<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useAppStore } from '@/stores/app'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagUrl, getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'

/**
 * NodeCard 头部（左：状态点/名称/消息；右：收藏/OS/旗帜）。
 * 只接收原始值 props：指标更新不改变这些 props 时整体跳过重渲染。
 */
const props = defineProps<{
  name: string
  online: boolean
  message?: string
  favorited: boolean
  os: string
  region: string
  reduceMotion: boolean
}>()

const emit = defineEmits<{
  toggleFavorite: []
}>()

const appStore = useAppStore()
const { t } = useI18n()

const nodeMessage = computed(() => props.message?.trim() ?? '')
const regionAlt = computed(() => getRegionDisplayName(props.region, appStore.lang) || getRegionCode(props.region))
</script>

<template>
  <div class="flex items-center gap-2 min-w-0 flex-1">
    <div class="relative size-2.5 shrink-0">
      <span
        class="size-2.5 rounded-full block"
        :class="props.online ? 'bg-success' : 'bg-destructive'"
      />
      <span
        v-if="!props.reduceMotion"
        class="animate-ping absolute inset-0 rounded-full opacity-60"
        :class="props.online ? 'bg-success' : 'bg-destructive'"
      />
    </div>
    <span class="text-sm font-bold flex-1 min-w-0 truncate">{{ props.name }}</span>
    <DataTooltip
      v-if="nodeMessage"
      :content="nodeMessage"
      placement="top"
      as="span"
      class="inline-flex shrink-0 text-amber-500"
      content-class="w-56 whitespace-pre-line leading-snug text-left"
    >
      <Icon icon="tabler:alert-triangle-filled" width="14" height="14" :aria-label="t('nodeCard.nodeMessage')" />
    </DataTooltip>
  </div>
  <div class="flex gap-1.5 items-center shrink-0">
    <button
      type="button"
      class="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-slate-500/10 hover:text-amber-500"
      :class="props.favorited && 'text-amber-500'"
      :aria-label="props.favorited ? t('nodeCard.favoriteRemove') : t('nodeCard.favoriteAdd')"
      :title="props.favorited ? t('nodeCard.favoriteRemove') : t('nodeCard.favoriteAdd')"
      @click.stop="emit('toggleFavorite')"
      @keydown.stop
    >
      <Icon :icon="props.favorited ? 'tabler:star-filled' : 'tabler:star'" width="14" height="14" />
    </button>
    <img :src="getOSImage(props.os)" :alt="getOSName(props.os)" class="size-4">
    <img
      v-if="props.region"
      :src="getFlagUrl(props.region)"
      :alt="regionAlt"
      class="size-5 shrink-0"
    >
  </div>
</template>
