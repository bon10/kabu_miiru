// 受取配当（DividendHistory）1 件の金額を、証券会社の配当明細から組み立てる純粋関数。
// 明細の 4 項目（数量 / 配当・分配金合計 / 税額合計 / 受取金額）をそのまま写す設計
// （ADR 0015）で、このファイルはその写し取りに要る計算と検証だけを持つ。
//
//   配当・分配金合計（税引前） = 1 株あたり配当金 × 数量   … calcDividendReceipt
//   税額合計 / 受取金額         = 片方だけの入力から他方を導出 … resolveDividendTax
//   集計に使う手取り            = 受取金額。無ければ税引前で代用 … netDividendAmount
//
// 計算は受取通貨（JPY / USD）建てのまま行い、円換算はしない（換算は読み取り時：ADR 0006）。
// API・入力フォームの双方から呼び、計算とバリデーションを 1 箇所に集約する。

import { toDateKey } from './date-key'

// DividendHistory の金額列はいずれも Decimal(15,2)。掛け算・引き算の浮動小数点誤差
// （例：2.3 × 50 = 114.9999…）を残さないよう、格納精度に合わせて小数第2位で丸める。
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export type DividendCalcError = 'INVALID_PER_SHARE' | 'NO_SHARES'

export type DividendCalcResult =
  | { ok: true; total: number }
  | { ok: false; error: DividendCalcError }

// エラーコードに対応する日本語メッセージ。API のレスポンスとフォームの表示で共用する。
export const DIVIDEND_CALC_MESSAGES: Record<DividendCalcError, string> = {
  INVALID_PER_SHARE: '1 株あたり配当金は 0 より大きい値を指定してください',
  NO_SHARES: '数量は 0 より大きい値を指定してください',
}

// 1 株あたり配当金と数量から配当・分配金合計（税引前）を求める。
// - perShare は 0 より大きい有限値であること（未入力・0・負数・NaN は INVALID_PER_SHARE）
// - shares は 0 より大きい有限値であること（0 株では総額を決められないため NO_SHARES）
export function calcDividendReceipt(
  perShare: number,
  shares: number,
): DividendCalcResult {
  if (!Number.isFinite(perShare) || perShare <= 0) {
    return { ok: false, error: 'INVALID_PER_SHARE' }
  }
  if (!Number.isFinite(shares) || shares <= 0) {
    return { ok: false, error: 'NO_SHARES' }
  }
  return { ok: true, total: round2(perShare * shares) }
}

export type DividendTaxError =
  | 'INVALID_TAX'
  | 'INVALID_NET'
  | 'TAX_EXCEEDS_GROSS'
  | 'NET_EXCEEDS_GROSS'

export type DividendTaxResult =
  | { ok: true; tax: number | null; net: number | null }
  | { ok: false; error: DividendTaxError }

export const DIVIDEND_TAX_MESSAGES: Record<DividendTaxError, string> = {
  INVALID_TAX: '税額合計は 0 以上の値を指定してください',
  INVALID_NET: '受取金額は 0 以上の値を指定してください',
  TAX_EXCEEDS_GROSS: '税額合計が配当・分配金合計を超えています',
  NET_EXCEEDS_GROSS: '受取金額が配当・分配金合計を超えています',
}

// 税額合計と受取金額を確定する。片方だけ入力されたら「合計 − 入力値」でもう片方を埋める。
// 証券会社の明細では国内株は税額合計に数字が入り、米国株はそこが空欄（現地源泉徴収税が
// 出ない）で受取金額だけが減っているため、どちらから入力しても済むようにしている。
// - 両方 null（＝税額が分からない）はそのまま null で通す。旧レコードと同じ扱いになる
// - 両方入力されたら引き算はせずそのまま採る。米国株は「税額合計 + 受取金額 ≠ 合計」に
//   なるため、合計との一致は検証しない
export function resolveDividendTax(
  gross: number,
  tax: number | null,
  net: number | null,
): DividendTaxResult {
  if (tax !== null && (!Number.isFinite(tax) || tax < 0)) {
    return { ok: false, error: 'INVALID_TAX' }
  }
  if (net !== null && (!Number.isFinite(net) || net < 0)) {
    return { ok: false, error: 'INVALID_NET' }
  }
  if (tax !== null && tax > gross) {
    return { ok: false, error: 'TAX_EXCEEDS_GROSS' }
  }
  if (net !== null && net > gross) {
    return { ok: false, error: 'NET_EXCEEDS_GROSS' }
  }

  if (tax !== null && net !== null) return { ok: true, tax: round2(tax), net: round2(net) }
  if (tax !== null) return { ok: true, tax: round2(tax), net: round2(gross - tax) }
  if (net !== null) return { ok: true, tax: round2(gross - net), net: round2(net) }
  return { ok: true, tax: null, net: null }
}

// 集計に使う手取り額を返す。受取金額を持たない旧レコード（ADR 0015 以前に登録した分）は
// 税引前しか記録が無いため、税引前で代用する。集計対象に新旧が混ざる前提の関数。
export function netDividendAmount(
  dividendAmount: number,
  netAmount: number | null | undefined,
): number {
  return netAmount === null || netAmount === undefined ? dividendAmount : netAmount
}

// NULL 可の Decimal 列（shares / taxAmount / netAmount）を number | null に直す。
// Prisma の Decimal は Number() で数値化できるので、NULL / undefined だけ素通しすればよい。
// 「値が無い」を 0 に潰さないための変換で、レスポンス組み立てと集計の入口で使う。
export function toNullableNumber(
  value: { toString(): string } | null | undefined,
): number | null {
  return value === null || value === undefined ? null : Number(value)
}

// 期末/中間/四半期/特別は個別株の配当区分。分配金は ETF・投資信託の分配（毎月分配型など）向け。
// 表示専用ラベルで集計には使わない。
export const DIVIDEND_TYPES = ['期末', '中間', '四半期', '特別', '分配金'] as const
export type DividendType = (typeof DIVIDEND_TYPES)[number]

export const DIVIDEND_TYPE_MESSAGE = `配当種別は ${DIVIDEND_TYPES.join(' / ')} のいずれかを指定してください`

export type DividendTypeResult = { ok: true; type: DividendType | null } | { ok: false }

// API が受け取った配当種別を検証する。配当種別は任意項目で、証券会社が期を示さず
// 判別できない場合があるため、未指定（undefined / null / 空文字）は種別なしの null として通す。
export function parseDividendType(value: unknown): DividendTypeResult {
  if (value === undefined || value === null || value === '') return { ok: true, type: null }
  const type = DIVIDEND_TYPES.find((t) => t === value)
  return type ? { ok: true, type } : { ok: false }
}

// 保存済みの配当合計と数量から、編集フォームの単価欄に入れる値を逆算する。
// 単価（1 株あたり配当金）は保存していない（ADR 0015）ため、登録時に入力された単価そのものは
// 復元できない。代わりに「数量を掛け直すと保存済みの配当合計と同じ値になる最短の小数」を返す。
// 単価に手を触れず支払日だけを直して保存したときに、配当合計が変わらないことを保証するため。
// 数量を持たない旧レコード（shares が null）は逆算できないので null を返す。
export function perShareFromTotal(total: number, shares: number | null): number | null {
  if (shares === null || !Number.isFinite(shares) || shares <= 0) return null
  const exact = total / shares
  for (let digits = 0; digits <= 10; digits++) {
    const candidate = Number(exact.toFixed(digits))
    if (round2(candidate * shares) === total) return candidate
  }
  return exact
}

export const DIVIDEND_CURRENCIES = ['JPY', 'USD'] as const
export type DividendCurrency = (typeof DIVIDEND_CURRENCIES)[number]

// DividendHistory に保存する値一式。追加と更新で同じ形を保存する。
export interface DividendRecordData {
  stockId: number
  dividendAmount: number
  shares: number
  taxAmount: number | null
  netAmount: number | null
  currency: DividendCurrency
  paymentDate: Date
  dividendType: DividendType | null
}

export type DividendInputResult =
  | { ok: true; data: DividendRecordData }
  | { ok: false; message: string }

// 税額合計・受取金額は明細に無ければ空欄で登録できる（ADR 0015）。空文字・null・未指定は
// 「未入力」として null に寄せ、数値が来たときだけ Number に通す。
function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  return Number(value)
}

// 受取配当の追加・更新 API が受け取ったリクエスト本文を検証し、保存する値を組み立てる。
// 入力は証券会社の配当明細を写したもの（ADR 0015）で、追加と更新で同じ項目・同じ検証を使う。
// 銘柄が DB に存在するかはここでは見ない（呼び出し側の API が確認する）。
export function parseDividendInput(body: Record<string, unknown>): DividendInputResult {
  if (!body.stockId || body.dividendPerShare === undefined || !body.paymentDate) {
    return { ok: false, message: '必須フィールドが不足しています' }
  }

  const stockId = Number(body.stockId)
  if (!Number.isInteger(stockId)) {
    return { ok: false, message: '銘柄の指定が不正です' }
  }

  const parsedType = parseDividendType(body.dividendType)
  if (!parsedType.ok) return { ok: false, message: DIVIDEND_TYPE_MESSAGE }

  // 受取通貨。未指定なら円建てとして扱う。
  const currency = DIVIDEND_CURRENCIES.find((c) => c === (body.currency ?? 'JPY'))
  if (!currency) {
    return {
      ok: false,
      message: `通貨は ${DIVIDEND_CURRENCIES.join(' / ')} のいずれかを指定してください`,
    }
  }

  const instant = new Date(String(body.paymentDate))
  if (Number.isNaN(instant.getTime())) {
    return { ok: false, message: '支払日は YYYY-MM-DD で指定してください' }
  }

  // 数量は明細の「数量」を写す（ADR 0015）。現在の保有株数（Stock.sharesHeld）は使わない。
  // 配当額は権利確定日の株数で決まるのに対し、登録時点の保有株数は権利確定後の売買を
  // 織り込んだ別の数字で、掛けると明細と違う配当合計を保存してしまうため。
  // 未指定は保有株数で補わず NO_SHARES で弾く（補うと上記の取り違えが復活する）。
  const shares = Number(body.shares)
  const calc = calcDividendReceipt(Number(body.dividendPerShare), shares)
  if (!calc.ok) return { ok: false, message: DIVIDEND_CALC_MESSAGES[calc.error] }

  // 税額合計・受取金額は片方だけの入力でよい（もう片方は配当合計から引いて埋まる）。
  // 両方空欄なら税額不明として NULL のまま保存する。
  const tax = resolveDividendTax(
    calc.total,
    optionalNumber(body.taxAmount),
    optionalNumber(body.netAmount),
  )
  if (!tax.ok) return { ok: false, message: DIVIDEND_TAX_MESSAGES[tax.error] }

  return {
    ok: true,
    data: {
      stockId,
      dividendAmount: calc.total,
      shares,
      taxAmount: tax.tax,
      netAmount: tax.net,
      currency,
      paymentDate: toDateKey(instant),
      dividendType: parsedType.type,
    },
  }
}
