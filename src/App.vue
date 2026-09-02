<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
      window.$message?.success('连接已恢复。')
    else
      window.$message?.error('仍无法连接服务器，请稍后再试。')
  }
  catch (error) {
    console.error('[App] Connection retry failed:', error)
    window.$message?.error('重试失败，请稍后再试。')
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
              <AlertTitle>需要登录</AlertTitle>
              <AlertDescription>该站点未公开，请登录后访问监控面板。</AlertDescription>
              <AlertAction class="top-1/2 -translate-y-1/2">
                <Button size="sm" variant="outline" @click="goToAdmin">
                  <Icon icon="tabler:lock-open" />
                  前往管理后台登录
                </Button>
              </AlertAction>
            </Alert>

            <!-- 连接错误 -->
            <Alert v-else-if="appStore.connectionError" variant="destructive" class="!pr-28 border-none bg-destructive/10 backdrop-blur-xs rounded-md">
              <Icon icon="tabler:plug-connected-x" />
              <AlertTitle>服务连接错误</AlertTitle>
              <AlertDescription>连接服务器失败，请检查网络后重试。</AlertDescription>
              <AlertAction class="top-1/2 -translate-y-1/2">
                <Button size="sm" variant="outline" :disabled="isRetryingConnection" @click="retryConnection">
                  <Icon :icon="isRetryingConnection ? 'tabler:loader-2' : 'tabler:refresh'" :class="isRetryingConnection && 'animate-spin'" />
                  {{ isRetryingConnection ? '重试中' : '重试' }}
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
      :open="wsTimeoutOpen" title="实时连接超时"
      description="连续实时连接已达管理员设置的时间上限。"
      content-class="!max-w-md"
      @update:open="(open) => { if (!open) respondToWsTimeout(false) }"
    >
      <div class="flex flex-col gap-3">
        <p class="text-xs leading-relaxed text-muted-foreground">
          是否继续保持实时连接？「继续连接」将重新建立连接并重新计时；「断开连接」则暂停实时推送，仅保留低频轮询更新，且不会自动重连。
        </p>
        <div class="flex justify-end gap-2">
          <Button size="sm" variant="outline" @click="respondToWsTimeout(false)">
            断开连接
          </Button>
          <Button size="sm" variant="default" @click="respondToWsTimeout(true)">
            继续连接
          </Button>
        </div>
      </div>
    </AppDialog>
  </Provider>
</template>