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

  it('引き金になった期の値と、その前の期の値を返す', () => {
    // 2024 期に 10% → 6% と悪化して基準割れ、2025 期は 7% に戻したがまだ基準以下。
    // 直近 2 期（7% ← 6%）だけを出すと「良くなっている」と読めてしまうため、
    // 悪化した期（6% ← 10%）の値も返す
    const signal = jp([
      period('2023-03-31', { roe: 10 }),
      period('2024-03-31', { roe: 6 }),
      period('2025-03-31', { roe: 7 }),
    ])
    expect(itemOf(signal, 'roe')).toMatchObject({
      status: 'consider_sell',
      latest: 7,
      previous: 6,
      firstPeriodEnd: '2024-03-31',
      firstPeriodValue: 6,
      firstPeriodPrevious: 10,
    })
  })

  it('1 期目が直近期なら、引き金の期の値は直近期の値と同じ', () => {
    const signal = jp([period('2024-03-31', { roe: 10 }), period('2025-03-31', { roe: 6 })])
    expect(itemOf(signal, 'roe')).toMatchObject({
      status: 'first_period',
      firstPeriodValue: 6,
      firstPeriodPrevious: 10,
    })
  })

  it('引き金が無い項目は引き金の期の値を返さない', () => {
    const signal = jp([period('2024-03-31'), period('2025-03-31')])
    expect(itemOf(signal, 'roe')).toMatchObject({
      status: 'ok',
      firstPeriodValue: null,
      firstPeriodPrevious: null,
    })
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

  describe('悪化とみなす幅（しきい値）', () => {
    it('0.5 ポイント未満しか下がっていなければ横ばいとみなす', () => {
      // 西松建設の自己資本比率 29.13% → 29.08%。決算は小数 1 桁の開示で、
      // この幅は端数処理や一時的な要因で動く範囲
      const signal = jp([
        period('2024-03-31', { equityRatio: 29.13 }),
        period('2025-03-31', { equityRatio: 29.08 }),
      ])
      expect(itemOf(signal, 'equityRatio')?.status).toBe('ok')
    })

    it('0.5 ポイント以上でも、前の期から 2% 未満の動きなら横ばいとみなす', () => {
      // 有利子負債倍率 350% → 351%。1 ポイント動いても 0.3% で、桁の大きい銘柄では誤差
      const signal = jp([
        period('2024-03-31', { debtToEquity: 350 }),
        period('2025-03-31', { debtToEquity: 351 }),
      ])
      expect(itemOf(signal, 'debtToEquity')?.status).toBe('ok')
    })

    it('ポイントと割合の両方を満たせば悪化とみなす', () => {
      // CNH の有利子負債倍率 334.8% → 344.0%（9.2 ポイント・2.7%）
      const signal = jp([
        period('2024-03-31', { debtToEquity: 334.8 }),
        period('2025-03-31', { debtToEquity: 344.0 }),
      ])
      expect(itemOf(signal, 'debtToEquity')?.status).toBe('first_period')
    })

    it('ちょうどしきい値なら悪化とみなす（以上で判定する）', () => {
      // 25.0% → 24.5%：0.5 ポイント・2.0%
      const signal = jp([
        period('2024-03-31', { equityRatio: 25.0 }),
        period('2025-03-31', { equityRatio: 24.5 }),
      ])
      expect(itemOf(signal, 'equityRatio')?.status).toBe('first_period')
    })

    it('前の期がゼロ以下なら、割合を見ずにポイントだけで判定する', () => {
      // ROE が赤字から赤字。割合は意味を持たない
      const worse = jp([period('2024-03-31', { roe: -3 }), period('2025-03-31', { roe: -5 })])
      expect(itemOf(worse, 'roe')?.status).toBe('first_period')
      const flat = jp([period('2024-03-31', { roe: -3 }), period('2025-03-31', { roe: -3.2 })])
      expect(itemOf(flat, 'roe')?.status).toBe('ok')
    })

    it('自己資本がマイナスに転じたときは、しきい値を見ずに悪化とみなす', () => {
      const signal = jp([
        period('2024-03-31'),
        period('2025-03-31', { roe: null, debtToEquity: null, negativeEquity: true }),
      ])
      expect(itemOf(signal, 'roe')?.status).toBe('first_period')
    })
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
