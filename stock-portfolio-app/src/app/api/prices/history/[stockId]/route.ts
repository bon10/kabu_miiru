import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'

export async function GET(
  request: NextRequest,
  { params }: { params: { stockId: string } }
) {
  try {
    const stockId = parseInt(params.stockId)
    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30')
    const interval = searchParams.get('interval') || 'daily'
    
    if (isNaN(stockId)) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '無効な銘柄IDです'),
        { status: 400 }
      )
    }

    // 銘柄の存在確認
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: { id: true, stockName: true }
    })

    if (!stock) {
      return Response.json(
        createErrorResponse('NOT_FOUND', '銘柄が見つかりません'),
        { status: 404 }
      )
    }

    // 期間の計算
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)

    let priceHistory = await prisma.priceHistory.findMany({
      where: {
        stockId,
        recordedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { recordedAt: 'asc' }
    })

    // インターバルに応じてデータを間引く
    if (interval === 'weekly' && priceHistory.length > 0) {
      // 週次データ: 週の最後の価格のみ
      const weeklyData = new Map<string, typeof priceHistory[0]>()
      
      priceHistory.forEach(price => {
        const date = new Date(price.recordedAt)
        const weekKey = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`
        weeklyData.set(weekKey, price)
      })
      
      priceHistory = Array.from(weeklyData.values()).sort(
        (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
      )
    } else if (interval === 'monthly' && priceHistory.length > 0) {
      // 月次データ: 月の最後の価格のみ
      const monthlyData = new Map<string, typeof priceHistory[0]>()
      
      priceHistory.forEach(price => {
        const date = new Date(price.recordedAt)
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`
        monthlyData.set(monthKey, price)
      })
      
      priceHistory = Array.from(monthlyData.values()).sort(
        (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
      )
    }

    return Response.json(createSuccessResponse({
      stockId,
      stockName: stock.stockName,
      history: priceHistory.map(price => ({
        ...price,
        price: Number(price.price)
      }))
    }))
  } catch (error) {
    return handleApiError(error)
  }
}