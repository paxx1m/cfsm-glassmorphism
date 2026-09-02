<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
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

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals ?? {})
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals ?? {})

const rows = computed(() => props.nodes)

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
          <th class="px-3 py-2 font-medium">状态</th>
          <th class="px-3 py-2 font-medium">服务器</th>
          <th class="px-3 py-2 font-medium">地区</th>
          <th class="px-3 py-2 font-medium">价格</th>
          <th class="px-3 py-2 font-medium">CPU</th>
          <th class="px-3 py-2 font-medium">内存</th>
          <th class="px-3 py-2 font-medium">硬盘</th>
          <th class="px-3 py-2 font-medium">流量</th>
          <th class="px-3 py-2 font-medium">实时网速</th>
          <th class="px-3 py-2 font-medium">延迟</th>
          <th class="px-3 py-2 font-medium">更新</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="node in rows" :key="node.id"
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
    <div v-if="!rows.length" class="py-8 text-center text-muted-foreground">
      暂无节点
    </div>
  </div>
</template>