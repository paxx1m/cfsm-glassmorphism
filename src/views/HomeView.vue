<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, onActivated, onDeactivated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Empty } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import NodeCard from '@/components/NodeCard.vue'
import NodeGeneralCards from '@/components/NodeGeneralCards.vue'
import NodeList from '@/components/NodeList.vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getRealtimePeakSpeed, getTotalTraffic, isExpiringNode, isHighLoadNode } from '@/utils/nodeMetricsHelper'
import { isNodeMatchSearch } from '@/utils/nodeSearch'

defineOptions({ name: 'HomeView' })

const appStore = useAppStore()
const nodesStore = useNodesStore()
const router = useRouter()
const { t } = useI18n()

const isViewActive = ref(true)

onActivated(() => {
  isViewActive.value = true
  window.scrollTo({ top: appStore.homeScrollPosition, behavior: 'instant' })
})
onDeactivated(() => {
  isViewActive.value = false
  appStore.homeScrollPosition = window.scrollY
})

const searchText = ref('')
const debouncedSearchText = ref('')
const activeQuickControl = ref<string | null>(null)

const quickControlDefinitions: Record<string, { key: string, labelKey: string, icon: string }> = {
  favorite: { key: 'favorite', labelKey: 'home.quick.favorite', icon: 'tabler:star' },
  totalTraffic: { key: 'totalTraffic', labelKey: 'home.quick.totalTraffic', icon: 'tabler:database' },
  upload: { key: 'upload', labelKey: 'home.quick.upload', icon: 'tabler:chevron-up' },
  download: { key: 'download', labelKey: 'home.quick.download', icon: 'tabler:chevron-down' },
  peak: { key: 'peak', labelKey: 'home.quick.peak', icon: 'tabler:activity' },
  offline: { key: 'offline', labelKey: 'home.quick.offline', icon: 'tabler:plug-connected-x' },
  highLoad: { key: 'highLoad', labelKey: 'home.quick.highLoad', icon: 'tabler:alert-triangle' },
  expiring: { key: 'expiring', labelKey: 'home.quick.expiring', icon: 'tabler:calendar-exclamation' },
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(searchText, (value) => {
  if (searchDebounceTimer)
    clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    debouncedSearchText.value = value
  }, 300)
})

const groups = computed(() => [
  { tab: t('home.allNodes'), name: 'all' },
  ...nodesStore.groups.map(group => ({ tab: group, name: group })),
])

const groupNodeList = computed(() => {
  const selectedGroup = appStore.nodeSelectedGroup
  if (selectedGroup === 'all')
    return nodesStore.visibleNodes
  return nodesStore.visibleNodes.filter(node => node.server_group === selectedGroup)
})

function sortByComputedValue(nodes: NodeData[], selector: (node: NodeData) => number): NodeData[] {
  return [...nodes].sort((a, b) => (selector(b) || 0) - (selector(a) || 0))
}

function placeOfflineLast(nodes: NodeData[]): NodeData[] {
  if (!appStore.offlineNodesLast)
    return nodes
  return [...nodes].sort((a, b) => (a.online === b.online ? 0 : a.online ? -1 : 1))
}

function getQuickControlNodes(nodes: NodeData[], control: string | null): NodeData[] {
  let result: NodeData[]
  switch (control) {
    case 'favorite':
      return nodes.filter(node => appStore.isFavoriteNode(node.id))
    case 'totalTraffic':
      result = sortByComputedValue(nodes, getTotalTraffic)
      break
    case 'upload':
      result = [...nodes].sort((a, b) => (b.net_out_speed || 0) - (a.net_out_speed || 0))
      break
    case 'download':
      result = [...nodes].sort((a, b) => (b.net_in_speed || 0) - (a.net_in_speed || 0))
      break
    case 'peak':
      result = sortByComputedValue(nodes, getRealtimePeakSpeed)
      break
    case 'offline':
      return nodes.filter(node => !node.online)
    case 'highLoad':
      result = nodes.filter(node => isHighLoadNode(node, appStore.homeHighLoadThreshold))
      break
    case 'expiring':
      result = nodes.filter(node => isExpiringNode(node, appStore.homeExpiringDays))
      break
    default:
      result = nodes
      break
  }
  return placeOfflineLast(result)
}

function getQuickControlCount(nodes: NodeData[], control: string): number {
  switch (control) {
    case 'favorite':
      return nodes.reduce((count, node) => count + (appStore.isFavoriteNode(node.id) ? 1 : 0), 0)
    case 'offline':
      return nodes.reduce((count, node) => count + (node.online ? 0 : 1), 0)
    case 'highLoad':
      return nodes.reduce((count, node) => count + (isHighLoadNode(node, appStore.homeHighLoadThreshold) ? 1 : 0), 0)
    case 'expiring':
      return nodes.reduce((count, node) => count + (isExpiringNode(node, appStore.homeExpiringDays) ? 1 : 0), 0)
    default:
      return nodes.length
  }
}

const quickControlKeys = computed(() => {
  const keys = Object.keys(quickControlDefinitions)
  return appStore.homeQuickControlsEnabled ? keys : []
})

const quickControls = computed(() => quickControlKeys.value.map((key) => {
  const def = quickControlDefinitions[key]
  return { key: def.key, label: t(def.labelKey), icon: def.icon }
}))

const nodeList = computed(() => {
  let filtered = groupNodeList.value
  if (debouncedSearchText.value.trim())
    filtered = filtered.filter(node => isNodeMatchSearch(node, debouncedSearchText.value))
  return getQuickControlNodes(filtered, activeQuickControl.value)
})

const quickControlCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const key of quickControlKeys.value)
    counts[key] = getQuickControlCount(groupNodeList.value, key)
  return counts
})

const emptyDescription = computed(() => {
  if (debouncedSearchText.value.trim())
    return t('home.empty.noMatch')
  if (activeQuickControl.value)
    return t('home.empty.noFilter')
  return t('home.empty.none')
})

function clearSearch(): void {
  searchText.value = ''
  debouncedSearchText.value = ''
}

function setQuickControl(key: string): void {
  activeQuickControl.value = activeQuickControl.value === key ? null : key
}

function setNodeViewMode(mode: 'card' | 'list'): void {
  appStore.nodeViewMode = mode
}

function handleNodeClick(node: NodeData): void {
  router.push({ name: 'server-detail', params: { id: node.id } })
}

const nodeCardGridClass = computed(() => {
  const sizeClass: Record<string, string> = {
    mini: 'gap-3 sm:grid-cols-[repeat(auto-fill,minmax(270px,1fr))]',
    compact: 'gap-3 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]',
    comfortable: 'gap-4 sm:grid-cols-[repeat(auto-fill,minmax(360px,1fr))]',
    large: 'gap-5 sm:grid-cols-[repeat(auto-fill,minmax(420px,1fr))]',
  }
  return ['grid grid-cols-1', sizeClass[appStore.nodeCardSize]]
})

watch(() => nodesStore.groups, (gs) => {
  const current = appStore.nodeSelectedGroup
  if (current !== 'all' && !gs.includes(current))
    appStore.nodeSelectedGroup = 'all'
}, { immediate: true })
</script>

<template>
  <div class="home-view">
    <!-- 站内公告 -->
    <div v-if="appStore.alertEnabled && appStore.alertContent" class="alert px-4">
      <Alert class="border-none bg-background/60 backdrop-blur-xs rounded-md">
        <AlertTitle v-if="appStore.alertTitle" class="text-sm font-semibold">
          {{ appStore.alertTitle }}
        </AlertTitle>
        <AlertDescription class="whitespace-pre-line break-words text-xs leading-relaxed">
          {{ appStore.alertContent }}
        </AlertDescription>
      </Alert>
    </div>

    <NodeGeneralCards v-if="!appStore.hideGeneralCard" :nodes="groupNodeList" />

    <div class="node-info p-4 pt-0 flex flex-col gap-4 relative z-1 pointer-events-none" :class="appStore.hideGeneralCard && 'pt-4'">
      <div class="nodes min-w-0">
        <Tabs v-model="appStore.nodeSelectedGroup" class="w-full flex-col gap-4">
          <div class="flex flex-col gap-2 xl:flex-row xl:items-center">
            <div class="home-controls-scroll min-w-0 overflow-x-auto overscroll-x-contain rounded-sm pointer-events-auto touch-pan-x">
              <div class="flex w-max gap-2">
                <TabsList class="w-max h-8 bg-background/50 backdrop-blur-xl rounded-md pointer-events-auto">
                  <TabsTrigger
                    v-for="group in groups" :key="group.name" :value="group.name"
                    class="h-6.5 flex-none shrink-0 text-xs border-none data-[state=active]:text-selection shadow-none rounded-sm"
                  >
                    {{ group.tab }}
                  </TabsTrigger>
                </TabsList>

                <div
                  v-if="quickControls.length"
                  class="flex h-8 w-max items-center gap-1 rounded-md bg-background/50 px-1 backdrop-blur-xl pointer-events-auto"
                >
                  <button
                    v-for="control in quickControls" :key="control.key"
                    type="button"
                    class="inline-flex h-6.5 flex-none shrink-0 items-center gap-1 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    :class="activeQuickControl === control.key ? 'bg-background text-selection shadow-sm' : ''"
                    :aria-pressed="activeQuickControl === control.key"
                    :aria-label="t('home.quick.aria', { label: control.label, count: quickControlCounts[control.key] ?? 0 })"
                    @click="setQuickControl(control.key)"
                  >
                    <Icon :icon="control.icon" :width="12" :height="12" />
                    <span>{{ control.label }}</span>
                    <span class="rounded-full bg-slate-500/10 px-1 text-[10px] tabular-nums text-foreground/65">
                      {{ quickControlCounts[control.key] ?? 0 }}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <div class="search flex min-w-0 flex-wrap gap-2 items-center justify-end pointer-events-auto max-sm:justify-start xl:ml-auto">
              <Button
                variant="outline" size="icon" :aria-label="t('home.viewCard')"
                class="w-8 h-8 border-none bg-background/50 backdrop-blur-xs shadow-none hover:bg-background/60 rounded-md"
                :class="[appStore.nodeViewMode === 'card' ? '!text-selection !bg-background' : '']"
                @click="setNodeViewMode('card')"
              >
                <Icon icon="tabler:layout-grid" :width="14" :height="14" />
              </Button>
              <Button
                variant="outline" size="icon" :aria-label="t('home.viewList')"
                class="w-8 h-8 border-none bg-background/50 backdrop-blur-xs shadow-none hover:bg-background/60 rounded-md"
                :class="[appStore.nodeViewMode === 'list' ? '!text-selection !bg-background' : '']"
                @click="setNodeViewMode('list')"
              >
                <Icon icon="tabler:table" :width="14" :height="14" />
              </Button>
              <div class="relative z-1 h-8" :class="searchText ? 'w-full sm:w-60' : 'w-8'">
                <div class="absolute top-0 right-0 w-full">
                  <Input
                    v-model="searchText" :placeholder="t('home.searchPlaceholder')"
                    :aria-label="t('home.searchLabel')"
                    class="transition-all border-none shadow-none h-8 bg-background/50 backdrop-blur-xs rounded-md hover:!bg-background/60 focus:!pl-7.5 focus:placeholder:!text-muted-foreground focus:!bg-background/80 focus:!ring-slate-500/10"
                    :class="searchText ? '!w-full sm:!w-60 !pl-7.5 pr-7 placeholder:!text-muted-foreground' : 'w-8 placeholder:text-transparent focus:!w-52 sm:focus:!w-60'"
                    @keydown.esc.prevent="clearSearch"
                  />
                  <Icon
                    icon="tabler:search" :width="14" :height="14"
                    class="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <button
                    v-if="searchText"
                    type="button"
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    :aria-label="t('home.searchClear')"
                    @click="clearSearch"
                  >
                    <Icon icon="tabler:x" :width="14" :height="14" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <TabsContent v-for="group in groups" :key="group.name" :value="group.name" class="pointer-events-auto">
            <TransitionGroup
              v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'"
              name="node-card-switch"
              tag="div"
              :css="!appStore.disablePageAnimation"
              :appear="!appStore.disablePageAnimation"
              :class="nodeCardGridClass"
            >
              <div
                v-for="(node, index) in nodeList" :key="node.id" class="min-w-0 h-full"
                :style="{ '--node-item-delay': `${Math.min(index, 12) * 35}ms` }"
              >
                <NodeCard
                  :node="node"
                  :reduce-motion="nodeList.length > 30"
                  :ping-enabled="isViewActive"
                  @click="handleNodeClick(node)"
                  @ping-click="handleNodeClick(node)"
                />
              </div>
            </TransitionGroup>
            <NodeList
              v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'"
              :nodes="nodeList"
              @click="handleNodeClick"
              @ping-click="handleNodeClick"
            />
            <div v-else class="text-muted-foreground text-center py-8">
              <Empty :description="emptyDescription" />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-controls-scroll {
  scrollbar-width: none;
}

.home-controls-scroll::-webkit-scrollbar {
  display: none;
}

.node-card-switch-enter-active,
.node-card-switch-appear-active {
  transition:
    opacity 320ms ease,
    transform 340ms cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--node-item-delay, 0ms);
}

.node-card-switch-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.node-card-switch-move {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.node-card-switch-appear-from,
.node-card-switch-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.985);
}

.node-card-switch-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.99);
  filter: blur(2px);
}
</style>