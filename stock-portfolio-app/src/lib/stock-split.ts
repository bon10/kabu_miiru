import { addDays, toDateKey } from '@/lib/date-key'
import { getApiSymbol } from '@/lib/utils'
import { parseDailyCloses, type DailyClose } from '@/lib/daily-price'

// 株式分割・併合の入力と、Yahoo Finance から取る分割の候補（ADR 0024）。
//
// 分割は利用者が登録する。Yahoo が返す分割は「この内容で登録しますか」と見せる
// 候補にとどめ、自動では登録しない。Yahoo の分割の扱いは銘柄によって正しくない
// ことがあり（docs/external-apis.md）、自動で登録すると保有株数が利用者の
// 知らないうちに変わるため。

export interface SplitTerms {
  // 分割日（権利落ち日）の暦日キー
  splitDate: Date
  // 分割前 fromShares 株が分割後 toShares 株になる
  fromShares: number
  toShares: number
}

// Yahoo Finance chart API のレスポンスのうち、分割の取得に必要な部分。
interface YahooSplitsResponse {
  chart?: {
    result?: Array<{
      events?: {
        splits?: Record<string, { date?: number; numerator?: number; denominator?: number }>
      }
    }>
  }
}

const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

// Yahoo Finance chart API のレスポンスから分割を取り出す純粋関数。
//
// 非公式 API のため公式ドキュメントは存在しない。events.splits の形と、numerator が
// 分割後・denominator が分割前の株数であることは 2026-11-15 に 8473.T / 7203.T / NVDA で
// 実測したものであり、仕様として保証されたものではない（docs/external-apis.md 参照）。
// 期間内に分割が無いと events そのものが返らない。
export function parseYahooSplits(data: YahooSplitsResponse): SplitTerms[] {
  const splits = data.chart?.result?.[0]?.events?.splits
  if (!splits) return []

  const parsed: SplitTerms[] = []
  for (const split of Object.values(splits)) {
    if (!isPositive(split.date) || !isPositive(split.numerator) || !isPositive(split.denominator)) {
      continue
    }
    parsed.push({
      // オブジェクトのキーではなく date を使う。range=max ではキーが date と食い違う
      // （2026-11-15 に 7203.T で実測）
      splitDate: toDateKey(new Date(split.date * 1000)),
      fromShares: split.denominator,
      toShares: split.numerator,
    })
  }
  return parsed.sort((a, b) => a.splitDate.getTime() - b.splitDate.getTime())
}

// Yahoo が返した分割のうち、利用者に登録を勧めるものを選ぶ純粋関数。
//
// 最初の取引の日以前の分割は外す。その銘柄の取引はすべて分割後の株数で記録されて
// いて、登録すると保有株数を二重に換算してしまうため。
export function selectSplitCandidates(
  yahooSplits: SplitTerms[],
  firstTransactionDate: Date | null,
  registeredSplitDates: Date[],
): SplitTerms[] {
  if (!firstTransactionDate) return []
  const firstKey = toDateKey(firstTransactionDate).getTime()
  const registered = new Set(registeredSplitDates.map((d) => toDateKey(d).getTime()))
  return yahooSplits.filter(
    (split) => split.splitDate.getTime() > firstKey && !registered.has(split.splitDate.getTime()),
  )
}

// chart API の range のうち、日次で返ることを実測した値と、そのおおよその日数。
// range=max は interval=1d を付けても月次で返るため使わない（2026-11-15 に 7203.T で実測）。
const CHART_RANGES: Array<{ range: string; days: number }> = [
  { range: '1mo', days: 28 },
  { range: '1y', days: 365 },
  { range: '2y', days: 730 },
  { range: '5y', days: 1826 },
  { range: '10y', days: 3652 },
]

// from から today までを含む最短の range を返す純粋関数。
// 10 年より前は 10y で打ち切る（それより長い期間を日次で取る手段を確認できていない）。
export function chartRangeCovering(from: Date, today: Date): string {
  const fromKey = toDateKey(from).getTime()
  const found = CHART_RANGES.find(({ days }) => addDays(toDateKey(today), -days).getTime() <= fromKey)
  return (found ?? CHART_RANGES[CHART_RANGES.length - 1]).range
}

export interface SplitInput extends SplitTerms {
  memo: string | null
}

// 分割の登録リクエストを検証して値に落とす純粋関数。
export function parseSplitInput(
  body: { splitDate?: unknown; fromShares?: unknown; toShares?: unknown; memo?: unknown },
  today: Date,
): { ok: true; value: SplitInput } | { ok: false; message: string } {
  if (typeof body.splitDate !== 'string' || Number.isNaN(new Date(body.splitDate).getTime())) {
    return { ok: false, message: '分割日を指定してください' }
  }
  const splitDate = toDateKey(new Date(body.splitDate))

  // 未来の分割は受け付けない。日次終値が分割後の水準に直るのは分割日からで、
  // それより前に登録すると保有株数だけが先に増えて評価額が比率ぶん膨らむため。
  if (splitDate.getTime() > toDateKey(today).getTime()) {
    return { ok: false, message: '分割日は今日以前の日付にしてください' }
  }

  const fromShares = typeof body.fromShares === 'number' ? body.fromShares : NaN
  const toShares = typeof body.toShares === 'number' ? body.toShares : NaN
  if (!isPositive(fromShares) || !isPositive(toShares)) {
    return { ok: false, message: '分割前・分割後の株数は 0 より大きい数にしてください' }
  }
  if (fromShares === toShares) {
    return { ok: false, message: '分割前と分割後の株数が同じです' }
  }

  const memo = typeof body.memo === 'string' && body.memo.trim() !== '' ? body.memo.trim() : null
  return { ok: true, value: { splitDate, fromShares, toShares, memo } }
}

export type YahooSplitHistory =
  | { success: true; splits: SplitTerms[]; closes: DailyClose[] }
  | { success: false; error: string }

// Yahoo Finance chart API から、期間内の分割と日次終値を 1 リクエストで取得する。
//
// 日次終値（indicators.quote[0].close）は、過去の日のぶんも「現在の株数の基準」に
// 換算済みの値で返る（分割日の前後で値が跳ばない。2026-11-15 に 8473.T / 7203.T / NVDA
// で実測。docs/external-apis.md 参照）。分割を登録するときに保存済みの日次終値を
// この値で置き換えるため、同じレスポンスから両方を取り出す。
export async function fetchYahooSplitHistory(
  code: string,
  range: string,
): Promise<YahooSplitHistory> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(getApiSymbol(code))}` +
    `?range=${encodeURIComponent(range)}&interval=1d&events=splits`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` }

    const data = await response.json()
    const closes = parseDailyCloses(data)
    if (!closes.ok) return { success: false, error: closes.error }
    return { success: true, splits: parseYahooSplits(data), closes: closes.closes }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '不明なエラー' }
  }
}
