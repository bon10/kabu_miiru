import fetch from 'node-fetch'

export interface StockPrice {
  symbol: string
  name: string
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  market: 'JP' | 'US'
}

const JAPANESE_STOCK_SYMBOLS = [
  '1377', '1429', '1540', '1820', '2121', '2154', '2170', '2175', '2267', '2300',
  '2379', '2384', '2429', '2484', '2503', '2638', '2685', '2764', '2811', '2928',
  '2980', '3064', '3246', '3401', '3407', '3415', '3445', '3543', '3608', '3679',
  '4005', '4062', '4176', '4188', '4208', '4246', '4432', '4433', '4442', '4490',
  '4495', '4502', '4599', '4666', '4667', '4886', '5020', '5070', '5285', '5333',
  '5401', '5940', '6027', '6165', '6301', '6469', '6501', '6546', '6724', '6752',
  '6753', '6758', '6862', '6929', '6962', '6999', '7004', '7011', '7048', '7049',
  '7133', '7228', '7267', '7347', '7358', '7453', '7545', '7606', '7760', '7839',
  '7911', '7944', '7971', '7974', '7990', '8005', '8031', '8111', '8114', '8173',
  '8203', '8225', '8473', '9021', '9031', '9204', '9229', '9252', '9268', '9310',
  '9380', '9432', '9517', '9697', '9842', '9973', '9983'
]

const US_STOCK_SYMBOLS = [
  'AMCR', 'AVGO', 'AY', 'BOTZ', 'CMP', 'CRSP', 'CRWS', 'DHR', 'DLO', 'DOCU',
  'ENPH', 'FIGS', 'FSLY', 'GPRO', 'HMY', 'ISRG', 'JNJ', 'LMT', 'LUV', 'MGA',
  'MSFT', 'NAT', 'NEE', 'NET', 'NVDA', 'OKTA', 'PANW', 'PG', 'RACE', 'SPXL',
  'SUSA', 'TRV', 'TSLA', 'TSM', 'V', 'VZ'
]

function isJapaneseStock(symbol: string): boolean {
  return JAPANESE_STOCK_SYMBOLS.includes(symbol) || /^\d+$/.test(symbol)
}

function formatSymbolForAPI(symbol: string): string {
  return isJapaneseStock(symbol) ? `${symbol}.T` : symbol
}

async function fetchYahooFinanceData(symbol: string): Promise<StockPrice | null> {
  try {
    const formattedSymbol = formatSymbolForAPI(symbol)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedSymbol}`
    
    const response = await fetch(url)
    const data = await response.json() as Record<string, unknown>

    const chart = data.chart as { result?: Array<{ meta?: Record<string, unknown>; indicators?: { quote?: unknown[] } }> } | undefined
    if (!chart?.result?.[0]) {
      console.error(`No data found for symbol: ${symbol}`)
      return null
    }

    const result = chart.result[0]
    const meta = result.meta
    const quote = result.indicators?.quote?.[0]

    if (!meta || !quote) {
      console.error(`Invalid data structure for symbol: ${symbol}`)
      return null
    }

    const currentPrice = (meta.regularMarketPrice as number) || 0
    const previousClose = (meta.previousClose as number) || 0
    const change = currentPrice - previousClose
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0

    return {
      symbol,
      name: (meta.shortName as string) || symbol,
      currentPrice,
      previousClose,
      change,
      changePercent,
      market: isJapaneseStock(symbol) ? 'JP' : 'US'
    }
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error)
    return null
  }
}

export async function fetchStockPrice(symbol: string): Promise<StockPrice | null> {
  return await fetchYahooFinanceData(symbol)
}

export async function fetchMultipleStockPrices(symbols: string[]): Promise<StockPrice[]> {
  const promises = symbols.map(symbol => fetchStockPrice(symbol))
  const results = await Promise.allSettled(promises)
  
  return results
    .filter((result): result is PromiseFulfilledResult<StockPrice | null> => 
      result.status === 'fulfilled' && result.value !== null
    )
    .map(result => result.value!)
}

export function getAllSymbols(): string[] {
  return [...JAPANESE_STOCK_SYMBOLS, ...US_STOCK_SYMBOLS]
}

export { JAPANESE_STOCK_SYMBOLS, US_STOCK_SYMBOLS }