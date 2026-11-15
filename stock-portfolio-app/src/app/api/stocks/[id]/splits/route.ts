import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatDateKey } from '@/lib/date-key'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import {
  assertNoOrphanedSells,
  recalculateStockAggregates,
  SPLIT_REPLAY_ORDER,
  TransactionOrderError,
} from '@/lib/stock-aggregation'
import { replaceDailyClosesBefore } from '@/lib/daily-price'
import { chartRangeCovering, fetchYahooSplitHistory, parseSplitInput } from '@/lib/stock-split'

// 銘柄の株式分割・併合（ADR 0024）。銘柄詳細画面から呼ぶ。
// GET は登録済みの分割の一覧、POST は分割の登録。

function serializeSplit(split: {
  id: number
  splitDate: Date
  fromShares: unknown
  toShares: unknown
  memo: string | null
}) {
  return {
    id: split.id,
    splitDate: formatDateKey(split.splitDate),
    fromShares: Number(split.fromShares),
    toShares: Number(split.toShares),
    memo: split.memo,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const splits = await prisma.stockSplit.findMany({
      where: { stockId: parseInt(id) },
      orderBy: SPLIT_REPLAY_ORDER,
    })
    return Response.json(createSuccessResponse({ splits: splits.map(serializeSplit) }))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const stockId = parseInt(id)

    const input = parseSplitInput(await request.json(), new Date())
    if (!input.ok) {
      return Response.json(createErrorResponse('BAD_REQUEST', input.message), { status: 400 })
    }
    const { splitDate, fromShares, toShares, memo } = input.value

    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: { id: true, code: true },
    })
    if (!stock) {
      return Response.json(createErrorResponse('NOT_FOUND', '指定された銘柄が見つかりません'), {
        status: 404,
      })
    }

    const duplicate = await prisma.stockSplit.findUnique({
      where: { stockId_splitDate: { stockId, splitDate } },
      select: { id: true },
    })
    if (duplicate) {
      return Response.json(
        createErrorResponse('DUPLICATE_ENTRY', 'この銘柄には同じ分割日の分割が登録済みです'),
        { status: 400 },
      )
    }

    // 分割日より前に保存した日次終値は、分割前の株数の基準のままの行がありうる。
    // Yahoo から現在の株数の基準の値を取り直して置き換える。取り直せなければ登録
    // ごと差し戻す。保有株数だけ換算して終値が古いままだと、推移の評価額が
    // 比率ぶんずれたまま気づけないため。
    const oldestClose = await prisma.dailyPrice.findFirst({
      where: { stockId, priceDate: { lt: splitDate } },
      orderBy: { priceDate: 'asc' },
      select: { priceDate: true },
    })
    let closes: Awaited<ReturnType<typeof fetchYahooSplitHistory>> | null = null
    if (oldestClose) {
      closes = await fetchYahooSplitHistory(
        stock.code,
        chartRangeCovering(oldestClose.priceDate, new Date()),
      )
      if (!closes.success) {
        return Response.json(
          createErrorResponse(
            'PRICE_FETCH_FAILED',
            `分割日より前の日次終値を取り直せなかったため、分割を登録しませんでした（${closes.error}）。時間をおいてもう一度登録してください。`,
          ),
          { status: 502 },
        )
      }
    }

    const { split, replacedCloseCount } = await prisma.$transaction(async (tx) => {
      const created = await tx.stockSplit.create({
        data: { stockId, splitDate, fromShares, toShares, memo },
      })
      assertNoOrphanedSells(await recalculateStockAggregates(stockId, tx))
      const replaced = closes?.success
        ? await replaceDailyClosesBefore(stockId, closes.closes, splitDate, tx)
        : 0
      return { split: created, replacedCloseCount: replaced }
      // 日次終値の置き換えは 10 年ぶんで約 2,500 行になる。Prisma の既定（5 秒）では
      // 足りないことがあるため延ばす
    }, { timeout: 30_000 })

    return Response.json(
      createSuccessResponse({ split: serializeSplit(split), replacedCloseCount }),
      { status: 201 },
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
