import { ETF_SECTOR } from '@/lib/sector'

// 基準チェック：保有銘柄が、銘柄選びのスキル（value-stock-screener）と同じ基準を
// 今も満たしているかを判定する（ADR 0021）。
//
// しきい値は固定で、スキルの初期値と同じ。スキルは候補が残らないと条件を緩めて選ぶが、
// 緩めた値は記録しない。代わりに購入時の指標と比べて、
//   - 買ったときは満たしていて、今は下回っている → 基準割れ（売りを検討するサイン）
//   - 買ったときから下回っている               → 購入時から未達（お知らせだけ）
// を見分ける。安値圏は買うタイミングの条件なので、ここでは見ない。

// 指標の値。比率はパーセントの値（12% なら 12）。ADR 0020
export interface IndicatorValues {
  roe: number | null
  fcfYield: number | null
  equityRatio: number | null
  debtToEquity: number | null
  altmanZ: number | null
  price: number | null
  movingAverage200: number | null
  negativeEquity: boolean
}

type CriterionKey = 'roe' | 'fcfYield' | 'equityRatio' | 'debtToEquity' | 'altmanZ' | 'trend'

export interface Criterion {
  key: CriterionKey
  label: string
  // 基準の表示（「8%以上」など）
  thresholdLabel: string
  passes: (value: number) => boolean
  // 値が大きいほど良いか。期をまたいで悪化したかを見るのに使う（ADR 0023）
  higherIsBetter: boolean
  // 自己資本がマイナスで値が無いとき、満たさないとみなす項目
  failsOnNegativeEquity?: boolean
}

// しきい値の置き場所はここ 1 か所。売りの判定（ADR 0023）も同じ定義を読む
export const CRITERIA: Record<CriterionKey, Criterion> = {
  roe: { key: 'roe', label: 'ROE', thresholdLabel: '8%以上', passes: (v) => v >= 8, higherIsBetter: true, failsOnNegativeEquity: true },
  fcfYield: { key: 'fcfYield', label: 'FCF利回り', thresholdLabel: '3%以上', passes: (v) => v >= 3, higherIsBetter: true },
  equityRatio: { key: 'equityRatio', label: '自己資本比率', thresholdLabel: '40%以上', passes: (v) => v >= 40, higherIsBetter: true },
  debtToEquity: {
    key: 'debtToEquity',
    label: '有利子負債倍率',
    thresholdLabel: '100%以下',
    passes: (v) => v <= 100,
    higherIsBetter: false,
    failsOnNegativeEquity: true,
  },
  altmanZ: { key: 'altmanZ', label: 'Altman Z', thresholdLabel: '1.8以上', passes: (v) => v >= 1.8, higherIsBetter: true },
  trend: { key: 'trend', label: '200日線', thresholdLabel: '上回る', passes: (v) => v > 0, higherIsBetter: true },
}

// 現在値が 200日線から何 % 上にいるか（下なら負）
function trendOf(values: IndicatorValues): number | null {
  const { price, movingAverage200 } = values
  if (price === null || movingAverage200 === null || movingAverage200 <= 0) return null
  return (price / movingAverage200 - 1) * 100
}

function valueOf(values: IndicatorValues | null, key: CriterionKey): number | null {
  if (!values) return null
  return key === 'trend' ? trendOf(values) : values[key]
}

// 項目を満たすか。値が無ければ判定できない（null）
function passesOf(criterion: Criterion, values: IndicatorValues | null): boolean | null {
  const value = valueOf(values, criterion.key)
  if (value !== null) return criterion.passes(value)
  if (values?.negativeEquity && criterion.failsOnNegativeEquity) return false
  return null
}

// 市場ごとの項目。財務の安全性は、国内株は自己資本比率と有利子負債倍率、米国株は
// Altman Z（今の値が無ければ有利子負債倍率で代える）。スキルの選定基準と同じ
function criteriaFor(market: string, current: IndicatorValues): Criterion[] {
  const safety =
    market === '米国'
      ? [current.altmanZ !== null ? CRITERIA.altmanZ : CRITERIA.debtToEquity]
      : [CRITERIA.equityRatio, CRITERIA.debtToEquity]
  return [CRITERIA.roe, CRITERIA.fcfYield, ...safety, CRITERIA.trend]
}

export type CheckItemStatus = 'ok' | 'broken' | 'unmet_since_purchase' | 'no_data'

export interface CheckItem {
  key: CriterionKey
  label: string
  thresholdLabel: string
  current: number | null
  purchase: number | null
  status: CheckItemStatus
}

// broken：基準割れの項目が 1 つ以上。unmet：基準割れは無いが購入時から未達の項目がある
export type CheckStatus = 'ok' | 'broken' | 'unmet' | 'no_data' | 'not_applicable'

export type CheckNote = 'negativeEquity' | 'financialSector' | 'realEstateSector'

export interface FundamentalCheck {
  status: CheckStatus
  items: CheckItem[]
  notes: CheckNote[]
}

// 注記の文言は画面からも読むため utils.ts の FUNDAMENTAL_CHECK_NOTE_TEXT に置く
// （このファイルは sector.ts 経由で prisma を読み込み、クライアントに含められない）

export function checkFundamentals(input: {
  market: string
  sector: string | null
  current: IndicatorValues | null
  purchase: IndicatorValues | null
}): FundamentalCheck {
  const { market, sector, current, purchase } = input
  if (sector === ETF_SECTOR) return { status: 'not_applicable', items: [], notes: [] }

  const notes: CheckNote[] = []
  if (sector === 'Financial Services') notes.push('financialSector')
  if (sector === 'Real Estate') notes.push('realEstateSector')
  if (!current) return { status: 'no_data', items: [], notes }
  if (current.negativeEquity) notes.push('negativeEquity')

  const items = criteriaFor(market, current).map((criterion): CheckItem => {
    const now = passesOf(criterion, current)
    const status: CheckItemStatus =
      now === null
        ? 'no_data'
        : now
          ? 'ok'
          : passesOf(criterion, purchase) === false
            ? 'unmet_since_purchase'
            : 'broken'
    return {
      key: criterion.key,
      label: criterion.label,
      thresholdLabel: criterion.thresholdLabel,
      current: valueOf(current, criterion.key),
      purchase: valueOf(purchase, criterion.key),
      status,
    }
  })

  const status: CheckStatus = items.some((i) => i.status === 'broken')
    ? 'broken'
    : items.some((i) => i.status === 'unmet_since_purchase')
      ? 'unmet'
      : 'ok'
  return { status, items, notes }
}
