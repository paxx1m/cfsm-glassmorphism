import type { NodeData } from '@/stores/nodes'
import { computed, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'

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
 * 缺失（或通过 options.enabled 关闭，用于视图失活时节省计算）时回退到当前值 ping_ct/cu/cm 与 loss_*。
 */
export function useNodePingDisplay(getNode: () => NodeData | undefined, options?: { enabled?: () => boolean }) {
  const node = computed(() => getNode())
  const { t } = useI18n()

  const carriers = ['ct', 'cu', 'cm'] as const
  const carrierLabels = computed<Record<string, string>>(() => ({
    ct: t('pingChart.carrierCt'),
    cu: t('pingChart.carrierCu'),
    cm: t('pingChart.carrierCm'),
  }))

  function isEnabled(): boolean {
    return options?.enabled ? options.enabled() : true
  }

  function windowBars(kind: 'ping' | 'loss'): PingBar[] {
    const current = node.value
    if (!current)
      return []
    const window = kind === 'ping' ? current.ping : current.loss
    const fmtVal = kind === 'ping' ? fmtLatency : fmtLoss
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
          const detail = carriers.map(c => `${carrierLabels.value[c]} ${fmtVal(point[c])}`).join('　')
          return {
            key: `${kind}-${point.ts}-${index}`,
            value: display,
            loss: display === null,
            tooltip: `${new Date(point.ts).toLocaleTimeString()}\n${detail}`,
            className: kind === 'ping' ? latencyClassName(display) : lossClassName(display),
          }
        })
    }

    // 回退：当前三网值
    return carriers.map((carrier) => {
      const raw = kind === 'ping' ? current[`ping_${carrier}`] : current[`loss_${carrier}`]
      const value = raw === false || raw === null || raw === undefined ? null : Number(raw)
      return {
        key: `${kind}-${carrier}`,
        value,
        loss: value === null,
        tooltip: t('pingChart.carrierTooltip', { carrier: carrierLabels.value[carrier], value: kind === 'ping' ? fmtLatency(raw) : fmtLoss(raw) }),
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
      .map(carrier => `${carrierLabels.value[carrier]} ${fmtLatency(current[`ping_${carrier}`])}`)
      .join(' · ')
  })

  const lossPanelTooltip = computed(() => {
    const current = node.value
    if (!current)
      return ''
    return carriers
      .map(carrier => `${carrierLabels.value[carrier]} ${fmtLoss(current[`loss_${carrier}`])}`)
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