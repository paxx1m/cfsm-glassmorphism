/** 地区代码与旗帜：默认皮肤静态文件位于 /flags/ 目录，不要在主题内打包。 */

export interface RegionInfo {
  code: string
  nameZh: string
  nameEn: string
}

const REGION_NAMES: Record<string, RegionInfo> = {
  HK: { code: 'HK', nameZh: '香港', nameEn: 'Hong Kong' },
  TW: { code: 'TW', nameZh: '台湾', nameEn: 'Taiwan' },
  CN: { code: 'CN', nameZh: '中国', nameEn: 'China' },
  JP: { code: 'JP', nameZh: '日本', nameEn: 'Japan' },
  KR: { code: 'KR', nameZh: '韩国', nameEn: 'South Korea' },
  SG: { code: 'SG', nameZh: '新加坡', nameEn: 'Singapore' },
  US: { code: 'US', nameZh: '美国', nameEn: 'United States' },
  CA: { code: 'CA', nameZh: '加拿大', nameEn: 'Canada' },
  GB: { code: 'GB', nameZh: '英国', nameEn: 'United Kingdom' },
  DE: { code: 'DE', nameZh: '德国', nameEn: 'Germany' },
  FR: { code: 'FR', nameZh: '法国', nameEn: 'France' },
  NL: { code: 'NL', nameZh: '荷兰', nameEn: 'Netherlands' },
  RU: { code: 'RU', nameZh: '俄罗斯', nameEn: 'Russia' },
  AU: { code: 'AU', nameZh: '澳大利亚', nameEn: 'Australia' },
  IN: { code: 'IN', nameZh: '印度', nameEn: 'India' },
  ID: { code: 'ID', nameZh: '印度尼西亚', nameEn: 'Indonesia' },
  TH: { code: 'TH', nameZh: '泰国', nameEn: 'Thailand' },
  VN: { code: 'VN', nameZh: '越南', nameEn: 'Vietnam' },
  MY: { code: 'MY', nameZh: '马来西亚', nameEn: 'Malaysia' },
  PH: { code: 'PH', nameZh: '菲律宾', nameEn: 'Philippines' },
  BR: { code: 'BR', nameZh: '巴西', nameEn: 'Brazil' },
  TR: { code: 'TR', nameZh: '土耳其', nameEn: 'Turkey' },
  UA: { code: 'UA', nameZh: '乌克兰', nameEn: 'Ukraine' },
  PL: { code: 'PL', nameZh: '波兰', nameEn: 'Poland' },
  ES: { code: 'ES', nameZh: '西班牙', nameEn: 'Spain' },
  IT: { code: 'IT', nameZh: '意大利', nameEn: 'Italy' },
  CH: { code: 'CH', nameZh: '瑞士', nameEn: 'Switzerland' },
  SE: { code: 'SE', nameZh: '瑞典', nameEn: 'Sweden' },
  FI: { code: 'FI', nameZh: '芬兰', nameEn: 'Finland' },
  NO: { code: 'NO', nameZh: '挪威', nameEn: 'Norway' },
  DK: { code: 'DK', nameZh: '丹麦', nameEn: 'Denmark' },
  AE: { code: 'AE', nameZh: '阿联酋', nameEn: 'United Arab Emirates' },
  SA: { code: 'SA', nameZh: '沙特阿拉伯', nameEn: 'Saudi Arabia' },
  ZA: { code: 'ZA', nameZh: '南非', nameEn: 'South Africa' },
}

/** 地区显示名（中/英）。未知代码回退为空。 */
export function getRegionDisplayName(region: string, lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const info = REGION_NAMES[String(region || '').toUpperCase()]
  if (!info)
    return ''
  return lang === 'en-US' ? info.nameEn : info.nameZh
}

/** 返回用于旗帜文件名的代码（默认皮肤 /flags/<code>.svg）。 */
export function getRegionCode(region: string): string {
  const code = String(region || '').toUpperCase()
  if (code === 'TW')
    return 'cn'
  return code.toLowerCase()
}

export function getFlagUrl(region: string): string {
  return `/flags/${getRegionCode(region)}.svg`
}

export function getRegionStatsLabel(region: string, lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  return getRegionDisplayName(region, lang) || region || 'unknown'
}