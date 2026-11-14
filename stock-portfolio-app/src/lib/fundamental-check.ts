import { ETF_SECTOR } from '@/lib/sector'

// 基準チェックの「値」：保有銘柄の指標と、今それが基準を満たすかを出す。
//
// しきい値は固定で、銘柄選びのスキル（value-stock-screener）の初期値と同じ（ADR 0021）。
//
// **銘柄を「どうするか」の判定はここでは出さない。** 判定は売りの判定ひとつに寄せた
// （judgeSellSignal。ADR 0023）。以前は購入時の指標と比べて「基準割れ」「購入時から未達」を
// 出していたが、画面とロジックに判定が 2 つあると、どちらに従えばよいか分からなくなる。
// 購入時の値は、比べるための数字として残す（判定には使わない）。
//
// 安値圏は買うタイミングの条件なので、ここでは見ない。

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

export type CriterionKey = 'roe' | 'fcfYield' | 'equityRatio' | 'debtToEquity' | 'altmanZ' | 'trend'

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

// 項目ごとの値と、今それが基準を満たすか。買ったときと比べる判定は持たない
export interface FundamentalValueItem {
  key: CriterionKey
  label: string
  thresholdLabel: string
  current: number | null
  // 購入時（またはチェック開始日）の値。比べるための数字で、判定には使わない
  purchase: number | null
  // 今の値が基準を満たすか。値が無ければ null（判定できない）
  meetsNow: boolean | null
}

export type CheckNote = 'negativeEquity' | 'financialSector' | 'realEstateSector'

export interface FundamentalValues {
  // ETF は財務の値が無いので項目を出さない
  applicable: boolean
  // 財務の値がまだ無い（価格更新で取りに行く）
  hasData: boolean
  items: FundamentalValueItem[]
  notes: CheckNote[]
}

// 注記の文言は画面からも読むため utils.ts の FUNDAMENTAL_CHECK_NOTE_TEXT に置く
// （このファイルは sector.ts 経由で prisma を読み込み、クライアントに含められない）

/**
 * 保有銘柄の指標と、今それが基準を満たすかを出す。
 *
 * 銘柄をどうするかの判定は返さない（売りの判定に寄せた。ADR 0023）。
 * 項目ごとの meetsNow は「今の値が基準を満たすか」という事実だけで、
 * 買ったあとに下がったのかどうかは見ない。
 */
export function fundamentalValues(input: {
  market: string
  sector: string | null
  current: IndicatorValues | null
  purchase: IndicatorValues | null
}): FundamentalValues {
  const { market, sector, current, purchase } = input
  if (sector === ETF_SECTOR) {
    return { applicable: false, hasData: false, items: [], notes: [] }
  }

  const notes: CheckNote[] = []
  if (sector === 'Financial Services') notes.push('financialSector')
  if (sector === 'Real Estate') notes.push('realEstateSector')
  if (!current) return { applicable: true, hasData: false, items: [], notes }
  if (current.negativeEquity) notes.push('negativeEquity')

  const items = criteriaFor(market, current).map(
    (criterion): FundamentalValueItem => ({
      key: criterion.key,
      label: criterion.label,
      thresholdLabel: criterion.thresholdLabel,
      current: valueOf(current, criterion.key),
      purchase: valueOf(purchase, criterion.key),
      meetsNow: passesOf(criterion, current),
    }),
  )

  return { applicable: true, hasData: true, items, notes }
}
