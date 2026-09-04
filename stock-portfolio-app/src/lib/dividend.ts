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
