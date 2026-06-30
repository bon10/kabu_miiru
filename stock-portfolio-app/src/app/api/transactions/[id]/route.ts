import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { recalculateStockAggregates } from '@/lib/stock-aggregation'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const transaction = await prisma.transaction.findUnique({
      where: { id: parseInt(id) },
      include: {
        stock: {
          select: { stockName: true, code: true },
        },
      },
    })

    if (!transaction) {
      return Response.json(createErrorResponse('NOT_FOUND', '取引が見つかりません'), {
        status: 404,
      })
    }

    return Response.json(
      createSuccessResponse({
        id: transaction.id,
        stockId: transaction.stockId,
        stockName: transaction.stock.stockName,
        stockCode: transaction.stock.code,
        transactionType: transaction.transactionType,
        shares: Number(transaction.shares),
        pricePerShare: Number(transaction.pricePerShare),
        totalAmount: Number(transaction.totalAmount),
        fee: Number(transaction.fee),
        transactionDate: transaction.transactionDate.toISOString(),
        memo: transaction.memo,
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const transactionId = parseInt(id)

    const existing = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { stockId: true },
    })

    if (!existing) {
      return Response.json(createErrorResponse('NOT_FOUND', '取引が見つかりません'), {
        status: 404,
      })
    }

    await prisma.$transaction(async (tx) => {
      await tx.transaction.delete({ where: { id: transactionId } })
      await recalculateStockAggregates(existing.stockId, tx)
    })

    return Response.json(createSuccessResponse({ id: transactionId }))
  } catch (error) {
    return handleApiError(error)
  }
}
