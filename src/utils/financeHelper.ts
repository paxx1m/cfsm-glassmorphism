import { detectBillingCycle, detectCurrencySymbol, getBillingCycleOption, isFreePrice, normalizeCurrency, normalizePrice } from '@/utils/tagHelper'

/** 财务计算所需的最小子集 */
export interface FinanceServer {
  price?: unknown
  billing_cycle?: string
  currency?: string
  expire_date?: string
  expired_at?: string
  net_rx_monthly?: number
  net_tx_monthly?: number
  traffic_calc_type?: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MONTH_DAYS = 30
const LONG_TERM_YEARS = 100

const FINANCE_CURRENCY_CONFIG: Record<string, { rate: number, symbol: string }> = {
  AED: { rate: 0.5435, symbol: 'د.إ' },
  AUD: { rate: 0.20941, symbol: 'A$' },
  BDT: { rate: 18.02, symbol: '৳' },
  BRL: { rate: 0.74734, symbol: 'R$' },
  CAD: { rate: 0.20691, symbol: 'C$' },
  CHF: { rate: 0.11746, symbol: 'CHF' },
  CNY: { rate: 1, symbol: '¥' },
  CZK: { rate: 3.0787, symbol: 'Kč' },
  DKK: { rate: 0.95296, symbol: 'kr' },
  EGP: { rate: 7.15, symbol: 'EGP' },
  EUR: { rate: 0.1275, symbol: '€' },
  GBP: { rate: 0.11027, symbol: '£' },
  GTQ: { rate: 1.14, symbol: 'Q' },
  HKD: { rate: 1.1594, symbol: 'HK$' },
  HUF: { rate: 44.688, symbol: 'Ft' },
  IDR: { rate: 2622.37, symbol: 'Rp' },
  ILS: { rate: 0.43085, symbol: '₪' },
  INR: { rate: 14.0178, symbol: '₹' },
  ISK: { rate: 18.4626, symbol: 'kr' },
  JPY: { rate: 23.707, symbol: '¥' },
  KRW: { rate: 224.11, symbol: '₩' },
  KZT: { rate: 64, symbol: '₸' },
  LKR: { rate: 44.4, symbol: 'LKR' },
  MXN: { rate: 2.5472, symbol: 'Mex$' },
  MYR: { rate: 0.59945, symbol: 'RM' },
  MNT: { rate: 530, symbol: '₮' },
  NGN: { rate: 225.6, symbol: '₦' },
  NOK: { rate: 1.4096, symbol: 'kr' },
  NZD: { rate: 0.2535, symbol: 'NZ$' },
  PHP: { rate: 8.9288, symbol: '₱' },
  PKR: { rate: 41.5, symbol: '₨' },
  PLN: { rate: 0.54138, symbol: 'zł' },
  RON: { rate: 0.66769, symbol: 'lei' },
  RUB: { rate: 11.9, symbol: '₽' },
  SAR: { rate: 0.555, symbol: '﷼' },
  SEK: { rate: 1.3895, symbol: 'kr' },
  SGD: { rate: 0.18975, symbol: 'S$' },
  THB: { rate: 4.8172, symbol: '฿' },
  TRY: { rate: 6.849, symbol: '₺' },
  UAH: { rate: 3.6, symbol: '₴' },
  USD: { rate: 0.14799, symbol: '$' },
  VND: { rate: 3500, symbol: '₫' },
  ZAR: { rate: 2.3995, symbol: 'R' },
}

const BILLING_CYCLE_DAYS: Record<string, number> = {
  month: 30,
  quarter: 90,
  half_year: 180,
  year: 365,
  two_years: 730,
  three_years: 1095,
  four_years: 1460,
  five_years: 1825,
}

export const SUPPORTED_FINANCE_CURRENCIES = Object.freeze(Object.keys(FINANCE_CURRENCY_CONFIG))
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = Object.freeze(
  Object.fromEntries(Object.entries(FINANCE_CURRENCY_CONFIG).map(([code, config]) => [code, config.rate])),
)
export const CURRENCY_SYMBOLS: Record<string, string> = Object.freeze(
  Object.fromEntries(Object.entries(FINANCE_CURRENCY_CONFIG).map(([code, config]) => [code, config.symbol])),
)

/** 计费周期 → 天数 */
export function getBillingCycleDays(cycleValue: string): number {
  const normalized = getBillingCycleOption(cycleValue).value
  return BILLING_CYCLE_DAYS[normalized] || MONTH_DAYS
}

export function normalizeFinanceCurrency(value: unknown): string {
  const raw = String(value || 'CNY').trim()
  if (!raw)
    return 'CNY'
  const upper = raw.toUpperCase()
  return DEFAULT_EXCHANGE_RATES[upper] ? upper : 'CNY'
}

export function getStoredFinanceCurrency(): string {
  return 'CNY'
}

export function calculateRemainingValueCNY(server: FinanceServer, priceCNY: number, now = Date.now()): number {
  const price = Number.isFinite(priceCNY) && priceCNY > 0 ? priceCNY : getPriceCNY(server)
  const expireDate = String(server?.expire_date || server?.expired_at || '').trim()
  if (!expireDate || price <= 0)
    return 0

  const expiredAt = new Date(expireDate).getTime()
  if (!Number.isFinite(expiredAt))
    return 0

  const diffMs = expiredAt - Number(now)
  if (diffMs <= 0)
    return 0

  const diffYears = diffMs / (MS_PER_DAY * 365)
  if (diffYears > LONG_TERM_YEARS)
    return price

  const billingCycleMs = getBillingCycleDays(server?.billing_cycle ?? 'month') * MS_PER_DAY
  if (billingCycleMs <= 0)
    return price

  return Math.min(price, price * (diffMs / billingCycleMs))
}

export interface FinanceAmount {
  currency: string
  symbol: string
  value: string
}

export function formatFinanceAmount(amount: number, currency: string): FinanceAmount {
  const code = normalizeFinanceCurrency(currency)
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0
  const value = new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Math.abs(safeAmount) < 100000 ? 2 : 0,
    notation: Math.abs(safeAmount) >= 100000 ? 'compact' : 'standard',
  }).format(safeAmount)
  return {
    currency: code,
    symbol: CURRENCY_SYMBOLS[code] || '',
    value,
  }
}

/** 币种符号 → 标准代码（用于把价格折算成 CNY） */
const CURRENCY_SYMBOL_TO_CODE: Record<string, string> = {
  $: 'USD', 'US$': 'USD', '¥': 'CNY', '￥': 'CNY', CNY: 'CNY', RMB: 'CNY',
  '¥JPY': 'JPY', JPY: 'JPY', '€': 'EUR', EUR: 'EUR', '£': 'GBP', GBP: 'GBP',
  'HK$': 'HKD', HKD: 'HKD', 'A$': 'AUD', AUD: 'AUD', 'C$': 'CAD', CAD: 'CAD',
  'S$': 'SGD', SGD: 'SGD', 'NZ$': 'NZD', NZD: 'NZD', '₣': 'CHF', CHF: 'CHF',
  '₩': 'KRW', KRW: 'KRW', '₹': 'INR', INR: 'INR', '฿': 'THB', THB: 'THB',
  '₫': 'VND', VND: 'VND', '₱': 'PHP', PHP: 'PHP', Rp: 'IDR', IDR: 'IDR',
  RM: 'MYR', MYR: 'MYR', '₺': 'TRY', TRY: 'TRY', '₪': 'ILS', ILS: 'ILS',
  '৳': 'BDT', BDT: 'BDT', '₨': 'PKR', PKR: 'PKR', LKR: 'LKR', '₮': 'MNT',
  MNT: 'MNT', '₽': 'RUB', RUB: 'RUB', 'R$': 'BRL', BRL: 'BRL', kr: 'SEK',
  SEK: 'SEK', NOK: 'NOK', DKK: 'DKK', 'zł': 'PLN', PLN: 'PLN', '₴': 'UAH',
  UAH: 'UAH', '₸': 'KZT', KZT: 'KZT', R: 'ZAR', ZAR: 'ZAR', '₦': 'NGN',
  NGN: 'NGN', EGP: 'EGP', 'د.إ': 'AED', AED: 'AED', '﷼': 'SAR', SAR: 'SAR',
  Q: 'GTQ', GTQ: 'GTQ',
}

/** 服务器币种符号 → 标准代码（默认为 CNY） */
export function serverCurrencyCode(server: FinanceServer): string {
  const symbol = normalizeCurrency(server?.currency || detectCurrencySymbol(server?.price))
  return CURRENCY_SYMBOL_TO_CODE[symbol] || 'CNY'
}

/** 价格折算为 CNY */
export function getPriceCNY(server: FinanceServer): number {
  const priceText = normalizePrice(server?.price)
  if (!priceText || isFreePrice(priceText))
    return 0
  const price = Number(priceText)
  if (!Number.isFinite(price) || price <= 0)
    return 0
  const code = serverCurrencyCode(server)
  if (code === 'CNY')
    return price
  const rate = DEFAULT_EXCHANGE_RATES[code] || 0
  return rate > 0 ? price / rate : 0
}

/** 单台服务器剩余价值（CNY） */
export function getRemainingValueCNY(server: FinanceServer): number {
  return calculateRemainingValueCNY(server, getPriceCNY(server))
}

/** 按币种符号格式化金额（例如 "¥88.00" / "$12.00"） */
export function formatFinanceAmountBySymbol(amount: number, symbol: string): string {
  const code = CURRENCY_SYMBOL_TO_CODE[normalizeCurrency(symbol) || '¥'] || 'CNY'
  const formatted = formatFinanceAmount(amount, code)
  return formatted.symbol + formatted.value
}
