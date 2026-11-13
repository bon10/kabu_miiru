import { describe, expect, it } from 'vitest'
import { FUNDAMENTAL_REFRESH_DAYS, shouldRefreshFundamental } from '@/lib/fundamental-store'

describe('shouldRefreshFundamental', () => {
  const now = new Date('2026-11-12T00:00:00Z')
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  // 売りの判定（ADR 0023）に足りる期数
  const enoughPeriods = 2

  it('まだ取っていなければ取る', () => {
    expect(shouldRefreshFundamental(null, now, 0)).toBe(true)
  })

  it('取得から 30 日未満なら取り直さない', () => {
    expect(
      shouldRefreshFundamental(daysAgo(FUNDAMENTAL_REFRESH_DAYS - 1), now, enoughPeriods),
    ).toBe(false)
  })

  it('取得から 30 日以上経っていれば取り直す', () => {
    expect(shouldRefreshFundamental(daysAgo(FUNDAMENTAL_REFRESH_DAYS), now, enoughPeriods)).toBe(
      true,
    )
  })

  it('期が 1 つしか無ければ、取得から 30 日未満でも取り直す', () => {
    // 期ごとの保存を始める前に取った銘柄は 1 期しか持たない。売りの判定は前の期と
    // 比べるため、取得日が新しくても取り直して過去の期を埋める
    expect(shouldRefreshFundamental(daysAgo(1), now, 1)).toBe(true)
  })
})
