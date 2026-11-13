import { describe, expect, it } from 'vitest'
import { judgeSellSignal, type SellPeriod } from './sell-signal'

// 通期決算の値。期は古い順に並べる
const period = (
  fiscalPeriodEnd: string,
  values: Partial<SellPeriod['values']> = {},
): SellPeriod => ({
  fiscalPeriodEnd,
  values: {
    roe: 10,
    equityRatio: 50,
    debtToEquity: 50,
    negativeEquity: false,
    ...values,
  },
})

const jp = (periods: SellPeriod[]) =>
  judgeSellSignal({ market: '国内', sector: 'Industrials', periods })

const itemOf = (signal: ReturnType<typeof judgeSellSignal>, key: string) =>
  signal.items.find((i) => i.key === key)

describe('judgeSellSignal', () => {
  it('すべて基準を満たしていれば ok', () => {
    const signal = jp([period('2024-03-31'), period('2025-03-31')])
    expect(signal.status).toBe('ok')
  })

  it('直近期が前の期より悪化して基準を下回ったら 1 期目', () => {
    const signal = jp([period('2024-03-31', { roe: 10 }), period('2025-03-31', { roe: 6 })])
    expect(signal.status).toBe('first_period')
    expect(itemOf(signal, 'roe')?.status).toBe('first_period')
    expect(itemOf(signal, 'roe')?.firstPeriodEnd).toBe('2025-03-31')
  })

  it('1 期目のあと次の期も基準を下回ったままなら売りを検討', () => {
    const signal = jp([
      period('2023-03-31', { roe: 10 }),
      period('2024-03-31', { roe: 6 }),
      period('2025-03-31', { roe: 7 }),
    ])
    expect(signal.status).toBe('consider_sell')
    expect(itemOf(signal, 'roe')?.firstPeriodEnd).toBe('2024-03-31')
  })

  it('基準を下回っていても前の期より良くなっていれば引き金にしない', () => {
    const signal = jp([period('2024-03-31', { roe: 3 }), period('2025-03-31', { roe: 5 })])
    expect(signal.status).toBe('ok')
    expect(itemOf(signal, 'roe')?.status).toBe('ok')
  })

  it('基準を満たすところまで戻ったら数えるのをやめる', () => {
    const signal = jp([
      period('2023-03-31', { roe: 10 }),
      period('2024-03-31', { roe: 6 }),
      period('2025-03-31', { roe: 9 }),
    ])
    expect(signal.status).toBe('ok')
    expect(itemOf(signal, 'roe')?.firstPeriodEnd).toBeNull()
  })

  it('有利子負債倍率は上がったら悪化とみなす', () => {
    const signal = jp([
      period('2024-03-31', { debtToEquity: 90 }),
      period('2025-03-31', { debtToEquity: 120 }),
    ])
    expect(itemOf(signal, 'debtToEquity')?.status).toBe('first_period')
  })

  it('期が 1 つしかなければ悪化を言えないので no_data', () => {
    const signal = jp([period('2025-03-31', { roe: 3 })])
    expect(signal.status).toBe('no_data')
    expect(itemOf(signal, 'roe')?.status).toBe('no_data')
  })

  it('値が無い項目は引き金にしない', () => {
    const signal = jp([
      period('2024-03-31', { roe: null }),
      period('2025-03-31', { roe: null }),
    ])
    expect(itemOf(signal, 'roe')?.status).toBe('no_data')
    expect(signal.status).toBe('ok')
  })

  it('FCF利回りと 200日線は引き金に使わない（項目に出さない）', () => {
    const signal = jp([period('2024-03-31'), period('2025-03-31')])
    expect(signal.items.map((i) => i.key)).toEqual(['roe', 'equityRatio', 'debtToEquity'])
  })

  it('米国株は自己資本比率を見ず、ROE と有利子負債倍率だけ', () => {
    const signal = judgeSellSignal({
      market: '米国',
      sector: 'Technology',
      periods: [period('2024-12-31'), period('2025-12-31')],
    })
    expect(signal.items.map((i) => i.key)).toEqual(['roe', 'debtToEquity'])
  })

  it('自己資本がマイナスなら ROE と有利子負債倍率を満たさないとみなす', () => {
    const signal = jp([
      period('2024-03-31'),
      period('2025-03-31', { roe: null, debtToEquity: null, negativeEquity: true }),
    ])
    expect(itemOf(signal, 'roe')?.status).toBe('first_period')
    expect(itemOf(signal, 'debtToEquity')?.status).toBe('first_period')
  })

  it('ETF は判定しない', () => {
    const signal = judgeSellSignal({
      market: '国内',
      sector: 'ETF',
      periods: [period('2024-03-31'), period('2025-03-31')],
    })
    expect(signal.status).toBe('not_applicable')
    expect(signal.items).toEqual([])
  })

  it('期が 1 つも無ければ no_data', () => {
    expect(jp([]).status).toBe('no_data')
  })
})
