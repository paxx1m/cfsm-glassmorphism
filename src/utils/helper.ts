import dayjs from 'dayjs'

/** 字节单位常量 */
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const
const LAST_BYTE_UNIT = BYTE_UNITS.at(-1)

/** 字节格式化精度配置 */
export interface ByteDecimalsConfig {
  /** B 精确位数，-1 为不显示此单位 */
  B?: number
  /** KB 精确位数，-1 为不显示此单位 */
  KB?: number
  /** MB 精确位数，-1 为不显示此单位 */
  MB?: number
  /** GB 精确位数，-1 为不显示此单位 */
  GB?: number
  /** TB 及以上精确位数，-1 为不显示此单位 */
  TB?: number
}

/** 默认字节精度配置 */
const DEFAULT_BYTE_DECIMALS: ByteDecimalsConfig = {
  B: 0,
  KB: 0,
  MB: 1,
  GB: 1,
  TB: 2,
}

/**
 * 格式化字节数为可读单位
 * @param bytes 字节数
 * @param decimals 小数位数
 * @returns 格式化后的字符串，如 "1.5 GB"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0)
    return '0 B'

  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const unit = BYTE_UNITS[i] ?? LAST_BYTE_UNIT
  return `${(bytes / k ** i).toFixed(decimals)} ${unit}`
}

/**
 * 格式化字节数为可读单位（支持自定义精度配置）
 * @param bytes 字节数
 * @param config 精度配置
 * @returns 格式化后的字符串，如 "1.5 GB"
 */
export function formatBytesWithConfig(bytes: number, config?: ByteDecimalsConfig): string {
  const mergedConfig = { ...DEFAULT_BYTE_DECIMALS, ...config }

  if (bytes === 0) {
    // 0 字节时，检查 B 是否被禁用
    if (mergedConfig.B === -1)
      return '0 KB'
    return '0 B'
  }

  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  // 获取对应单位的精度配置
  const unitKey = BYTE_UNITS[i]
  // PB 及以上单位使用 TB 的精度配置
  const decimals = (unitKey === 'TB' || unitKey === 'PB') ? mergedConfig.TB : mergedConfig[unitKey as keyof ByteDecimalsConfig]

  // 如果当前单位被禁用，向上查找可用单位
  if (decimals === -1) {
    for (let j = i + 1; j < BYTE_UNITS.length; j++) {
      const nextUnitKey = BYTE_UNITS[j]
      const nextDecimals = (nextUnitKey === 'TB' || nextUnitKey === 'PB') ? mergedConfig.TB : mergedConfig[nextUnitKey as keyof ByteDecimalsConfig]
      if (nextDecimals !== -1) {
        const unit = BYTE_UNITS[j]
        return `${(bytes / k ** j).toFixed(nextDecimals)} ${unit}`
      }
    }
    // 所有单位都被禁用，使用默认行为
    const unit = BYTE_UNITS[i] ?? LAST_BYTE_UNIT
    return `${(bytes / k ** i).toFixed(1)} ${unit}`
  }

  const unit = BYTE_UNITS[i] ?? LAST_BYTE_UNIT
  return `${(bytes / k ** i).toFixed(decimals)} ${unit}`
}

/**
 * 格式化字节率为可读单位
 * @param bytes 字节速率
 * @returns 格式化后的字符串，如 "1.5 GB/s"
 */
export function formatBytesPerSecond(bytes: number): string {
  return `${formatBytes(bytes)}/s`
}

/**
 * 格式化字节速率为可读单位（支持自定义精度配置）
 * @param bytes 字节速率
 * @param config 精度配置
 * @returns 格式化后的字符串，如 "1.5 GB/s"
 */
export function formatBytesPerSecondWithConfig(bytes: number, config?: ByteDecimalsConfig): string {
  return `${formatBytesWithConfig(bytes, config)}/s`
}

/** 自适应时长：取最大适用单位；不足一天显示小时，不足一小时显示分钟，不足一分钟显示秒。
 * `rounding` 控制单位取整：在线时长用 floor（不虚高），剩余时间用 ceil（不低估）。 */
export function formatDurationAdaptive(seconds: number, lang: 'zh-CN' | 'en-US' = 'zh-CN', rounding: 'floor' | 'ceil' = 'floor'): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const pick = (n: number): number => (rounding === 'ceil' ? Math.ceil(n) : Math.floor(n))
  if (s < 60)
    return lang === 'zh-CN' ? `${pick(s / 1)} 秒` : `${pick(s / 1)} sec`
  if (s < 3600)
    return lang === 'zh-CN' ? `${pick(s / 60)} 分钟` : `${pick(s / 60)} min`
  if (s < 86400)
    return lang === 'zh-CN' ? `${pick(s / 3600)} 小时` : `${pick(s / 3600)} hr`
  return lang === 'zh-CN' ? `${pick(s / 86400)} 天` : `${pick(s / 86400)} days`
}

/** 状态阈值配置 */
const STATUS_THRESHOLDS = {
  success: 60,
  warning: 80,
} as const

/**
 * 根据占用百分比返回状态
 * @param percentage 百分比
 * @returns 状态类型
 */
export function getStatus(percentage: number): 'success' | 'warning' | 'error' {
  if (percentage < STATUS_THRESHOLDS.success)
    return 'success'
  if (percentage < STATUS_THRESHOLDS.warning)
    return 'warning'
  return 'error'
}

/**
 * 格式化时间戳为可读日期时间
 * @param timestamp 时间戳字符串或 Date 对象
 * @returns 格式化后的字符串，如 "2024-01-15 14:30:00"
 */
export function formatDateTime(timestamp: string | Date | undefined, format = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!timestamp)
    return '-'

  const date = dayjs(timestamp)

  if (!date.isValid())
    return '-'

  return date.format(format)
}
