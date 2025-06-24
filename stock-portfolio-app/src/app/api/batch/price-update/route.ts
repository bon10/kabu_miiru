import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { fetchMultipleStockPrices, getCurrentMarketSession, shouldUpdatePrice } from '@/lib/stock-price'
import { calculateProfitLoss } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    // API認証チェック（簡易版）
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey || apiKey !== process.env.BATCH_API_KEY) {
      return Response.json(
        createErrorResponse('UNAUTHORIZED', 'Invalid API key'),
        { status: 401 }
      )
    }

    // 保有株数 > 0 の銘柄のみを対象とする
    const activeStocks = await prisma.stock.findMany({
      where: {
        sharesHeld: {
          gt: 0
        }
      },
      select: {
        id: true,
        code: true,
        stockName: true,
        currentPrice: true,
        lastPriceUpdate: true,
        avgAcquisitionPrice: true,
        sharesHeld: true
      }
    })

    if (activeStocks.length === 0) {
      return Response.json(createSuccessResponse({
        batchId: `batch_${Date.now()}`,
        executedAt: new Date().toISOString(),
        session: getCurrentMarketSession(),
        updatedCount: 0,
        failedCount: 0,
        message: 'No active stocks to update'
      }))
    }

    // 更新が必要な銘柄をフィルタリング
    const stocksToUpdate = activeStocks.filter(stock => 
      shouldUpdatePrice(stock.lastPriceUpdate)
    )

    if (stocksToUpdate.length === 0) {
      return Response.json(createSuccessResponse({
        batchId: `batch_${Date.now()}`,
        executedAt: new Date().toISOString(),
        session: getCurrentMarketSession(),
        updatedCount: 0,
        failedCount: 0,
        message: 'All prices are up to date'
      }))
    }

    // 株価を一括取得
    const symbols = stocksToUpdate.map(stock => stock.code)
    const priceResults = await fetchMultipleStockPrices(symbols)

    let updatedCount = 0
    let failedCount = 0
    const results = []

    // 結果を処理してデータベースを更新
    for (let i = 0; i < stocksToUpdate.length; i++) {
      const stock = stocksToUpdate[i]
      const priceResult = priceResults[i]

      if (priceResult.success && priceResult.newPrice) {
        try {
          // 損益を再計算
          const { profitLoss, profitLossRate } = calculateProfitLoss(
            priceResult.newPrice!,
            Number(stock.avgAcquisitionPrice),
            Number(stock.sharesHeld)
          )

          // 株価とPrice Historyを更新
          await prisma.$transaction(async (tx) => {
            // 株価を更新
            await tx.stock.update({
              where: { id: stock.id },
              data: {
                currentPrice: priceResult.newPrice!,
                profitLoss,
                profitLossRate,
                lastPriceUpdate: new Date(),
                priceUpdateStatus: 'SUCCESS',
                priceUpdateError: null,
                priceSource: 'yahoo'
              }
            })

            // 価格履歴に記録
            await tx.priceHistory.create({
              data: {
                stockId: stock.id,
                price: priceResult.newPrice!,
                recordedAt: new Date(),
                source: 'yahoo',
                marketSession: getCurrentMarketSession()
              }
            })
          })

          updatedCount++
          results.push({
            stockId: stock.id,
            stockName: stock.stockName,
            success: true,
            oldPrice: Number(stock.currentPrice),
            newPrice: priceResult.newPrice
          })
        } catch (error) {
          console.error(`Failed to update price for ${stock.stockName}:`, error)
          failedCount++
          results.push({
            stockId: stock.id,
            stockName: stock.stockName,
            success: false,
            error: 'Database update failed'
          })
        }
      } else {
        // 価格取得失敗時はエラー状態を記録
        try {
          await prisma.stock.update({
            where: { id: stock.id },
            data: {
              priceUpdateStatus: 'ERROR',
              priceUpdateError: priceResult.error || 'Price fetch failed',
              lastPriceUpdate: new Date()
            }
          })
        } catch (error) {
          console.error(`Failed to update error status for ${stock.stockName}:`, error)
        }

        failedCount++
        results.push({
          stockId: stock.id,
          stockName: stock.stockName,
          success: false,
          error: priceResult.error || 'Price fetch failed'
        })
      }
    }

    return Response.json(createSuccessResponse({
      batchId: `batch_${Date.now()}`,
      executedAt: new Date().toISOString(),
      session: getCurrentMarketSession(),
      updatedCount,
      failedCount,
      totalProcessed: stocksToUpdate.length,
      results
    }))
  } catch (error) {
    console.error('Batch price update error:', error)
    return handleApiError(error)
  }
}