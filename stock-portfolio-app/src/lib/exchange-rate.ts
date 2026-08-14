import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { fetchDailyCloseSeries } from '@/lib/daily-price'

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma

const BASE = 'USD'
const QUOTE = 'JPY'

// Yahoo Finance における USD/JPY の系列シンボル。銘柄コード変換は不要。
const USDJPY_SYMBOL = 'USDJPY=X'

// サーバーローカルの暦日 0 時（= その日のレコードキー）を返す。
// 「1 日 1 レコード」の粒度を暦日で揃えるため、時刻を切り落とす。
function toRateDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Yahoo Finance の USDJPY=X から現在の USD/JPY レートを取得する。
// 取得できなければ null を返し、呼び出し側で保存済みレートにフォールバックさせる。
async function fetchUsdJpyFromYahoo(): Promise<number | null> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/USDJPY=X'
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = (await response.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number } }> }
    }
    const meta = data.chart?.result?.[0]?.meta
    const rate = meta?.regularMarketPrice ?? meta?.previousClose
    if (!rate || rate <= 0) return null
    return rate
  } catch (error) {
    console.error('USD/JPY レートの取得に失敗:', error)
    return null
  }
}

// 当日の USD/JPY レート（1 USD = ? JPY）を返す。
// 当日レコードがあればそれを返し、無ければ Yahoo から取得して保存する（= 1 日 1 回更新）。
// 取得に失敗した場合は、保存済みの最新レートにフォールバックする。
// 米国株を保有していて 1 度もレートを取得できていない場合のみ、エラーを投げる。
export async function getCurrentUsdJpyRate(
  client: PrismaClientOrTx = prisma,
): Promise<number> {
  const today = toRateDate(new Date())

  const existing = await client.exchangeRate.findUnique({
    where: { base_quote_rateDate: { base: BASE, quote: QUOTE, rateDate: today } },
  })
  if (existing) return Number(existing.rate)

  const fetched = await fetchUsdJpyFromYahoo()
  if (fetched !== null) {
    try {
      await client.exchangeRate.create({
        data: { base: BASE, quote: QUOTE, rate: fetched, rateDate: today, source: 'yahoo' },
      })
      return fetched
    } catch {
      // ダッシュボードは複数 API を並行で叩くため、当日レコードが無い初回は
      // 複数リクエストが同時に作成しようとしてユニーク制約に衝突しうる。
      // その場合は先に作成された当日レコードを読み直して返す。
      const row = await client.exchangeRate.findUnique({
        where: { base_quote_rateDate: { base: BASE, quote: QUOTE, rateDate: today } },
      })
      if (row) return Number(row.rate)
      return fetched
    }
  }

  // Yahoo が失敗したときは、保存済みの最新レートで代替する
  const latest = await client.exchangeRate.findFirst({
    where: { base: BASE, quote: QUOTE },
    orderBy: { rateDate: 'desc' },
  })
  if (latest) return Number(latest.rate)

  throw new Error('USD/JPY レートを取得できませんでした（Yahoo 取得失敗・保存済みレートなし）')
}

export interface RateBackfillSummary {
  range: string
  success: boolean
  savedCount: number
  error?: string
}

// 過去の USD/JPY レートをまとめて取り込む（ADR 0009）。
//
// getCurrentUsdJpyRate は当日 1 件しか取りに行かないため、アプリを起動していなかった
// 期間のレートが欠ける。ポートフォリオ推移では過去日の評価額を「その日のレート」で
// 円換算するため、日次終値と同様にレートも遡って埋める必要がある。
//
// 既存レコードは上書きしない（取得済みの実測値を後から書き換えないため）。
export async function backfillUsdJpyRates(range: string): Promise<RateBackfillSummary> {
  const fetched = await fetchDailyCloseSeries(USDJPY_SYMBOL, range)

  if (!fetched.success) {
    return { range, success: false, savedCount: 0, error: fetched.error }
  }

  const existing = await prisma.exchangeRate.findMany({
    where: {
      base: BASE,
      quote: QUOTE,
      rateDate: { gte: fetched.closes[0].priceDate },
    },
    select: { rateDate: true },
  })
  const existingKeys = new Set(existing.map((e) => toRateDate(e.rateDate).getTime()))

  const toCreate = fetched.closes
    .filter((c) => !existingKeys.has(c.priceDate.getTime()))
    .map((c) => ({
      base: BASE,
      quote: QUOTE,
      rate: c.close,
      rateDate: c.priceDate,
      source: 'yahoo',
    }))

  if (toCreate.length === 0) {
    return { range, success: true, savedCount: 0 }
  }

  const created = await prisma.exchangeRate.createMany({
    data: toCreate,
    skipDuplicates: true,
  })

  return { range, success: true, savedCount: created.count }
}

// 指定期間の USD/JPY レートを暦日キーの Map で返す。
// 推移の再構成で日ごとに引くため、1 クエリで読んでメモリ上で解決する。
export async function getUsdJpyRateMap(from: Date): Promise<Map<number, number>> {
  const rates = await prisma.exchangeRate.findMany({
    where: { base: BASE, quote: QUOTE, rateDate: { gte: toRateDate(from) } },
    orderBy: { rateDate: 'asc' },
  })

  const map = new Map<number, number>()
  for (const r of rates) {
    map.set(toRateDate(r.rateDate).getTime(), Number(r.rate))
  }
  return map
}
