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