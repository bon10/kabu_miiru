// 受取配当（DividendHistory）の受取総額を「1 株あたり配当金 × 保有株数」で算出する。
// 入力は 1 株あたり配当金（DPS）で、保有株数を掛けて総額を確定する（ADR 0007 / BR-202）。
// 掛け算は受取通貨（JPY / USD）建てのまま行い、円換算はしない（換算は読み取り時：ADR 0006）。
// API・入力フォームの双方から呼び、計算とバリデーションを 1 箇所に集約する。

export type DividendCalcError = 'INVALID_PER_SHARE' | 'NO_SHARES'

export type DividendCalcResult =
  | { ok: true; total: number }
  | { ok: false; error: DividendCalcError }

// エラーコードに対応する日本語メッセージ。API のレスポンスとフォームの表示で共用する。
export const DIVIDEND_CALC_MESSAGES: Record<DividendCalcError, string> = {
  INVALID_PER_SHARE: '1 株あたり配当金は 0 より大きい値を指定してください',
  NO_SHARES: '保有株数が 0 のため受取配当を計算できません',
}

// 1 株あたり配当金と保有株数から受取総額を求める。
// - perShare は 0 より大きい有限値であること（未入力・0・負数・NaN は INVALID_PER_SHARE）
// - sharesHeld は 0 より大きい有限値であること（保有 0 では総額を決められないため NO_SHARES）
export function calcDividendReceipt(
  perShare: number,
  sharesHeld: number,
): DividendCalcResult {
  if (!Number.isFinite(perShare) || perShare <= 0) {
    return { ok: false, error: 'INVALID_PER_SHARE' }
  }
  if (!Number.isFinite(sharesHeld) || sharesHeld <= 0) {
    return { ok: false, error: 'NO_SHARES' }
  }
  // 保存先 DividendHistory.dividendAmount は Decimal(15,2)。掛け算の浮動小数点誤差
  // （例：2.3 × 50 = 114.9999…）を避けるため、格納精度に合わせて小数第2位で丸める。
  const total = Math.round(perShare * sharesHeld * 100) / 100
  return { ok: true, total }
}
