import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const dividend = await prisma.dividendHistory.findUnique({
      where: { id: parseInt(id) },
      include: {
        stock: {
          select: { stockName: true, code: true, holdingCompany: true },
        },
      },
    })

    if (!dividend) {
      return Response.json(createErrorResponse('NOT_FOUND', '配当が見つかりません'), {
        status: 404,
      })
    }

    return Response.json(
      createSuccessResponse({
        id: dividend.id,
        stockId: dividend.stockId,
        stockName: dividend.stock.stockName,
        stockCode: dividend.stock.code,
        holdingCompany: dividend.stock.holdingCompany,
        dividendAmount: Number(dividend.dividendAmount),
        paymentDate: dividend.paymentDate.toISOString(),
        dividendType: dividend.dividendType,
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
    const dividendId = parseInt(id)

    const existing = await prisma.dividendHistory.findUnique({
      where: { id: dividendId },
      select: { id: true },
    })
    if (!existing) {
      return Response.json(createErrorResponse('NOT_FOUND', '配当が見つかりません'), {
        status: 404,
      })
    }

    await prisma.dividendHistory.delete({ where: { id: dividendId } })

    return Response.json(createSuccessResponse({ id: dividendId }))
  } catch (error) {
    return handleApiError(error)
  }
}
