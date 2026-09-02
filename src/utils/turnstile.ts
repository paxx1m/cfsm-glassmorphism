/**
 * Cloudflare Turnstile 人机验证（仅作用于公开 API 的全局开关）。
 *
 * 流程（对应 theme-develop.md §1.2）：
 *  `/api/config`（不带 Turnstile Header）→ 拿到 `turnstile_site_key`
 *  → 渲染 Turnstile 组件并获取一次性 token → 暂存 `turnstile_token`
 *  → 以 `X-Turnstile-Token` 请求 `/api/config` 换取 `turnstile_verified`（加密凭证，1 小时有效）并缓存
 *  → 后续请求复用 `X-Turnstile-Verified`（见 cfsm.service.getAuthHeaders），一次性 token 不再携带
 */

import { getApiBase, JWT_KEY, TURNSTILE_TOKEN_KEY, TURNSTILE_VERIFIED_KEY } from '@/services/cfsm.service'

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileWindow = Window & { turnstile?: { render: (container: HTMLElement, options: unknown) => string | undefined, remove: (id: string) => void } }

let scriptPromise: Promise<void> | null = null

function getStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function setStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  }
  catch {
    // 隐私模式/配额用尽：本次会话内后续请求仍会尝试携带内存中提供的一性次 token
  }
}

function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key)
  }
  catch {
    // 同上，删除失败不影响功能
  }
}

function loadTurnstileScript(): Promise<void> {
  if ((window as TurnstileWindow).turnstile)
    return Promise.resolve()
  if (scriptPromise)
    return scriptPromise
  scriptPromise = new Promise<unknown>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cf-turnstile]')
    if (existing) {
      existing.addEventListener('load', () => resolve(undefined), { once: true })
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.setAttribute('data-cf-turnstile', '')
    script.addEventListener('load', () => resolve(undefined), { once: true })
    script.addEventListener('error', () => reject(new Error('Turnstile script failed')), { once: true })
    document.head.appendChild(script)
  }).then(() => undefined)
  return scriptPromise
}

/** 渲染 Turnstile 组件（置于页面中央弹层），用户完成后返回一次性 token。 */
function renderTurnstileWidget(siteKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const overlayId = `cf-turnstile-overlay-${Date.now()}`
    const overlay = document.createElement('div')
    overlay.id = overlayId
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.innerHTML = `
      <div class="cf-turnstile-card">
        <div class="cf-turnstile-title">人机验证</div>
        <div class="cf-turnstile-hint">请完成安全验证以继续访问</div>
        <div class="cf-turnstile-slot"></div>
      </div>`

    const style = document.createElement('style')
    style.textContent = [
      `#${overlayId}{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(2px)}`,
      `#${overlayId} .cf-turnstile-card{width:min(92vw,360px);border-radius:14px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:20px;text-align:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}`,
      `#${overlayId} .cf-turnstile-title{font-size:16px;font-weight:600;color:#111}`,
      `#${overlayId} .cf-turnstile-hint{font-size:12px;color:#555;margin:6px 0 16px}`,
      `#${overlayId} .cf-turnstile-slot{display:flex;justify-content:center;min-height:65px}`,
    ].join('\n')
    document.head.appendChild(style)
    document.body.appendChild(overlay)

    const slot = overlay.querySelector<HTMLElement>('.cf-turnstile-slot')
    if (!slot) {
      cleanup()
      reject(new Error('Turnstile container missing'))
      return
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('Turnstile verification timed out'))
    }, 120_000)
    let widgetId: string | undefined

    function cleanup(): void {
      window.clearTimeout(timeoutId)
      const cf = (window as TurnstileWindow).turnstile
      if (widgetId && cf)
        cf.remove(widgetId)
      style.remove()
      overlay.remove()
    }

    try {
      widgetId = (window as TurnstileWindow).turnstile?.render(slot, {
        sitekey: siteKey,
        callback: (token: string) => {
          cleanup()
          resolve(token)
        },
        'error-callback': () => {
          cleanup()
          reject(new Error('Turnstile challenge failed'))
        },
      } as unknown)
    }
    catch (error) {
      cleanup()
      reject(error instanceof Error ? error : new Error('Failed to render Turnstile'))
    }
  })
}

/**
 * 确保持有可复用的 `X-Turnstile-Verified` 凭证；缺少时自动完成一次人机验证，
 * 并调用 `/api/config` 兑换加密凭证后缓存。已有有效凭证时直接返回。
 */
export async function ensureTurnstileVerified(siteKey: string): Promise<void> {
  if (!siteKey)
    return
  if (getStored(TURNSTILE_VERIFIED_KEY))
    return

  await loadTurnstileScript()
  const token = await renderTurnstileWidget(siteKey)
  setStored(TURNSTILE_TOKEN_KEY, token)

  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Turnstile-Token': token }
  const jwt = getStored(JWT_KEY)
  if (jwt)
    headers.Authorization = `Bearer ${jwt}`

  const res = await fetch(`${getApiBase()}/api/config`, { headers })
  if (!res.ok) {
    removeStored(TURNSTILE_TOKEN_KEY)
    throw new Error('Turnstile verification failed')
  }
  const data = await res.json() as { turnstile_verified?: string | null }
  if (data.turnstile_verified) {
    // 兑换成功后，一次性 token 已失效，只保留可复用的加密凭证
    setStored(TURNSTILE_VERIFIED_KEY, String(data.turnstile_verified))
    removeStored(TURNSTILE_TOKEN_KEY)
  }
}