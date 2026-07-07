import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'

// ポートフォリオ推移 API。
// 月末時点でのスナップショットを返す：
//   - investedAmount: その時点の保有銘柄の取得原価（cost basis）
//   - cumulativeRealizedPL: その時点までの累計実現損益
//   - cumulativeDividends: その時点までの累計配当受取（カレンダー年は ADR 0004）
// 平均取得単価法 (ADR 0003 の stock-aggregation と同じロジック) で再生する。
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const monthsParam = searchParams.get('months')
    const months = monthsParam === 'all' ? null : parseInt(monthsParam ?? '24')

    const [transactions, dividends, stocks, usdJpyRate] = await Promise.all([
      prisma.transaction.findMany({ orderBy: { transactionDate: 'asc' } }),
      prisma.dividendHistory.findMany({ orderBy: { paymentDate: 'asc' } }),
      prisma.stock.findMany({ select: { id: true, market: true } }),
      getCurrentUsdJpyRate(),
    ])

    // 米国株の取引はドル建てのため円換算する。購入時レートを持たないため
    // 当日レートで換算する（サマリ等と同じ方針）。国内株は係数 1。
    const jpyFactorByStock = new Map<number, number>()
    for (const s of stocks) {
      jpyFactorByStock.set(s.id, s.market === '米国' ? usdJpyRate : 1)
    }

    if (transactions.length === 0 && dividends.length === 0) {
      return Response.json(createSuccessResponse({ snapshots: [] }))
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const earliest = (() => {
      const txEarliest = transactions[0]?.transactionDate
      const divEarliest = dividends[0]?.paymentDate
      if (txEarliest && divEarliest) {
        return txEarliest < divEarliest ? txEarliest : divEarliest
      }
      return txEarliest ?? divEarliest ?? today
    })()

    const startMonth = months
      ? new Date(today.getFullYear(), today.getMonth() - (months - 1), 1)
      : new Date(earliest.getFullYear(), earliest.getMonth(), 1)

    // 各月の月末日 (= 翌月初日 - 1ms) を作って checkpoint にする
    const checkpoints: Date[] = []
    const cursor = new Date(startMonth)
    while (cursor <= today) {
      const nextMonthFirst = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const monthEnd = new Date(nextMonthFirst.getTime() - 1)
      checkpoints.push(monthEnd <= today ? monthEnd : today)
      cursor.setMonth(cursor.getMonth() + 1)
    }

    type StockState = { shares: number; costBasis: number }
    const snapshots = checkpoints.map((checkpoint) => {
      const states = new Map<number, StockState>()
      let realizedPL = 0

      for (const tx of transactions) {
        if (tx.transactionDate > checkpoint) break
        const state = states.get(tx.stockId) ?? { shares: 0, costBasis: 0 }
        const factor = jpyFactorByStock.get(tx.stockId) ?? 1 // 米国株は円換算
        const shares = Number(tx.shares)
        const price = Number(tx.pricePerShare) * factor // 円建て単価
        const fee = Number(tx.fee) * factor
        // costBasis は円建てで積み上げる（avgPrice も円建てになる）

        if (tx.transactionType === 'BUY') {
          state.costBasis += shares * price + fee
          state.shares += shares
        } else if (tx.transactionType === 'SELL' && state.shares > 0) {
          const avgPrice = state.costBasis / state.shares
          const sellShares = Math.min(shares, state.shares)
          realizedPL += (price - avgPrice) * sellShares - fee
          state.costBasis -= avgPrice * sellShares
          state.shares -= sellShares
          if (state.shares <= 0) {
            state.shares = 0
            state.costBasis = 0
          }
        }
        states.set(tx.stockId, state)
      }

      let invested = 0
      for (const state of states.values()) invested += state.costBasis

      let cumulativeDividends = 0
      for (const d of dividends) {
        if (d.paymentDate > checkpoint) break
        cumulativeDividends += Number(d.dividendAmount)
      }

      return {
        date: checkpoint.toISOString().slice(0, 10),
        investedAmount: Math.round(invested * 100) / 100,
        cumulativeRealizedPL: Math.round(realizedPL * 100) / 100,
        cumulativeDividends: Math.round(cumulativeDividends * 100) / 100,
      }
    })

    return Response.json(createSuccessResponse({ snapshots }))
  } catch (error) {
    return handleApiError(error)
  }
}
