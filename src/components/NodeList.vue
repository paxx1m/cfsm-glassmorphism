<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { DataTooltip } from '@/components/ui/data-tooltip'
import NodePingListCell from '@/components/NodePingListCell.vue'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime } from '@/utils/helper'
import { getDiskPercentage, getMemoryPercentage, getTrafficUsed, getTrafficUsedPercentage } from '@/utils/nodeMetricsHelper'
import { getOSImage } from '@/utils/osImageHelper'
import { getFlagUrl, getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { formatBillingPrice, getExpireStatus, getExpireText } from '@/utils/tagHelper'

const props = defineProps<{
  nodes: NodeData[]
}>()

const emit = defineEmits<{
  click: [node: NodeData]
  pingClick: [node: NodeData]
}>()

const appStore = useAppStore()
const { t } = useI18n()

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals ?? {})
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals ?? {})

function cpuClass(cpu: number): string {
  if (cpu >= 80)
    return 'text-red-500'
  if (cpu >= 60)
    return 'text-amber-500'
  return 'text-emerald-500'
}

function ramClass(node: NodeData): string {
  const p = getMemoryPercentage(node)
  if (p >= 80)
    return 'text-red-500'
  if (p >= 60)
    return 'text-amber-500'
  return 'text-muted-foreground'
}

function diskClass(node: NodeData): string {
  const p = getDiskPercentage(node)
  if (p >= 80)
    return 'text-red-500'
  if (p >= 60)
    return 'text-amber-500'
  return 'text-muted-foreground'
}

function trafficClass(node: NodeData): string {
  const p = getTrafficUsedPercentage(node)
  if (p >= 80)
    return 'text-red-500'
  if (p >= 60)
    return 'text-amber-500'
  return 'text-muted-foreground'
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg bg-background/40 backdrop-blur-xl">
    <table class="w-full min-w-[720px] text-left text-xs">
      <thead>
        <tr class="border-b border-slate-500/10 text-[11px] text-muted-foreground">
          <th class="px-3 py-2 font-medium">{{ t('nodeList.status') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.server') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.region') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.price') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.cpu') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.memory') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.disk') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.traffic') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.speed') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.latency') }}</th>
          <th class="px-3 py-2 font-medium">{{ t('nodeList.updated') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="node in nodes" :key="node.id"
          v-memo="[node.online, node.name, node.cpu, node.ram_used, node.disk_used, node.net_in_speed, node.net_out_speed, node.last_updated, node.expire_date, appStore.showPrice, appStore.lang]"
          class="border-b border-slate-500/5 transition-colors hover:bg-background/60 cursor-pointer"
          @click="emit('click', node)"
        >
          <td class="px-3 py-2.5">
            <span class="size-2 rounded-full inline-block" :class="node.online ? 'bg-success' : 'bg-destructive'" />
          </td>
          <td class="px-3 py-2.5">
            <div class="flex items-center gap-2 min-w-0">
              <img :src="getFlagUrl(node.region)" :alt="getRegionDisplayName(node.region, appStore.lang) || getRegionCode(node.region)" class="size-4 shrink-0">
              <img :src="getOSImage(node.os)" :alt="node.os" class="size-4 shrink-0">
              <span class="truncate font-medium text-foreground">{{ node.name }}</span>
            </div>
            <div v-if="node.tags" class="mt-0.5 flex flex-wrap gap-1">
              <Badge
                v-for="tag in node.tags.split(',')" :key="tag"
                variant="outline" class="!text-[10px] rounded text-muted-foreground border-muted-foreground/15 px-1 py-0"
              >
                {{ tag.trim() }}
              </Badge>
            </div>
          </td>
          <td class="px-3 py-2.5 text-muted-foreground">
            {{ getRegionDisplayName(node.region, appStore.lang) || node.region || '-' }}
          </td>
          <td class="px-3 py-2.5 text-muted-foreground">
            <DataTooltip as="span" placement="top" :content="getExpireText(node.expire_date, appStore.lang)">
              {{ appStore.showPrice ? formatBillingPrice(node, appStore.lang) : '-' }}
            </DataTooltip>
          </td>
          <td class="px-3 py-2.5 tabular-nums" :class="cpuClass(node.cpu ?? 0)">
            {{ (node.cpu ?? 0).toFixed(1) }}%
          </td>
          <td class="px-3 py-2.5 tabular-nums" :class="ramClass(node)">
            {{ getMemoryPercentage(node).toFixed(1) }}%
            <div class="text-[10px] text-muted-foreground">{{ formatBytes(node.ram_used ?? 0) }}</div>
          </td>
          <td class="px-3 py-2.5 tabular-nums" :class="diskClass(node)">
            {{ getDiskPercentage(node).toFixed(1) }}%
            <div class="text-[10px] text-muted-foreground">{{ formatBytes(node.disk_used ?? 0) }}</div>
          </td>
          <td class="px-3 py-2.5 tabular-nums" :class="trafficClass(node)">
            {{ formatBytes(getTrafficUsed(node)) }}
            <div v-if="node.traffic_limit" class="text-[10px] text-muted-foreground">
              {{ getTrafficUsedPercentage(node).toFixed(1) }}%
            </div>
          </td>
          <td class="px-3 py-2.5 tabular-nums text-muted-foreground">
            <div class="text-blue-600">↓ {{ formatBytesPerSecond(node.net_in_speed ?? 0) }}</div>
            <div class="text-success">↑ {{ formatBytesPerSecond(node.net_out_speed ?? 0) }}</div>
          </td>
          <td class="px-3 py-2.5 min-w-28">
            <NodePingListCell :node="node" @click="emit('pingClick', node)" />
          </td>
          <td class="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
            {{ formatDateTime(node.last_updated).slice(5, 16) }}
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!nodes.length" class="py-8 text-center text-muted-foreground">
      {{ t('nodeList.empty') }}
    </div>
  </div>
</template>