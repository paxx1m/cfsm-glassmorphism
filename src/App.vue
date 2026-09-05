<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AppDialog } from '@/components/ui/app-dialog'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useAppStore } from '@/stores/app'
import { destroyInitManager, initApp, respondToWsTimeout, retryInitApp, switchRealtimeScope, wsTimeoutOpen } from '@/utils/init'
import Provider from './components/Provider.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'

const appStore = useAppStore()
const route = useRoute()
const { t } = useI18n()

const isReady = ref(false)
const isRetryingConnection = ref(false)

/** 首页/根路径用全量实时订阅，详情页按规范切到单台服务器订阅 */
function syncRealtimeScope(): void {
  const detailId = route.params.id
  switchRealtimeScope(detailId ? String(detailId) : 'all')
}
watch(() => route.fullPath, syncRealtimeScope)

async function retryConnection(): Promise<void> {
  if (isRetryingConnection.value)
    return
  isRetryingConnection.value = true
  try {
    const recovered = await retryInitApp()
    if (recovered)
      window.$message?.success(t('app.connected'))
    else
      window.$message?.error(t('app.stillCannotConnect'))
  }
  catch (error) {
    console.error('[App] Connection retry failed:', error)
    window.$message?.error(t('app.retryFailed'))
  }
  finally {
    isRetryingConnection.value = false
  }
}

function goToAdmin(): void {
  window.location.href = '/admin#admin'
}

onMounted(async () => {
  try {
    await initApp()
    syncRealtimeScope()
    await nextTick()
  }
  catch (error) {
    console.error('[App] Initialization failed:', error)
  }
  finally {
    isReady.value = true
  }
})

onUnmounted(() => {
  destroyInitManager()
})
</script>

<template>
  <Provider>
    <Header />
    <Transition
      :css="!appStore.disablePageAnimation"
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
    >
      <div v-if="isReady" class="app-shell">
        <main class="min-h-screen overflow-hidden">
          <div class="mx-auto max-w-[1280px] px-4 pt-4">
            <!-- 私有站点需登录 -->
            <Alert v-if="appStore.loginRequired" variant="destructive" class="!pr-28 border-none bg-destructive/10 backdrop-blur-xs rounded-md">
              <Icon icon="tabler:lock" />
              <AlertTitle>{{ t('app.loginTitle') }}</AlertTitle>
              <AlertDescription>{{ t('app.loginDesc') }}</AlertDescription>
              <AlertAction class="top-1/2 -translate-y-1/2">
                <Button size="sm" variant="outline" @click="goToAdmin">
                  <Icon icon="tabler:lock-open" />
                  {{ t('app.goAdmin') }}
                </Button>
              </AlertAction>
            </Alert>

            <!-- 连接错误 -->
            <Alert v-else-if="appStore.connectionError" variant="destructive" class="!pr-28 border-none bg-destructive/10 backdrop-blur-xs rounded-md">
              <Icon icon="tabler:plug-connected-x" />
              <AlertTitle>{{ t('app.connErrorTitle') }}</AlertTitle>
              <AlertDescription>{{ t('app.connErrorDesc') }}</AlertDescription>
              <AlertAction class="top-1/2 -translate-y-1/2">
                <Button size="sm" variant="outline" :disabled="isRetryingConnection" @click="retryConnection">
                  <Icon :icon="isRetryingConnection ? 'tabler:loader-2' : 'tabler:refresh'" :class="isRetryingConnection && 'animate-spin'" />
                  {{ isRetryingConnection ? t('app.retrying') : t('app.retry') }}
                </Button>
              </AlertAction>
            </Alert>
          </div>

          <div class="max-w-[1280px] mx-auto">
            <RouterView v-slot="{ Component }">
              <Transition
                :css="!appStore.disablePageAnimation"
                enter-active-class="transition-all duration-300 ease-out"
                enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition-opacity duration-150 ease-in" leave-from-class="opacity-100"
                leave-to-class="opacity-0"
                :mode="appStore.disablePageAnimation ? 'default' : 'out-in'"
              >
                <KeepAlive :include="['HomeView']">
                  <component :is="Component" />
                </KeepAlive>
              </Transition>
            </RouterView>
          </div>
        </main>
        <Footer />
      </div>
    </Transition>
    <Toaster rich-colors close-button position="top-center" />
    <AppDialog
      :open="wsTimeoutOpen" :title="t('app.wsTimeoutTitle')"
      :description="t('app.wsTimeoutDesc')"
      content-class="!max-w-md"
      @update:open="(open) => { if (!open) respondToWsTimeout(false) }"
    >
      <div class="flex flex-col gap-3">
        <p class="text-xs leading-relaxed text-muted-foreground">
          {{ t('app.wsTimeoutBody') }}
        </p>
        <div class="flex justify-end gap-2">
          <Button size="sm" variant="outline" @click="respondToWsTimeout(false)">
            {{ t('app.disconnect') }}
          </Button>
          <Button size="sm" variant="default" @click="respondToWsTimeout(true)">
            {{ t('app.keepConnection') }}
          </Button>
        </div>
      </div>
    </AppDialog>
  </Provider>
</template>