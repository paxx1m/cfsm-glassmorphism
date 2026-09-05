/** 三网探测线路（电信/联通/移动）统一定义：key、i18n key、图表颜色。
 * 卡片迷你柱、PingChart、线路概览共用这一份，保证全局颜色一致。 */
export const PING_CARRIERS = [
  { key: 'ct', labelKey: 'pingChart.carrierCt', color: '#4da6ff' },
  { key: 'cu', labelKey: 'pingChart.carrierCu', color: '#00d4aa' },
  { key: 'cm', labelKey: 'pingChart.carrierCm', color: '#f778ba' },
] as const

export type PingCarrierKey = typeof PING_CARRIERS[number]['key']

export const PING_CARRIER_COLOR: Record<PingCarrierKey, string> = Object.fromEntries(
  PING_CARRIERS.map(c => [c.key, c.color]),
) as Record<PingCarrierKey, string>
