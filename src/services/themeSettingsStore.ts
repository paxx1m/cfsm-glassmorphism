/**
 * 主题设置的本地存储（对齐 CFSM-Theme-LuminaPlus 的配置模型）。
 *
 * CF-Server-Monitor 的第三方主题不能直接写管理端接口，`/api/config` 里的 `theme_options`
 * 对主题是只读的。因此：
 *
 *   默认值 ← 后端 theme_options ← 本机覆盖
 *
 * 访客/未登录情况下，主题内调整只影响本设备（存 localStorage）。
 * 登录站长可把当前配置「保存到后端」发布给所有访客（`POST /api/theme_options`）。
 */

const STORAGE_KEY = 'cfsm-glassmorphism:theme-settings'

type Listener = () => void

const listeners = new Set<Listener>()
let cache: Record<string, unknown> | null = null

function readStorage(): Record<string, unknown> {
  if (cache)
    return cache
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      cache = {}
      return cache
    }
    const parsed: unknown = JSON.parse(raw)
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    cache = {}
  }
  return cache
}

/** 本机覆盖项；未被覆盖的键交给后端 theme_options / 主题默认值。 */
export function getLocalThemeSettings(): Record<string, unknown> {
  return readStorage()
}

export function saveLocalThemeSettings(settings: Record<string, unknown>): void {
  cache = { ...settings }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  }
  catch {
    // 隐私模式/配额用尽时写入失败，本次会话内的设置仍然生效。
    console.warn('[cfsm-glassmorphism] 主题设置无法写入本地存储')
  }
  emit()
}

/** 丢弃本机设置，改用后端下发的配置。 */
export function resetLocalThemeSettings(): void {
  cache = {}
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  }
  catch {
    // 同上，删除失败不影响内存中的重置结果。
  }
  emit()
}

export function subscribeLocalThemeSettings(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const listener of listeners)
    listener()
}

// 另一个标签页改了设置时同步过来。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY)
      return
    cache = null
    emit()
  })
}