import type { HistoryRow } from '@/services/cfsm.service'
import { fetchHistory } from '@/services/cfsm.service'

/** 进行中的历史请求（single-flight）：详情页多个图表同时请求相同 (id, hours) 时合并为一次网络请求 */
const inFlight = new Map<string, Promise<HistoryRow[]>>()

/** 短 TTL 结果缓存：首页 ↔ 详情往返时立即回显上次数据，避免每次进入都白屏等请求 */
const TTL_MS = 30_000
const cache = new Map<string, { rows: HistoryRow[], at: number }>()

/** 加载服务器历史指标（/api/history/all） */
export async function loadServerHistory(uuid: string, hours: number): Promise<HistoryRow[]> {
  if (!uuid)
    return []
  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 168) : 24
  const key = `${uuid}:${safeHours}`

  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < TTL_MS)
    return cached.rows

  const existing = inFlight.get(key)
  if (existing) {
    try {
      return await existing
    }
    catch {
      // 落入下方重新发起
    }
  }
  const promise = (async (): Promise<HistoryRow[]> => {
    try {
      const rows = await fetchHistory(uuid, safeHours)
      const result = Array.isArray(rows) ? rows : []
      cache.set(key, { rows: result, at: Date.now() })
      return result
    }
    catch {
      return []
    }
  })()
  inFlight.set(key, promise)
  try {
    return await promise
  }
  finally {
    inFlight.delete(key)
  }
}

/** CF 历史接口最大采样规模参考（不是强制上限，保留以约束前端渲染） */