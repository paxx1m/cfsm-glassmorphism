<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { CardX } from '@/components/ui/card-x'
import NodeCardHeader from '@/components/NodeCardHeader.vue'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatDurationAdaptive, getStatus } from '@/utils/helper'
import { getDiskPercentage, getMemoryPercentage, getTrafficLimitBytes, getTrafficUsed, getTrafficUsedPercentage, hasTrafficLimit } from '@/utils/nodeMetricsHelper'
import { formatBillingPrice, formatCurrencyValue, getDaysUntilExpired, getExpireStatus, getRemainingValue, isFreePrice, normalizePrice, parseTags } from '@/utils/tagHelper'

const props = withDefaults(defineProps<{
  node: NodeData
  reduceMotion?: boolean
  pingEnabled?: boolean
}>(), {
  reduceMotion: false,
  pingEnabled: true,
})
const emit = defineEmits<{
  click: []
  pingClick: []
}>()
const appStore = useAppStore()
const { t } = useI18n()
const isFavorite = computed(() => appStore.isFavoriteNode(props.node.id))

function toggleFavorite(): void {
  appStore.toggleFavoriteNode(props.node.id)
}

function handleKeyboardOpen(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  emit('click')
}

interface RemainingInfoTag {
  icon: string
  text?: string
  prefix?: string
  value?: string
  unit?: string
  className?: string
}

const NODE_METRIC_ICONS = {
  cpu: 'tabler:cpu',
  memory: 'icon-park-outline:memory',
  disk: 'tabler:server-2',
  traffic: 'tabler:arrows-transfer-up-down',
} as const

const isMiniNodeCard = computed(() => appStore.nodeCardSize === 'mini')
const nodeCardXSize = computed(() => appStore.nodeCardSize === 'large' ? 'large' : 'medium')
const nodeCardContentClass = computed(() => appStore.nodeCardSize === 'large' ? 'gap-4' : isMiniNodeCard.value ? 'gap-2' : 'gap-3')
const nodeCardContentPaddingClass = computed(() => isMiniNodeCard.value ? 'pb-2' : '')
const nodeCardMetricGridClass = 'grid-cols-3'
const nodeCardMetricBoxClass = computed(() => isMiniNodeCard.value
  ? 'px-1 py-1'
  : appStore.nodeCardSize === 'compact' ? 'px-1.5 py-1.5' : 'px-2 py-1.5')
const nodeCardPanelClass = computed(() => appStore.nodeCardSize === 'large' ? 'h-14' : appStore.nodeCardSize === 'comfortable' ? 'h-12' : isMiniNodeCard.value ? 'h-7' : 'h-11')
const nodeCardPingPanelClass = computed(() => isMiniNodeCard.value ? 'gap-1 p-1' : 'gap-1.5 p-2')

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const offlineTime = computed(() => formatDateTime(props.node.reportedAt))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => getMemoryPercentage(props.node))
const memStatus = computed(() => getStatus(memPercentage.value))
const swapTooltip = computed(() => {
  const used = formatBytes(Math.max(0, props.node.swap_used ?? 0))
  const total = Math.max(0, props.node.swap_total ?? 0)
  return total > 0 ? t('nodeCard.swapUsed', { used, total: formatBytes(total) }) : t('nodeCard.swapUsedOnly', { used })
})
const diskPercentage = computed(() => getDiskPercentage(props.node))
const diskStatus = computed(() => getStatus(diskPercentage.value))

const {
  latencyRenderBars,
  lossRenderBars,
  latencyDisplay,
  lossDisplay,
  latencyPanelTooltip,
  lossPanelTooltip,
} = useNodePingDisplay(() => props.node, { enabled: () => props.pingEnabled })

const trafficUsedPercentage = computed(() => getTrafficUsedPercentage(props.node))
const trafficUsed = computed(() => getTrafficUsed(props.node))
const trafficLimitBytes = computed(() => getTrafficLimitBytes(props.node))
const hasLimit = computed(() => hasTrafficLimit(props.node))
const uptimeDaysText = computed(() => {
  const text = formatDurationAdaptive(props.node.uptime, appStore.lang)
  return t('common.onlineDays', { days: text })
})

// 是否显示金额：未登录且开启「未登录隐藏价格」时不显示价格 / 剩余价值
const showPriceValue = computed(() => appStore.showPrice && (appStore.isPublic || !appStore.hidePriceWhenLoggedOut))

const priceText = computed(() => {
  if (!showPriceValue.value)
    return ''
  return formatBillingPrice(props.node, appStore.lang)
})

// 第三列：剩余天数（遵守 show_expire）+ 剩余价值（遵守 show_price），免费显示"免费"
const remainingInfoTags = computed<RemainingInfoTag[]>(() => {
  const node = props.node
  const lang = appStore.lang
  const items: RemainingInfoTag[] = []
  const days = getDaysUntilExpired(node.expire_date)
  const status = getExpireStatus(node.expire_date)
  const expiryClass = status === 'expired' || status === 'critical'
    ? 'text-destructive'
    : status === 'warning' ? 'text-warning' : 'text-muted-foreground'

  if (appStore.showExpire) {
    if (status === 'unknown') {
      items.push({ icon: 'tabler:calendar-stats', text: '-', className: expiryClass })
    }
    else if (status === 'expired') {
      items.push({ icon: 'tabler:calendar-stats', text: t('common.expired'), className: expiryClass })
    }
    else if (status === 'long_term') {
      items.push({ icon: 'tabler:calendar-stats', text: t('common.longTerm'), className: expiryClass })
    }
    else if (lang === 'zh-CN') {
      items.push({ icon: 'tabler:calendar-stats', prefix: t('common.remainingPrefix'), value: String(days ?? 0), unit: t('common.dayUnit'), className: expiryClass })
    }
    else {
      items.push({ icon: 'tabler:calendar-stats', prefix: t('common.leftPrefix'), value: String(days ?? 0), unit: t('common.daysUnit'), className: expiryClass })
    }
  }

  if (showPriceValue.value) {
    const text = !normalizePrice(node.price)
      ? ''
      : isFreePrice(node.price)
        ? t('common.free')
        : formatCurrencyValue(getRemainingValue(node.price, node.billing_cycle, node.expire_date, node.currency), node.currency)
    if (text)
      items.push({ icon: 'tabler:coins', text })
  }
  return items
})

const customTags = computed(() => parseTags(props.node.tags).map(t => t.text))

const trafficStatus = computed(() => {
  if (!hasLimit.value)
    return 'success'
  if (trafficUsedPercentage.value >= 95)
    return 'error'
  if (trafficUsedPercentage.value >= 80)
    return 'warning'
  if (trafficUsedPercentage.value >= 60)
    return 'info'
  return 'success'
})

const trafficPercentageClass = computed(() => {
  if (!hasLimit.value)
    return 'text-muted-foreground'
  if (trafficUsedPercentage.value >= 95)
    return 'text-destructive'
  if (trafficUsedPercentage.value >= 80)
    return 'text-warning'
  if (trafficUsedPercentage.value >= 60)
    return 'text-warning'
  return 'text-success'
})
</script>

<template>
  <CardX
    hoverable
    :size="nodeCardXSize"
    :content-class="nodeCardContentPaddingClass"
    class="node-card glass-surface h-full w-full cursor-pointer border-none shadow-[0_0_0_3px] shadow-transparent transition-shadow duration-200 rounded-xl"
    :class="[!props.node.online && '!shadow-destructive/30']"
    role="button"
    tabindex="0"
    :aria-label="t('nodeCard.viewNode', { name: props.node.name })"
    @click="emit('click')"
    @keydown="handleKeyboardOpen"
  >
    <!-- 头部：整行交给 NodeCardHeader 子组件（props 不变即跳过重渲染） -->
    <template #header-full>
      <NodeCardHeader
        :name="props.node.name"
        :online="props.node.online"
        :message="props.node.message"
        :favorited="isFavorite"
        :os="props.node.os"
        :region="props.node.region"
        :reduce-motion="props.reduceMotion"
        @toggle-favorite="toggleFavorite"
      />
    </template>

    <template #default>
      <div class="flex flex-col relative" :class="nodeCardContentClass">
        <!-- 在线天数 + 价格徽章 -->
        <div class="relative z-20 flex items-center gap-1.5 -mt-1 h-[19px] overflow-hidden">
          <span class="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-slate-500/10 text-muted-foreground leading-tight">
            {{ uptimeDaysText }}
          </span>
          <span
            v-if="priceText"
            class="min-w-0 truncate text-[11px] px-2 py-0.5 rounded-full bg-slate-500/10 text-muted-foreground leading-tight"
          >
            {{ priceText }}
          </span>
        </div>

        <!-- mini：2 列紧凑布局 -->
        <div v-if="isMiniNodeCard" class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-2">
          <div class="grid grid-cols-2 gap-x-3 gap-y-1">
            <div class="flex flex-col gap-1">
              <div class="flex justify-between text-xs">
                <span class="inline-flex items-center text-sky-500" role="img" title="CPU" aria-label="CPU">
                  <Icon :icon="NODE_METRIC_ICONS.cpu" data-node-metric-icon="cpu" width="12" height="12" aria-hidden="true" />
                </span>
                <span class="tabular-nums font-medium">{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
              </div>
              <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" :height="4" />
            </div>

            <div class="flex flex-col gap-1" :title="swapTooltip">
              <div class="flex justify-between text-xs">
                <span class="inline-flex items-center text-emerald-500" role="img" :title="t('nodeCard.memory')" :aria-label="t('nodeCard.memory')">
                  <Icon :icon="NODE_METRIC_ICONS.memory" data-node-metric-icon="memory" width="12" height="12" aria-hidden="true" />
                </span>
                <span class="tabular-nums font-medium">{{ memPercentage.toFixed(1) }}%</span>
              </div>
              <ProgressThin :percentage="memPercentage" :status="memStatus" :height="4" />
            </div>

            <div class="col-span-2 text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.ram_used ?? 0) }} / {{ formatBytes(props.node.ram_total ?? 0) }}
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <Icon :icon="NODE_METRIC_ICONS.traffic" data-node-metric-icon="traffic" width="12" height="12" class="shrink-0 text-violet-500" aria-hidden="true" />
                <span class="truncate">{{ t('nodeCard.traffic') }}</span>
              </span>
              <span class="tabular-nums font-medium" :class="trafficPercentageClass">
                {{ hasLimit ? `${trafficUsedPercentage.toFixed(1)}%` : '∞' }}
              </span>
            </div>
            <ProgressThin :percentage="trafficUsedPercentage" :status="trafficStatus" :height="4" />
            <div class="text-[11px] truncate" :class="trafficUsedPercentage >= 95 ? 'text-destructive' : 'text-muted-foreground'">
              {{ formatBytes(trafficUsed) }}
              <template v-if="hasLimit">
                / {{ formatBytes(trafficLimitBytes) }}
              </template>
              <template v-else>
                / ∞
              </template>
            </div>
          </div>
        </div>

        <!-- 常规：CPU / 内存 / 硬盘 / 流量 四块进度 -->
        <div v-else class="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div class="flex flex-col gap-1">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <Icon :icon="NODE_METRIC_ICONS.cpu" data-node-metric-icon="cpu" width="13" height="13" class="shrink-0 text-sky-500" aria-hidden="true" />
                <span class="truncate">CPU</span>
              </span>
              <span class="tabular-nums font-medium">{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ props.node.load1.toFixed(2) }}, {{ props.node.load5.toFixed(2) }}, {{ props.node.load15.toFixed(2) }}
            </div>
          </div>

          <div class="flex flex-col gap-1" :title="swapTooltip">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <Icon :icon="NODE_METRIC_ICONS.memory" data-node-metric-icon="memory" width="13" height="13" class="shrink-0 text-emerald-500" aria-hidden="true" />
                <span class="truncate">{{ t('nodeCard.memory') }}</span>
              </span>
              <span class="tabular-nums font-medium">{{ memPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="memPercentage" :status="memStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.ram_used ?? 0) }} / {{ formatBytes(props.node.ram_total ?? 0) }}
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <Icon :icon="NODE_METRIC_ICONS.disk" data-node-metric-icon="disk" width="13" height="13" class="shrink-0 text-orange-500" aria-hidden="true" />
                <span class="truncate">{{ t('nodeCard.disk') }}</span>
              </span>
              <span class="tabular-nums font-medium">{{ diskPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="diskPercentage" :status="diskStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.disk_used ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <Icon :icon="NODE_METRIC_ICONS.traffic" data-node-metric-icon="traffic" width="13" height="13" class="shrink-0 text-violet-500" aria-hidden="true" />
                <span class="truncate">{{ t('nodeCard.traffic') }}</span>
              </span>
              <span class="tabular-nums font-medium" :class="trafficPercentageClass">
                {{ hasLimit ? `${trafficUsedPercentage.toFixed(1)}%` : '∞' }}
              </span>
            </div>
            <ProgressThin :percentage="trafficUsedPercentage" :status="trafficStatus" :height="4" />
            <div class="text-[11px] truncate" :class="trafficUsedPercentage >= 95 ? 'text-destructive' : 'text-muted-foreground'">
              {{ formatBytes(trafficUsed) }}
              <template v-if="hasLimit">
                / {{ formatBytes(trafficLimitBytes) }}
              </template>
              <template v-else>
                / ∞
              </template>
            </div>
          </div>
        </div>

        <!-- 三列：实时网速 / 累计流量 / 剩余天数+价格（或负载） -->
        <div class="grid gap-1.5" :class="nodeCardMetricGridClass">
          <div class="flex flex-col gap-0.5 rounded-lg bg-slate-500/5 min-w-0 overflow-hidden" :class="nodeCardMetricBoxClass">
            <div class="text-[11px] text-success flex items-center gap-1">
              <Icon icon="tabler:chevron-up" width="11" height="11" />
              <span class="truncate min-w-0 overflow-hidden">{{ formatBytesPerSecond(props.node.net_out_speed ?? 0) }}</span>
            </div>
            <div class="text-[11px] text-blue-600 flex items-center gap-1">
              <Icon icon="tabler:chevron-down" width="11" height="11" />
              <span class="truncate min-w-0 overflow-hidden">{{ formatBytesPerSecond(props.node.net_in_speed ?? 0) }}</span>
            </div>
          </div>

          <div class="flex flex-col gap-0.5 rounded-lg bg-slate-500/5 min-w-0 overflow-hidden" :class="nodeCardMetricBoxClass">
            <div class="text-[11px] text-muted-foreground flex items-center gap-1">
              <Icon icon="tabler:upload" width="11" height="11" />
              <span class="truncate min-w-0 overflow-hidden">{{ formatBytes(props.node.net_tx_monthly ?? 0) }}</span>
            </div>
            <div class="text-[11px] text-muted-foreground flex items-center gap-1">
              <Icon icon="tabler:download" width="11" height="11" />
              <span class="truncate min-w-0 overflow-hidden">{{ formatBytes(props.node.net_rx_monthly ?? 0) }}</span>
            </div>
          </div>

          <div class="flex flex-col gap-0.5 rounded-lg bg-slate-500/5 min-w-0 overflow-hidden" :class="nodeCardMetricBoxClass">
            <template v-if="remainingInfoTags.length">
              <div
                v-for="(item, i) in remainingInfoTags" :key="i"
                class="text-[11px] flex items-center gap-0.5"
                :class="item.className ?? 'text-muted-foreground'"
              >
                <Icon :icon="item.icon" width="11" height="11" class="shrink-0" />
                <span v-if="item.text" class="truncate min-w-0 overflow-hidden">{{ item.text }}</span>
                <template v-else>
                  <span v-if="item.prefix" class="shrink-0">{{ item.prefix }}</span>
                  <span v-if="item.value" class="shrink-0 tabular-nums">{{ item.value }}</span>
                  <span v-if="item.unit" class="shrink-0">{{ item.unit }}</span>
                </template>
              </div>
            </template>
            <template v-else>
              <div class="text-[11px] text-muted-foreground truncate">
                {{ props.node.load1.toFixed(2) }}
              </div>
              <div class="text-[11px] text-muted-foreground truncate">
                {{ props.node.load5.toFixed(2) }} / {{ props.node.load15.toFixed(2) }}
              </div>
            </template>
          </div>
        </div>

        <!-- 延迟 + 丢包（可悬停展开的迷你柱） -->
        <div class="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            class="group/panel relative flex flex-col rounded-lg bg-slate-500/5"
            :class="[nodeCardPingPanelClass, nodeCardPanelClass, !props.node.online ? 'blur-xs opacity-50' : '']"
            :title="latencyPanelTooltip"
            :aria-label="`${props.node.name} ${t('nodeCard.latency')}`"
            @click.stop="emit('pingClick')"
          >
            <div class="flex items-center justify-between text-[11px] leading-none">
              <span class="text-muted-foreground">{{ t('nodeCard.latency') }}</span>
              <span class="font-medium">{{ latencyDisplay }}</span>
            </div>
            <div
              data-node-ping-bars="latency"
              class="grid min-h-0 min-w-0 w-full flex-1 items-end justify-start gap-[1px] opacity-80 group-hover/panel:opacity-100"
              :style="{ gridTemplateColumns: `repeat(${Math.max(latencyRenderBars.length, 1)}, 7px)` }"
            >
              <span
                v-for="bar in latencyRenderBars" :key="bar.key"
                class="block h-full w-full rounded-[1px] transition-transform duration-150 group-hover/panel:scale-y-160 group-hover/panel:opacity-80"
                :class="bar.className"
                :title="bar.tooltip"
                :aria-label="bar.tooltip"
              />
            </div>
          </button>

          <button
            type="button"
            class="group/panel relative flex flex-col rounded-lg bg-slate-500/5"
            :class="[nodeCardPingPanelClass, nodeCardPanelClass, !props.node.online ? 'blur-xs opacity-50' : '']"
            :title="lossPanelTooltip"
            :aria-label="`${props.node.name} ${t('nodeCard.packetLoss')}`"
            @click.stop="emit('pingClick')"
          >
            <div class="flex items-center justify-between text-[11px] leading-none">
              <span class="text-muted-foreground">{{ t('nodeCard.packetLoss') }}</span>
              <span class="font-medium">{{ lossDisplay }}</span>
            </div>
            <div
              data-node-ping-bars="loss"
              class="grid min-h-0 min-w-0 w-full flex-1 items-end justify-start gap-[1px] opacity-80 group-hover/panel:opacity-100"
              :style="{ gridTemplateColumns: `repeat(${Math.max(lossRenderBars.length, 1)}, 7px)` }"
            >
              <span
                v-for="bar in lossRenderBars" :key="bar.key"
                class="block h-full w-full rounded-[1px] transition-transform duration-150 group-hover/panel:scale-y-160 group-hover/panel:opacity-80"
                :class="bar.className"
                :title="bar.tooltip"
                :aria-label="bar.tooltip"
              />
            </div>
          </button>
        </div>

        <!-- 自定义标签 -->
        <div v-if="customTags.length > 0" class="flex flex-wrap gap-1">
          <Badge
            v-for="(tag, i) in customTags" :key="i"
            variant="outline"
            class="!text-[11px] rounded-full text-muted-foreground border-muted-foreground/15 px-2 py-0"
          >
            {{ tag }}
          </Badge>
        </div>

        <!-- 离线遮罩 -->
        <div
          v-if="!props.node.online"
          class="absolute inset-0 flex flex-col items-center justify-center z-10 rounded-xl bg-white/20 dark:bg-black/20 backdrop-blur-[2px]"
        >
          <div class="text-sm font-semibold text-destructive">
            {{ t('nodeCard.offline') }}
          </div>
          <div class="text-[11px] text-muted-foreground mt-1">
            {{ offlineTime }}
          </div>
        </div>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
  overflow: hidden;
}
</style>