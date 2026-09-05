import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { i18n, initI18n } from '@/i18n'
import { setupIconify } from '@/utils/iconify'
import { message } from '@/utils/message'
import App from './App.vue'
import router from './router'

import './styles/main.css'

window.$message = message

setupIconify().catch((err) => {
  console.warn('[main] iconify init failed', err)
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(i18n)
app.use(router)

app.mount('#app')

// 懒加载浏览器本地语言的语言包（默认中文；/api/config 的 default_language 会随后接管）
void initI18n()
