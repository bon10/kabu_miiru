export interface Stock {
  id: string
  symbol: string
  name: string
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  market: 'JP' | 'US'
  updatedAt: Date
}

export interface Portfolio {
  id: string
  userId: string
  name: string
  stocks: PortfolioStock[]
  totalValue: number
  totalChange: number
  totalChangePercent: number
  createdAt: Date
  updatedAt: Date
}

export interface PortfolioStock {
  id: string
  portfolioId: string
  stockSymbol: string
  quantity: number
  averagePrice: number
  totalCost: number
  currentValue: number
  unrealizedGain: number
  unrealizedGainPercent: number
  stock: Stock
}

export interface Transaction {
  id: string
  portfolioId: string
  stockSymbol: string
  type: 'BUY' | 'SELL'
  quantity: number
  price: number
  totalAmount: number
  fees: number
  broker: string
  executedAt: Date
  createdAt: Date
}

export interface User {
  id: string
  email: string
  name: string
  portfolios: Portfolio[]
  createdAt: Date
  updatedAt: Date
}