<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const buildVersion = __BUILD_VERSION__
</script>

<template>
  <footer class="w-full max-w-[1280px] mx-auto p-4">
    <div class="flex w-full flex-row justify-between gap-4 text-xs text-muted-foreground">
      <div class="flex gap-1 items-center">
        Powered by
        <a
          href="https://github.com/huilang-me/CF-Server-Monitor/" target="_blank" rel="noopener noreferrer"
          class="transition-opacity hover:opacity-80"
        >
          <span class="font-medium text-foreground">
            CF-Server-Monitor<template v-if="appStore.version"> v{{ appStore.version }}</template>
          </span>
        </a>
        <!-- 版本升级提示：仅登录后 /api/config 会返回 last_workers_version -->
        <span v-if="appStore.lastWorkersVersion && appStore.lastWorkersVersion !== appStore.version" class="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-red-500">
          发现新版本 {{ appStore.lastWorkersVersion }}
        </span>
      </div>
      <div class="flex flex-wrap gap-1 items-center justify-end text-right">
        Theme by
        <span class="font-medium text-foreground">
          CFSM Glassmorphism v{{ buildVersion }}
        </span>
      </div>
    </div>
  </footer>
</template>