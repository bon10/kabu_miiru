import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { dateKeyParts, formatDateKey, startOfWeekKey, toDateKey } from '@/lib/date-key'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  try {
    const { stockId: stockIdStr } = await params
    const stockId = parseInt(stockIdStr)
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

    // インターバルに応じてデータを間引く。
    // 週・月の区切りは日本時間の暦日で判定する（docs/2-domain/time-and-dates.md）。
    // recordedAt から実行環境のローカル時刻で年月日を取ると、動かすサーバーの
    // タイムゾーンによって区切りが変わってしまうため。
    if (interval === 'weekly' && priceHistory.length > 0) {
      // 週次データ: 週の最後の価格のみ（週は月曜始まり）
      const weeklyData = new Map<string, typeof priceHistory[0]>()

      priceHistory.forEach(price => {
        const weekKey = formatDateKey(startOfWeekKey(toDateKey(price.recordedAt)))
        weeklyData.set(weekKey, price)
      })

      priceHistory = Array.from(weeklyData.values()).sort(
        (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
      )
    } else if (interval === 'monthly' && priceHistory.length > 0) {
      // 月次データ: 月の最後の価格のみ
      const monthlyData = new Map<string, typeof priceHistory[0]>()

      priceHistory.forEach(price => {
        const { year, month } = dateKeyParts(toDateKey(price.recordedAt))
        monthlyData.set(`${year}-${month}`, price)
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