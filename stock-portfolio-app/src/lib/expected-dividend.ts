// 銘柄マスタの予想配当（Stock.dividendPerShare）から導く値。どちらも DB に保存せず、
// 読み取りのたびに計算する（ADR 0019）。
//
//   配当利回り   = 1株配当金 ÷ 現在価格 × 100 … dividendYieldOf（BR-201）
//   予想年間配当 = 1株配当金 × 保有株数       … expectedAnnualDividendOf（BR-200）
//
// 以前は両方を手入力・TSV 取り込みの値として保存していたため、価格更新や売買で現在価格・
// 保有株数が変わっても追従せず、配当利回りは入力経路ごとに単位（% か割合か）も揃っていなかった。

// 予想年間配当は金額なので、旧 Stock.dividendAmount（Decimal(15,2)）と同じく小数第2位で
// 丸め、掛け算の浮動小数点誤差（例：2.3 × 50 = 114.9999…）を残さない。
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// パーセントの値で返す（2.74% なら 2.74）。評価損益率（Stock.profitLossRate）と単位を
// 揃えており、表示では formatPercentage(yield / 100) とする。
// 現在価格が 0 以下（価格未取得）なら割り算できないので 0 を返す。
export function dividendYieldOf(dividendPerShare: number, currentPrice: number): number {
  if (!(currentPrice > 0)) return 0
  return (dividendPerShare / currentPrice) * 100
}

// 1株配当金と同じ通貨建て（米国株ならドル）で返す。円換算は呼び出し側で行う（ADR 0005）。
export function expectedAnnualDividendOf(dividendPerShare: number, sharesHeld: number): number {
  return round2(dividendPerShare * sharesHeld)
}
