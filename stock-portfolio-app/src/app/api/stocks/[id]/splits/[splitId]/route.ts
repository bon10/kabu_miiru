import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import {
  assertNoOrphanedSells,
  recalculateStockAggregates,
  TransactionOrderError,
} from '@/lib/stock-aggregation'
import { assertTransactionEditAllowed } from '@/lib/settings'

// 登録済みの株式分割・併合を取り消す（ADR 0024）。銘柄詳細画面から呼ぶ。
//
// 取引の削除と同じく保有株数・平均取得単価を書き換える操作なので、取引履歴の
// 編集・削除と同じ設定で許可されているときだけ受け付ける。
// 日次終値は戻さない。Yahoo が返す現在の値に置き換えただけで、分割の登録が
// 誤りだった場合も終値そのものは正しいため。
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; splitId: string }> },
) {
  try {
    const forbidden = await assertTransactionEditAllowed()
    if (forbidden) return forbidden

    const { id, splitId } = await params
    const stockId = parseInt(id)

    const existing = await prisma.stockSplit.findFirst({
      where: { id: parseInt(splitId), stockId },
      select: { id: true },
    })
    if (!existing) {
      return Response.json(createErrorResponse('NOT_FOUND', '株式分割が見つかりません'), {
        status: 404,
      })
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockSplit.delete({ where: { id: existing.id } })
      assertNoOrphanedSells(await recalculateStockAggregates(stockId, tx))
    })

    return Response.json(createSuccessResponse({ id: existing.id }))
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
