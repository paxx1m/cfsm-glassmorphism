<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppDialog } from '@/components/ui/app-dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
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
const { t } = useI18n()
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
  window.$message?.success(t('settings.savedLocal'))
}

async function saveBackend(): Promise<void> {
  if (savingBackend.value)
    return
  savingBackend.value = true
  try {
    const remote = appStore.config?.theme_options ?? {}
    await saveThemeOptions({ ...remote, ...toSettingsObject() })
    saveLocalThemeSettings(toSettingsObject())
    window.$message?.success(t('settings.savedBackend'))
  }
  catch {
    window.$message?.error(t('settings.saveBackendFailed'))
  }
  finally {
    savingBackend.value = false
  }
}

function useBackendConfig(): void {
  resetLocalThemeSettings()
  window.$message?.info(t('settings.useBackendDone'))
}

async function copyJson(): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(toSettingsObject(), null, 2))
    window.$message?.success(t('settings.copied'))
  }
  catch {
    window.$message?.error(t('settings.copyFailed'))
  }
}
</script>

<template>
  <AppDialog
    :open="open" :title="t('settings.title')"
    :description="t('settings.description')"
    :content-class="'!max-w-3xl'"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="flex items-center gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">{{ t('settings.defaultView') }}</span>
          <div class="ml-auto">
            <Select v-model="draft.defaultViewMode">
              <SelectTrigger class="w-24" :aria-label="t('settings.defaultView')">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="card">{{ t('settings.optionCard') }}</SelectItem>
                <SelectItem value="list">{{ t('settings.optionList') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div class="flex items-center gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">{{ t('settings.cardDensity') }}</span>
          <div class="ml-auto">
            <Select v-model="draft.nodeCardSize">
              <SelectTrigger class="w-24" :aria-label="t('settings.cardDensity')">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mini">{{ t('settings.optionMini') }}</SelectItem>
                <SelectItem value="compact">{{ t('settings.optionCompact') }}</SelectItem>
                <SelectItem value="comfortable">{{ t('settings.optionComfortable') }}</SelectItem>
                <SelectItem value="large">{{ t('settings.optionLarge') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <label class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">{{ t('settings.cardBlur') }}</span>
          <input v-model.number="draft.cardBlur" type="number" min="0" max="40" class="h-8 w-20 rounded-md border-0 bg-background/60 px-2 text-right text-xs outline-none">
        </label>
        <label class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">{{ t('settings.cardOpacity') }}</span>
          <input v-model.number="draft.cardOpacity" type="number" min="0.15" max="1" step="0.05" class="h-8 w-20 rounded-md border-0 bg-background/60 px-2 text-right text-xs outline-none">
        </label>
      </div>

      <!-- 开关 -->
      <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <div class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">{{ t('settings.showGeneral') }}</span>
          <Switch :model-value="!draft.hideGeneralCard" @update:model-value="draft.hideGeneralCard = !$event" :aria-label="t('settings.showGeneral')" />
        </div>
        <div class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">{{ t('settings.offlineLast') }}</span>
          <Switch v-model="draft.offlineNodesLast" :aria-label="t('settings.offlineLast')" />
        </div>
        <div class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">{{ t('settings.showQuick') }}</span>
          <Switch v-model="draft.homeQuickControlsEnabled" :aria-label="t('settings.showQuick')" />
        </div>
        <div class="flex items-center justify-between gap-3 rounded-md bg-slate-500/5 px-3 py-2">
          <span class="text-xs text-muted-foreground">{{ t('settings.reduceAnimation') }}</span>
          <Switch v-model="draft.disablePageAnimation" :aria-label="t('settings.reduceAnimation')" />
        </div>
      </div>

      <p class="text-[11px] text-muted-foreground/70">
        {{ t('settings.backendNote') }}
      </p>

      <!-- 操作 -->
      <div class="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <Button size="sm" variant="outline" @click="saveLocal">
          <Icon icon="tabler:device-floppy" /> {{ t('settings.saveLocal') }}
        </Button>
        <Button v-if="appStore.authorization" size="sm" variant="default" :disabled="savingBackend" @click="saveBackend">
          <Icon :icon="savingBackend ? 'tabler:loader-2' : 'tabler:cloud-upload'" :class="savingBackend && 'animate-spin'" /> {{ t('settings.saveBackend') }}
        </Button>
        <Button size="sm" variant="outline" @click="useBackendConfig">
          <Icon icon="tabler:cloud-download" /> {{ t('settings.useBackend') }}
        </Button>
        <Button size="sm" variant="ghost" @click="copyJson">
          <Icon icon="tabler:clipboard-copy" /> {{ t('settings.copyJson') }}
        </Button>
        <span v-if="!appStore.authorization" class="ml-auto text-[11px] text-muted-foreground">
          {{ t('settings.notLoggedIn') }}
        </span>
      </div>
    </div>
  </AppDialog>
</template>