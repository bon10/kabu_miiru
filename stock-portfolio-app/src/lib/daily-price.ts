import { prisma } from '@/lib/prisma'
import { toDateKey } from '@/lib/date-key'
import { getApiSymbol } from '@/lib/utils'

// 日次終値の取得・保存（ADR 0009）。
//
// ポートフォリオ推移は「その日の保有株数 × その日の終値 × その日のレート」で
// 読み取り時に再構成する。本モジュールはその原資料である日次終値を集める。
//
// 場中の価格を記録する PriceHistory とは別テーブル（DailyPrice）に保存する。
// PriceHistory は recordedAt が任意時刻で終値と場中値が混在するため、
// 時系列の再構成には使えないため。

// Yahoo Finance chart API のレスポンスのうち、日次終値の取得に必要な部分。
interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>
      }
    }>
    error?: unknown
  }
}

export interface DailyClose {
  // 暦日キー（DailyPrice.priceDate の値。ADR 0012）
  priceDate: Date
  close: number
}

export interface DailyCloseFetchResult {
  symbol: string
  success: boolean
  closes: DailyClose[]
  error?: string
}

// UNIX 秒（Yahoo の timestamp）を、その時刻が属する JST 暦日のキーに丸める。
// ExchangeRate.rateDate と同じ「暦日をキーにする」粒度に揃えるため。
function toPriceDate(unixSeconds: number): Date {
  return toDateKey(new Date(unixSeconds * 1000))
}

// Yahoo Finance chart API のレスポンスから日次終値を取り出す純粋関数。
// ネットワークを伴わないため、配列の対応付けと欠損の扱いを単体テストで固定できる。
export function parseDailyCloses(
  data: YahooChartResponse,
): { ok: true; closes: DailyClose[] } | { ok: false; error: string } {
  const result = data.chart?.result?.[0]
  const timestamps = result?.timestamp
  const closes = result?.indicators?.quote?.[0]?.close

  if (!timestamps || !closes) {
    return { ok: false, error: 'レスポンス形式が不正です' }
  }

  // timestamp と close は同じ長さの配列で対応する。休場明けなどで close が
  // null になる要素があるため、null は捨てる（後段で前営業日の値で埋める）。
  const parsed: DailyClose[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i]
    if (close === null || close === undefined || !Number.isFinite(close)) continue
    parsed.push({ priceDate: toPriceDate(timestamps[i]), close })
  }

  if (parsed.length === 0) {
    return { ok: false, error: '有効な終値がありませんでした' }
  }

  return { ok: true, closes: parsed }
}

// Yahoo Finance chart API から日次終値をまとめて取得する。
//
// range で指定した期間分が 1 リクエストで返るため、アプリを止めていた期間も
// 後から一括で埋められる（1 ヶ月の欠測でも 1 日ぶんの更新でもリクエストは 1 回）。
// この性質が「保存するのは原資料の終値だけ」という ADR 0009 の設計を支えている。
//
// 非公式 API のため公式ドキュメントは存在しない。range / interval の挙動は
// 2026-08-14 に実測で確認したものであり、仕様として保証されたものではない
// （docs/external-apis.md 参照）。
export async function fetchDailyCloseSeries(
  apiSymbol: string,
  range: string,
): Promise<DailyCloseFetchResult> {
  const symbol = apiSymbol
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(apiSymbol)}` +
    `?range=${encodeURIComponent(range)}&interval=1d`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    if (!response.ok) {
      return { symbol, success: false, closes: [], error: `HTTP ${response.status}` }
    }

    const parsed = parseDailyCloses(await response.json())
    if (!parsed.ok) {
      return { symbol, success: false, closes: [], error: parsed.error }
    }
    return { symbol, success: true, closes: parsed.closes }
  } catch (error) {
    return {
      symbol,
      success: false,
      closes: [],
      error: error instanceof Error ? error.message : '不明なエラー',
    }
  }
}

// 銘柄コードを Yahoo のシンボルに変換して日次終値を取得する（日本株は .T 付き）。
// 為替のように銘柄コード変換が不要な系列は fetchDailyCloseSeries を直接使う。
export async function fetchDailyCloses(
  code: string,
  range: string,
): Promise<DailyCloseFetchResult> {
  return fetchDailyCloseSeries(getApiSymbol(code), range)
}

export interface BackfillStockResult {
  stockId: number
  code: string
  success: boolean
  savedCount: number
  error?: string
}

// 1 銘柄ぶんの日次終値を取得して保存する。
// 既存レコードは上書きせずスキップする（実測値を後から取り直して壊さないため）。
// 価格は建値通貨のまま保存する。円換算は読み取り時に行う（ADR 0005 / 0008）。
async function backfillStock(
  stock: { id: number; code: string },
  range: string,
): Promise<BackfillStockResult> {
  const fetched = await fetchDailyCloses(stock.code, range)

  if (!fetched.success) {
    return {
      stockId: stock.id,
      code: stock.code,
      success: false,
      savedCount: 0,
      error: fetched.error,
    }
  }

  const existing = await prisma.dailyPrice.findMany({
    where: {
      stockId: stock.id,
      priceDate: { gte: fetched.closes[0].priceDate },
    },
    select: { priceDate: true },
  })
  const existingKeys = new Set(existing.map((e) => toDateKey(e.priceDate).getTime()))

  const toCreate = fetched.closes
    .filter((c) => !existingKeys.has(c.priceDate.getTime()))
    .map((c) => ({
      stockId: stock.id,
      close: c.close,
      priceDate: c.priceDate,
      source: 'yahoo',
      isFilled: false,
    }))

  if (toCreate.length === 0) {
    return { stockId: stock.id, code: stock.code, success: true, savedCount: 0 }
  }

  // 同時実行で同じ日を作りにいったときはユニーク制約で弾かれる。既存値を正とし、
  // 取りこぼしは次回の実行で埋まるため skipDuplicates で黙認する。
  const created = await prisma.dailyPrice.createMany({
    data: toCreate,
    skipDuplicates: true,
  })

  return {
    stockId: stock.id,
    code: stock.code,
    success: true,
    savedCount: created.count,
  }
}

export interface BackfillSummary {
  range: string
  targetCount: number
  successCount: number
  failedCount: number
  savedCount: number
  results: BackfillStockResult[]
}

// 保有中の全銘柄について日次終値を取り込む。
//
// 銘柄ごとに直列で処理する（既存の fetchMultipleStockPrices と同じ方針）。
// Yahoo 側のレート制限を避けるためであり、そのぶん時間がかかるため
// 画面リクエストからではなくバッチ経路で呼ぶこと。
export async function backfillDailyPrices(range: string): Promise<BackfillSummary> {
  const stocks = await prisma.stock.findMany({
    where: { sharesHeld: { gt: 0 } },
    select: { id: true, code: true },
  })

  const results: BackfillStockResult[] = []
  for (const stock of stocks) {
    results.push(await backfillStock(stock, range))
  }

  return {
    range,
    targetCount: stocks.length,
    successCount: results.filter((r) => r.success).length,
    failedCount: results.filter((r) => !r.success).length,
    savedCount: results.reduce((sum, r) => sum + r.savedCount, 0),
    results,
  }
}
