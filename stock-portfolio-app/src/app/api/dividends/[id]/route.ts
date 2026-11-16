import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { parseDividendInput, toNullableNumber } from '@/lib/dividend'

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
        shares: toNullableNumber(dividend.shares),
        taxAmount: toNullableNumber(dividend.taxAmount),
        netAmount: toNullableNumber(dividend.netAmount),
        currency: dividend.currency,
        paymentDate: dividend.paymentDate.toISOString(),
        dividendType: dividend.dividendType,
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}

// 登録済みの受取配当 1 件を、証券会社の配当明細から入れ直した値で置き換える。
// 入力ミスの訂正用で、受け取る項目と検証は追加 API（POST /api/dividends）と同じ（ADR 0015）。
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const dividendId = parseInt(id)

    const input = parseDividendInput(await request.json())
    if (!input.ok) {
      return Response.json(createErrorResponse('BAD_REQUEST', input.message), { status: 400 })
    }

    const existing = await prisma.dividendHistory.findUnique({
      where: { id: dividendId },
      select: { id: true },
    })
    if (!existing) {
      return Response.json(createErrorResponse('NOT_FOUND', '配当が見つかりません'), {
        status: 404,
      })
    }

    // 銘柄の選び間違いも訂正できるよう stockId の付け替えを許す。付け替え先の存在だけ確認する
    const stock = await prisma.stock.findUnique({
      where: { id: input.data.stockId },
      select: { id: true },
    })
    if (!stock) {
      return Response.json(
        createErrorResponse('NOT_FOUND', '指定された銘柄が見つかりません'),
        { status: 404 },
      )
    }

    const updated = await prisma.dividendHistory.update({
      where: { id: dividendId },
      data: input.data,
      include: {
        stock: {
          select: { stockName: true, code: true, holdingCompany: true },
        },
      },
    })

    return Response.json(
      createSuccessResponse({
        id: updated.id,
        stockId: updated.stockId,
        stockName: updated.stock.stockName,
        stockCode: updated.stock.code,
        holdingCompany: updated.stock.holdingCompany,
        dividendAmount: Number(updated.dividendAmount),
        shares: toNullableNumber(updated.shares),
        taxAmount: toNullableNumber(updated.taxAmount),
        netAmount: toNullableNumber(updated.netAmount),
        currency: updated.currency,
        paymentDate: updated.paymentDate.toISOString(),
        dividendType: updated.dividendType,
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
