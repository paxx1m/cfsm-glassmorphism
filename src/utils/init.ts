/**
 * CF-Server-Monitor 前端初始化模块
 *
 * 启动流程：读取 /api/config → 若站点开启全局 Turnstile 先完成一次人机验证 → 拉取 /api/servers → 建立实时 WebSocket → 低频轮询兜底。
 * 首页/根路径使用 `subscribe=all` 订阅全部服务器；详情页按规范切换到单台服务器的 `subscribe=<id>` 实时订阅并改用单机 REST。
 * 页面隐藏时关闭 WebSocket，恢复可见时按当前页面类型重新连接并补齐一次 REST 数据。
 */

import { ref } from 'vue'
import type { CfsmConfig, WsBatchUpdate } from '@/services/cfsm.service'
import { ApiError, fetchConfig, fetchServer, fetchServers, openLiveSocket, type LiveSocket } from '@/services/cfsm.service'
import { REALTIME_CONFIG } from '@/constants/realtime'
import { ensureTurnstileVerified } from '@/utils/turnstile'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'

/** WebSocket 断开时的轮询节奏（兜底数据源） */
const POLL_REFRESH_INTERVAL_MS = 5_000
/** WebSocket 正常时仍定期全量对齐，用于捕获节点增删与元数据变更 */
const FULL_REFRESH_INTERVAL_MS = 60_000

/** 实时连接超时弹窗是否可见（由 frontend_ws_timeout_minutes 触发，用户在 App 内选择继续或断开） */
export const wsTimeoutOpen = ref(false)

/** 初始化状态管理 */
class InitManager {
  private appStore = useAppStore()
  private nodesStore = useNodesStore()
  private liveSocket: LiveSocket | null = null
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private wsTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private isInitialized = false
  private reconnectAttempts = 0
  private realtimeConnected = false
  /** 当前实时订阅域：'all'（首页/列表）或单个服务器 id（详情页） */
  private realtimeScope: 'all' | string = 'all'
  /** 用户在超时弹窗里选择断开后设为 true，禁止静默重连 */
  private userStoppedRealtime = false

  async init(): Promise<void> {
    this.destroyed = false
    if (this.isInitialized)
      return

    try {
      await this.runStartupRequests()
      if (this.destroyed)
        return
      this.startPolling()
      this.startRealtime()
      this.setupVisibilityHandling()
      this.isInitialized = true
    }
    catch (error) {
      console.error('[InitManager] Initialization failed:', error)
      this.appStore.connectionError = true
      throw error
    }
    finally {
      this.appStore.setLoading(false)
    }
  }

  private async runStartupRequests(): Promise<boolean> {
    let config: CfsmConfig | null = null
    try {
      config = await fetchConfig()
      if (this.destroyed)
        return false
      this.appStore.setConfig(config)
    }
    catch (reason) {
      console.error('[InitManager] Failed to fetch config:', reason)
    }

    // 站点开启全局 Turnstile 时，先完成一次人机验证以获取可复用的 X-Turnstile-Verified
    try {
      if (config?.turnstile_enabled && config.turnstile_site_key)
        await ensureTurnstileVerified(config.turnstile_site_key)
    }
    catch (reason) {
      console.error('[InitManager] Turnstile verification failed:', reason)
    }
    if (this.destroyed)
      return false

    try {
      const data = await fetchServers()
      this.nodesStore.initNodes(data.servers)
      this.appStore.setServersData(data)
      this.appStore.connectionError = false
      this.appStore.loginRequired = false
      this.liveSocket?.subscribe(this.nodesStore.visibleNodes.map(node => node.id))
      return true
    }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.appStore.loginRequired = true
        this.appStore.connectionError = false
        return false
      }
      this.appStore.connectionError = true
      return false
    }
  }

  async retry(): Promise<boolean> {
    if (this.destroyed)
      return false
    const ok = await this.runStartupRequests()
    if (ok)
      this.startPolling()
    this.startRealtime()
    if (!this.isInitialized && !this.destroyed) {
      this.setupVisibilityHandling()
      this.isInitialized = true
    }
    return ok
  }

  /** 按当前页面类型切换实时订阅域 */
  setScope(scope: 'all' | string): void {
    if (this.destroyed)
      return
    if (this.realtimeScope === scope && this.liveSocket)
      return
    // 用户在超时弹窗里选择断开后，主动导航视为重新开始，重置该标记
    this.userStoppedRealtime = false
    this.cancelWsTimeout()
    wsTimeoutOpen.value = false
    this.realtimeScope = scope
    if (scope === 'all')
      this.openRealtime('all', this.nodesStore.visibleNodes.map(node => node.id))
    else
      this.openRealtime(scope, [])
    void this.poll()
  }

  private startRealtime(): void {
    this.realtimeScope = 'all'
    this.openRealtime('all', this.nodesStore.visibleNodes.map(node => node.id))
  }

  private openRealtime(scope: 'all' | string, ids: string[]): void {
    this.liveSocket?.close()
    this.liveSocket = openLiveSocket(scope, ids)

    this.liveSocket.onStatus((state) => {
      this.realtimeConnected = state === 'connected'
      if (state === 'connected') {
        this.nodesStore.updateWsState('connected', 0)
        this.reconnectAttempts = 0
        this.appStore.connectionError = false
        this.startWsTimeout()
      }
      else {
        this.cancelWsTimeout()
        this.nodesStore.updateWsState(this.reconnectAttempts > 0 ? 'reconnecting' : 'disconnected', this.reconnectAttempts)
      }
    })

    this.liveSocket.onMessage((msg: WsBatchUpdate) => {
      if (this.destroyed)
        return
      const updates: Array<{ serverId: string, data?: Record<string, unknown> }> = []
      for (const update of msg.updates ?? []) {
        const samples = update.samples ?? []
        for (const sample of samples) {
          const data = (sample.data ?? sample.payload ?? sample.metrics) as Record<string, unknown> | undefined
          if (data)
            updates.push({ serverId: update.serverId, data })
        }
      }
      if (updates.length)
        this.nodesStore.updateNodeStatuses(updates)
    })
  }

  private startPolling(): void {
    if (this.pollTimer)
      return
    const schedule = () => {
      const delay = this.realtimeConnected ? FULL_REFRESH_INTERVAL_MS : POLL_REFRESH_INTERVAL_MS
      this.pollTimer = setTimeout(async () => {
        await this.poll()
        if (!this.destroyed)
          schedule()
      }, delay)
    }
    schedule()
  }

  private async poll(): Promise<void> {
    if (this.destroyed)
      return
    try {
      if (this.realtimeScope === 'all') {
        const data = await fetchServers()
        this.nodesStore.initNodes(data.servers)
        this.appStore.setServersData(data)
        // 节点增删后同步刷新 WS 订阅 id，避免新节点收不到实时推送
        this.liveSocket?.subscribe(this.nodesStore.visibleNodes.map(node => node.id))
        this.appStore.connectionError = false
      }
      else {
        const data = await fetchServer(this.realtimeScope)
        this.nodesStore.updateNodeStatuses([{ serverId: this.realtimeScope, data }])
        this.appStore.connectionError = false
      }
    }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.appStore.loginRequired = true
        return
      }
      console.error('[InitManager] Poll error:', error)
    }
  }

  private startWsTimeout(): void {
    this.cancelWsTimeout()
    const minutes = this.appStore.wsTimeoutMinutes
    if (!minutes || minutes <= 0 || this.userStoppedRealtime)
      return
    this.wsTimeoutTimer = setTimeout(() => this.handleWsTimeout(), minutes * 60_000)
  }

  private cancelWsTimeout(): void {
    if (this.wsTimeoutTimer) {
      clearTimeout(this.wsTimeoutTimer)
      this.wsTimeoutTimer = null
    }
  }

  private handleWsTimeout(): void {
    if (this.destroyed)
      return
    this.cancelWsTimeout()
    this.liveSocket?.close()
    wsTimeoutOpen.value = true
  }

  /** 用户在超时弹窗里的选择 */
  resolveWsTimeout(continueConnecting: boolean): void {
    wsTimeoutOpen.value = false
    this.cancelWsTimeout()
    if (continueConnecting) {
      this.userStoppedRealtime = false
      this.openRealtime(this.realtimeScope, this.realtimeScope === 'all' ? this.nodesStore.visibleNodes.map(node => node.id) : [])
      void this.poll()
    }
    else {
      // 断开后保留低频轮询，但不再静默重连实时连接
      this.userStoppedRealtime = true
    }
  }

  private setupVisibilityHandling(): void {
    if (typeof document === 'undefined')
      return
    document.addEventListener('visibilitychange', this.handleVisibility)
  }

  private handleVisibility = (): void => {
    if (this.destroyed)
      return
    if (document.hidden) {
      this.liveSocket?.close()
    }
    else {
      void this.poll()
      if (!this.userStoppedRealtime)
        this.liveSocket?.reconnect()
    }
  }

  destroy(): void {
    this.destroyed = true
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cancelWsTimeout()
    wsTimeoutOpen.value = false
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.handleVisibility)
    this.liveSocket?.close()
    this.liveSocket = null
    this.nodesStore.clearNodes()
    this.isInitialized = false
  }
}

let initManager: InitManager | null = null

export async function initApp(): Promise<void> {
  if (!initManager)
    initManager = new InitManager()
  await initManager.init()
}

export async function retryInitApp(): Promise<boolean> {
  if (!initManager)
    initManager = new InitManager()
  return initManager.retry()
}

export function destroyInitManager(): void {
  if (initManager) {
    initManager.destroy()
    initManager = null
  }
}

/** 首页/详情页切换实时订阅域（'all' 或单个服务器 id） */
export function switchRealtimeScope(scope: 'all' | string): void {
  initManager?.setScope(scope)
}

/** 用户在实时连接超时弹窗里的选择 */
export function respondToWsTimeout(continueConnecting: boolean): void {
  initManager?.resolveWsTimeout(continueConnecting)
}