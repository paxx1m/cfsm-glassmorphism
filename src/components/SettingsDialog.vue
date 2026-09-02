<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { reactive, ref, watch } from 'vue'
import { AppDialog } from '@/components/ui/app-dialog'
import { Button } from '@/components/ui/button'
import { saveThemeOptions } from '@/services/cfsm.service'
import {
  resetLocalThemeSettings,
  saveLocalThemeSettings,
} from '@/services/themeSettingsStore'
import { useAppStore } from '@/stores/app'

const props = defineProps<{
  open: boolean
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const appStore = useAppStore()
const savingBackend = ref(false)

// 主题设置只保留外观类配置（背景图由 CF 后端外观设置统一管理，主题不接管）
interface Draft {
  defaultViewMode: string
  nodeCardSize: string
  cardBlur: number
  cardOpacity: number
  hideGeneralCard: boolean
  offlineNodesLast: boolean
  homeQuickControlsEnabled: boolean
  disablePageAnimation: boolean
}

const draft = reactive<Draft>({
  defaultViewMode: 'card',
  nodeCardSize: 'compact',
  cardBlur: 14,
  cardOpacity: 0.74,
  hideGeneralCard: false,
  offlineNodesLast: false,
  homeQuickControlsEnabled: true,
  disablePageAnimation: false,
})

watch(() => props.open, (open) => {
  if (!open)
    return
  const s = appStore.themeSettings
  draft.defaultViewMode = s.defaultViewMode === 'list' ? 'list' : 'card'
  const size = ['mini', 'compact', 'comfortable', 'large'].includes(String(s.nodeCardSize))
    ? String(s.nodeCardSize)
    : 'compact'
  draft.nodeCardSize = size
  draft.cardBlur = typeof s.cardBlur === 'number' ? s.cardBlur : 14
  draft.cardOpacity = typeof s.cardOpacity === 'number' ? s.cardOpacity : 0.74
  draft.hideGeneralCard = s.hideGeneralCard === true
  draft.offlineNodesLast = s.offlineNodesLast === true
  draft.homeQuickControlsEnabled = s.homeQuickControlsEnabled !== false
  draft.disablePageAnimation = s.disablePageAnimation === true
}, { immediate: true })

function toSettingsObject(): Record<string, unknown> {
  return {
    defaultViewMode: draft.defaultViewMode,
    nodeCardSize: draft.nodeCardSize,
    cardBlur: draft.cardBlur,
    cardOpacity: draft.cardOpacity,
    hideGeneralCard: draft.hideGeneralCard,
    offlineNodesLast: draft.offlineNodesLast,
    homeQuickControlsEnabled: draft.homeQuickControlsEnabled,
    disablePageAnimation: draft.disablePageAnimation,
  }
}

function saveLocal(): void {
  saveLocalThemeSettings(toSettingsObject())
  window.$message?.success('已保存到本机（仅当前设备生效）')
}

async function saveBackend(): Promise<void> {
  if (savingBackend.value)
    return
  savingBackend.value = true
  try {
    const remote = appStore.config?.theme_options ?? {}
    await saveThemeOptions({ ...remote, ...toSettingsObject() })
    saveLocalThemeSettings(toSettingsObject())
    window.$message?.success('已发布到后端，所有访客生效（后台缓存约 2 分钟后可见）')
  }
  catch {
    window.$message?.error('保存到后端失败，请确认已登录站长账号')
  }
  finally {
    savingBackend.value = false
  }
}

function useBackendConfig(): void {
  resetLocalThemeSettings()
  window.$message?.info('已改用后端配置')
}

async function copyJson(): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(toSettingsObject(), null, 2))
    window.$message?.success('配置 JSON 已复制到剪贴板')
  }
  catch {
    window.$message?.error('复制失败，请手动复制')
  }
}
</script>

<template>
  <AppDialog
    :open="open" title="主题设置"
    description="参数仅影响主题外观；访客保存在本机，登录站长可发布到后端供所有访客使用。背景图由后台外观设置统一管理。"
    :content-class="'!max-w-3xl'"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">默认视图</span>
          <select v-model="draft.defaultViewMode" class="h-8 rounded-md border-0 bg-background/60 px-2 text-xs outline-none">
            <option value="card">卡片</option>
            <option value="list">列表</option>
          </select>
        </label>
        <label class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">卡片密度</span>
          <select v-model="draft.nodeCardSize" class="h-8 rounded-md border-0 bg-background/60 px-2 text-xs outline-none">
            <option value="mini">迷你</option>
            <option value="compact">紧凑</option>
            <option value="comfortable">舒适</option>
            <option value="large">大</option>
          </select>
        </label>
        <label class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">卡片背景模糊</span>
          <input v-model.number="draft.cardBlur" type="number" min="0" max="40" class="h-8 w-20 rounded-md border-0 bg-background/60 px-2 text-right text-xs outline-none">
        </label>
        <label class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">卡片不透明度</span>
          <input v-model.number="draft.cardOpacity" type="number" min="0.15" max="1" step="0.05" class="h-8 w-20 rounded-md border-0 bg-background/60 px-2 text-right text-xs outline-none">
        </label>
      </div>

      <!-- 开关 -->
      <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <label class="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">显示总览指标卡</span>
          <input type="checkbox" class="h-4 w-4 accent-emerald-500" :checked="!draft.hideGeneralCard" @change="draft.hideGeneralCard = !$event.target.checked">
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">离线节点置底</span>
          <input v-model="draft.offlineNodesLast" type="checkbox" class="h-4 w-4 accent-emerald-500">
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">显示快捷筛选</span>
          <input v-model="draft.homeQuickControlsEnabled" type="checkbox" class="h-4 w-4 accent-emerald-500">
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">减弱过渡动画</span>
          <input v-model="draft.disablePageAnimation" type="checkbox" class="h-4 w-4 accent-emerald-500">
        </label>
      </div>

      <p class="text-[11px] text-muted-foreground/70">
        站点标题、背景图、自定义 head / 脚本由后台「外观设置」下发，主题不接管，也不在本机保存这些项。
      </p>

      <!-- 操作 -->
      <div class="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <Button size="sm" variant="outline" @click="saveLocal">
          <Icon icon="tabler:device-floppy" /> 保存到本机
        </Button>
        <Button v-if="appStore.authorization" size="sm" variant="default" :disabled="savingBackend" @click="saveBackend">
          <Icon :icon="savingBackend ? 'tabler:loader-2' : 'tabler:cloud-upload'" :class="savingBackend && 'animate-spin'" /> 保存到后端
        </Button>
        <Button size="sm" variant="outline" @click="useBackendConfig">
          <Icon icon="tabler:cloud-download" /> 改用后端配置
        </Button>
        <Button size="sm" variant="ghost" @click="copyJson">
          <Icon icon="tabler:clipboard-copy" /> 复制配置 JSON
        </Button>
        <span v-if="!appStore.authorization" class="ml-auto text-[11px] text-muted-foreground">
          未登录，仅本机生效（「复制配置 JSON」后可粘到后台主题自定义配置）
        </span>
      </div>
    </div>
  </AppDialog>
</template>