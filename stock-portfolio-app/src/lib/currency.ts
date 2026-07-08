// 通貨換算ヘルパー。
// 米国株は価格・金額がドル建て（native USD）で保存されているため、
// 表示・集計の直前に当日の USD/JPY レートで円換算する（円ベースに統一）。
// 国内株は円建てなので換算しない。
//
// 注: 購入日・取得時レートを持たないため、取得原価も評価額も「当日レート」で
// 換算する（= 為替損益は損益に含めない）。取得時レートを記録できるように
// なれば、取得原価だけ購入時レートで換算する方式に拡張できる。

// 市場が米国株かどうか。銘柄マスタの market フィールド（'国内' / '米国'）で判定する。
export function isUsStock(market: string): boolean {
  return market === '米国'
}

// ドル建て金額を円換算する。米国株のみ当日レートを掛け、国内株はそのまま返す。
export function toJpy(amount: number, market: string, usdJpyRate: number): number {
  return isUsStock(market) ? amount * usdJpyRate : amount
}

// 受取通貨コード。配当は銘柄の市場と独立に受取通貨を持つ（米国株の円受取があるため）。
export type Currency = 'JPY' | 'USD'

// 通貨コードで金額を円換算する。USD のみ当日レートを掛け、JPY はそのまま返す。
// market ではなく通貨コードで判定する点が toJpy との違い（配当の受取通貨に使う）。
export function toJpyByCurrency(
  amount: number,
  currency: string,
  usdJpyRate: number,
): number {
  return currency === 'USD' ? amount * usdJpyRate : amount
}
