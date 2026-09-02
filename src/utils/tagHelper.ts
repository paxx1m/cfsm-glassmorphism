import type { NodeData } from '@/stores/nodes'
import { calculateRemainingValueCNY, formatFinanceAmount } from '@/utils/financeHelper'

/** 计费周期定义，与 CF-Server-Monitor 内置 server.js 保持一致 */
export interface BillingCycle {
  value: string
  months: number
  labelZh: string
  labelEn: string
  shortLabelZh: string
  shortLabelEn: string
}

export const BILLING_CYCLES: BillingCycle[] = [
  { value: 'month', months: 1, labelZh: '月', labelEn: 'Monthly', shortLabelZh: '月', shortLabelEn: 'M' },
  { value: 'quarter', months: 3, labelZh: '季', labelEn: 'Quarterly', shortLabelZh: '季', shortLabelEn: 'Q' },
  { value: 'half_year', months: 6, labelZh: '半年', labelEn: 'Half-yearly', shortLabelZh: '半年', shortLabelEn: 'HY' },
  { value: 'year', months: 12, labelZh: '年', labelEn: 'Yearly', shortLabelZh: '年', shortLabelEn: 'Y' },
  { value: 'two_years', months: 24, labelZh: '两年', labelEn: 'Two years', shortLabelZh: '2年', shortLabelEn: '2Y' },
  { value: 'three_years', months: 36, labelZh: '三年', labelEn: 'Three years', shortLabelZh: '3年', shortLabelEn: '3Y' },
  { value: 'four_years', months: 48, labelZh: '四年', labelEn: 'Four years', shortLabelZh: '4年', shortLabelEn: '4Y' },
  { value: 'five_years', months: 60, labelZh: '五年', labelEn: 'Five years', shortLabelZh: '5年', shortLabelEn: '5Y' },
]

const CYCLE_ALIASES = new Map<string, string>([
  ['月', 'month'], ['monthly', 'month'], ['month', 'month'], ['mo', 'month'],
  ['季', 'quarter'], ['季度', 'quarter'], ['quarter', 'quarter'], ['quarterly', 'quarter'],
  ['半年', 'half_year'], ['halfyear', 'half_year'], ['half_year', 'half_year'], ['half-yearly', 'half_year'],
  ['年', 'year'], ['一年', 'year'], ['year', 'year'], ['yearly', 'year'], ['annual', 'year'],
  ['两年', 'two_years'], ['二年', 'two_years'], ['two_years', 'two_years'], ['2 years', 'two_years'],
  ['三年', 'three_years'], ['three_years', 'three_years'], ['3 years', 'three_years'],
  ['四年', 'four_years'], ['four_years', 'four_years'], ['4 years', 'four_years'],
  ['五年', 'five_years'], ['five_years', 'five_years'], ['5 years', 'five_years'],
])

const CURRENCIES = [
  { symbol: '$' }, { symbol: '¥' }, { symbol: '€' }, { symbol: '£' },
  { symbol: '¥JPY' }, { symbol: 'HK$' }, { symbol: 'A$' }, { symbol: 'C$' },
  { symbol: 'S$' }, { symbol: 'NZ$' }, { symbol: '₣' }, { symbol: '₩' },
  { symbol: '₹' }, { symbol: '฿' }, { symbol: '₫' }, { symbol: '₱' },
  { symbol: 'Rp' }, { symbol: 'RM' }, { symbol: '₺' }, { symbol: '₪' },
  { symbol: '৳' }, { symbol: '₨' }, { symbol: 'LKR' }, { symbol: '₮' },
  { symbol: '₽' }, { symbol: 'R$' }, { symbol: 'kr' }, { symbol: 'zł' },
  { symbol: '₴' }, { symbol: '₸' }, { symbol: 'R' }, { symbol: '₦' },
  { symbol: 'EGP' }, { symbol: 'د.إ' }, { symbol: '﷼' }, { symbol: 'Q' },
] as const

/** 价格归一化："12.00" / "-1" / "" */
export function normalizePrice(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  const raw = String(value).trim()
  if (!raw)
    return ''
  const numberText = raw.match(/-?[\d.,]+/)?.[0]
  if (!numberText)
    return ''
  const normalized = numberText.replace(/,/g, '')
  const num = Number.parseFloat(normalized)
  if (!Number.isFinite(num))
    return ''
  if (num === -1)
    return '-1'
  if (num < 0)
    return ''
  return num.toFixed(2)
}

/** 免费判定：价格为 -1 或 0 */
export function isFreePrice(value: unknown): boolean {
  const price = normalizePrice(value)
  return price === '-1' || price === '0.00'
}

export function normalizeCurrency(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw)
    return ''
  const normalized = raw === '￥' ? '¥' : raw
  for (const item of CURRENCIES) {
    if (item.symbol.length > 1 && normalized.startsWith(item.symbol))
      return item.symbol
  }
  return normalized[0] || ''
}

export function detectCurrencySymbol(value: unknown): string {
  const raw = String(value || '')
  if (!raw)
    return ''
  if (raw.includes('￥'))
    return '¥'
  for (const item of CURRENCIES) {
    if (item.symbol.length > 1 && raw.includes(item.symbol))
      return item.symbol
  }
  return CURRENCIES.find(item => item.symbol.length === 1 && raw.includes(item.symbol))?.symbol || ''
}

export function detectBillingCycle(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw)
    return ''
  if (/五年|5\s*(y|yr|yrs|year|years)/i.test(raw)) return 'five_years'
  if (/四年|4\s*(y|yr|yrs|year|years)/i.test(raw)) return 'four_years'
  if (/三年|3\s*(y|yr|yrs|year|years)/i.test(raw)) return 'three_years'
  if (/(两年|二年)|2\s*(y|yr|yrs|year|years)/i.test(raw)) return 'two_years'
  if (/半年|half[-_\s]?year/i.test(raw)) return 'half_year'
  if (/季|quarter|\/q\b/i.test(raw)) return 'quarter'
  if (/年|annual|year|yr\b|\/y\b/i.test(raw)) return 'year'
  if (/月|monthly|month|mo\b|\/m\b/i.test(raw)) return 'month'
  return ''
}

export function getBillingCycleOption(value: unknown): BillingCycle {
  const raw = String(value || '').trim()
  const direct = BILLING_CYCLES.find(item => item.value === raw)
  if (direct)
    return direct
  const alias = CYCLE_ALIASES.get(raw.toLowerCase())
  return BILLING_CYCLES.find(item => item.value === alias) || BILLING_CYCLES[0]!
}

/** 格式化价格，如 "¥12.00/月"，免费显示"免费"。 */
export function formatBillingPrice(server: Pick<NodeData, 'price' | 'currency' | 'billing_cycle'>, lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const price = normalizePrice(server?.price)
  if (!price)
    return ''
  if (isFreePrice(price))
    return lang === 'zh-CN' ? '免费' : 'Free'
  const currency = normalizeCurrency(server?.currency || detectCurrencySymbol(server?.price))
  const cycle = getBillingCycleOption(detectBillingCycle(server?.price) || server?.billing_cycle)
  const cycleLabel = lang === 'zh-CN' ? cycle.shortLabelZh : cycle.shortLabelEn
  return `${currency}${price}/${cycleLabel}`
}

/** 兼容旧组件命名的包装函数 */
export function formatPriceWithCycle(price: number | string, billingCycle: string, currency: string, lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  return formatBillingPrice({ price: String(price), billing_cycle: billingCycle, currency }, lang)
}

/** 简单金额格式化 */
export function formatPrice(amount: number, currency: string, lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  return formatCurrencyValue(amount, currency)
}

/** 金额格式化：数值 + 币种符号 */
export function formatCurrencyValue(value: number, currency: string): string {
  const safe = Number.isFinite(value) ? value : 0
  const formatted = formatFinanceAmount(safe, currency)
  return `${formatted.symbol}${formatted.value}`
}

// ==================== 到期 ====================

export type ExpireStatus = 'unknown' | 'expired' | 'critical' | 'warning' | 'long_term'

/** 距到期还有多少天。无效日期返回 null。 */
export function getDaysUntilExpired(expireDate: string | null | undefined): number | null {
  const raw = String(expireDate ?? '').trim()
  if (!raw)
    return null
  const ts = new Date(raw).getTime()
  if (!Number.isFinite(ts))
    return null
  const diffMs = ts - Date.now()
  return Math.ceil(diffMs / 86_400_000)
}

export function getExpireStatus(expireDate: string | null | undefined): ExpireStatus {
  const days = getDaysUntilExpired(expireDate)
  if (days === null)
    return 'unknown'
  if (days <= 0)
    return 'expired'
  if (days <= 5)
    return 'critical'
  if (days <= 10)
    return 'warning'
  if (days > 3650)
    return 'long_term'
  return 'normal'
}

export function getExpireText(expireDate: string | null | undefined, lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const status = getExpireStatus(expireDate)
  if (status === 'unknown')
    return '-'
  if (status === 'expired')
    return lang === 'zh-CN' ? '已过期' : 'Expired'
  if (status === 'long_term') {
    const days = getDaysUntilExpired(expireDate)
    return days !== null && days > 3650
      ? lang === 'zh-CN' ? '长期' : 'Long-term'
      : '-'
  }
  const days = getDaysUntilExpired(expireDate)
  if (days === null)
    return '-'
  return lang === 'zh-CN' ? `剩余 ${days} 天` : `${days} days left`
}

/** 剩余价值（按到期日与计费周期折算） */
export function getRemainingValue(price: number | string, billingCycle: string, expireDate: string): number {
  const normalizedPrice = Number(normalizePrice(price))
  const node = { price: String(price), billing_cycle: billingCycle, expire_date: expireDate } as NodeData
  const priceCNY = getPriceCNY(node)
  return calculateRemainingValueCNY(node, priceCNY)
}

function getPriceCNY(node: NodeData): number {
  const priceText = normalizePrice(node.price)
  if (!priceText || isFreePrice(priceText))
    return 0
  return Number(priceText) || 0
}

/** 标签解析：逗号分隔 → [{text}] */
export function parseTags(tags: string | null | undefined): Array<{ text: string }> {
  return String(tags ?? '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .map(text => ({ text }))
}