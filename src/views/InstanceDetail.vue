<script setup lang="ts">
import type { DetailMetricCardKey } from '@/stores/app'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Empty } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import LoadChart from '@/components/LoadChart.vue'
// PingChart 在首屏折叠下方，异步加载可把 echarts chunk 推迟到需要时再取
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDurationAdaptive } from '@/utils/helper'
import { getDiskPercentage, getMemoryPercentage, getTrafficLimitBytes, getTrafficUsed, getTrafficUsedPercentage } from '@/utils/nodeMetricsHelper'
import { getOSImage } from '@/utils/osImageHelper'
import { getFlagUrl, getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { getBillingCycleDays, formatFinanceAmountBySymbol } from '@/utils/financeHelper'
import { detectCurrencySymbol, formatBillingPrice, getExpireStatus, getRemainingValue, isFreePrice, normalizeCurrency, normalizePrice, parseTags } from '@/utils/tagHelper'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const nodesStore = useNodesStore()
const { t } = useI18n()

const node = computed<NodeData | undefined>(() => nodesStore.visibleNodesById.get(String(route.params.id)))

const isFavoriteNode = computed(() => node.value ? appStore.isFavoriteNode(node.value.id) : false)

const detailNodes = computed(() => nodesStore.visibleNodes)
const detailNodeIndex = computed(() => detailNodes.value.findIndex(item => item.id === node.value?.id))

function navigateDetailNode(offset: number): void {
  const nodes = detailNodes.value
  const index = detailNodeIndex.value
  if (nodes.length < 2 || index < 0)
    return
  const target = nodes[(index + offset + nodes.length) % nodes.length]
  if (target)
    void router.push({ name: 'server-detail', params: { id: target.id } })
}

function selectDetailNodeById(id: string | number | Array<string | number> | unknown): void {
  if (typeof id !== 'string' || !id)
    return
  if (id !== node.value?.id)
    void router.push({ name: 'server-detail', params: { id } })
}

// 进入 / 切换节点时回到页面顶部
function scrollDetailToTop(): void {
  window.scrollTo({ top: 0, behavior: 'instant' })
}
onMounted(scrollDetailToTop)
watch(() => route.params.id, () => {
  nextTick(scrollDetailToTop)
})

// 详情页共享的时间范围（同时控制 LoadChart 与 PingChart）
type TimeRangeKey = 'realtime' | 'h1' | 'h6' | 'h12' | 'day1' | 'day2' | 'day7'
const timeOptions = [
  { key: 'realtime', hours: 0.167, realtime: true, labelKey: 'detail.time.realtime' },
  { key: 'h1', hours: 1, labelKey: 'detail.time.h1' },
  { key: 'h6', hours: 6, labelKey: 'detail.time.h6' },
  { key: 'h12', hours: 12, labelKey: 'detail.time.h12' },
  { key: 'day1', hours: 24, labelKey: 'detail.time.day1' },
  { key: 'day2', hours: 48, labelKey: 'detail.time.day2' },
  { key: 'day7', hours: 168, labelKey: 'detail.time.day7' },
] as const
const selectedRange = ref<TimeRangeKey>('day1')
const visibleTimeOptions = computed(() =>
  appStore.authorization ? timeOptions : timeOptions.filter(option => option.hours <= 24),
)
const currentRange = computed(() =>
  timeOptions.find(option => option.key === selectedRange.value) ?? timeOptions[4],
)
const rangeLabel = computed(() => t(currentRange.value.labelKey))
const rangeHours = computed(() => currentRange.value.hours)
const rangeRealtime = computed(() => currentRange.value.realtime === true)

// 详情页统一驱动的实时刷新：实时档下每 15s 推送一次 refreshNonce，
// LoadChart 与 PingChart 共享该信号（配合 single-flight）合并为单次历史请求。
const realtimeRefreshNonce = ref(0)
let realtimeRefreshTimer: ReturnType<typeof setInterval> | null = null
function updateRealtimeRefresh(): void {
  if (realtimeRefreshTimer) {
    clearInterval(realtimeRefreshTimer)
    realtimeRefreshTimer = null
  }
  if (rangeRealtime.value) {
    realtimeRefreshTimer = setInterval(() => { realtimeRefreshNonce.value += 1 }, 15_000)
  }
}
watch([rangeRealtime, rangeHours], updateRealtimeRefresh, { immediate: true })
onUnmounted(() => {
  if (realtimeRefreshTimer)
    clearInterval(realtimeRefreshTimer)
})

const showPriceValue = computed(() => appStore.showPrice && (appStore.isPublic || !appStore.hidePriceWhenLoggedOut))

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals ?? {})
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals ?? {})

// 直接复用 store 推算的 uptime（秒）；避免依赖 Date.now() 的非响应式计算被冻结
const uptimeSeconds = computed(() => node.value?.uptime ?? 0)

const formatUptime = (seconds: number) => formatDurationAdaptive(seconds, appStore.lang)

function toggleFavorite(): void {
  if (node.value)
    appStore.toggleFavoriteNode(node.value.id)
}

function usagePercentage(used: number, total: number): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0)
    return null
  return Math.min(100, Math.max(0, used / total * 100))
}

function splitMeasurement(value: string): { value: string, unit?: string } {
  const separatorIndex = value.lastIndexOf(' ')
  if (separatorIndex <= 0)
    return { value }
  return {
    value: value.slice(0, separatorIndex),
    unit: value.slice(separatorIndex + 1),
  }
}

interface MetricCard {
  key: DetailMetricCardKey
  label: string
  value: string
  unit?: string
  icon: string
  valueClass?: string
  tooltip?: string
}

const avgPing = computed(() => {
  const current = node.value
  if (!current)
    return null
  const values = ['ct', 'cu', 'cm']
    .map(carrier => current[`ping_${carrier}`])
    .filter((v): v is number => v !== false && v !== null && v !== undefined && Number.isFinite(Number(v)))
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
})

function getDetailMetricCard(key: DetailMetricCardKey): MetricCard {
  const current = node.value
  const masked = !showPriceValue.value
  const priceText = masked ? '***' : (current ? formatBillingPrice(current, appStore.lang) : '-')
  const memoryUsage = usagePercentage(current?.ram_used ?? 0, current?.ram_total ?? 0)
  const swapUsage = usagePercentage(current?.swap_used ?? 0, current?.swap_total ?? 0)
  const diskUsage = usagePercentage(current?.disk_used ?? 0, current?.disk_total ?? 0)

  switch (key) {
    case 'nodePrice':
      return { key, label: t('detail.metric.nodePrice'), value: priceText, icon: 'tabler:cash' }
    case 'monthlyCost': {
      const langFree = t('common.free')
      const raw = Number(normalizePrice(current?.price))
      if (isFreePrice(current?.price) || !Number.isFinite(raw) || raw <= 0)
        return { key, label: t('detail.metric.monthlyCost'), value: masked ? '***' : langFree, icon: 'tabler:receipt-2' }
      const cycleDays = getBillingCycleDays(current!.billing_cycle)
      const monthly = cycleDays > 0 ? raw / cycleDays * 30 : 0
      const symbol = normalizeCurrency(current!.currency || detectCurrencySymbol(current!.price)) || '¥'
      return { key, label: t('detail.metric.monthlyCost'), value: masked ? '***' : formatFinanceAmountBySymbol(monthly, symbol), icon: 'tabler:receipt-2' }
    }
    case 'remainingTime': {
      const expireStatus = getExpireStatus(current?.expire_date)
      const lang = appStore.lang
      if (expireStatus === 'unknown')
        return { key, label: t('detail.metric.remainingTime'), value: '-', icon: 'tabler:calendar-dollar' }
      if (expireStatus === 'expired')
        return { key, label: t('detail.metric.remainingTime'), value: t('common.expired'), icon: 'tabler:calendar-dollar', valueClass: 'text-destructive' }
      if (expireStatus === 'long_term')
        return { key, label: t('detail.metric.remainingTime'), value: t('common.longTerm'), icon: 'tabler:calendar-dollar' }
      const ts = new Date(String(current?.expire_date ?? '')).getTime()
      if (!Number.isFinite(ts))
        return { key, label: t('detail.metric.remainingTime'), value: '-', icon: 'tabler:calendar-dollar' }
      const seconds = Math.max(0, Math.floor((ts - Date.now()) / 1000))
      return {
        key,
        label: t('detail.metric.remainingTime'),
        value: formatDurationAdaptive(seconds, lang, 'ceil'),
        icon: 'tabler:calendar-dollar',
        valueClass: expireStatus === 'critical' ? 'text-destructive' : expireStatus === 'warning' ? 'text-orange-600 dark:text-orange-400' : '',
      }
    }
    case 'remainingValue': {
      if (isFreePrice(current?.price))
        return { key, label: t('detail.metric.remainingValue'), value: masked ? '***' : t('common.none'), icon: 'tabler:coins' }
      const raw = current ? getRemainingValue(current.price, current.billing_cycle, current.expire_date, current.currency) : 0
      const symbol = normalizeCurrency(current?.currency || detectCurrencySymbol(current?.price)) || '¥'
      return { key, label: t('detail.metric.remainingValue'), value: masked ? '***' : formatFinanceAmountBySymbol(raw, symbol), icon: 'tabler:coins' }
    }
    case 'cpuUsage':
      return { key, label: t('detail.metric.cpuUsage'), value: (current?.cpu ?? 0).toFixed(1), unit: '%', icon: 'tabler:cpu' }
    case 'memoryUsage':
      return { key, label: t('detail.metric.memoryUsage'), value: memoryUsage === null ? '-' : memoryUsage.toFixed(1), unit: memoryUsage === null ? undefined : '%', icon: 'icon-park-outline:memory', tooltip: memoryUsage === null ? undefined : `${formatBytes(current?.ram_used ?? 0)} / ${formatBytes(current?.ram_total ?? 0)}` }
    case 'swapUsage':
      return { key, label: t('detail.metric.swapUsage'), value: swapUsage === null ? '-' : swapUsage.toFixed(1), unit: swapUsage === null ? undefined : '%', icon: 'icon-park-outline:switch', tooltip: swapUsage === null ? undefined : `${formatBytes(current?.swap_used ?? 0)} / ${formatBytes(current?.swap_total ?? 0)}` }
    case 'diskUsage':
      return { key, label: t('detail.metric.diskUsage'), value: diskUsage === null ? '-' : diskUsage.toFixed(1), unit: diskUsage === null ? undefined : '%', icon: 'tabler:server-2', tooltip: diskUsage === null ? undefined : `${formatBytes(current?.disk_used ?? 0)} / ${formatBytes(current?.disk_total ?? 0)}` }
    case 'load':
      return { key, label: t('detail.metric.load'), value: (current?.load1 ?? 0).toFixed(2), unit: '1m', icon: 'tabler:chart-line', tooltip: current ? `5m ${current.load5.toFixed(2)} / 15m ${current.load15.toFixed(2)}` : undefined }
    case 'processes':
      return { key, label: t('detail.metric.processes'), value: Math.round(current?.processes ?? 0).toLocaleString(appStore.lang.startsWith('zh') ? 'zh-CN' : 'en-US'), icon: 'tabler:list-numbers' }
    case 'connections':
      return { key, label: t('detail.metric.connections'), value: Math.round((current?.tcp_conn ?? 0) + (current?.udp_conn ?? 0)).toLocaleString(appStore.lang.startsWith('zh') ? 'zh-CN' : 'en-US'), icon: 'tabler:plug-connected', tooltip: `TCP ${current?.tcp_conn ?? 0} / UDP ${current?.udp_conn ?? 0}` }
    case 'uptime':
      return { key, label: t('detail.metric.uptime'), value: formatUptime(uptimeSeconds.value), icon: 'tabler:clock-up' }
    case 'uploadSpeed': {
      const speed = splitMeasurement(formatBytesPerSecond(current?.net_out_speed ?? 0))
      return { key, label: t('detail.metric.uploadSpeed'), value: speed.value, unit: speed.unit, icon: 'tabler:chevrons-up' }
    }
    case 'downloadSpeed': {
      const speed = splitMeasurement(formatBytesPerSecond(current?.net_in_speed ?? 0))
      return { key, label: t('detail.metric.downloadSpeed'), value: speed.value, unit: speed.unit, icon: 'tabler:chevrons-down' }
    }
    case 'totalTraffic': {
      const used = (current?.net_rx_monthly ?? 0) + (current?.net_tx_monthly ?? 0)
      const traffic = splitMeasurement(formatBytes(used))
      return { key, label: t('detail.metric.totalTraffic'), value: traffic.value, unit: traffic.unit, icon: 'tabler:arrows-transfer-up-down', tooltip: `↑ ${formatBytes(current?.net_tx_monthly ?? 0)} / ↓ ${formatBytes(current?.net_rx_monthly ?? 0)}` }
    }
    case 'trafficQuota': {
      const hasLimit = getTrafficLimitBytes(current ?? { traffic_limit: '' } as NodeData) > 0
      const p = current ? getTrafficUsedPercentage(current) : 0
      return {
        key,
        label: t('detail.metric.trafficQuota'),
        value: hasLimit ? p.toFixed(1) : '∞',
        unit: hasLimit ? '%' : undefined,
        icon: 'tabler:gauge',
        tooltip: hasLimit && current ? `${formatBytes(getTrafficUsed(current))} / ${formatBytes(getTrafficLimitBytes(current))}` : '∞',
      }
    }
    case 'region':
      return { key, label: t('detail.metric.region'), value: getRegionDisplayName(current?.region ?? '', appStore.lang) || current?.region || '-', icon: 'tabler:map' }
    case 'ping':
      return { key, label: t('detail.metric.ping'), value: avgPing.value === null ? '-' : `${avgPing.value.toFixed(0)}`, unit: avgPing.value === null ? undefined : 'ms', icon: 'tabler:radar' }
    default:
      return { key: 'cpuUsage', label: t('detail.metric.cpuUsage'), value: (current?.cpu ?? 0).toFixed(1), unit: '%', icon: 'tabler:cpu' }
  }
}

const metricCards = computed<MetricCard[]>(() => appStore.detailMetricCardOrder.map(getDetailMetricCard))

const customTags = computed(() => parseTags(node.value?.tags).map(tag => tag.text))

const ipSupport = computed(() => {
  const current = node.value
  const arr: string[] = []
  if (current?.ip_v4 === '1')
    arr.push('IPv4')
  if (current?.ip_v6 === '1')
    arr.push('IPv6')
  return arr
})

interface InfoItem {
  key: string
  label: string
  value: string
  icon: string
}

const systemInfo = computed<InfoItem[]>(() => [
  { key: 'os', label: t('detail.sys.os'), value: node.value?.os ?? '-', icon: 'icon-park-outline:computer' },
  { key: 'kernel', label: t('detail.sys.kernel'), value: node.value?.kernel_version ?? '-', icon: 'icon-park-outline:code' },
  { key: 'uptime', label: t('detail.sys.uptime'), value: formatUptime(uptimeSeconds.value), icon: 'icon-park-outline:timer' },
  { key: 'arch', label: t('detail.sys.arch'), value: node.value?.arch ?? '-', icon: 'icon-park-outline:application-two' },
])

const diskUsagePercent = computed(() => usagePercentage(node.value?.disk_used ?? 0, node.value?.disk_total ?? 0))
const diskBarClass = computed(() => diskUsagePercent.value >= 80 ? 'bg-red-500/30' : diskUsagePercent.value >= 60 ? 'bg-amber-500/25' : 'bg-emerald-500/20')
const diskUsageText = computed(() => node.value
  ? `${formatBytes(node.value.disk_used ?? 0)} / ${formatBytes(node.value.disk_total ?? 0)}`
  : '-')

const storageInfo = computed<InfoItem[]>(() => [
  { key: 'memory', label: t('detail.storage.memory'), value: formatBytes(node.value?.ram_total ?? 0), icon: 'icon-park-outline:memory' },
  { key: 'swap', label: t('detail.storage.swap'), value: formatBytes(node.value?.swap_total ?? 0), icon: 'icon-park-outline:switch' },
  { key: 'disk', label: t('detail.storage.disk'), value: diskUsageText.value, icon: 'icon-park-outline:hard-disk' },
])

const trafficUsedBytes = computed(() => node.value ? getTrafficUsed(node.value) : 0)
const trafficLimitBytes = computed(() => node.value ? getTrafficLimitBytes(node.value) : 0)
const hasTrafficLimit = computed(() => trafficLimitBytes.value > 0)
const trafficUsedPercentage = computed(() => {
  if (!hasTrafficLimit.value)
    return 0
  return Math.min(100, Math.max(0, trafficUsedBytes.value / trafficLimitBytes.value * 100))
})
const trafficUsageText = computed(() => {
  if (!hasTrafficLimit.value)
    return '∞'
  return `${formatBytes(trafficUsedBytes.value)} / ${formatBytes(trafficLimitBytes.value)}`
})

const gpuDevices = computed(() => {
  const info = node.value?.gpu_info
  if (Array.isArray(info))
    return info
  if (typeof info === 'string' && info.trim()) {
    try {
      const parsed = JSON.parse(info)
      return Array.isArray(parsed) ? parsed : []
    }
    catch {
      return []
    }
  }
  return []
})
</script>

<template>
  <div class="instance-detail space-y-4">
    <div v-if="!node" class="p-4">
      <CardX>
        <Empty :description="t('detail.notFound')">
          <template #extra>
            <Button @click="router.push('/')">
              {{ t('detail.backHome') }}
            </Button>
          </template>
        </Empty>
      </CardX>
    </div>

    <template v-else>
      <!-- 顶部导航 -->
      <div class="px-4 flex flex-wrap gap-2 items-center sm:gap-4">
        <Button variant="ghost" size="icon-sm" class="bg-background/50 hover:bg-slate-500/10" :aria-label="t('detail.backHome')" @click="router.push('/')">
          <Icon icon="tabler:arrow-left" :width="16" :height="16" />
        </Button>
        <div class="min-w-0 text-lg font-bold flex gap-2 items-center">
          <img :src="getFlagUrl(node.region)" :alt="getRegionDisplayName(node.region, appStore.lang) || getRegionCode(node.region)" class="size-6">
          <span class="truncate">{{ node.name }}</span>
        </div>
        <Badge :variant="node.online ? 'default' : 'destructive'" class="text-xs !rounded">
          {{ node.online ? t('detail.online') : t('detail.offline') }}
        </Badge>
        <div v-if="customTags.length" class="flex flex-wrap gap-1">
          <Badge
            v-for="(tag, i) in customTags" :key="i"
            variant="outline" class="!text-[11px] rounded text-muted-foreground border-muted-foreground/15 px-1.5 py-0"
          >
            {{ tag }}
          </Badge>
        </div>
        <div class="ml-auto flex h-8 shrink-0 items-center gap-1 rounded-md bg-background/50 p-0.5 backdrop-blur-xs">
          <Button
            variant="ghost" size="icon-sm" class="size-7 rounded-sm shadow-none"
            :class="isFavoriteNode && 'text-amber-500'"
            :aria-label="isFavoriteNode ? t('detail.unfavoriteNode') : t('detail.favoriteNode')"
            :title="isFavoriteNode ? t('detail.unfavorite') : t('detail.favorite')"
            @click="toggleFavorite"
          >
            <Icon :icon="isFavoriteNode ? 'tabler:star-filled' : 'tabler:star'" :width="14" :height="14" />
          </Button>
          <Button
            variant="ghost" size="icon-sm" class="size-7 rounded-sm shadow-none"
            :disabled="detailNodes.length < 2"
            :aria-label="t('detail.prev')" :title="t('detail.prev')"
            @click="navigateDetailNode(-1)"
          >
            <Icon icon="tabler:chevron-left" :width="14" :height="14" />
          </Button>
          <Select :model-value="node.id" @update:model-value="selectDetailNodeById">
            <SelectTrigger class="h-7 max-w-34 gap-0.5 border-none bg-transparent px-1 text-xs sm:max-w-48" :aria-label="t('detail.switchNode')">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in detailNodes" :key="item.id" :value="item.id">
                {{ item.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost" size="icon-sm" class="size-7 rounded-sm shadow-none"
            :disabled="detailNodes.length < 2"
            :aria-label="t('detail.next')" :title="t('detail.next')"
            @click="navigateDetailNode(1)"
          >
            <Icon icon="tabler:chevron-right" :width="14" :height="14" />
          </Button>
        </div>
      </div>

      <!-- 指标卡片 -->
      <div
        class="px-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4"
        :class="!appStore.disablePageAnimation && 'stagger-entrance'"
      >
        <CardX
          v-for="(item, i) in metricCards" :key="item.key" hoverable size="small"
          v-memo="[item.value, item.valueClass, item.unit, appStore.disablePageAnimation]"
          class="glass-surface group h-full bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md"
          content-class="h-full !p-3"
          :class="!appStore.disablePageAnimation && 'fade-rise'"
          :style="{ '--stagger-i': i }"
        >
          <div :title="item.tooltip" class="flex h-full min-h-10 md:min-h-18 flex-col justify-between gap-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium tracking-wider text-muted-foreground">{{ item.label }}</span>
              <Icon :icon="item.icon" :width="20" :height="20" class="text-slate-500/25 transition-colors group-hover:text-slate-500" />
            </div>
            <div class="min-w-0 space-y-1">
              <div class="flex min-w-0 items-baseline gap-1 truncate font-semibold leading-none" :class="item.valueClass">
                <span class="truncate text-base sm:text-2xl">{{ item.value }}</span>
                <span v-if="item.unit" class="shrink-0 text-[11px] font-medium text-muted-foreground sm:text-xs">{{ item.unit }}</span>
              </div>
            </div>
          </div>
        </CardX>
      </div>

      <!-- 硬件 / 系统 / 存储 / 网络 -->
      <div class="px-4 gap-4 grid grid-cols-1 lg:grid-cols-2">
        <CardX :title="t('detail.hardwareInfo')" size="small" content-class="flex-1" class="glass-surface group h-full bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <div class="flex flex-col gap-3 h-full">
            <div class="min-w-0 flex flex-col gap-2 rounded-sm bg-slate-500/5 p-2">
              <div class="flex items-center justify-between gap-2 text-muted-foreground">
                <div class="flex min-w-0 items-center gap-1">
                  <Icon icon="icon-park-outline:cpu" :width="14" :height="14" />
                  <span class="text-xs sm:text-sm">CPU</span>
                </div>
              </div>
              <span class="text-xs sm:text-sm break-all">{{ node.cpu_info || '-' }} ({{ t('detail.cores', { count: node.cpu_cores }) }})</span>
            </div>
            <div class="grid gap-3 flex-1 auto-rows-fr grid-cols-3">
              <div class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
                <div class="flex gap-1 items-center text-muted-foreground">
                  <Icon icon="icon-park-outline:application-two" :width="14" :height="14" />
                  <span class="text-xs sm:text-sm">{{ t('detail.arch') }}</span>
                </div>
                <span class="text-xs sm:text-sm break-words">{{ node.arch || '-' }}</span>
              </div>
              <div class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
                <div class="flex gap-1 items-center text-muted-foreground">
                  <Icon icon="tabler:server" :width="14" :height="14" />
                  <span class="text-xs sm:text-sm">{{ t('detail.group') }}</span>
                </div>
                <span class="text-xs sm:text-sm break-words">{{ node.server_group || '-' }}</span>
              </div>
              <div v-if="gpuDevices.length" class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2 col-span-2">
                <div class="flex gap-1 items-center text-muted-foreground">
                  <Icon icon="icon-park-outline:video-one" :width="14" :height="14" />
                  <span class="text-xs sm:text-sm">GPU</span>
                </div>
                <span class="text-xs sm:text-sm break-words">
                  {{ gpuDevices.map(gpu => `${gpu.name || 'GPU'}${gpu.info != null ? ` ${gpu.info}%` : ''}`).join(' · ') }}
                </span>
              </div>
            </div>
          </div>
        </CardX>

        <CardX :title="t('detail.systemInfo')" size="small" content-class="flex-1" class="glass-surface group h-full bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <div class="gap-3 grid grid-cols-1 sm:grid-cols-2 h-full sm:auto-rows-fr">
            <div v-for="item in systemInfo" :key="item.label" class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <div class="flex min-w-0 gap-2 items-center">
                <img v-if="item.key === 'os'" :src="getOSImage(node.os)" :alt="node.os" class="size-5 shrink-0">
                <span class="text-xs sm:text-sm break-words">{{ item.value }}</span>
              </div>
            </div>
          </div>
        </CardX>

        <CardX :title="t('detail.storageInfo')" size="small" content-class="flex-1" class="glass-surface group h-full bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md">
          <div class="gap-3 grid h-full auto-rows-fr grid-cols-2 sm:grid-cols-3">
            <template v-for="item in storageInfo" :key="item.label">
              <div v-if="item.key === 'disk'" class="relative min-w-0 overflow-hidden rounded-sm bg-slate-500/5 p-2 col-span-2 sm:col-span-1">
                <div
                  class="absolute inset-y-0 left-0 rounded-sm pointer-events-none transition-[width,background-color] duration-300 ease-out"
                  :class="diskBarClass"
                  :style="{ width: `${diskUsagePercent}%` }"
                />
                <div class="relative flex flex-col gap-1">
                  <div class="flex gap-1 items-center text-muted-foreground">
                    <Icon :icon="item.icon" :width="14" :height="14" />
                    <span class="text-xs sm:text-sm">{{ item.label }}</span>
                  </div>
                  <span class="text-xs sm:text-sm break-words">{{ item.value }}</span>
                  <span v-if="diskUsagePercent !== null" class="text-[10px] tabular-nums text-muted-foreground">
                    {{ diskUsagePercent.toFixed(1) }}%
                  </span>
                </div>
              </div>
              <div v-else class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
                <div class="flex gap-1 items-center text-muted-foreground">
                  <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" />
                  <span class="text-xs sm:text-sm">{{ item.label }}</span>
                </div>
                <span class="text-xs sm:text-sm break-words">{{ item.value }}</span>
              </div>
            </template>
          </div>
        </CardX>

        <CardX :title="t('detail.networkInfo')" size="small" class="glass-surface group h-full bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md" content-class="flex-1 pt-0">
          <div class="gap-3 grid h-full auto-rows-fr grid-cols-2">
            <div class="relative min-w-0 overflow-hidden rounded-sm bg-slate-500/5 p-2">
              <div
                v-if="hasTrafficLimit"
                class="absolute inset-y-0 left-0 rounded-sm pointer-events-none transition-[width,background-color] duration-300 ease-out"
                :class="trafficUsedPercentage >= 80 ? 'bg-red-500/30' : trafficUsedPercentage >= 60 ? 'bg-amber-500/25' : 'bg-emerald-500/20'"
                :style="{ width: `${trafficUsedPercentage}%` }"
              />
              <div class="relative flex flex-col gap-1.5">
                <div class="flex gap-1 items-center text-muted-foreground">
                  <Icon icon="icon-park-outline:transfer-data" :width="14" :height="14" />
                  <span class="text-xs sm:text-sm">{{ t('detail.totalTraffic') }}</span>
                  <Badge
                    v-for="proto in ipSupport" :key="proto" variant="outline"
                    class="!text-[10px] rounded text-emerald-600 border-emerald-600/25 px-1 py-0 leading-none"
                  >
                    {{ proto }}
                  </Badge>
                </div>
                <span class="text-xs sm:text-sm break-all">{{ trafficUsageText }}</span>
              </div>
            </div>
            <div class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:dashboard-one" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">{{ t('detail.netRate') }}</span>
              </div>
              <span class="text-xs sm:text-sm break-all flex flex-row flex-wrap items-center gap-1">
                <span class="flex items-center gap-1 text-success">
                  <Icon icon="tabler:chevron-up" width="12" height="12" />
                  {{ formatBytesPerSecond(node.net_out_speed ?? 0) }}
                </span>
                <span class="px-0.5" />
                <span class="flex items-center gap-1 text-blue-600">
                  <Icon icon="tabler:chevron-down" width="12" height="12" />
                  {{ formatBytesPerSecond(node.net_in_speed ?? 0) }}
                </span>
              </span>
            </div>
          </div>
        </CardX>
      </div>

      <!-- 共享时间范围 -->
      <div class="px-4 flex justify-center">
        <Tabs v-model="selectedRange" class="w-full items-center" data-load-chart-range :class="!appStore.disablePageAnimation && 'fade-rise'">
          <TabsList class="w-max h-8 bg-background/50 backdrop-blur-xl pointer-events-auto rounded-md">
            <TabsTrigger
              v-for="option in visibleTimeOptions" :key="option.key" :value="option.key"
              class="h-6.5 flex-none shrink-0 text-xs border-none data-[state=active]:text-green-600 shadow-none rounded-sm"
            >
              {{ t(option.labelKey) }}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <LoadChart
        :uuid="node.id" :hours="rangeHours" :realtime="rangeRealtime" :refresh-nonce="realtimeRefreshNonce" class="mx-4"
      />
      <PingChart
        :uuid="node.id" :hours="rangeHours" :realtime="rangeRealtime" :range-label="rangeLabel" :refresh-nonce="realtimeRefreshNonce" class="mx-4"
      />
    </template>
  </div>
</template>