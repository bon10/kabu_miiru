import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { getCurrentUsdJpyRate } from '@/lib/exchange-rate'
import { toJpyByCurrency } from '@/lib/currency'
import {
  calcDividendReceipt,
  netDividendAmount,
  resolveDividendTax,
  toNullableNumber,
  DIVIDEND_CALC_MESSAGES,
  DIVIDEND_TAX_MESSAGES,
} from '@/lib/dividend'
import { dateKeyOf, toDateKey } from '@/lib/date-key'

// 期末/中間/四半期/特別は個別株の配当区分。分配金は ETF・投資信託の分配（毎月分配型など）向け。
// 表示専用ラベルで集計には使わないため任意。証券会社が期を示さず判別できない場合は未指定（NULL）で保存できる。
const ALLOWED_DIVIDEND_TYPES = ['期末', '中間', '四半期', '特別', '分配金'] as const
const ALLOWED_CURRENCIES = ['JPY', 'USD'] as const

// 税額合計・受取金額は明細に無ければ空欄で登録できる（ADR 0015）。空文字・null・未指定は
// 「未入力」として null に寄せ、数値が来たときだけ Number に通す。
function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  return Number(value)
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const stockId = searchParams.get('stockId')
    const year = searchParams.get('year')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Prisma.DividendHistoryWhereInput = {}

    if (stockId) {
      where.stockId = parseInt(stockId)
    }

    if (year) {
      // 年の境目は JST の暦日で判定する（ADR 0004 / 0012）
      const y = parseInt(year)
      where.paymentDate = {
        gte: dateKeyOf(y, 0, 1),
        lt: dateKeyOf(y + 1, 0, 1),
      }
    } else if (startDate || endDate) {
      where.paymentDate = {}
      if (startDate) where.paymentDate.gte = new Date(startDate)
      if (endDate) where.paymentDate.lte = new Date(endDate)
    }

    const skip = (page - 1) * limit

    const [dividends, totalCount] = await Promise.all([
      prisma.dividendHistory.findMany({
        where,
        include: {
          stock: {
            select: { stockName: true, code: true, holdingCompany: true },
          },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dividendHistory.count({ where }),
    ])

    // USD 建ての配当があるときだけ当日レートを取得して円換算する。
    // 円建てのみなら換算不要なので、外部リクエストを避けてレート取得をスキップする。
    const hasUsd = dividends.some((d) => d.currency === 'USD')
    const usdJpyRate = hasUsd ? await getCurrentUsdJpyRate() : 1

    return Response.json(
      createSuccessResponse({
        dividends: dividends.map((d) => {
          // 手取り＝受取金額。持たない旧レコードは税引前で代用する（ADR 0015）
          const net = netDividendAmount(Number(d.dividendAmount), toNullableNumber(d.netAmount))
          return {
            id: d.id,
            stockId: d.stockId,
            stockName: d.stock.stockName,
            stockCode: d.stock.code,
            holdingCompany: d.stock.holdingCompany,
            dividendAmount: Number(d.dividendAmount),
            shares: toNullableNumber(d.shares),
            taxAmount: toNullableNumber(d.taxAmount),
            netAmount: toNullableNumber(d.netAmount),
            currency: d.currency,
            dividendAmountJpy: toJpyByCurrency(Number(d.dividendAmount), d.currency, usdJpyRate),
            netAmountJpy: toJpyByCurrency(net, d.currency, usdJpyRate),
            paymentDate: d.paymentDate.toISOString(),
            dividendType: d.dividendType,
          }
        }),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
        },
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (
      !body.stockId ||
      body.dividendPerShare === undefined ||
      !body.paymentDate
    ) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '必須フィールドが不足しています'),
        { status: 400 },
      )
    }

    // 入力は証券会社の配当明細を写したもの（ADR 0015）。単価にあたるのが 1 株あたり配当金で、
    // 配当・分配金合計は「1 株あたり配当金 × 数量」で後段で確定する。
    const dividendPerShare = Number(body.dividendPerShare)

    // 配当種別は任意。指定された場合のみ許可値を検証し、未指定は NULL として保存する。
    const dividendType =
      body.dividendType === undefined || body.dividendType === null || body.dividendType === ''
        ? null
        : body.dividendType
    if (dividendType !== null && !ALLOWED_DIVIDEND_TYPES.includes(dividendType)) {
      return Response.json(
        createErrorResponse(
          'BAD_REQUEST',
          `配当種別は ${ALLOWED_DIVIDEND_TYPES.join(' / ')} のいずれかを指定してください`,
        ),
        { status: 400 },
      )
    }

    // 受取通貨。未指定なら従来どおり円建てとして扱う。
    const currency = body.currency ?? 'JPY'
    if (!ALLOWED_CURRENCIES.includes(currency)) {
      return Response.json(
        createErrorResponse(
          'BAD_REQUEST',
          `通貨は ${ALLOWED_CURRENCIES.join(' / ')} のいずれかを指定してください`,
        ),
        { status: 400 },
      )
    }

    // 銘柄の存在確認のみ。配当合計に掛ける株数は明細の数量なので、保有株数は参照しない
    const stock = await prisma.stock.findUnique({
      where: { id: body.stockId },
      select: { id: true },
    })
    if (!stock) {
      return Response.json(
        createErrorResponse('NOT_FOUND', '指定された銘柄が見つかりません'),
        { status: 404 },
      )
    }

    // 数量は明細の「数量」を写す（ADR 0015）。現在の保有株数（Stock.sharesHeld）は使わない。
    // 配当額は権利確定日の株数で決まるのに対し、登録時点の保有株数は権利確定後の売買を
    // 織り込んだ別の数字で、掛けると明細と違う配当合計を保存してしまうため。
    // 未指定は保有株数で補わず NO_SHARES で弾く（補うと上記の取り違えが復活する）。
    const shares = Number(body.shares)
    const calc = calcDividendReceipt(dividendPerShare, shares)
    if (!calc.ok) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', DIVIDEND_CALC_MESSAGES[calc.error]),
        { status: 400 },
      )
    }
    const dividendAmount = calc.total

    // 税額合計・受取金額は片方だけの入力でよい（もう片方は配当合計から引いて埋まる）。
    // 両方空欄なら税額不明として NULL のまま保存する。
    const tax = resolveDividendTax(
      dividendAmount,
      optionalNumber(body.taxAmount),
      optionalNumber(body.netAmount),
    )
    if (!tax.ok) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', DIVIDEND_TAX_MESSAGES[tax.error]),
        { status: 400 },
      )
    }

    const created = await prisma.dividendHistory.create({
      data: {
        stockId: body.stockId,
        dividendAmount,
        shares,
        taxAmount: tax.tax,
        netAmount: tax.net,
        currency,
        paymentDate: toDateKey(new Date(body.paymentDate)),
        dividendType,
      },
      include: {
        stock: {
          select: { stockName: true, code: true, holdingCompany: true },
        },
      },
    })

    return Response.json(
      createSuccessResponse({
        id: created.id,
        stockId: created.stockId,
        stockName: created.stock.stockName,
        stockCode: created.stock.code,
        holdingCompany: created.stock.holdingCompany,
        dividendAmount: Number(created.dividendAmount),
        shares: toNullableNumber(created.shares),
        taxAmount: toNullableNumber(created.taxAmount),
        netAmount: toNullableNumber(created.netAmount),
        currency: created.currency,
        paymentDate: created.paymentDate.toISOString(),
        dividendType: created.dividendType,
      }),
      { status: 201 },
    )
  } catch (error) {
    return handleApiError(error)
  }
}
