import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { fetchStockPrice, getCurrentMarketSession } from '@/lib/stock-price'
import { calculateProfitLoss } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const stockIds = body.stockIds

    // 更新対象の銘柄を取得
    let stocks
    if (stockIds && Array.isArray(stockIds)) {
      stocks = await prisma.stock.findMany({
        where: {
          id: { in: stockIds },
          sharesHeld: { gt: 0 }
        }
      })
    } else {
      // 全ての保有銘柄を更新
      stocks = await prisma.stock.findMany({
        where: {
          sharesHeld: { gt: 0 }
        }
      })
    }

    const results = []
    let updatedCount = 0
    let failedCount = 0

    for (const stock of stocks) {
      try {
        const priceData = await fetchStockPrice(stock.code)
        
        if (priceData) {
          const oldPrice = Number(stock.currentPrice)
          const newPrice = priceData.currentPrice
          
          // 損益を再計算
          const { profitLoss, profitLossRate } = calculateProfitLoss(
            newPrice,
            Number(stock.avgAcquisitionPrice),
            Number(stock.sharesHeld)
          )

          // 銘柄情報を更新
          await prisma.stock.update({
            where: { id: stock.id },
            data: {
              currentPrice: newPrice,
              profitLoss,
              profitLossRate,
              lastPriceUpdate: new Date(),
              priceUpdateStatus: 'SUCCESS',
              priceUpdateError: null,
              priceSource: 'yahoo'
            }
          })

          // 価格履歴を保存
          await prisma.priceHistory.create({
            data: {
              stockId: stock.id,
              price: newPrice,
              recordedAt: new Date(),
              source: 'yahoo',
              marketSession: getCurrentMarketSession()
            }
          })

          results.push({
            stockId: stock.id,
            stockName: stock.stockName,
            success: true,
            oldPrice,
            newPrice
          })
          
          updatedCount++
        } else {
          await prisma.stock.update({
            where: { id: stock.id },
            data: {
              priceUpdateStatus: 'ERROR',
              priceUpdateError: '価格取得に失敗しました'
            }
          })

          results.push({
            stockId: stock.id,
            stockName: stock.stockName,
            success: false,
            error: '価格取得に失敗しました'
          })
          
          failedCount++
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '不明なエラー'
        
        await prisma.stock.update({
          where: { id: stock.id },
          data: {
            priceUpdateStatus: 'ERROR',
            priceUpdateError: errorMessage
          }
        })

        results.push({
          stockId: stock.id,
          stockName: stock.stockName,
          success: false,
          error: errorMessage
        })
        
        failedCount++
      }
    }

    return Response.json(createSuccessResponse({
      updatedCount,
      failedCount,
      results
    }))
  } catch (error) {
    return handleApiError(error)
  }
}