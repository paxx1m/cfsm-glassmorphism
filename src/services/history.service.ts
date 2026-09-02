import type { HistoryRow } from '@/services/cfsm.service'
import { fetchHistory } from '@/services/cfsm.service'
import { LOAD_RECORD_MAX_COUNT } from '@/constants/load'

/** 进行中的历史请求（single-flight）：详情页多个图表同时请求相同 (id, hours) 时合并为一次网络请求 */
const inFlight = new Map<string, Promise<HistoryRow[]>>()

/** 加载服务器历史指标（/api/history/all） */
export async function loadServerHistory(uuid: string, hours: number): Promise<HistoryRow[]> {
  if (!uuid)
    return []
  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 168) : 24
  const key = `${uuid}:${safeHours}`
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
      return Array.isArray(rows) ? rows : []
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
export const MAX_HISTORY_POINTS = LOAD_RECORD_MAX_COUNT