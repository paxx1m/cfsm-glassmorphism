import type { NodeData } from '@/stores/nodes'
import { computed, type ComputedRef } from 'vue'

const GOOD_THRESHOLD = 80
const WARNING_THRESHOLD = 160
const CRITICAL_THRESHOLD = 240

export interface PingBar {
  key: string
  value: number | null
  loss: boolean
  tooltip: string
  className: string
}

function latencyClassName(value: number | null): string {
  if (value === null)
    return 'bg-slate-500/30'
  if (value < GOOD_THRESHOLD)
    return 'bg-emerald-500'
  if (value < WARNING_THRESHOLD)
    return 'bg-amber-500'
  if (value < CRITICAL_THRESHOLD)
    return 'bg-orange-500'
  return 'bg-red-500'
}

function lossClassName(value: number | null): string {
  if (value === null)
    return 'bg-slate-500/30'
  if (value > 10)
    return 'bg-red-500'
  if (value > 3)
    return 'bg-amber-500'
  return 'bg-emerald-500'
}

function fmtLatency(value: number | null | undefined | false): string {
  if (value === false || value === null || value === undefined)
    return '-'
  return `${value.toFixed(0)} ms`
}

function fmtLoss(value: number | null | undefined | false): string {
  if (value === false || value === null || value === undefined)
    return '-'
  return `${value.toFixed(1)}%`
}

/**
 * 从 CF 节点数据计算延迟 / 丢包展示与迷你柱状条。
 * 优先使用 /api/servers 返回的三网窗口数组 node.ping / node.loss，
 * 缺失（或通过 options.enabled 关闭，用于视图失活时节省计算）时回退到当前值 ping_ct/cu/cm/bd 与 loss_*。
 */
export function useNodePingDisplay(getNode: () => NodeData | undefined, options?: { enabled?: () => boolean }) {
  const node = computed(() => getNode())

  const carriers = ['ct', 'cu', 'cm', 'bd'] as const
  const carrierLabels: Record<string, string> = { ct: '电信', cu: '联通', cm: '移动', bd: 'BGP' }

  function isEnabled(): boolean {
    return options?.enabled ? options.enabled() : true
  }

  function windowBars(kind: 'ping' | 'loss'): PingBar[] {
    const current = node.value
    if (!current)
      return []
    const window = kind === 'ping' ? current.ping : current.loss
    if (isEnabled() && Array.isArray(window) && window.length > 0) {
      return window
        .slice(-10)
        .map((point, index) => {
          const values = carriers
            .map((carrier) => {
              const raw = point[carrier]
              return raw === false || raw === null || raw === undefined ? null : Number(raw)
            })
            .filter((value): value is number => value !== null && Number.isFinite(value))
          const nonNull = values.length ? values : null
          const avg = nonNull ? nonNull.reduce((sum, v) => sum + v, 0) / nonNull.length : null
          const display = avg ?? null
          return {
            key: `${kind}-${point.ts}-${index}`,
            value: display,
            loss: display === null,
            tooltip: `时间 ${new Date(point.ts).toLocaleTimeString()}`,
            className: kind === 'ping' ? latencyClassName(display) : lossClassName(display),
          }
        })
    }

    // 回退：当前四线值
    return carriers.map((carrier) => {
      const raw = kind === 'ping' ? current[`ping_${carrier}`] : current[`loss_${carrier}`]
      const value = raw === false || raw === null || raw === undefined ? null : Number(raw)
      return {
        key: `${kind}-${carrier}`,
        value,
        loss: value === null,
        tooltip: `${carrierLabels[carrier]} · ${kind === 'ping' ? fmtLatency(raw) : fmtLoss(raw)}`,
        className: kind === 'ping' ? latencyClassName(value) : lossClassName(value),
      }
    })
  }

  const latencyRenderBars: ComputedRef<PingBar[]> = computed(() => windowBars('ping'))
  const lossRenderBars: ComputedRef<PingBar[]> = computed(() => windowBars('loss'))

  const latencyDisplay = computed<string>(() => {
    const current = node.value
    if (!current)
      return '-'
    const values = carriers
      .map(carrier => current[`ping_${carrier}`])
      .filter((v): v is number => v !== false && v !== null && v !== undefined && Number.isFinite(Number(v)))
      .map(Number)
    if (!values.length)
      return '-'
    return `${(values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(0)}`
  })

  const lossDisplay = computed<string>(() => {
    const current = node.value
    if (!current)
      return '-'
    const values = carriers
      .map(carrier => current[`loss_${carrier}`])
      .filter((v): v is number => v !== false && v !== null && v !== undefined && Number.isFinite(Number(v)))
      .map(Number)
    if (!values.length)
      return '-'
    return `${(values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(1)}%`
  })

  const latencyPanelTooltip = computed(() => {
    const current = node.value
    if (!current)
      return ''
    return carriers
      .map(carrier => `${carrierLabels[carrier]} ${fmtLatency(current[`ping_${carrier}`])}`)
      .join(' · ')
  })

  const lossPanelTooltip = computed(() => {
    const current = node.value
    if (!current)
      return ''
    return carriers
      .map(carrier => `${carrierLabels[carrier]} ${fmtLoss(current[`loss_${carrier}`])}`)
      .join(' · ')
  })

  return {
    latencyRenderBars,
    lossRenderBars,
    latencyDisplay,
    lossDisplay,
    latencyPanelTooltip,
    lossPanelTooltip,
  }
}