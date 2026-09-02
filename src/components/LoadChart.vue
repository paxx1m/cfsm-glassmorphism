<script setup lang="ts">
import type { HistoryRow } from '@/services/cfsm.service'
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import MetricChartHeader from '@/components/MetricChartHeader.vue'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { loadServerHistory } from '@/services/history.service'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getLoadChartPalette } from '@/utils/chartPalette'
import { useThemeVars } from '@/composables/useThemeVars'
import { formatBytes } from '@/utils/helper'
import { mibToBytes } from '@/utils/nodeMetricsHelper'
import '@/utils/echarts'

const props = defineProps<{
  uuid: string
  /** 时间范围（小时），由详情页共享的时间档控制 */
  hours?: number
  /** 是否处于「实时」档（周期刷新） */
  realtime?: boolean
  /** 详情页统一驱动的实时刷新信号：变化时重新拉取，避免多个图表各自轮询 */
  refreshNonce?: number
}>()

const appStore = useAppStore()
const nodesStore = useNodesStore()

const themeVars = useThemeVars()

const history = ref<HistoryRow[]>([])
const loading = ref(false)
const isInitialLoad = ref(true)
const error = ref<string | null>(null)

/** 历史接口的内存/磁盘字段单位为 MiB，统一换算为字节 */
const normHistory = computed<HistoryRow[]>(() => history.value.map(row => ({
  ...row,
  ram_used: row.ram_used != null ? mibToBytes(row.ram_used) : undefined,
  ram_total: row.ram_total != null ? mibToBytes(row.ram_total) : undefined,
  swap_used: row.swap_used != null ? mibToBytes(row.swap_used) : undefined,
  swap_total: row.swap_total != null ? mibToBytes(row.swap_total) : undefined,
  disk_used: row.disk_used != null ? mibToBytes(row.disk_used) : undefined,
  disk_total: row.disk_total != null ? mibToBytes(row.disk_total) : undefined,
})))

async function loadData(): Promise<void> {
  if (!props.uuid)
    return
  if (isInitialLoad.value)
    loading.value = true
  error.value = null

  const hours = props.hours ?? 24

  try {
    const rows = await loadServerHistory(props.uuid, hours)
    history.value = rows
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : '获取历史数据失败'
    history.value = []
  }
  finally {
    loading.value = false
    isInitialLoad.value = false
  }
}

// 实时档位由详情页统一驱动 refreshNonce 触发刷新，其它档位只在切换/打开时请求一次
watch(() => props.uuid, () => {
  isInitialLoad.value = true
  history.value = []
  void loadData()
}, { immediate: true })

watch(() => props.hours, () => {
  void loadData()
})

// 详情页在「实时」档下周期性推送 refreshNonce；各图表共用同一信号并借 single-flight 合并并发请求
watch(() => props.refreshNonce, () => {
  if (props.realtime)
    void loadData()
})

function formatTime(ts: number, showDate: boolean): string {
  const date = dayjs(ts)
  return showDate ? date.format('M/D HH:mm') : date.format('HH:mm')
}

const showDateInAxis = computed(() => (props.hours ?? 24) >= 24)

const chartColors = computed(() => getLoadChartPalette(appStore.colorVisionFriendly))

const node = computed(() => nodesStore.nodesById.get(props.uuid))

const baseXAxis = computed(() => ({
  type: 'category' as const,
  data: normHistory.value.map(row => formatTime(row.timestamp, showDateInAxis.value)),
  axisLabel: { fontSize: 11, color: themeVars.value.textColor3, margin: 12 },
  axisLine: { show: true, lineStyle: { color: themeVars.value.borderColor, width: 1 } },
  axisTick: { show: false },
  boundaryGap: false,
}))

const baseYAxis = computed(() => ({
  type: 'value' as const,
  axisLabel: { fontSize: 11, color: themeVars.value.textColor3 },
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: themeVars.value.progressRailColor, type: 'dashed' as const } },
}))

const baseTooltip = computed(() => ({
  trigger: 'axis' as const,
  backgroundColor: themeVars.value.bodyColor,
  borderColor: 'transparent',
  borderWidth: 0,
  textStyle: { color: themeVars.value.textColor1, fontSize: 12 },
  axisPointer: {
    type: 'cross' as const,
    lineStyle: { color: themeVars.value.borderColor, type: 'dashed' as const },
    label: { backgroundColor: themeVars.value.textColor1, color: themeVars.value.bodyColor },
  },
}))

const cpuChartOption = computed(() => ({
  animation: false,
  tooltip: {
    ...baseTooltip.value,
    valueFormatter: (value: number | null) => `${value == null ? '-' : value.toFixed(1)}%`,
  },
  grid: { top: 24, right: 16, bottom: 28, left: 48 },
  xAxis: baseXAxis.value,
  yAxis: [{
    ...baseYAxis.value,
    name: 'CPU %',
    min: 0,
    max: 100,
    axisLabel: { ...baseYAxis.value.axisLabel, formatter: '{value}%' },
  }, {
    ...baseYAxis.value,
    name: '负载',
    min: 0,
    splitLine: { show: false },
  }],
  series: [
    {
      name: 'CPU',
      type: 'line',
      data: seriesData.value.cpu,
      showSymbol: false,
      yAxisIndex: 0,
      lineStyle: { width: 1.5, color: chartColors.value.primary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: chartColors.value.primaryAreaStrong },
            { offset: 1, color: chartColors.value.primaryAreaFaint },
          ],
        },
      },
    },
    {
      name: '负载',
      type: 'line',
      data: seriesData.value.load,
      showSymbol: false,
      yAxisIndex: 1,
      lineStyle: { width: 1.5, color: chartColors.value.secondary, cap: 'round' as const },
    },
  ],
}))

function parseLoad(loadAvg: string | undefined): number | null {
  const values = String(loadAvg ?? '').split(/\s+/).map(Number).filter(Number.isFinite)
  return values[0] ?? null
}

const memoryChartOption = computed(() => ({
  animation: false,
  tooltip: {
    ...baseTooltip.value,
    valueFormatter: (value: number | null) => value == null ? '-' : formatBytes(value),
  },
  legend: { data: ['RAM', 'Swap'], bottom: 4, itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 10, color: themeVars.value.textColor3 } },
  grid: { top: 24, right: 16, bottom: 46, left: 52 },
  xAxis: baseXAxis.value,
  yAxis: { ...baseYAxis.value, name: '内存', axisLabel: { ...baseYAxis.value.axisLabel, formatter: (val: number) => formatBytes(val) } },
  series: [
    {
      name: 'RAM', type: 'line', data: seriesData.value.ram,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.primary, cap: 'round' as const },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: chartColors.value.primaryAreaStrong }, { offset: 1, color: chartColors.value.primaryAreaFaint }] } },
    },
    {
      name: 'Swap', type: 'line', data: seriesData.value.swap,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.quaternary, cap: 'round' as const },
    },
  ],
}))

/* 磁盘用量图：暂不需要，注释保留
const diskChartOption = computed(() => ({
  animation: false,
  tooltip: {
    ...baseTooltip.value,
    valueFormatter: (value: number | null) => value == null ? '-' : formatBytes(value),
  },
  legend: { data: ['磁盘已用', '总量'], bottom: 4, itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 10, color: themeVars.value.textColor3 } },
  grid: { top: 24, right: 16, bottom: 46, left: 52 },
  xAxis: baseXAxis.value,
  yAxis: { ...baseYAxis.value, name: '磁盘', axisLabel: { ...baseYAxis.value.axisLabel, formatter: (val: number) => formatBytes(val) } },
  series: [
    {
      name: '磁盘已用', type: 'line', data: seriesData.value.diskUsed,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.tertiary, cap: 'round' as const },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: chartColors.value.tertiaryAreaStrong }, { offset: 1, color: chartColors.value.tertiaryAreaFaint }] } },
    },
    {
      name: '总量', type: 'line', data: seriesData.value.diskTotal,
      showSymbol: false, lineStyle: { width: 1.2, type: 'dashed' as const, color: chartColors.value.quinary, cap: 'round' as const },
    },
  ],
}))
*/

const diskIoChartOption = computed(() => ({
  animation: false,
  tooltip: {
    ...baseTooltip.value,
    valueFormatter: (value: number | null) => value == null ? '-' : `${formatBytes(value)}/s`,
  },
  legend: { data: ['读取', '写入'], bottom: 4, itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 10, color: themeVars.value.textColor3 } },
  grid: { top: 24, right: 16, bottom: 46, left: 52 },
  xAxis: baseXAxis.value,
  yAxis: { ...baseYAxis.value, name: '磁盘 IO', axisLabel: { ...baseYAxis.value.axisLabel, formatter: (val: number) => formatBytes(val) } },
  series: [
    {
      name: '读取', type: 'line', data: seriesData.value.diskRead,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.primary, cap: 'round' as const },
    },
    {
      name: '写入', type: 'line', data: seriesData.value.diskWrite,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.quaternary, cap: 'round' as const },
    },
  ],
}))

const networkChartOption = computed(() => ({
  animation: false,
  tooltip: {
    ...baseTooltip.value,
    valueFormatter: (value: number | null) => value == null ? '-' : `${formatBytes(value)}/s`,
  },
  legend: { data: ['下行', '上行'], bottom: 4, itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 10, color: themeVars.value.textColor3 } },
  grid: { top: 24, right: 16, bottom: 46, left: 52 },
  xAxis: baseXAxis.value,
  yAxis: { ...baseYAxis.value, name: '速度', axisLabel: { ...baseYAxis.value.axisLabel, formatter: (val: number) => formatBytes(val) } },
  series: [
    {
      name: '下行', type: 'line', data: seriesData.value.netIn,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.quinary, cap: 'round' as const },
    },
    {
      name: '上行', type: 'line', data: seriesData.value.netOut,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.quaternary, cap: 'round' as const },
    },
  ],
}))

const gpuChartOption = computed(() => {
  // 取最近一行的 gpu_info 描述设备
  const lastGpu = normHistory.value.at(-1)?.gpu_info
  let devices: Array<{ name: string }> = []
  if (Array.isArray(lastGpu))
    devices = lastGpu.map(item => ({ name: item.name || 'GPU' }))
  else if (typeof lastGpu === 'string' && lastGpu.trim()) {
    try {
      const parsed = JSON.parse(lastGpu) as Array<{ name: string; info?: number | null }>
      if (Array.isArray(parsed))
        devices = parsed.map(item => ({ name: item.name || 'GPU' }))
    }
    catch {
      devices = [{ name: 'GPU' }]
    }
  }
  const usage = seriesData.value.gpu
  return {
    animation: false,
    tooltip: {
      ...baseTooltip.value,
      valueFormatter: (value: number | null) => value == null ? '-' : `${value.toFixed(1)}%`,
    },
    grid: { top: 24, right: 16, bottom: 28, left: 48 },
    xAxis: baseXAxis.value,
    yAxis: { ...baseYAxis.value, name: 'GPU %', min: 0, max: 100, axisLabel: { ...baseYAxis.value.axisLabel, formatter: '{value}%' } },
    series: [
      {
        name: 'GPU',
        type: 'line',
        data: usage,
        showSymbol: false,
        lineStyle: { width: 1.5, color: chartColors.value.senary, cap: 'round' as const },
      },
    ],
  }
})

function gpuUsage(row: HistoryRow): number | null {
  const info = row.gpu_info
  if (Array.isArray(info)) {
    const values = info.map(item => item.info).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
  }
  if (typeof info === 'string' && info.trim()) {
    try {
      const parsed = JSON.parse(info) as Array<{ name: string, info?: number | null }>
      if (Array.isArray(parsed)) {
        const values = parsed.map(item => item.info).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
      }
    }
    catch {
      return null
    }
  }
  return null
}

/** 各图表共用的序列数据：数据刷新时只做一次字段提取，避免每个图表选项各自 map 一遍 */
const seriesData = computed(() => {
  const rows = normHistory.value
  return {
    cpu: rows.map(row => row.cpu ?? null),
    load: rows.map(row => parseLoad(row.load_avg)),
    ram: rows.map(row => row.ram_used ?? null),
    swap: rows.map(row => row.swap_used ?? null),
    diskUsed: rows.map(row => row.disk_used ?? null),
    diskTotal: rows.map(row => row.disk_total ?? null),
    diskRead: rows.map(row => row.disk?.read_bps ?? null),
    diskWrite: rows.map(row => row.disk?.write_bps ?? null),
    netIn: rows.map(row => row.net_in_speed ?? null),
    netOut: rows.map(row => row.net_out_speed ?? null),
    tcp: rows.map(row => row.tcp_conn ?? null),
    udp: rows.map(row => row.udp_conn ?? null),
    process: rows.map(row => row.processes ?? null),
    gpu: rows.map(row => gpuUsage(row)),
  }
})

const connectionsChartOption = computed(() => ({
  animation: false,
  tooltip: {
    ...baseTooltip.value,
    valueFormatter: (value: number | null) => value == null ? '-' : String(Math.round(value)),
  },
  legend: { data: ['TCP', 'UDP'], bottom: 4, itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 10, color: themeVars.value.textColor3 } },
  grid: { top: 24, right: 16, bottom: 46, left: 48 },
  xAxis: baseXAxis.value,
  yAxis: { ...baseYAxis.value, name: '连接数', min: 0 },
  series: [
    {
      name: 'TCP', type: 'line', data: seriesData.value.tcp,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.primary, cap: 'round' as const },
    },
    {
      name: 'UDP', type: 'line', data: seriesData.value.udp,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.tertiary, cap: 'round' as const },
    },
  ],
}))

const processChartOption = computed(() => ({
  animation: false,
  tooltip: {
    ...baseTooltip.value,
    valueFormatter: (value: number | null) => value == null ? '-' : String(Math.round(value)),
  },
  grid: { top: 24, right: 16, bottom: 28, left: 48 },
  xAxis: baseXAxis.value,
  yAxis: { ...baseYAxis.value, name: '进程', min: 0 },
  series: [
    {
      name: '进程数', type: 'line', data: seriesData.value.process,
      showSymbol: false, lineStyle: { width: 1.5, color: chartColors.value.quaternary, cap: 'round' as const },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(167,139,250,0.25)' }, { offset: 1, color: 'rgba(167,139,250,0.02)' }] } },
    },
  ],
}))

const latestStatus = computed(() => normHistory.value.at(-1) ?? null)
</script>

<template>
  <div class="flex flex-col gap-4">
    <Spinner :show="loading">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="history.length === 0 && !loading" class="py-8">
        <Empty description="暂无历史数据" />
      </div>

      <div v-else class="gap-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <CardX v-if="appStore.chartDashboardCards.some(c => c.key === 'cpu')" size="small" content-class="pt-2" class="glass-surface bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md" data-load-chart-card="cpu">
          <template #header>
            <MetricChartHeader title="CPU 与负载" icon="tabler:cpu" tone="rose">
              <span v-if="latestStatus?.cpu != null" class="text-xs">{{ latestStatus.cpu.toFixed(1) }}%</span>
              <span v-else class="text-xs">-</span>
            </MetricChartHeader>
          </template>
          <div class="h-48">
            <VChart :option="cpuChartOption" autoresize />
          </div>
        </CardX>

        <CardX v-if="appStore.chartDashboardCards.some(c => c.key === 'memory')" size="small" content-class="pt-2" class="glass-surface bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <template #header>
            <MetricChartHeader title="内存与 Swap" icon="tabler:database" tone="violet">
              <span class="text-xs">RAM {{ formatBytes(node?.ram_total ?? 0) }}</span>
            </MetricChartHeader>
          </template>
          <div class="h-48">
            <VChart :option="memoryChartOption" autoresize />
          </div>
        </CardX>

        <!-- 磁盘用量图：暂注释，保留卡片渲染占位
        <CardX v-if="appStore.chartDashboardCards.some(c => c.key === 'disk')" size="small" content-class="pt-2" class="glass-surface bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <template #header>
            <MetricChartHeader title="磁盘" icon="tabler:device-floppy" tone="emerald">
              <span class="text-xs">{{ formatBytes(node?.disk_total ?? 0) }}</span>
            </MetricChartHeader>
          </template>
          <div class="h-48">
            <VChart :option="diskChartOption" autoresize />
          </div>
        </CardX>
        -->

        <CardX v-if="appStore.chartDashboardCards.some(c => c.key === 'diskIo')" size="small" content-class="pt-2" class="glass-surface bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <template #header>
            <MetricChartHeader title="磁盘 IO" icon="tabler:device-floppy" tone="cyan">
              <span class="text-xs">B/s · IOPS</span>
            </MetricChartHeader>
          </template>
          <div class="h-48">
            <VChart :option="diskIoChartOption" autoresize />
          </div>
        </CardX>

        <CardX v-if="appStore.chartDashboardCards.some(c => c.key === 'network')" size="small" content-class="pt-2" class="glass-surface bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <template #header>
            <MetricChartHeader title="实时网络" icon="tabler:network" tone="sky">
              <span class="text-xs flex gap-2 items-center">
                <span class="flex items-center gap-0.5"><Icon icon="tabler:chevron-up" width="12" height="12" />{{ formatBytes(node?.net_out_speed ?? 0) }}</span>
                <span class="flex items-center gap-0.5"><Icon icon="tabler:chevron-down" width="12" height="12" />{{ formatBytes(node?.net_in_speed ?? 0) }}</span>
              </span>
            </MetricChartHeader>
          </template>
          <div class="h-48">
            <VChart :option="networkChartOption" autoresize />
          </div>
        </CardX>

        <CardX v-if="appStore.chartDashboardCards.some(c => c.key === 'gpu') && appStore.gpuChartEnabled" size="small" content-class="pt-2" class="glass-surface bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <template #header>
            <MetricChartHeader title="GPU 利用率" icon="tabler:device-desktop-analytics" tone="sky">
              <span v-if="latestStatus" class="text-xs">{{ gpuUsage(latestStatus) == null ? '-' : `${gpuUsage(latestStatus)?.toFixed(1)}%` }}</span>
            </MetricChartHeader>
          </template>
          <div class="h-48">
            <VChart :option="gpuChartOption" autoresize />
          </div>
        </CardX>

        <CardX v-if="appStore.chartDashboardCards.some(c => c.key === 'network')" size="small" content-class="pt-2" class="glass-surface bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <template #header>
            <MetricChartHeader title="网络连接" icon="tabler:binary-tree" tone="amber">
              <span class="text-xs">TCP {{ node?.tcp_conn ?? '-' }}</span>
            </MetricChartHeader>
          </template>
          <div class="h-48">
            <VChart :option="connectionsChartOption" autoresize />
          </div>
        </CardX>

        <CardX v-if="appStore.chartDashboardCards.some(c => c.key === 'network')" size="small" content-class="pt-2" class="glass-surface bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <template #header>
            <MetricChartHeader title="进程" icon="tabler:activity" tone="slate">
              <span class="text-xs">{{ node?.processes ?? '-' }}</span>
            </MetricChartHeader>
          </template>
          <div class="h-48">
            <VChart :option="processChartOption" autoresize />
          </div>
        </CardX>
      </div>
    </Spinner>
  </div>
</template>