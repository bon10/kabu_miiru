import { describe, expect, it } from 'vitest'
import { addDays, dateKeyOf } from '@/lib/date-key'
import {
  computeFundamentalIndicators,
  computePriceStats,
  parseAnnualFundamentals,
  parseAnnualFundamentalsSeries,
  type AnnualFundamentals,
} from '@/lib/fundamentals'

// timeseries API の 1 系列ぶん（type ごとに result が 1 つ並ぶ）
function series(type: string, points: Array<[string, number, string?]>) {
  return {
    meta: { type: [type] },
    [type]: points.map(([asOfDate, raw, currencyCode = 'JPY']) => ({
      asOfDate,
      currencyCode,
      reportedValue: { raw },
    })),
  }
}

describe('parseAnnualFundamentals', () => {
  it('自己資本の最新期を基準期とし、各項目はその期の値を取る', () => {
    const payload = {
      timeseries: {
        result: [
          series('annualStockholdersEquity', [
            ['2025-03-31', 900],
            ['2026-03-31', 1000],
          ]),
          series('annualTotalAssets', [
            ['2025-03-31', 2200],
            ['2026-03-31', 2500],
          ]),
          series('annualNetIncomeCommonStockholders', [['2026-03-31', 120]]),
        ],
      },
    }

    const parsed = parseAnnualFundamentals(payload)

    expect(parsed).toMatchObject({
      fiscalPeriodEnd: '2026-03-31',
      currency: 'JPY',
      equity: 1000,
      totalAssets: 2500,
      netIncome: 120,
    })
  })

  it('基準期の値が無い項目は、古い期の値で埋めず null にする', () => {
    // JNJ の利益剰余金のように、ある項目だけ最新期が欠けることがある
    const payload = {
      timeseries: {
        result: [
          series('annualStockholdersEquity', [['2025-12-31', 1000, 'USD']]),
          series('annualRetainedEarnings', [['2023-12-31', 500, 'USD']]),
        ],
      },
    }

    expect(parseAnnualFundamentals(payload)?.retainedEarnings).toBeNull()
  })

  it('配列に null が混ざっていても読み飛ばす', () => {
    const payload = {
      timeseries: {
        result: [
          {
            meta: { type: ['annualStockholdersEquity'] },
            annualStockholdersEquity: [
              null,
              { asOfDate: '2026-03-31', currencyCode: 'JPY', reportedValue: { raw: 1000 } },
            ],
          },
        ],
      },
    }

    expect(parseAnnualFundamentals(payload)?.equity).toBe(1000)
  })

  it('自己資本が取れなければ null を返す', () => {
    const payload = {
      timeseries: { result: [series('annualTotalAssets', [['2026-03-31', 2500]])] },
    }

    expect(parseAnnualFundamentals(payload)).toBeNull()
  })
})

const BASE: AnnualFundamentals = {
  fiscalPeriodEnd: '2026-03-31',
  currency: 'JPY',
  equity: 1000,
  totalAssets: 2500,
  totalLiabilities: 1500,
  totalDebt: 600,
  workingCapital: 300,
  retainedEarnings: 700,
  ebit: 200,
  revenue: 3000,
  netIncome: 120,
  freeCashFlow: 90,
  sharesOutstanding: 10,
}

describe('computeFundamentalIndicators', () => {
  it('ROE・自己資本比率・有利子負債倍率をパーセントの値で返す', () => {
    const result = computeFundamentalIndicators(BASE, { price: 300, currency: 'JPY' })

    expect(result.roe).toBeCloseTo(12) // 120 / 1000
    expect(result.equityRatio).toBeCloseTo(40) // 1000 / 2500
    expect(result.debtToEquity).toBeCloseTo(60) // 600 / 1000
  })

  it('時価総額は 現在値 × 発行済株式数、FCF利回りは フリーCF ÷ 時価総額', () => {
    const result = computeFundamentalIndicators(BASE, { price: 300, currency: 'JPY' })

    expect(result.marketCap).toBe(3000)
    expect(result.fcfYield).toBeCloseTo(3) // 90 / 3000
  })

  it('Altman Z を元の式（製造業向け）で計算する', () => {
    const result = computeFundamentalIndicators(BASE, { price: 300, currency: 'JPY' })

    const expected =
      1.2 * (300 / 2500) +
      1.4 * (700 / 2500) +
      3.3 * (200 / 2500) +
      0.6 * (3000 / 1500) +
      1.0 * (3000 / 2500)
    expect(result.altmanZ).toBeCloseTo(expected)
  })

  it('Altman Z は項目が 1 つでも欠けたら null', () => {
    const result = computeFundamentalIndicators(
      { ...BASE, retainedEarnings: null },
      { price: 300, currency: 'JPY' },
    )

    expect(result.altmanZ).toBeNull()
    expect(result.roe).toBeCloseTo(12)
  })

  it('財務と株価の通貨が違えば、時価総額を使う値は null', () => {
    // 台湾ドルで決算し、米国でドル建ての ADR が取引される銘柄（TSM など）
    const result = computeFundamentalIndicators(
      { ...BASE, currency: 'TWD' },
      { price: 300, currency: 'USD' },
    )

    expect(result.marketCap).toBeNull()
    expect(result.fcfYield).toBeNull()
    expect(result.altmanZ).toBeNull()
    expect(result.roe).toBeCloseTo(12)
  })

  it('自己資本がマイナスなら、自己資本で割る値は null にし、その旨を返す', () => {
    const result = computeFundamentalIndicators(
      { ...BASE, equity: -100 },
      { price: 300, currency: 'JPY' },
    )

    expect(result.negativeEquity).toBe(true)
    expect(result.roe).toBeNull()
    expect(result.debtToEquity).toBeNull()
    expect(result.equityRatio).toBeCloseTo(-4)
  })
})

describe('computePriceStats', () => {
  // 2025-01-01 から 1 日 1 本の終値を並べる（休場日は考えない）
  const start = dateKeyOf(2025, 1, 1)
  const closesOf = (prices: number[]) =>
    prices.map((close, i) => ({ priceDate: addDays(start, i), close }))

  it('200日線は直近 200 本の終値の平均', () => {
    const prices = Array.from({ length: 250 }, (_, i) => i + 1)
    const stats = computePriceStats(closesOf(prices))

    // 直近 200 本は 51〜250
    expect(stats.movingAverage200).toBeCloseTo((51 + 250) / 2)
  })

  it('終値が 200 本に満たなければ 200日線は null', () => {
    const stats = computePriceStats(closesOf(Array.from({ length: 199 }, () => 100)))

    expect(stats.movingAverage200).toBeNull()
  })

  it('年初来安値は、最新の終値と同じ年の終値の最小値', () => {
    // 2025-01-01 から 400 本 → 最新は 2026-02-04。2025 年の安値 10 は含めない
    const prices = Array.from({ length: 400 }, (_, i) => (i === 5 ? 10 : i === 380 ? 50 : 100))
    const stats = computePriceStats(closesOf(prices))

    expect(stats.yearToDateLow).toBe(50)
  })

  it('52週安値は、最新の終値から 364 日前までの終値の最小値', () => {
    const prices = Array.from({ length: 400 }, () => 100)
    prices[399 - 364] = 40 // ちょうど 364 日前（含む）
    prices[399 - 365] = 10 // 365 日前（含まない）
    const stats = computePriceStats(closesOf(prices))

    expect(stats.low52Week).toBe(40)
  })

  it('終値が無ければすべて null', () => {
    expect(computePriceStats([])).toEqual({
      movingAverage200: null,
      yearToDateLow: null,
      low52Week: null,
    })
  })
})

describe('parseAnnualFundamentalsSeries', () => {
  // 期ごとの値は、売りの判定（ADR 0023）で前の期と比べるのに使う
  const payload = {
    timeseries: {
      result: [
        series('annualStockholdersEquity', [
          ['2024-03-31', 800],
          ['2025-03-31', 900],
          ['2026-03-31', 1000],
        ]),
        series('annualTotalAssets', [
          ['2024-03-31', 2000],
          ['2026-03-31', 2500],
        ]),
        series('annualNetIncomeCommonStockholders', [
          ['2024-03-31', 80],
          ['2025-03-31', 60],
          ['2026-03-31', 120],
        ]),
      ],
    },
  }

  it('自己資本が取れた期ごとに 1 件返し、古い順に並べる', () => {
    const parsed = parseAnnualFundamentalsSeries(payload)
    expect(parsed.map((a) => a.fiscalPeriodEnd)).toEqual(['2024-03-31', '2025-03-31', '2026-03-31'])
  })

  it('期ごとに、その期の値だけを使う（ほかの期の値で埋めない）', () => {
    const parsed = parseAnnualFundamentalsSeries(payload)
    expect(parsed[1]).toMatchObject({
      fiscalPeriodEnd: '2025-03-31',
      equity: 900,
      netIncome: 60,
      // 2025-03-31 の総資産は返っていないので null（2024 や 2026 の値で埋めない）
      totalAssets: null,
    })
  })

  it('自己資本が 1 期も取れなければ空', () => {
    expect(parseAnnualFundamentalsSeries({ timeseries: { result: [] } })).toEqual([])
  })

  it('最新期は parseAnnualFundamentals と同じ値になる', () => {
    const parsed = parseAnnualFundamentalsSeries(payload)
    expect(parsed[parsed.length - 1]).toEqual(parseAnnualFundamentals(payload))
  })
})
