import type { CfsmServer } from '@/services/cfsm.service'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isServerOnline, mibToBytes, normalizeTimestamp } from '@/utils/nodeMetricsHelper'

/** 节点数据 = CF 服务器原始字段 + 派生字段 */
export interface NodeData extends CfsmServer {
  /** 是否在线（根据最近上报时间推断） */
  online: boolean
  /** 解析自 load_avg 字符串（1m / 5m / 15m） */
  load1: number
  load5: number
  load15: number
  /** 运行时长（秒），由 boot_time 推算（保留字段；旧数据缺失时为 0） */
  uptime: number
  /** 节点消息（CF 当前未提供该字段，预留兼容原版卡片的提示位） */
  message?: string
  /** 末次上报时间（毫秒，用于离线展示） */
  reportedAt: number
}

/** WebSocket 连接状态 */
export type WsConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

function parseLoadAvg(loadAvg: string | undefined): [number, number, number] {
  const values = String(loadAvg ?? '')
    .trim()
    .split(/\s+/)
    .map(value => Number(value))
    .filter(Number.isFinite)

  if (values.length === 0)
    return [0, 0, 0]
  if (values.length === 1)
    return [values[0] as number, values[0] as number, values[0] as number]
  if (values.length === 2)
    return [values[0] as number, values[1] as number, values[1] as number]
  return [values[0] as number, values[1] as number, values[2] as number]
}

function createNodeFromServer(server: CfsmServer): NodeData {
  const [load1, load5, load15] = parseLoadAvg(server.load_avg)
  const reportedAt = normalizeTimestamp(server.last_updated ?? server.timestamp)
  const boot = normalizeTimestamp(server.boot_time)
  const node: NodeData = {
    ...server,
    online: isServerOnline(server),
    load1,
    load5,
    load15,
    uptime: boot > 0 ? Math.max(0, Math.floor((Date.now() - boot) / 1000)) : 0,
    reportedAt,
  }
  // CF 的内存/磁盘容量字段单位为 MiB，统一换算为字节
  node.ram_total = mibToBytes(server.ram_total)
  node.ram_used = mibToBytes(server.ram_used)
  node.swap_total = mibToBytes(server.swap_total)
  node.swap_used = mibToBytes(server.swap_used)
  node.disk_total = mibToBytes(server.disk_total)
  node.disk_used = mibToBytes(server.disk_used)
  return node
}

/** 就地合并实时增量字段 */
function applyLiveUpdate(node: NodeData, update: Partial<CfsmServer>): void {
  const fields: Array<keyof CfsmServer> = [
    'cpu', 'ram_total', 'ram_used', 'swap_total', 'swap_used',
    'disk_total', 'disk_used', 'disk', 'net_in_speed', 'net_out_speed',
    'net_rx', 'net_tx', 'net_rx_monthly', 'net_tx_monthly',
    'tcp_conn', 'udp_conn', 'processes',
    'ping_ct', 'ping_cu', 'ping_cm', 'ping_bd',
    'loss_ct', 'loss_cu', 'loss_cm', 'loss_bd',
    'ping', 'loss', 'last_updated', 'timestamp',
  ]
  const STORAGE_FIELDS = new Set(['ram_total', 'ram_used', 'swap_total', 'swap_used', 'disk_total', 'disk_used'])
  for (const field of fields) {
    const value = update[field]
    if (value === undefined)
      continue
    // 实时上报的内存/磁盘字段单位为 MiB，统一换算为字节
    const next = STORAGE_FIELDS.has(field as string) && typeof value === 'number'
      ? mibToBytes(value)
      : value
    if (node[field] !== next)
      ;(node[field] as unknown) = next
  }
  if (update.load_avg !== undefined && node.load_avg !== update.load_avg) {
    node.load_avg = update.load_avg
    const [load1, load5, load15] = parseLoadAvg(update.load_avg)
    node.load1 = load1
    node.load5 = load5
    node.load15 = load15
  }
  const reportedAt = normalizeTimestamp(update.last_updated ?? update.timestamp)
  if (reportedAt > 0 && node.reportedAt !== reportedAt)
    node.reportedAt = reportedAt
  node.online = isServerOnline(node)
}

const useNodesStore = defineStore('nodes', () => {
  const nodes = ref<NodeData[]>([])
  const wsConnectionState = ref<WsConnectionState>('disconnected')
  const wsReconnectAttempts = ref(0)
  const nodeIndex = new Map<string, NodeData>()

  const visibleNodes = computed(() => nodes.value)
  const onlineCount = computed(() => nodes.value.filter(node => node.online).length)
  const totalCount = computed(() => nodes.value.length)

  const groups = computed(() => {
    const set = new Set<string>()
    for (const node of nodes.value) {
      const group = node.server_group?.trim()
      if (group)
        set.add(group)
    }
    return Array.from(set)
  })

  const nodesById = computed(() => {
    const map = new Map<string, NodeData>()
    for (const node of nodes.value)
      map.set(node.id, node)
    return map
  })

  const visibleNodesById = computed(() => nodesById.value)

  function sortNodes(): void {
    nodes.value.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  function addIndexedNode(node: NodeData): void {
    nodes.value.push(node)
    const reactiveNode = nodes.value.at(-1)
    if (reactiveNode)
      nodeIndex.set(reactiveNode.id, reactiveNode)
  }

  /** 首次全量加载服务器列表 */
  function initNodes(servers: CfsmServer[]): void {
    const newIds = new Set(servers.map(server => server.id))

    for (const server of servers) {
      const existing = nodeIndex.get(server.id)
      if (existing) {
        // 就地更新静态字段（复用 createNodeFromServer 的所有字段）
        Object.assign(existing, createNodeFromServer(server))
      }
      else {
        addIndexedNode(createNodeFromServer(server))
      }
    }

    // 移除不存在的服务器
    for (let i = nodes.value.length - 1; i >= 0; i--) {
      const node = nodes.value[i]
      if (node && !newIds.has(node.id)) {
        nodeIndex.delete(node.id)
        nodes.value.splice(i, 1)
      }
    }

    sortNodes()
  }

  /** 合并实时增量（WebSocket / 轮询） */
  function updateNodeStatuses(updates: Array<{ serverId: string, data?: Partial<CfsmServer> }>): void {
    for (const update of updates) {
      const node = nodeIndex.get(update.serverId)
      if (node && update.data)
        applyLiveUpdate(node, update.data)
    }
  }

  function updateWsState(state: WsConnectionState, attempts?: number): void {
    wsConnectionState.value = state
    if (attempts !== undefined)
      wsReconnectAttempts.value = attempts
  }

  function clearNodes(): void {
    nodes.value = []
    nodeIndex.clear()
  }

  return {
    nodes,
    wsConnectionState,
    wsReconnectAttempts,
    visibleNodes,
    onlineCount,
    totalCount,
    groups,
    nodesById,
    visibleNodesById,
    initNodes,
    updateNodeStatuses,
    updateWsState,
    clearNodes,
  }
})

export { useNodesStore }