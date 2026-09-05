import type { CfsmConfig, CfsmServersResponse } from '@/services/cfsm.service'
import { getLocalThemeSettings, subscribeLocalThemeSettings } from '@/services/themeSettingsStore'
import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { loadLocale } from '@/i18n'

export type ThemeMode = 'light' | 'dark'
export type Lang = 'zh-CN' | 'en-US'
export type NodeViewMode = 'card' | 'list'
export type NodeCardSize = 'mini' | 'compact' | 'comfortable' | 'large'
export type GlassColorPreset = 'emerald' | 'soft' | 'contrast' | 'midnight' | 'custom'
export type DetailMetricCardKey =
  | 'nodePrice' | 'remainingTime' | 'remainingValue'
  | 'cpuUsage' | 'memoryUsage' | 'swapUsage' | 'diskUsage' | 'load'
  | 'processes' | 'connections' | 'uptime'
  | 'uploadSpeed' | 'downloadSpeed' | 'totalTraffic' | 'trafficQuota'
  | 'region' | 'ping'

export interface GlassCustomColors {
  lightCard: string
  lightControl: string
  lightText: string
  lightMutedText: string
  lightBorder: string
  darkCard: string
  darkControl: string
  darkText: string
  darkMutedText: string
  darkBorder: string
}

export interface ChartDashboardCardKey {
  key: 'cpu' | 'memory' | 'disk' | 'diskIo' | 'gpu' | 'network'
}

type ThemeSettings = Record<string, unknown>

const DEFAULT_DETAIL_METRIC_CARD_ORDER: DetailMetricCardKey[] = [
  'nodePrice', 'monthlyCost', 'remainingTime', 'remainingValue',
  'totalTraffic', 'trafficQuota', 'uptime', 'connections',
]

const DEFAULT_CHART_CARDS: ChartDashboardCardKey[] = [
  { key: 'cpu' }, { key: 'memory' }, { key: 'disk' }, { key: 'diskIo' }, { key: 'gpu' },
]

const DEFAULT_GLASS_CUSTOM_COLORS: GlassCustomColors = {
  lightCard: '#f1f5f9bd',
  lightControl: '#e2e8f0c2',
  lightText: '#14151a',
  lightMutedText: '#3f4552',
  lightBorder: '#cbd5e199',
  darkCard: '#0d111ad9',
  darkControl: '#101624cc',
  darkText: '#f7f8fb',
  darkMutedText: '#d6dae4',
  darkBorder: '#ffffff2e',
}

const HEX_COLOR_REGEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i

function normalizeThemeSettings(raw: unknown): ThemeSettings {
  if (!raw)
    return {}
  if (typeof raw === 'string') {
    try {
      return normalizeThemeSettings(JSON.parse(raw))
    }
    catch {
      return {}
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw))
    return raw as ThemeSettings
  return {}
}

function readBooleanSetting(settings: ThemeSettings, key: string, fallback: boolean): boolean {
  const value = settings[key]
  return typeof value === 'boolean' ? value : fallback
}

function readNumberSetting(settings: ThemeSettings, key: string, fallback: number, min: number, max: number): number {
  const value = settings[key]
  if (typeof value !== 'number' || !Number.isFinite(value))
    return fallback
  return Math.min(Math.max(value, min), max)
}

function readStringSetting(settings: ThemeSettings, key: string, fallback = ''): string {
  const value = settings[key]
  return typeof value === 'string' ? value.trim() : fallback
}

function readColorSetting(settings: ThemeSettings, key: string, fallback: string): string {
  const value = readStringSetting(settings, key, fallback)
  return HEX_COLOR_REGEX.test(value) ? value : fallback
}

const useAppStore = defineStore('app', () => {
  const loading = ref(true)
  const connectionError = ref(false)
  const loginRequired = ref(false)

  const themeMode = useStorage<ThemeMode>('theme_mode', 'light', localStorage)
  const lang = ref<Lang>((typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')) ? 'zh-CN' : 'en-US')
  const nodeSelectedGroup = useStorage<string>('node_selected_group', 'all', localStorage)
  const favoriteNodeIds = useStorage<string[]>('theme:favorite-nodes:v1', [], localStorage)
  const storedViewMode = useStorage<NodeViewMode | null>('node_view_mode', null, localStorage)

  // CF 后端数据
  const config = ref<CfsmConfig | null>(null)
  const serversStats = ref<CfsmServersResponse['stats'] | null>(null)
  const regionStats = ref<CfsmServersResponse['regionStats']>({})
  const sysConfig = ref<CfsmServersResponse['sysConfig']>({})

  // 生效设置 = 后端 theme_options（站点预设）+ 本机覆盖（该设备访客自己的调整）
  const localSettingsVersion = ref(0)
  subscribeLocalThemeSettings(() => {
    localSettingsVersion.value += 1
  })
  const themeSettings = computed(() => {
    void localSettingsVersion.value
    return normalizeThemeSettings({
      ...(config.value?.theme_options ?? {}),
      ...getLocalThemeSettings(),
    })
  })

  const settingsOpen = ref(false)
  function toggleSettings(open?: boolean): void {
    settingsOpen.value = typeof open === 'boolean' ? open : !settingsOpen.value
  }

  const siteTitle = computed(() => config.value?.site_title || 'Cloudflare Server Monitor')
  const version = computed(() => config.value?.version || '')
  const lastWorkersVersion = computed(() => config.value?.last_workers_version || '')
  const isPublic = computed(() => config.value?.is_public !== false)
  const authorization = computed(() => config.value?.authorization === true)
  const wsTimeoutMinutes = computed(() => config.value?.frontend_ws_timeout_minutes ?? 0)
  const showPrice = computed(() => sysConfig.value.show_price !== false)
  const showExpire = computed(() => sysConfig.value.show_expire !== false)
  const showTraffic = computed(() => sysConfig.value.show_tf !== false)
  const showThreeNetDetails = computed(() => sysConfig.value.show_three_net_details !== false)

  const alertEnabled = computed(() => readBooleanSetting(themeSettings.value, 'alertEnabled', false))
  const alertTitle = computed(() => readStringSetting(themeSettings.value, 'alertTitle'))
  const alertContent = computed(() => readStringSetting(themeSettings.value, 'alertContent'))

  /** 卡片背景模糊度（px），默认 14 与现有毛玻璃一致 */
  const cardBlur = computed(() => readNumberSetting(themeSettings.value, 'cardBlur', 14, 0, 40))

  /** 卡片不透明度（0.15–1），默认 0.74 与现有半透玻璃一致 */
  const cardOpacity = computed(() => readNumberSetting(themeSettings.value, 'cardOpacity', 0.74, 0.15, 1))

  const favouriteNodeIdSet = computed(() => new Set(
    (Array.isArray(favoriteNodeIds.value) ? favoriteNodeIds.value : []).filter((id): id is string => typeof id === 'string' && Boolean(id.trim())),
  ))

  function isFavoriteNode(id: string): boolean {
    return favouriteNodeIdSet.value.has(id)
  }

  function toggleFavoriteNode(id: string): void {
    const normalized = id.trim()
    if (!normalized)
      return
    favoriteNodeIds.value = favouriteNodeIdSet.value.has(normalized)
      ? [...favouriteNodeIdSet.value].filter(item => item !== normalized)
      : [...favouriteNodeIdSet.value, normalized]
  }

  const defaultViewMode = computed<NodeViewMode>(() => {
    const value = themeSettings.value.defaultViewMode
    return value === 'list' ? 'list' : 'card'
  })

  const nodeViewMode = computed<NodeViewMode>({
    get: () => storedViewMode.value === 'list' || storedViewMode.value === 'card' ? storedViewMode.value : defaultViewMode.value,
    set: (val) => { storedViewMode.value = val },
  })

  const nodeCardSize = computed<NodeCardSize>(() => {
    const value = themeSettings.value.nodeCardSize
    if (value === 'mini' || value === 'compact' || value === 'comfortable' || value === 'large')
      return value
    return 'compact'
  })

  function isValidThemeMode(value: unknown): value is ThemeMode {
    return value === 'light' || value === 'dark'
  }

  const isDark = computed(() => isValidThemeMode(themeMode.value) ? themeMode.value === 'dark' : false)

  const resolvedThemeMode = computed<'light' | 'dark'>(() => isDark.value ? 'dark' : 'light')

  function updateThemeMode(origin?: { x: number, y: number }): void {
    const current = isValidThemeMode(themeMode.value) ? themeMode.value : 'light'
    flipThemeMode(current === 'dark' ? 'light' : 'dark', origin)
  }

  /** 亮暗切换：圆心/半径写入 CSS 变量，由 View Transition 伪元素自己播圆形展开。 */
  let themeTransitionSeq = 0
  function flipThemeMode(next: ThemeMode, origin?: { x: number, y: number }): void {
    const doc = document as Document & { startViewTransition?: (callback: () => void) => { finished?: Promise<void> } }
    const setTheme = () => { themeMode.value = next }
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (typeof window === 'undefined' || typeof doc.startViewTransition !== 'function' || reducedMotion) {
      setTheme()
      return
    }

    const fallbackX = window.innerWidth - 48
    const fallbackY = 28
    const usedFallback = !(origin && Number.isFinite(origin.x) && origin.x > 0 && Number.isFinite(origin.y) && origin.y > 0)
    const x = usedFallback ? fallbackX : Number(origin?.x)
    const y = usedFallback ? fallbackY : Number(origin?.y)
    const vw = Math.max(window.innerWidth, 1)
    const vh = Math.max(window.innerHeight, 1)
    const radius = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y))
    const maxRadius = Math.hypot(vw, vh) / Math.SQRT2
    const root = document.documentElement
    const seq = ++themeTransitionSeq

    root.dataset.themeTransition = next === 'dark' ? 'to-dark' : 'to-light'
    root.style.setProperty('--theme-transition-x', `${(x / vw) * 100}%`)
    root.style.setProperty('--theme-transition-y', `${(y / vh) * 100}%`)
    root.style.setProperty('--theme-transition-radius', `${(100 * radius) / maxRadius}%`)

    const clearTransitionVars = () => {
      if (seq !== themeTransitionSeq)
        return
      delete root.dataset.themeTransition
      root.style.removeProperty('--theme-transition-x')
      root.style.removeProperty('--theme-transition-y')
      root.style.removeProperty('--theme-transition-radius')
    }

    try {
      const transition = doc.startViewTransition(setTheme)
      Promise.resolve(transition.finished).finally(clearTransitionVars)
    }
    catch {
      clearTransitionVars()
      setTheme()
    }
  }

  function setLanguage(language: Lang): void {
    lang.value = language
    void loadLocale(language)
  }

  const glassColorPreset = computed<GlassColorPreset>(() => {
    const value = themeSettings.value.glassColorPreset
    if (value === 'soft' || value === 'contrast' || value === 'midnight' || value === 'custom')
      return value
    return 'emerald'
  })

  const glassCustomColors = computed<GlassCustomColors>(() => {
    const layout: GlassCustomColors = {
      lightCard: readColorSetting(themeSettings.value, 'glassLightCardColor', DEFAULT_GLASS_CUSTOM_COLORS.lightCard),
      lightControl: readColorSetting(themeSettings.value, 'glassLightControlColor', DEFAULT_GLASS_CUSTOM_COLORS.lightControl),
      lightText: readColorSetting(themeSettings.value, 'glassLightTextColor', DEFAULT_GLASS_CUSTOM_COLORS.lightText),
      lightMutedText: readColorSetting(themeSettings.value, 'glassLightMutedTextColor', DEFAULT_GLASS_CUSTOM_COLORS.lightMutedText),
      lightBorder: readColorSetting(themeSettings.value, 'glassLightBorderColor', DEFAULT_GLASS_CUSTOM_COLORS.lightBorder),
      darkCard: readColorSetting(themeSettings.value, 'glassDarkCardColor', DEFAULT_GLASS_CUSTOM_COLORS.darkCard),
      darkControl: readColorSetting(themeSettings.value, 'glassDarkControlColor', DEFAULT_GLASS_CUSTOM_COLORS.darkControl),
      darkText: readColorSetting(themeSettings.value, 'glassDarkTextColor', DEFAULT_GLASS_CUSTOM_COLORS.darkText),
      darkMutedText: readColorSetting(themeSettings.value, 'glassDarkMutedTextColor', DEFAULT_GLASS_CUSTOM_COLORS.darkMutedText),
      darkBorder: readColorSetting(themeSettings.value, 'glassDarkBorderColor', DEFAULT_GLASS_CUSTOM_COLORS.darkBorder),
    }
    return layout
  })

  const colorVisionFriendly = computed(() => themeSettings.value.colorVisionMode === 'accessible')

  const hideGeneralCard = computed(() => readBooleanSetting(themeSettings.value, 'hideGeneralCard', false))
  const offlineNodesLast = computed(() => readBooleanSetting(themeSettings.value, 'offlineNodesLast', false))
  const homeHighLoadThreshold = computed(() => readNumberSetting(themeSettings.value, 'homeHighLoadThreshold', 80, 1, 100))
  const homeExpiringDays = computed(() => readNumberSetting(themeSettings.value, 'homeExpiringDays', 30, 1, 3650))
  const homeQuickControlsEnabled = computed(() => readBooleanSetting(themeSettings.value, 'homeQuickControlsEnabled', true))
  const disablePageAnimation = computed(() => readBooleanSetting(themeSettings.value, 'disablePageAnimation', false))
  const hidePriceWhenLoggedOut = computed(() => readBooleanSetting(themeSettings.value, 'hidePriceWhenLoggedOut', false))
  const gpuChartEnabled = computed(() => readBooleanSetting(themeSettings.value, 'gpuChartEnabled', false))

  const detailMetricCardOrder = computed<DetailMetricCardKey[]>(() => {
    const raw = readStringSetting(themeSettings.value, 'detailMetricCardKeys')
    const preset = readStringSetting(themeSettings.value, 'detailMetricCardPreset')
    const valid: DetailMetricCardKey[] = [
      'nodePrice', 'remainingTime', 'remainingValue', 'cpuUsage', 'memoryUsage',
      'swapUsage', 'diskUsage', 'load', 'processes', 'connections', 'uptime',
      'uploadSpeed', 'downloadSpeed', 'totalTraffic', 'trafficQuota', 'region', 'ping',
    ]
    if (raw.trim()) {
      const keys = raw.split(/[\s,，;；]+/).map(item => item.trim()).filter((item): item is DetailMetricCardKey => valid.includes(item as DetailMetricCardKey))
      if (keys.length)
        return keys
    }
    if (preset === 'finance')
      return ['nodePrice', 'remainingTime', 'remainingValue', 'totalTraffic', 'trafficQuota', 'uptime', 'connections']
    if (preset === 'status')
      return ['cpuUsage', 'memoryUsage', 'diskUsage', 'load', 'uptime', 'processes', 'connections', 'region', 'ping']
    if (preset === 'network')
      return ['uploadSpeed', 'downloadSpeed', 'totalTraffic', 'trafficQuota', 'connections', 'processes', 'uptime']
    return DEFAULT_DETAIL_METRIC_CARD_ORDER
  })

  function resolveChartCardKeys(): Array<'cpu' | 'memory' | 'disk' | 'diskIo' | 'gpu' | 'network'> {
    const raw = readStringSetting(themeSettings.value, 'chartDashboardKeys')
    const valid = ['cpu', 'memory', 'disk', 'diskIo', 'gpu', 'network'] as const
    if (raw.trim()) {
      const keys = raw.split(/[\s,，;；]+/).map(item => item.trim()).filter((item): item is typeof valid[number] => valid.includes(item as typeof valid[number]))
      if (keys.length)
        return keys
    }
    if (readStringSetting(themeSettings.value, 'chartDashboardPreset') === 'compact')
      return ['cpu', 'memory', 'disk']
    if (readStringSetting(themeSettings.value, 'chartDashboardPreset') === 'network')
      return ['network', 'cpu', 'memory']
    if (readStringSetting(themeSettings.value, 'chartDashboardPreset') === 'resource')
      return ['cpu', 'memory', 'disk', 'diskIo']
    return ['cpu', 'memory', 'disk', 'diskIo', 'gpu', 'network']
  }

  const chartDashboardCards = computed<ChartDashboardCardKey[]>(() =>
    resolveChartCardKeys().map(key => ({ key } as ChartDashboardCardKey)),
  )

  const homeScrollPosition = ref(0)

  // 字节精度配置（固定）
  const byteDecimals = { B: 0, KB: 0, MB: 1, GB: 1, TB: 2 } as const

  function setConfig(nextConfig: CfsmConfig): void {
    config.value = nextConfig
    if (nextConfig.default_language === 'zh')
      lang.value = 'zh-CN'
    else if (nextConfig.default_language === 'en')
      lang.value = 'en-US'
    else if (typeof window !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh'))
      lang.value = 'zh-CN'
    else
      lang.value = 'en-US'
    void loadLocale(lang.value)
  }

  function setServersData(data: CfsmServersResponse): void {
    serversStats.value = data.stats
    regionStats.value = data.regionStats
    sysConfig.value = data.sysConfig
  }

  function setLoading(value: boolean): void {
    loading.value = value
  }

  watch(themeMode, (mode) => {
    if (!isValidThemeMode(mode))
      themeMode.value = 'light'
  }, { immediate: true })

  return {
    loading,
    connectionError,
    loginRequired,
    themeMode,
    lang,
    nodeSelectedGroup,
    favoriteNodeIds,
    favoriteNodeIdSet: favouriteNodeIdSet,
    config,
    serversStats,
    regionStats,
    sysConfig,
    themeSettings,
    siteTitle,
    version,
    lastWorkersVersion,
    isPublic,
    authorization,
    wsTimeoutMinutes,
    showPrice,
    showExpire,
    showTraffic,
    showThreeNetDetails,
    cardBlur,
    cardOpacity,
    alertEnabled,
    alertTitle,
    alertContent,
    nodeViewMode,
    nodeCardSize,
    isFavoriteNode,
    toggleFavoriteNode,
    isDark,
    resolvedThemeMode,
    updateThemeMode,
    setLanguage,
    glassColorPreset,
    glassCustomColors,
    colorVisionFriendly,
    hideGeneralCard,
    offlineNodesLast,
    homeHighLoadThreshold,
    homeExpiringDays,
    homeQuickControlsEnabled,
    disablePageAnimation,
    hidePriceWhenLoggedOut,
    gpuChartEnabled,
    detailMetricCardOrder,
    chartDashboardCards,
    homeScrollPosition,
    byteDecimals,
    settingsOpen,
    toggleSettings,
    setConfig,
    setServersData,
    setLoading,
  }
})

export { useAppStore }