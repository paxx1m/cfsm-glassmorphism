<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))

const siteFavicon = ref('/favicon.ico')
const themeTitleMap = {
  auto: '跟随系统主题',
  light: '浅色主题',
  dark: '深色主题',
} as const

const themeIconMap = {
  auto: appStore.isDark ? 'icon-park-outline:moon' : 'icon-park-outline:sun-one',
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
  const buttons: ActionButton[] = [
    {
      title: `${themeTitleMap[appStore.themeMode]}（点击切换）`,
      icon: themeIconMap[appStore.themeMode],
      action: 'toggleTheme',
    },
  ]
  buttons.push({
    title: '主题设置',
    icon: 'tabler:adjustments',
    action: 'openSettings',
  })
  if (appStore.isPublic || appStore.authorization) {
    buttons.push({
      title: '后台管理',
      icon: 'icon-park-outline:setting',
      action: 'jumpToSetting',
    })
  }
  return buttons
})

function handleButtonClick(action: string) {
  switch (action) {
    case 'toggleTheme':
      appStore.updateThemeMode()
      break
    case 'openSettings':
      appStore.toggleSettings(true)
      break
    case 'jumpToSetting':
      window.location.href = '/admin#admin'
      break
  }
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
      <TooltipProvider :delay-duration="200">
        <div class="flex items-center gap-2">
          <Tooltip v-for="button in actionButtons" :key="button.action">
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                :aria-label="button.title"
                :aria-pressed="button.pressed"
                :class="button.pressed && 'bg-background/70 text-selection'"
                @click="handleButtonClick(button.action)"
              >
                <Icon :icon="button.icon" :width="18" :height="18" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ button.title }}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  </div>

  <!-- 主题设置对话框 -->
  <SettingsDialog :open="appStore.settingsOpen" @update:open="appStore.toggleSettings($event)" />
</template>