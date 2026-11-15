import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatDateKey } from '@/lib/date-key'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { TRANSACTION_REPLAY_ORDER } from '@/lib/stock-aggregation'
import {
  chartRangeCovering,
  fetchYahooSplitHistory,
  selectSplitCandidates,
} from '@/lib/stock-split'

// まだ登録していない株式分割・併合の候補を Yahoo Finance から取る（ADR 0024）。
// 銘柄詳細画面が「この内容で登録しますか」と見せるために呼ぶ。登録はしない。
//
// Yahoo から取れなかったときも 200 で候補なしを返し、理由を fetchError に入れる。
// 候補は手入力の補助であり、取れなくても手入力での登録は続けられるため。
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const stock = await prisma.stock.findUnique({
      where: { id: parseInt(id) },
      select: {
        code: true,
        transactions: { orderBy: TRANSACTION_REPLAY_ORDER, take: 1, select: { transactionDate: true } },
        stockSplits: { select: { splitDate: true } },
      },
    })
    if (!stock) {
      return Response.json(createErrorResponse('NOT_FOUND', '指定された銘柄が見つかりません'), {
        status: 404,
      })
    }

    const firstTransactionDate = stock.transactions[0]?.transactionDate ?? null
    if (!firstTransactionDate) {
      return Response.json(createSuccessResponse({ candidates: [], fetchError: null }))
    }

    const history = await fetchYahooSplitHistory(
      stock.code,
      chartRangeCovering(firstTransactionDate, new Date()),
    )
    if (!history.success) {
      return Response.json(createSuccessResponse({ candidates: [], fetchError: history.error }))
    }

    const candidates = selectSplitCandidates(
      history.splits,
      firstTransactionDate,
      stock.stockSplits.map((s) => s.splitDate),
    )
    return Response.json(
      createSuccessResponse({
        candidates: candidates.map((c) => ({
          splitDate: formatDateKey(c.splitDate),
          fromShares: c.fromShares,
          toShares: c.toShares,
        })),
        fetchError: null,
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
