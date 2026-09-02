import { TIME_MS } from './time'

export const LOAD_CONFIG = {
  records: {
    maxCount: 6_000,
    refreshInterval: 5 * TIME_MS.minute,
  },
} as const

export const LOAD_RECORD_MAX_COUNT = LOAD_CONFIG.records.maxCount