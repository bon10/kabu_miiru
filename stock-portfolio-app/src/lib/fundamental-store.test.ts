import { describe, expect, it } from 'vitest'
import { FUNDAMENTAL_REFRESH_DAYS, shouldRefreshFundamental } from '@/lib/fundamental-store'

describe('shouldRefreshFundamental', () => {
  const now = new Date('2026-11-12T00:00:00Z')
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  it('まだ取っていなければ取る', () => {
    expect(shouldRefreshFundamental(null, now)).toBe(true)
  })

  it('取得から 30 日未満なら取り直さない', () => {
    expect(shouldRefreshFundamental(daysAgo(FUNDAMENTAL_REFRESH_DAYS - 1), now)).toBe(false)
  })

  it('取得から 30 日以上経っていれば取り直す', () => {
    expect(shouldRefreshFundamental(daysAgo(FUNDAMENTAL_REFRESH_DAYS), now)).toBe(true)
  })
})
