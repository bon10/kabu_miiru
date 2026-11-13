import { CRITERIA, type Criterion } from '@/lib/fundamental-check'
import { ETF_SECTOR } from '@/lib/sector'

// 売りの判定（ADR 0023）。保有銘柄を「売りを検討する」と読むかどうかを、
// 通期決算だけで動く指標（ROE・自己資本比率・有利子負債倍率）から判定する。
//
// 基準チェック（ADR 0021）とは比べる相手が違う。基準チェックは購入時の指標と比べるが、
// こちらは前の通期決算と比べる。購入時と比べると、起点の時点で既に基準を下回っていた
// 項目がその後どれだけ悪化しても引き金にならないため（ADR 0023 の案F）。
//
// FCF利回り・Altman Z・200日線は株価でも動くので使わない。保有銘柄が値上がりすると
// FCF利回りが基準を割り、持ち続ける理由と無関係な合図が出る。
//
// しきい値は基準チェックと同じ CRITERIA を読む（二重に持たない）。

export type SellCriterionKey = 'roe' | 'equityRatio' | 'debtToEquity'

// 1 つの通期決算の値。比率はパーセントの値（12% なら 12）。ADR 0020
export interface SellPeriodValues {
  roe: number | null
  equityRatio: number | null
  debtToEquity: number | null
  // 自己資本がマイナス。ROE と有利子負債倍率を「満たさない」とみなす（ADR 0021 と同じ）
  negativeEquity: boolean
}

export interface SellPeriod {
  // 決算期末日 'YYYY-MM-DD'。順序付きのラベルとして扱う（ADR 0012）
  fiscalPeriodEnd: string
  values: SellPeriodValues
}

// first_period：前の期より悪化して基準を下回った最初の期。consider_sell：それが 2 期以上続いている
export type SellItemStatus = 'ok' | 'first_period' | 'consider_sell' | 'no_data'

export interface SellItem {
  key: SellCriterionKey
  label: string
  thresholdLabel: string
  status: SellItemStatus
  // 1 期目と判定した期。無ければ null
  firstPeriodEnd: string | null
  latest: number | null
  previous: number | null
}

export type SellStatus = SellItemStatus | 'not_applicable'

export interface SellSignal {
  status: SellStatus
  items: SellItem[]
}

// 市場ごとの項目。米国株の財務の安全性は ADR 0021 では Altman Z で見るが、
// Altman Z は時価総額を含み株価で動くため、売りの判定では有利子負債倍率を使う（ADR 0023）
function criteriaFor(market: string): Criterion[] {
  return market === '米国'
    ? [CRITERIA.roe, CRITERIA.debtToEquity]
    : [CRITERIA.roe, CRITERIA.equityRatio, CRITERIA.debtToEquity]
}

function valueOf(values: SellPeriodValues, criterion: Criterion): number | null {
  return values[criterion.key as SellCriterionKey] ?? null
}

// 基準を満たすか。値が無ければ判定できない（null）
function passesOf(criterion: Criterion, values: SellPeriodValues): boolean | null {
  const value = valueOf(values, criterion)
  if (value !== null) return criterion.passes(value)
  if (values.negativeEquity && criterion.failsOnNegativeEquity) return false
  return null
}

// 前の期より悪くなったか。判定できなければ null
function worseThanPrevious(
  criterion: Criterion,
  now: SellPeriodValues,
  previous: SellPeriodValues,
): boolean | null {
  // 自己資本がプラスからマイナスに転じたのは悪化とみなす
  if (
    criterion.failsOnNegativeEquity &&
    now.negativeEquity &&
    !previous.negativeEquity &&
    valueOf(now, criterion) === null
  ) {
    return true
  }
  const a = valueOf(now, criterion)
  const b = valueOf(previous, criterion)
  if (a === null || b === null) return null
  return criterion.higherIsBetter ? a < b : a > b
}

function judgeItem(criterion: Criterion, periods: SellPeriod[]): SellItem {
  const last = periods.length - 1
  const base: SellItem = {
    key: criterion.key as SellCriterionKey,
    label: criterion.label,
    thresholdLabel: criterion.thresholdLabel,
    status: 'no_data',
    firstPeriodEnd: null,
    latest: valueOf(periods[last].values, criterion),
    previous: valueOf(periods[last - 1].values, criterion),
  }

  const latestPasses = passesOf(criterion, periods[last].values)
  if (latestPasses === null) return base
  // 基準を満たすところまで戻ったら数えるのをやめる
  if (latestPasses) return { ...base, status: 'ok' }

  // 直近期は基準を下回っている。どこから続いているかを古い方へたどる
  let streakStart = last
  while (streakStart - 1 >= 0 && passesOf(criterion, periods[streakStart - 1].values) === false) {
    streakStart--
  }

  // 続いている期のうち、前の期より悪化した最初の期が 1 期目。
  // 悪化した期が 1 つも無ければ、基準は下回っているが立て直している途中なので引き金にしない
  for (let i = Math.max(streakStart, 1); i <= last; i++) {
    if (worseThanPrevious(criterion, periods[i].values, periods[i - 1].values) !== true) continue
    return {
      ...base,
      status: i === last ? 'first_period' : 'consider_sell',
      firstPeriodEnd: periods[i].fiscalPeriodEnd,
    }
  }
  return { ...base, status: 'ok' }
}

/**
 * 売りの判定（ADR 0023）。periods は通期決算を古い順に並べたもの。
 *
 * 項目ごとに「前の期より悪化して基準を下回った期（1 期目）」を探し、その状態が次の期も
 * 続いていれば consider_sell（売りを検討する）とする。2 期目にはさらなる悪化を求めない。
 * 比べる前の期が無い（1 期しか無い）ときは判定しない。
 *
 * consider_sell でも売ると決めるものではない。含み益があれば売った時点で税が確定するため、
 * 売るかどうかは利用者が決める（ADR 0023）。
 */
export function judgeSellSignal(input: {
  market: string
  sector: string | null
  periods: SellPeriod[]
}): SellSignal {
  const { market, sector, periods } = input
  if (sector === ETF_SECTOR) return { status: 'not_applicable', items: [] }

  const criteria = criteriaFor(market)
  // 悪化は前の期と比べて言うため、2 期そろうまで判定しない
  if (periods.length < 2) {
    return {
      status: 'no_data',
      items: criteria.map((criterion) => ({
        key: criterion.key as SellCriterionKey,
        label: criterion.label,
        thresholdLabel: criterion.thresholdLabel,
        status: 'no_data' as const,
        firstPeriodEnd: null,
        latest: periods.length > 0 ? valueOf(periods[0].values, criterion) : null,
        previous: null,
      })),
    }
  }

  const items = criteria.map((criterion) => judgeItem(criterion, periods))
  const status: SellStatus = items.some((i) => i.status === 'consider_sell')
    ? 'consider_sell'
    : items.some((i) => i.status === 'first_period')
      ? 'first_period'
      : items.some((i) => i.status === 'ok')
        ? 'ok'
        : 'no_data'
  return { status, items }
}
