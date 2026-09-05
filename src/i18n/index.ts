import { createI18n } from 'vue-i18n'

export type AppLocale = 'zh-CN' | 'en-US'

export const LOCALE_ZH: AppLocale = 'zh-CN'
export const LOCALE_EN: AppLocale = 'en-US'

/** 与后端 /api/config 的 default_language 取值对应：auto / zh / en */
export function resolveDefaultLocale(lang: 'auto' | 'zh' | 'en' | string | undefined): AppLocale {
  if (lang === 'zh')
    return 'zh-CN'
  if (lang === 'en')
    return 'en-US'
  if (typeof window !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh'))
    return 'zh-CN'
  return 'en-US'
}

/** 浏览器本地语言 → 主题语言包 */
export function localeFromBrowser(): AppLocale {
  return resolveDefaultLocale('auto')
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: LOCALE_ZH,
  fallbackLocale: LOCALE_ZH,
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    [LOCALE_ZH]: {},
    [LOCALE_EN]: {},
  },
})

/** 懒加载语言包：按需动态 import 对应 JSON，Vite 会单独分包。 */
export async function loadLocale(locale: AppLocale): Promise<void> {
  const loaded = Object.keys(i18n.global.getLocaleMessage(locale)).length > 0
  if (loaded && i18n.global.locale.value === locale)
    return
  const messages = await importMessages(locale)
  i18n.global.setLocaleMessage(locale, messages as never)
  i18n.global.locale.value = locale
}

async function importMessages(locale: AppLocale): Promise<Record<string, unknown>> {
  const mod = locale === LOCALE_ZH
    ? await import('./locales/zh-CN.json')
    : await import('./locales/en-US.json')
  return (mod as { default: Record<string, unknown> }).default ?? {}
}

export async function initI18n(locale: AppLocale = localeFromBrowser()): Promise<void> {
  await loadLocale(locale)
}