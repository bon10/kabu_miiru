import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { CheckItem, CheckNote } from "@/lib/fundamental-check"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)
}

// 1 株あたりの価格を「その銘柄の建値通貨」で表示する。
// 米国株はドル建て（$）、国内株は円建て（¥）。評価額・損益などの金額は
// 円換算済み（formatCurrency）で表示するのに対し、単価は元の通貨で見せる。
export function formatPrice(value: number, market: string): string {
  const isUs = market === '米国'
  return new Intl.NumberFormat(isUs ? 'en-US' : 'ja-JP', {
    style: 'currency',
    currency: isUs ? 'USD' : 'JPY',
    minimumFractionDigits: isUs ? 2 : 0
  }).format(value)
}

// 平均取得単価の表示桁数。取得原価 ÷ 保有株数 は割り切れないことがあるため、
// 表示は小数第2位で四捨五入すると決めた（ADR 0010）。
export const AVG_ACQUISITION_PRICE_DIGITS = 2

// 平均取得単価を建値通貨で表示する。formatPrice と分けているのは、現在価格や
// 目標価格が市場から来る値そのものなのに対し、平均取得単価だけが割り算の結果で
// 端数を持つため。投資額は丸めない取得原価を保持しているので、
// 平均取得単価 × 保有株数 と投資額はわずかにズレることがある（ADR 0010）。
export function formatAvgAcquisitionPrice(value: number, market: string): string {
  const isUs = market === '米国'
  return new Intl.NumberFormat(isUs ? 'en-US' : 'ja-JP', {
    style: 'currency',
    currency: isUs ? 'USD' : 'JPY',
    minimumFractionDigits: AVG_ACQUISITION_PRICE_DIGITS,
    maximumFractionDigits: AVG_ACQUISITION_PRICE_DIGITS,
  }).format(value)
}

// 平均取得単価の丸めについて、表示の近くに添える説明文。
// 銘柄詳細と保有一覧で同じ文言を使うため定数にしている。
export const AVG_ACQUISITION_PRICE_NOTE =
  '平均取得単価は 取得原価 ÷ 保有株数 を小数第2位で四捨五入した表示値です。' +
  '投資額は手数料を含む取得原価そのものを表示しているため、' +
  '平均取得単価 × 保有株数 と一致しないことがあります。'

// 初回購入日が初期残高の起点日だった場合に、日付の近くに添える説明文（ADR 0008）。
// 起点日は購入日が判明していない銘柄では TSV 一括取り込み日の推定値であり、
// 実際の初回購入日はそれより前でありうる。
export const INITIAL_BALANCE_BASELINE_NOTE =
  '移行時の初期残高の起点日です。実際にはこれより前から保有していた可能性があります。'

// 基準チェック（ADR 0021）の注記。判定の近くに添える。銘柄詳細と MCP で同じ文言を使う。
// 銀行・保険・不動産は、事業の性質で財務の安全性の基準を割りやすいことを伝える。
export const FUNDAMENTAL_CHECK_NOTE_TEXT: Record<CheckNote, string> = {
  negativeEquity:
    '自己資本がマイナスです（自社株買いなどで起きます）。ROE と有利子負債倍率は計算できないため、基準を満たさないとみなします。',
  financialSector:
    '銀行・保険・証券は、預金や保険の準備金を負債として抱える事業のため、自己資本比率が低く出ます。財務の安全性の基準割れは、経営の悪化を意味しないことがあります。',
  realEstateSector:
    '不動産は物件を借入で買う事業のため、有利子負債が多く出ます。財務の安全性の基準割れは、経営の悪化を意味しないことがあります。',
}

// 基準チェック（ADR 0021）の項目ごとの説明。画面で数字のとなりに添える。
// 利用者は投資の専門家ではないため、指標の名前だけでなく「その数字が何を見ているか」を出す。
// 判定に使うしきい値は fundamental-check.ts が持つ。ここは意味の説明だけで、基準は書かない。
export const FUNDAMENTAL_CRITERION_HINT: Record<CheckItem['key'], string> = {
  roe: '集めたお金でどれだけ稼げているか。低いほど稼ぐ力が弱いという見方です。',
  fcfYield:
    '手元に残る現金が、株価に対してどれだけあるか。マイナスは現金が出ていっている状態です。',
  equityRatio: '借金に頼らず自分のお金で事業をしているか。高いほど倒れにくいという見方です。',
  debtToEquity:
    '利息の付く借金が自分のお金より多くないか。100% を超えると借金のほうが多い状態です。',
  altmanZ: '倒産しにくさの目安。低いほど危ないという見方です（米国株で使います）。',
  trend: 'ここ 200 日の平均の株価より、今が上か下か。下なら下がり気味ということです。',
}

// 購入時の指標をチェック開始日の一括作成で作った銘柄で、購入時の値の近くに添える説明文
export const FUNDAMENTAL_CHECK_START_NOTE =
  '基準チェックを始めた日の値です。実際に買ったときの値ではありません。'

// 金額を指定通貨（JPY / USD）建てで表示する。配当のように受取通貨を明示的に
// 持つ値を、その通貨のまま見せるのに使う（円換算はしない）。
export function formatMoney(value: number, currency: string): string {
  const isUsd = currency === 'USD'
  return new Intl.NumberFormat(isUsd ? 'en-US' : 'ja-JP', {
    style: 'currency',
    currency: isUsd ? 'USD' : 'JPY',
    minimumFractionDigits: isUsd ? 2 : 0,
  }).format(value)
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

// 日付・日時の表示は日本時間で固定する（docs/2-domain/time-and-dates.md）。
//
// timeZone を省略すると実行環境のタイムゾーンが使われるため、サーバーで描くか
// ブラウザで描くか、どの国で開くかによって日付が変わってしまう。取引日・配当日・
// 購入日は日本の証券会社の帳簿上の日付なので、閲覧場所で変わってはならない。
const JST = 'Asia/Tokyo'

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(date))
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date))
}

export function isJapaneseStock(code: string): boolean {
  // 数字のみの場合は日本株と判定
  return /^\d+$/.test(code)
}

export function getApiSymbol(code: string): string {
  // 日本株の場合は .T を付ける
  return isJapaneseStock(code) ? `${code}.T` : code
}

export function calculateProfitLoss(currentPrice: number, avgPrice: number, shares: number): {
  profitLoss: number;
  profitLossRate: number;
} {
  const currentValue = currentPrice * shares
  const investmentAmount = avgPrice * shares
  const profitLoss = currentValue - investmentAmount
  // パーセントの値で返す（-6.59% なら -6.59）。取引からの再計算
  // （recalculateStockAggregates）と単位を揃えるため（docs/2-domain/business-rules.md）
  const profitLossRate = investmentAmount > 0 ? (profitLoss / investmentAmount) * 100 : 0

  return { profitLoss, profitLossRate }
}

export function validateStockCode(code: string): boolean {
  // 日本株（4桁数字）または米国株（英数字）
  return /^\d{4}$/.test(code) || /^[A-Z]{1,5}$/.test(code)
}

export function getMarketFromCode(code: string): string {
  return isJapaneseStock(code) ? '国内' : '米国'
}