<script setup lang="ts">
import type { HistoryRow } from '@/services/cfsm.service'
import dayjs from 'dayjs'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { useThemeVars } from '@/composables/useThemeVars'
import { loadServerHistory } from '@/services/history.service'
import { PING_CARRIERS } from '@/constants/ping'
import '@/utils/echarts'

const props = defineProps<{
  uuid: string
  /** 时间范围（小时），由详情页共享的时间档控制 */
  hours?: number
  /** 是否处于「实时」档（周期刷新） */
  realtime?: boolean
  /** 当前时间档文案，用于副标题 */
  rangeLabel?: string
  /** 详情页统一驱动的实时刷新信号：变化时重新拉取，避免多个图表各自轮询 */
  refreshNonce?: number
}>()

const themeVars = useThemeVars()
const { t } = useI18n()

function formatTimeFromTs(ts: number): string {
  return dayjs(ts).format('HH:mm')
}

// 探测线路：电信 / 联通 / 移动（颜色等统一定义在 constants/ping.ts）
const CARRIERS = PING_CARRIERS
type CarrierKey = typeof CARRIERS[number]['key']
const carrierLabel = (key: CarrierKey) => t(CARRIERS.find(c => c.key === key)!.labelKey)

const history = ref<HistoryRow[]>([])
const loading = ref(true)

// 视图选项
const lossBand = ref(false) // {{ t('pingChart.lossBand') }}
const smoothing = ref(false) // {{ t('pingChart.smoothing') }}
const connectNulls = ref(false) // {{ t('pingChart.connectNulls') }}
const hiddenAll = ref(false) // {{ t('pingChart.hideAll') }}

const rows = computed(() => history.value)

function pingOf(row: HistoryRow, key: CarrierKey): number | null {
  const v = row[`ping_${key}`]
  return v === false || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v)
}
function lossOf(row: HistoryRow, key: CarrierKey): number | null {
  const v = row[`loss_${key}`]
  return v === false || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v)
}

/** 3 点移动平均，用来削峰平滑 */
function smooth(values: Array<number | null>): Array<number | null> {
  const out: Array<number | null> = []
  for (let i = 0; i < values.length; i++) {
    const windowValues: number[] = []
    for (let j = Math.max(0, i - 1); j <= Math.min(values.length - 1, i + 1); j++) {
      const v = values[j]
      if (v !== null && Number.isFinite(v))
        windowValues.push(v)
    }
    out.push(windowValues.length ? windowValues.reduce((s, v) => s + v, 0) / windowValues.length : null)
  }
  return out
}

const xLabels = computed(() => rows.value.map(row => formatTimeFromTs(row.timestamp)))

const seriesData = computed(() => CARRIERS.map((carrier) => {
  let values = rows.value.map(row => pingOf(row, carrier.key))
  if (smoothing.value)
    values = smooth(values)
  return { carrier, values }
}))

// 丢包率（按线路），用于右侧隐性坐标轴的色带
const lossSeries = computed(() => rows.value.map((row) => {
  const vals = CARRIERS
    .map(c => lossOf(row, c.key))
    .filter((v): v is number => v !== null && Number.isFinite(v))
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
}))

// 每条线路的当前延迟 / 丢包
const currentStats = computed(() => CARRIERS.map((carrier) => {
  let latestPing: number | null = null
  let latestLoss: number | null = null
  for (let i = rows.value.length - 1; i >= 0; i--) {
    const row = rows.value[i]
    if (latestPing === null)
      latestPing = pingOf(row, carrier.key)
    if (latestLoss === null)
      latestLoss = lossOf(row, carrier.key)
    if (latestPing !== null && latestLoss !== null)
      break
  }
  return { carrier, ping: latestPing, loss: latestLoss }
}))

const baseTooltip = computed(() => ({
  trigger: 'axis' as const,
  backgroundColor: themeVars.value.bodyColor,
  borderColor: 'transparent',
  borderWidth: 0,
  textStyle: { color: themeVars.value.textColor1, fontSize: 12 },
  axisPointer: { type: 'line' as const, lineStyle: { color: themeVars.value.borderColor, type: 'dashed' as const } },
}))

const chartOption = computed(() => {
  const xs = xLabels.value
  const series: unknown[] = []

  if (lossBand.value) {
    series.push({
      name: t('pingChart.lossRate'),
      type: 'line',
      yAxisIndex: 1,
      data: lossSeries.value,
      symbol: 'none',
      lineStyle: { width: 0 },
      areaStyle: { color: 'rgba(248, 81, 73, 0.14)', origin: 'start' },
      z: 0,
    })
  }

  for (let i = 0; i < seriesData.value.length; i++) {
    const { carrier, values } = seriesData.value[i] as { carrier: typeof CARRIERS[number], values: Array<number | null> }
    if (hiddenAll.value) {
      series.push({
        name: carrierLabel(carrier.key),
        type: 'line', data: [], showSymbol: false, lineStyle: { width: 1.5, color: carrier.color }, legendHoverLink: false,
      })
      continue
    }
    series.push({
      name: carrierLabel(carrier.key),
      type: 'line',
      data: values,
      showSymbol: false,
      connectNulls: connectNulls.value,
      lineStyle: { width: 1.5, color: carrier.color, cap: 'round' as const },
      emphasis: { disabled: true },
    })
  }

  return {
    animation: false,
    tooltip: baseTooltip.value,
    legend: hiddenAll.value ? { show: false } : {
      data: CARRIERS.map(c => carrierLabel(c.key)), bottom: 4, itemWidth: 10, itemHeight: 8, icon: 'roundRect',
      textStyle: { fontSize: 10, color: themeVars.value.textColor3 },
    },
    grid: { top: 16, right: 16, bottom: 46, left: 44 },
    xAxis: { type: 'category', data: xs, boundaryGap: false, axisLabel: { fontSize: 10, color: themeVars.value.textColor3 }, axisLine: { lineStyle: { color: themeVars.value.borderColor } }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', name: 'ms', nameTextStyle: { color: themeVars.value.textColor3 }, axisLabel: { fontSize: 10, color: themeVars.value.textColor3 }, splitLine: { lineStyle: { color: themeVars.value.progressRailColor, type: 'dashed' as const } } },
      { type: 'value', min: 0, max: 100, show: false },
    ],
    series,
  }
})

async function load(): Promise<void> {
  if (!props.uuid)
    return
  // 切换时间档时保有旧图，避免闪烁；仅首次/空数据时显示加载态
  if (history.value.length === 0)
    loading.value = true
  try {
    history.value = await loadServerHistory(props.uuid, props.hours ?? 1)
  }
  finally {
    loading.value = false
  }
}

// 实时档位由详情页统一驱动 refreshNonce 触发刷新；各图表共用同一信号并借 single-flight 合并并发请求
// immediate 已覆盖首次加载，不再额外挂 onMounted 双触发
watch(() => props.uuid, () => { void load() }, { immediate: true })
watch(() => props.hours, () => { void load() })
watch(() => props.refreshNonce, () => {
  if (props.realtime)
    void load()
})

const subtitle = computed(() => props.realtime ? t('pingChart.realtimeSubtitle') : t('pingChart.rangeSubtitle', { range: props.rangeLabel || '' }))
</script>

<template>
  <CardX
    class="glass-surface bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md"
    content-class="!pt-2"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold">{{ t('pingChart.title') }}</div>
            <div class="text-[10px] leading-4 text-muted-foreground">
              {{ subtitle }}
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <Button v-if="!hiddenAll" size="xs" variant="outline" @click="hiddenAll = true">
              {{ t('pingChart.hideAll') }}
            </Button>
            <Button v-else size="xs" variant="outline" @click="hiddenAll = false">
              {{ t('pingChart.showAll') }}
            </Button>
            <Button size="xs" variant="outline" @click="load">
              {{ t('pingChart.refresh') }}
            </Button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <label class="inline-flex cursor-pointer items-center gap-1.5">
            <Switch v-model="lossBand" :aria-label="t('pingChart.lossBand')" />
            {{ t('pingChart.lossBand') }}
          </label>
          <label class="inline-flex cursor-pointer items-center gap-1.5">
            <Switch v-model="smoothing" :aria-label="t('pingChart.smoothing')" />
            {{ t('pingChart.smoothing') }}
          </label>
          <label class="inline-flex cursor-pointer items-center gap-1.5">
            <Switch v-model="connectNulls" :aria-label="t('pingChart.connectNulls')" />
            {{ t('pingChart.connectNulls') }}
          </label>
        </div>
      </div>
    </template>

    <Spinner :show="loading">
      <div class="relative h-52">
        <VChart v-if="history.length" :option="chartOption" autoresize class="h-full w-full" />
        <div v-else class="flex h-full items-center justify-center text-xs text-muted-foreground">
          {{ t('pingChart.noData') }}
        </div>
        <div v-if="hiddenAll && history.length" class="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/40 text-xs text-muted-foreground backdrop-blur-[1px]">
          {{ t('pingChart.hidden') }}
        </div>
      </div>
    </Spinner>

    <!-- 线路概览 -->
    <div class="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      <div
        v-for="item in currentStats" :key="item.carrier.key"
        class="flex items-center justify-between rounded-md bg-slate-500/5 px-2 py-1.5"
      >
        <span class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: item.carrier.color }" />
          {{ carrierLabel(item.carrier.key) }}
        </span>
        <span class="text-right text-[11px] tabular-nums">
          <span class="font-medium text-foreground">{{ item.ping === null ? '-' : `${item.ping.toFixed(1)} ms` }}</span>
          <span v-if="item.loss !== null" class="ml-1" :class="item.loss > 5 ? 'text-red-500' : 'text-muted-foreground'">
            {{ item.loss.toFixed(1) }}%
          </span>
        </span>
      </div>
    </div>
  </CardX>
</template>