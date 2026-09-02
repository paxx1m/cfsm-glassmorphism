import type { NodeData } from '@/stores/nodes'

/** 在线判定阈值（毫秒）：最近 5 分钟内有过上报即视为在线 */
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

/** CF-Server-Monitor 的内存/磁盘容量字段单位为 MiB，需要换算为字节以便格式化 */
const MIB_TO_BYTES = 1024 * 1024

/** MiB → 字节 */
export function mibToBytes(value: number): number {
  return (Number(value) || 0) * MIB_TO_BYTES
}

/** 规范化时间戳：秒转为毫秒 */
export function normalizeTimestamp(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0)
    return 0
  return num < 10 ** 10 ? num * 1000 : num
}

/** 单台服务器是否在线 */
export function isServerOnline(server: Pick<NodeData, 'last_updated' | 'timestamp'>): boolean {
  const last = normalizeTimestamp(server.last_updated ?? server.timestamp)
  if (!last)
    return false
  return Date.now() - last < ONLINE_THRESHOLD_MS
}

/** 内存使用百分比 */
export function getMemoryPercentage(node: Pick<NodeData, 'ram_used' | 'ram_total'>): number {
  if (!node.ram_total || node.ram_total <= 0)
    return 0
  return Math.min(100, Math.max(0, (node.ram_used || 0) / node.ram_total * 100))
}

/** 磁盘使用百分比 */
export function getDiskPercentage(node: Pick<NodeData, 'disk_used' | 'disk_total'>): number {
  if (!node.disk_total || node.disk_total <= 0)
    return 0
  return Math.min(100, Math.max(0, (node.disk_used || 0) / node.disk_total * 100))
}

const TRAFFIC_UNIT_MAP: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
  PB: 1024 ** 5,
  KBIN: 1000,
  MBIN: 1000 ** 2,
  GBIN: 1000 ** 3,
  TBIN: 1000 ** 4,
}

function readTrafficUnit(value: string): number | null {
  const upper = value.trim().toUpperCase()
  for (const key of Object.keys(TRAFFIC_UNIT_MAP)) {
    if (upper === key || upper === `${key}B` || upper === `${key}iB`)
      return TRAFFIC_UNIT_MAP[key]
  }
  return null
}

/** 将流量限制解析为字节数。数值视为 GB。 */
export function getTrafficLimitBytes(node: Pick<NodeData, 'traffic_limit'>): number {
  const raw = String(node.traffic_limit ?? '').trim()
  if (!raw)
    return 0
  const numericMatch = raw.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/)
  if (!numericMatch)
    return 0
  const amount = Number(numericMatch[1])
  if (!Number.isFinite(amount) || amount <= 0)
    return 0
  const unit = numericMatch[2]
  if (!unit) {
    // 纯数字视为 GB
    return amount * 1024 ** 3
  }
  const multiplier = readTrafficUnit(unit)
  return multiplier ? amount * multiplier : 0
}

export function hasTrafficLimit(node: Pick<NodeData, 'traffic_limit'>): boolean {
  return getTrafficLimitBytes(node) > 0
}

/** 已用流量（字节），按月流量统计 + traffic_calc_type 计算。 */
export function getTrafficUsed(node: Pick<NodeData, 'net_rx_monthly' | 'net_tx_monthly' | 'traffic_calc_type'>): number {
  const rx = Number(node.net_rx_monthly) || 0
  const tx = Number(node.net_tx_monthly) || 0
  switch (node.traffic_calc_type) {
    case 'dl': return rx
    case 'ul': return tx
    case 'max': return Math.max(rx, tx)
    case 'total':
    default: return rx + tx
  }
}

/** 已用流量百分比（0-100） */
export function getTrafficUsedPercentage(node: Pick<NodeData, 'net_rx_monthly' | 'net_tx_monthly' | 'traffic_calc_type' | 'traffic_limit'>): number {
  const limit = getTrafficLimitBytes(node)
  if (limit <= 0)
    return 0
  return Math.min(100, Math.max(0, getTrafficUsed(node) / limit * 100))
}

/** 累计流量（排序/快捷筛选用，字节） */
export function getTotalTraffic(node: Pick<NodeData, 'net_rx_monthly' | 'net_tx_monthly'>): number {
  return (Number(node.net_rx_monthly) || 0) + (Number(node.net_tx_monthly) || 0)
}

/** 实时峰值速率（字节/秒） */
export function getRealtimePeakSpeed(node: Pick<NodeData, 'net_in_speed' | 'net_out_speed'>): number {
  return Math.max(Number(node.net_in_speed) || 0, Number(node.net_out_speed) || 0)
}

/** 高负载判定：CPU 使用率超过阈值，或 1m 负载远超核心数 */
export function isHighLoadNode(node: Pick<NodeData, 'cpu' | 'load1' | 'cpu_cores'>, threshold: number): boolean {
  if (Number.isFinite(node.cpu) && node.cpu >= threshold)
    return true
  if (node.cpu_cores > 0 && Number.isFinite(node.load1))
    return node.load1 >= node.cpu_cores * 2
  return false
}

/** 即将到期判定：到期日期在 days 天内 */
export function isExpiringNode(node: Pick<NodeData, 'expire_date'>, days: number): boolean {
  const expireDate = String(node.expire_date ?? '').trim()
  if (!expireDate)
    return false
  const ts = new Date(expireDate).getTime()
  if (!Number.isFinite(ts))
    return false
  const diff = ts - Date.now()
  return diff > 0 && diff <= days * 24 * 60 * 60 * 1000
}