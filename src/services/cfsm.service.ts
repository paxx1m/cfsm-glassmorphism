/**
 * CF-Server-Monitor 前端数据层
 *
 * 对接 CF-Server-Monitor 的公开 REST 接口与实时 WebSocket。
 * 参考 theme-develop.md 的公开 API 约定实现。
 */

// ==================== 类型定义 ====================

export interface LatencyWindowPoint {
  ts: number
  ct?: number | null | false
  cu?: number | null | false
  cm?: number | null | false
  bd?: number | null | false
}

export interface DiskIoMetrics {
  read_bps: number
  write_bps: number
  read_iops: number
  write_iops: number
  await_ms: number
  util: number
}

export interface GpuInfo {
  id: string
  name: string
  info: number | null
}

export interface CfsmServer {
  id: string
  name: string
  server_group: string
  tags: string
  price: string
  billing_cycle: string
  auto_renewal: string
  currency: string
  expire_date: string
  traffic_limit: string
  traffic_calc_type: string
  reset_day: number
  report_interval: number
  wss_report_interval: number
  is_hidden: '0' | '1'
  sort_order: number
  cpu: number
  load_avg: string
  net_in_speed: number
  net_out_speed: number
  net_rx: number
  net_tx: number
  net_rx_monthly: number
  net_tx_monthly: number
  processes: number
  tcp_conn: number
  udp_conn: number
  ping_ct: number | null | false
  ping_cu: number | null | false
  ping_cm: number | null | false
  ping_bd: number | null | false
  loss_ct: number | null | false
  loss_cu: number | null | false
  loss_cm: number | null | false
  loss_bd: number | null | false
  ping?: LatencyWindowPoint[]
  loss?: LatencyWindowPoint[]
  ram_total: number
  ram_used: number
  swap_total: number
  swap_used: number
  disk_total: number
  disk_used: number
  disk?: DiskIoMetrics
  cpu_cores: number
  cpu_info: string
  gpu_info: GpuInfo[] | string
  arch: string
  os: string
  kernel_version: string
  region: string
  ip_v4: '0' | '1'
  ip_v6: '0' | '1'
  boot_time: string | number
  agent_version?: string
  last_updated: number
  timestamp: number
  is_online?: boolean
}

export interface CfsmConfig {
  version: string
  last_workers_version?: string | null
  last_agent_version?: string | null
  is_public: boolean
  authorization: boolean
  turnstile_enabled: boolean
  turnstile_login_enabled: boolean
  turnstile_site_key: string
  site_title: string
  preferred_theme: 'auto' | 'dark' | 'light'
  default_language: 'auto' | 'zh' | 'en'
  theme_options: Record<string, unknown>
  verified: boolean
  turnstile_verified: string | null
  frontend_ws_timeout_minutes: number
  long_history_points: number
  latency_window?: { points: number, hours: number }
}

export interface CfsmServersResponse {
  servers: CfsmServer[]
  stats: {
    total: number
    online: number
    offline: number
    globalSpeedIn: number
    globalSpeedOut: number
    globalNetTx: number
    globalNetRx: number
  }
  regionStats: Record<string, number>
  sysConfig: {
    show_price?: boolean
    show_expire?: boolean
    show_tf?: boolean
    show_three_net_details?: boolean
    site_title?: string
  }
  latestReportUpdates?: Array<{
    serverId: string
    reportTs: number
    reportAgeMs: number
    samples: Array<{ ts: number, data?: Partial<CfsmServer> }>
  }>
}

export interface HistoryRow {
  timestamp: number
  cpu?: number
  ram_used?: number
  ram_total?: number
  swap_used?: number
  swap_total?: number
  disk_used?: number
  disk_total?: number
  net_in_speed?: number
  net_out_speed?: number
  tcp_conn?: number
  udp_conn?: number
  processes?: number
  load_avg?: string
  ping_ct?: number | null | false
  ping_cu?: number | null | false
  ping_cm?: number | null | false
  ping_bd?: number | null | false
  loss_ct?: number | null | false
  loss_cu?: number | null | false
  loss_cm?: number | null | false
  loss_bd?: number | null | false
  gpu_info?: GpuInfo[] | string
  disk?: DiskIoMetrics
  kernel_version?: string
}

export interface WsBatchUpdate {
  type: 'batchUpdate'
  ts: number
  updates: Array<{
    serverId: string
    samples: Array<{ ts: number, data?: Partial<CfsmServer>, payload?: Partial<CfsmServer>, metrics?: Partial<CfsmServer> }>
  }>
}

// ==================== 配置与鉴权 ====================

/** JWT 与 Turnstile 凭据的浏览器存储键，供鉴权与初始化模块共用 */
export const JWT_KEY = 'jwt_token'
export const TURNSTILE_TOKEN_KEY = 'turnstile_token'
export const TURNSTILE_VERIFIED_KEY = 'turnstile_verified'

/** 读取主题的运行后端地址（apiBase）。 */
export function getApiBases(): string[] {
  const meta = document.querySelector('meta[name="apiBase"]')?.getAttribute('content')
  const configured = (meta ?? import.meta.env.VITE_API_BASE ?? '').toString()
  const bases = configured.split(',')
    .map(base => base.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return bases.length > 0 ? bases : [window.location.origin]
}

/** 单站模式默认使用第一个 apiBase。 */
export function getApiBase(): string {
  return getApiBases()[0] || window.location.origin
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const jwt = localStorage.getItem(JWT_KEY)
  if (jwt)
    headers.Authorization = `Bearer ${jwt}`
  // 一次性 token 在换取 turnstile_verified 后即失效，此后应只复用 X-Turnstile-Verified
  const verified = localStorage.getItem(TURNSTILE_VERIFIED_KEY)
  if (verified) {
    headers['X-Turnstile-Verified'] = verified
  }
  else {
    const turnstileToken = localStorage.getItem(TURNSTILE_TOKEN_KEY)
    if (turnstileToken)
      headers['X-Turnstile-Token'] = turnstileToken
  }
  return headers
}

async function request<T>(path: string, options: { method?: string, body?: unknown, signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  }
  const response = await fetch(`${getApiBase()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })

  if (response.status === 401)
    throw new ApiError(401, 'unauthorized')
  if (response.status === 403)
    throw new ApiError(403, 'turnstileVerificationFailed')

  const text = await response.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) as unknown : undefined
  }
  catch {
    data = text
  }

  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in (data as object)
      ? String((data as { error: unknown }).error)
      : `HTTP ${response.status}`
    throw new ApiError(response.status, message)
  }

  return data as T
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

// ==================== 数据请求 ====================

export function fetchConfig(): Promise<CfsmConfig> {
  return request<CfsmConfig>('/api/config')
}

export function fetchServers(): Promise<CfsmServersResponse> {
  return request<CfsmServersResponse>('/api/servers')
}

export function fetchServer(id: string): Promise<CfsmServer> {
  return request<CfsmServer>(`/api/server?id=${encodeURIComponent(id)}`)
}

export function fetchHistory(id: string, hours: number): Promise<HistoryRow[]> {
  return request<HistoryRow[]>(`/api/history/all?id=${encodeURIComponent(id)}&hours=${hours}`)
}

export function saveThemeOptions(themeOptions: Record<string, unknown>): Promise<{ success: boolean, theme_options: Record<string, unknown> }> {
  return request('/api/theme_options', { method: 'POST', body: { theme_options: themeOptions } })
}

// ==================== 实时推送 ====================

export interface LiveSocket {
  onMessage: (handler: (msg: WsBatchUpdate) => void) => void
  onStatus: (handler: (state: 'connected' | 'disconnected' | 'closed') => void) => void
  close: () => void
  reconnect: () => void
  subscribe: (ids: string[]) => void
}

/** 建立 /api/ws 实时连接。scope 为 'all' 或单个服务器 id。 */
export function openLiveSocket(scope: 'all' | string, ids: string[] = []): LiveSocket {
  const isSameHost = () => {
    const base = getApiBase()
    try {
      const url = new URL(base)
      return url.host === window.location.host
    }
    catch {
      return true
    }
  }

  const buildUrl = () => {
    const url = new URL(`${getApiBase()}/api/ws`)
    url.searchParams.set('subscribe', scope)
    // 非公开站点跨域时浏览器 WebSocket 不能自定义 Authorization 头，需要使用查询参数认证
    if (!isSameHost()) {
      const token = localStorage.getItem(JWT_KEY)
      if (token)
        url.searchParams.set('token', token)
    }
    return url.toString()
  }

  let socket: WebSocket | null = null
  let closed = false
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const messageHandlers: Array<(msg: WsBatchUpdate) => void> = []
  const statusHandlers: Array<(state: 'connected' | 'disconnected' | 'closed') => void> = []
  let currentIds = ids

  function notify(state: 'connected' | 'disconnected' | 'closed') {
    for (const handler of statusHandlers)
      handler(state)
  }

  function connect() {
    if (closed)
      return
    try {
      socket = new WebSocket(buildUrl())
    }
    catch {
      scheduleReconnect()
      return
    }
    socket.onopen = () => {
      reconnectAttempts = 0
      notify('connected')
      // subscribe=<serverId> 时 URL 已经限定单台服务器，无需再发送订阅控制消息
      if (scope === 'all') {
        socket?.send(JSON.stringify({ type: 'subscribe', scope, ids: currentIds.filter(id => typeof id === 'string' && id.length > 0) }))
      }
    }
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as WsBatchUpdate
        if (msg.type === 'batchUpdate')
          for (const handler of messageHandlers)
            handler(msg)
      }
      catch {
        // 忽略无法解析的消息
      }
    }
    socket.onclose = () => {
      notify('disconnected')
      if (!closed)
        scheduleReconnect()
    }
    socket.onerror = () => {
      socket?.close()
    }
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer)
      return
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 30_000)
    reconnectAttempts += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  const api: LiveSocket = {
    onMessage(handler) {
      messageHandlers.push(handler)
    },
    onStatus(handler) {
      statusHandlers.push(handler)
    },
    subscribe(ids) {
      currentIds = ids
      socket?.send(JSON.stringify({ type: 'subscribe', scope, ids }))
    },
    close() {
      closed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      socket?.close()
      socket = null
    },
    reconnect() {
      if (closed)
        closed = false
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      socket?.close()
      reconnectAttempts = 0
      connect()
    },
  }

  connect()
  return api
}