import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import {
  assertNoOrphanedSells,
  recalculateStockAggregates,
  TransactionOrderError,
} from '@/lib/stock-aggregation'
import { ALLOW_TRANSACTION_EDIT, getBooleanSetting } from '@/lib/settings'

// 取引履歴の編集・削除は設定フラグ（既定オフ）で許可されているときのみ受け付ける。
// オフのときに直接 API を叩かれてもデータを守るためのサーバー側ガード。
async function assertTransactionEditAllowed(): Promise<Response | null> {
  const allowed = await getBooleanSetting(ALLOW_TRANSACTION_EDIT)
  if (!allowed) {
    return Response.json(
      createErrorResponse('FORBIDDEN', '取引履歴の編集・削除は設定で許可されていません'),
      { status: 403 },
    )
  }
  return null
}

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
    const forbidden = await assertTransactionEditAllowed()
    if (forbidden) return forbidden

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

    // 先行する BUY を削除すると後続の SELL が保有ゼロの時点に取り残される。
    // その状態は実現損益を計算できないため、削除ごとロールバックして差し戻す。
    await prisma.$transaction(async (tx) => {
      await tx.transaction.delete({ where: { id: transactionId } })
      assertNoOrphanedSells(await recalculateStockAggregates(existing.stockId, tx))
    })

    return Response.json(createSuccessResponse({ id: transactionId }))
  } catch (error) {
    if (error instanceof TransactionOrderError) {
      return Response.json(
        createErrorResponse('INVALID_TRANSACTION_ORDER', error.message, error.orphanedSells),
        { status: 400 },
      )
    }
    return handleApiError(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const forbidden = await assertTransactionEditAllowed()
    if (forbidden) return forbidden

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

    const body = await request.json()

    if (
      !body.transactionType ||
      body.shares === undefined ||
      body.pricePerShare === undefined ||
      !body.transactionDate
    ) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '必須フィールドが不足しています'),
        { status: 400 },
      )
    }
    if (body.transactionType !== 'BUY' && body.transactionType !== 'SELL') {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '取引種別は BUY または SELL である必要があります'),
        { status: 400 },
      )
    }

    const shares = Number(body.shares)
    const pricePerShare = Number(body.pricePerShare)
    if (shares <= 0 || pricePerShare < 0) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '株数は 0 より大きく、単価は 0 以上である必要があります'),
        { status: 400 },
      )
    }

    const fee = Number(body.fee) || 0
    const totalAmount = body.totalAmount ?? shares * pricePerShare

    // 取引そのものは stock を付け替えない（銘柄変更は非対応）。
    // 更新後、その銘柄の集計値（保有株数・取得単価・損益）を取引履歴から再計算する。
    // 取引日を SELL より後ろにずらすと保有ゼロ時点の SELL が生まれ実現損益が消えるため、
    // その場合は更新ごとロールバックする（ADR 0008）。
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          transactionType: body.transactionType,
          shares,
          pricePerShare,
          totalAmount,
          fee,
          transactionDate: new Date(body.transactionDate),
          memo: body.memo ?? null,
        },
        include: {
          stock: { select: { stockName: true, code: true } },
        },
      })
      assertNoOrphanedSells(await recalculateStockAggregates(existing.stockId, tx))
      return result
    })

    return Response.json(
      createSuccessResponse({
        id: updated.id,
        stockId: updated.stockId,
        stockName: updated.stock.stockName,
        stockCode: updated.stock.code,
        transactionType: updated.transactionType,
        shares: Number(updated.shares),
        pricePerShare: Number(updated.pricePerShare),
        totalAmount: Number(updated.totalAmount),
        fee: Number(updated.fee),
        transactionDate: updated.transactionDate.toISOString(),
        memo: updated.memo,
      }),
    )
  } catch (error) {
    if (error instanceof TransactionOrderError) {
      return Response.json(
        createErrorResponse('INVALID_TRANSACTION_ORDER', error.message, error.orphanedSells),
        { status: 400 },
      )
    }
    return handleApiError(error)
  }
}
