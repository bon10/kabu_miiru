import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

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

export function formatDate(date: Date | string): string {
  if (typeof window === 'undefined') {
    // サーバーサイドでは簡単な形式を使用
    const d = new Date(date)
    return d.toISOString().split('T')[0]
  }

  const d = new Date(date)
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

export function formatDateTime(date: Date | string): string {
  if (typeof window === 'undefined') {
    // サーバーサイドでは簡単な形式を使用
    const d = new Date(date)
    return d.toISOString().replace('T', ' ').substring(0, 16)
  }

  const d = new Date(date)
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d)
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
  const profitLossRate = investmentAmount > 0 ? profitLoss / investmentAmount : 0

  return { profitLoss, profitLossRate }
}

export function validateStockCode(code: string): boolean {
  // 日本株（4桁数字）または米国株（英数字）
  return /^\d{4}$/.test(code) || /^[A-Z]{1,5}$/.test(code)
}

export function getMarketFromCode(code: string): string {
  return isJapaneseStock(code) ? '国内' : '米国'
}