<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CardX } from '@/components/ui/card-x'
import { useAppStore } from '@/stores/app'
import { formatBytes, formatBytesPerSecond } from '@/utils/helper'
import { getRemainingValueCNY, formatFinanceAmount, getStoredFinanceCurrency } from '@/utils/financeHelper'

const props = defineProps<{
  nodes: NodeData[]
}>()

const appStore = useAppStore()
const { t } = useI18n()

interface OverviewCard {
  key: string
  label: string
  icon: string
  /** 大号数值（加粗、前景色） */
  primary: string
  /** 小号单位/总量（灰字） */
  secondary: string
}

/** 把 "778.7 MB" 拆成 { num: "778.7", unit: "MB" } */
function splitUnit(value: string): { num: string, unit: string } {
  const index = value.indexOf(' ')
  if (index < 0)
    return { num: value, unit: '' }
  return { num: value.slice(0, index), unit: value.slice(index + 1) }
}

const financeCurrency = computed(() => getStoredFinanceCurrency())

// 内存 / 硬盘：聚合绝对值（求和，MB→字节已由 store 换算）
const memUsed = computed(() => props.nodes.reduce((sum, node) => sum + (node.ram_used || 0), 0))
const memTotal = computed(() => props.nodes.reduce((sum, node) => sum + (node.ram_total || 0), 0))
const diskUsed = computed(() => props.nodes.reduce((sum, node) => sum + (node.disk_used || 0), 0))
const diskTotal = computed(() => props.nodes.reduce((sum, node) => sum + (node.disk_total || 0), 0))

// 剩余价值：折算 CNY 聚合
const remainingValueCNY = computed(() => props.nodes.reduce((sum, node) => sum + getRemainingValueCNY(node), 0))
const remainingValueText = computed(() => {
  const { symbol, value } = formatFinanceAmount(remainingValueCNY.value, financeCurrency.value)
  return `${symbol}${value}`
})
// 累计流量
const totalTraffic = computed(() => props.nodes.reduce((sum, node) => sum + (node.net_rx_monthly || 0) + (node.net_tx_monthly || 0), 0))
// 实时全局网速（后端 stats 聚合，缺失时本地求和）
const globalIn = computed(() => appStore.serversStats?.globalSpeedIn ?? props.nodes.reduce((sum, node) => sum + (node.net_in_speed || 0), 0))
const globalOut = computed(() => appStore.serversStats?.globalSpeedOut ?? props.nodes.reduce((sum, node) => sum + (node.net_out_speed || 0), 0))

const cards = computed<OverviewCard[]>(() => {
  const memUsedStr = formatBytes(memUsed.value)
  const memUsedPart = splitUnit(memUsedStr)
  const diskUsedStr = formatBytes(diskUsed.value)
  const diskUsedPart = splitUnit(diskUsedStr)
  const trafficStr = formatBytes(totalTraffic.value)
  const trafficPart = splitUnit(trafficStr)
  const upStr = formatBytesPerSecond(globalOut.value)
  const upPart = splitUnit(upStr)
  const downStr = formatBytesPerSecond(globalIn.value)
  const downPart = splitUnit(downStr)

  return [
    {
      key: 'memory',
      label: t('nodeGeneral.memory'),
      icon: 'icon-park-outline:memory',
      primary: memUsedPart.num,
      secondary: `${memUsedPart.unit} / ${formatBytes(memTotal.value)}`,
    },
    {
      key: 'disk',
      label: t('nodeGeneral.disk'),
      icon: 'tabler:server-2',
      primary: diskUsedPart.num,
      secondary: `${diskUsedPart.unit} / ${formatBytes(diskTotal.value)}`,
    },
    {
      key: 'remainingValue',
      label: t('nodeGeneral.remainingValue'),
      icon: 'tabler:coins',
      primary: remainingValueText.value,
      secondary: '',
    },
    {
      key: 'totalTraffic',
      label: t('nodeGeneral.totalTraffic'),
      icon: 'tabler:arrows-transfer-up-down',
      primary: trafficPart.num,
      secondary: trafficPart.unit,
    },
    {
      key: 'uploadSpeed',
      label: t('nodeGeneral.uploadSpeed'),
      icon: 'tabler:chevron-up',
      primary: upPart.num,
      secondary: upPart.unit,
    },
    {
      key: 'downloadSpeed',
      label: t('nodeGeneral.downloadSpeed'),
      icon: 'tabler:chevron-down',
      primary: downPart.num,
      secondary: downPart.unit,
    },
  ]
})

</script>

<template>
  <div
    class="px-4 pt-4 pb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
    :class="!appStore.disablePageAnimation && 'stagger-entrance'"
  >
    <CardX
      v-for="(card, i) in cards" :key="card.key"
      class="glass-surface group bg-background/50 border-none hover:bg-slate-500/10 transition-all rounded-md"
      content-class="!h-full !p-3"
      :class="!appStore.disablePageAnimation && 'fade-rise'"
      :style="{ '--stagger-i': i }"
    >
      <div class="flex h-full flex-col justify-between gap-3 min-w-0">
        <div class="flex items-center justify-between gap-2 min-w-0">
          <span class="text-xs font-medium tracking-wider text-muted-foreground">
            {{ card.label }}
          </span>
          <Icon
            :icon="card.icon" :width="20" :height="20"
            class="shrink-0 text-slate-500/25 transition-colors group-hover:text-slate-500"
          />
        </div>
        <div class="flex items-baseline gap-1 min-w-0">
          <span class="text-lg sm:text-2xl font-bold leading-none tracking-tight truncate text-foreground">
            {{ card.primary }}
          </span>
          <span v-if="card.secondary" class="text-[11px] font-medium text-muted-foreground truncate">
            {{ card.secondary }}
          </span>
        </div>
      </div>
    </CardX>
  </div>
</template>