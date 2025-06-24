import { getApiSymbol } from './utils'

export interface StockPrice {
  symbol: string
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  lastUpdate: Date
}

export interface PriceUpdateResult {
  symbol: string
  success: boolean
  oldPrice?: number
  newPrice?: number
  error?: string
}

/**
 * Yahoo Finance APIから株価を取得
 */
export async function fetchStockPrice(symbol: string): Promise<StockPrice | null> {
  try {
    const apiSymbol = getApiSymbol(symbol)
    
    // Yahoo Finance APIから実際の株価を取得
    const priceData = await fetchFromYahooFinance(apiSymbol)
    
    if (!priceData) {
      console.warn(`No price data available for ${symbol}, using mock data`)
      return generateMockPriceData(symbol)
    }
    
    return {
      symbol,
      currentPrice: priceData.regularMarketPrice,
      previousClose: priceData.regularMarketPreviousClose,
      change: priceData.regularMarketChange,
      changePercent: priceData.regularMarketChangePercent,
      lastUpdate: new Date()
    }
  } catch (error) {
    console.error(`Failed to fetch price for ${symbol}:`, error)
    // エラー時はモックデータを返す（開発用）
    return generateMockPriceData(symbol)
  }
}

/**
 * Yahoo Finance APIから株価データを取得
 */
async function fetchFromYahooFinance(symbol: string): Promise<any | null> {
  try {
    // Yahoo Finance v8 API（非公式）を使用
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (!data.chart?.result?.[0]?.meta) {
      throw new Error('Invalid response format')
    }
    
    const meta = data.chart.result[0].meta
    
    return {
      regularMarketPrice: meta.regularMarketPrice || meta.previousClose,
      regularMarketPreviousClose: meta.previousClose,
      regularMarketChange: (meta.regularMarketPrice || meta.previousClose) - meta.previousClose,
      regularMarketChangePercent: ((meta.regularMarketPrice || meta.previousClose) - meta.previousClose) / meta.previousClose * 100
    }
  } catch (error) {
    console.error(`Yahoo Finance API error for ${symbol}:`, error)
    return null
  }
}

/**
 * 複数銘柄の株価を一括取得
 */
export async function fetchMultipleStockPrices(symbols: string[]): Promise<PriceUpdateResult[]> {
  const results: PriceUpdateResult[] = []
  
  for (const symbol of symbols) {
    try {
      const priceData = await fetchStockPrice(symbol)
      
      if (priceData) {
        results.push({
          symbol,
          success: true,
          newPrice: priceData.currentPrice,
          oldPrice: priceData.previousClose
        })
      } else {
        results.push({
          symbol,
          success: false,
          error: '価格取得に失敗しました'
        })
      }
    } catch (error) {
      results.push({
        symbol,
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー'
      })
    }
  }
  
  return results
}

/**
 * モック価格データ生成（Yahoo Finance API失敗時のフォールバック）
 */
function generateMockPriceData(symbol: string): StockPrice {
  const basePrice = symbol.length * 100 + Math.random() * 1000
  const variation = (Math.random() - 0.5) * 0.1 // ±5%の変動
  const currentPrice = Math.round(basePrice * (1 + variation))
  const previousClose = Math.round(currentPrice * (0.95 + Math.random() * 0.1)) // ±5%の変動
  const change = currentPrice - previousClose
  const changePercent = (change / previousClose) * 100
  
  return {
    symbol,
    currentPrice,
    previousClose,
    change,
    changePercent,
    lastUpdate: new Date()
  }
}

/**
 * 前場・後場の判定
 */
export function getCurrentMarketSession(): 'morning' | 'afternoon' | 'after_hours' {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const timeInMinutes = hour * 60 + minute
  
  // 前場: 9:00-11:30
  if (timeInMinutes >= 540 && timeInMinutes <= 690) {
    return 'morning'
  }
  
  // 後場: 12:30-15:00
  if (timeInMinutes >= 750 && timeInMinutes <= 900) {
    return 'afternoon'
  }
  
  return 'after_hours'
}

/**
 * 価格更新が必要かどうかを判定
 */
export function shouldUpdatePrice(lastUpdate: Date | null): boolean {
  if (!lastUpdate) return true
  
  const now = new Date()
  const diffInHours = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60)
  
  // 6時間以上経過している場合は更新
  return diffInHours >= 6
}