<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const { t } = useI18n()

const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))

const siteFavicon = ref('/favicon.ico')
const themeTitleMap = computed(() => ({
  light: t('header.themeLight'),
  dark: t('header.themeDark'),
}) as const)

const themeIconMap = {
  light: 'icon-park-outline:sun-one',
  dark: 'icon-park-outline:moon',
} as const

interface ActionButton {
  title: string
  icon: string
  action: string
  pressed?: boolean
}

const actionButtons = computed<ActionButton[]>(() => {
  const current = appStore.themeMode === 'dark' ? 'dark' : 'light'
  const next = current === 'dark' ? 'light' : 'dark'
  const buttons: ActionButton[] = [
    {
      title: t('header.toggleTheme', { theme: themeTitleMap.value[next] }),
      icon: themeIconMap[current],
      action: 'toggleTheme',
    },
  ]
  buttons.push({
    title: t('header.openSettings'),
    icon: 'tabler:adjustments',
    action: 'openSettings',
  })
  if (appStore.isPublic || appStore.authorization) {
    buttons.push({
      title: t('header.admin'),
      icon: 'icon-park-outline:setting',
      action: 'jumpToSetting',
    })
  }
  return buttons
})

function handleButtonClick(action: string, event?: MouseEvent) {
  switch (action) {
    case 'toggleTheme': {
      const target = event?.currentTarget
      const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : null
      const click = event ? { x: event.clientX, y: event.clientY } : undefined
      const origin = click ?? (rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : undefined)
      appStore.updateThemeMode(origin)
      break
    }
    case 'openSettings':
      appStore.toggleSettings(true)
      break
    case 'jumpToSetting':
      window.location.href = '/admin#admin'
      break
  }
}

function toggleLanguage(): void {
  appStore.setLanguage(appStore.lang === 'zh-CN' ? 'en-US' : 'zh-CN')
}
</script>

<template>
  <div
    class="transition-all duration-200 top-0 sticky z-10 border-b border-transparent"
    :class="isScrolled ? '!border-slate-500/10 backdrop-blur-lg' : 'bg-transparent'"
  >
    <div class="px-4 flex-between h-14 max-w-[1280px] mx-auto">
      <div class="flex items-center gap-3 cursor-pointer" @click="router.push('/')">
        <Avatar class="size-8">
          <AvatarImage :src="siteFavicon" :alt="appStore.siteTitle" />
          <AvatarFallback>{{ appStore.siteTitle.slice(0, 1) }}</AvatarFallback>
        </Avatar>
        <h3 class="m-0 text-lg font-semibold">
          {{ appStore.siteTitle }}
        </h3>
      </div>
      <div class="flex items-center gap-1.5">
        <TooltipProvider :delay-duration="200">
          <div class="flex items-center gap-1.5">
            <Tooltip v-for="button in actionButtons" :key="button.action">
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="button.title"
                  :aria-pressed="button.pressed"
                  :class="button.pressed && 'bg-background/70 text-selection'"
                  @click="handleButtonClick(button.action, $event)"
                >
                  <Icon :icon="button.icon" :width="18" :height="18" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ button.title }}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center rounded-md bg-background/50 px-2 text-xs font-semibold text-muted-foreground backdrop-blur-xl transition-colors hover:bg-background/60 hover:text-foreground"
          :title="t('header.language')"
          :aria-label="t('header.language')"
          @click="toggleLanguage"
        >
          {{ appStore.lang === 'zh-CN' ? 'EN' : '中' }}
        </button>
      </div>
    </div>
  </div>

  <!-- 主题设置对话框 -->
  <SettingsDialog :open="appStore.settingsOpen" @update:open="appStore.toggleSettings($event)" />
</template>