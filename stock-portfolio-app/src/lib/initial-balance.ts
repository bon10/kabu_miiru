import { prisma } from '@/lib/prisma'
import { recalculateStockAggregates } from '@/lib/stock-aggregation'
import { formatDateKey } from '@/lib/daily-price'

// 初期残高 Transaction の生成（ADR 0008）。
//
// TSV 一括インポート由来の保有は Stock に直接書かれており Transaction を持たない。
// この状態では任意時点の保有株数を再生できず、ポートフォリオ推移（ADR 0009）を
// 計算できないため、「起点日にこの株数を保有していた」という 1 件の BUY を作る。
//
// 生成する取引は isInitialBalance = true を立てるだけで、種別も集計上の扱いも
// 通常の BUY と同一。フラグが示すのは「取引日が実データではなく推定値」であること。

// 購入日を持たない銘柄に与える起点日（ADR 0008）。
// 全銘柄の Stock.createdAt が示す TSV 一括取り込み日。この日にその株数を保有して
// いたことは事実であり、それ以前は不明なため推定で遡らせない。
export const DEFAULT_BASELINE_DATE = new Date(2025, 8, 10) // 2025-09-10

// 株数の比較に使う許容誤差。Decimal(15,4) で保持しているため 4 桁目未満は誤差とみなす。
const SHARES_EPSILON = 0.00005

export interface InitialBalanceCreated {
  stockId: number
  code: string
  stockName: string
  shares: number
  pricePerShare: number
  baselineDate: string
  // 起点日に Stock.purchaseDate を使えたか。false なら DEFAULT_BASELINE_DATE による推定
  fromPurchaseDate: boolean
}

export interface InitialBalanceSkipped {
  stockId: number
  code: string
  stockName: string
  reason: string
}

export interface InitialBalanceSummary {
  applied: boolean
  createdCount: number
  created: InitialBalanceCreated[]
  skipped: InitialBalanceSkipped[]
  // 移行後に Stock の集計値が移行前と一致しなかった銘柄。空であることが成功条件
  mismatches: Array<{ code: string; field: string; before: number; after: number }>
}

// 既存の Transaction が説明できている保有株数を返す（平均取得単価法の株数部分のみ）。
// stock-aggregation.ts の再計算と同じ順序・同じ打ち切り規則で数える。
function replayShares(
  transactions: Array<{ transactionType: string; shares: unknown }>,
): number {
  let shares = 0
  for (const tx of transactions) {
    const txShares = Number(tx.shares)
    if (tx.transactionType === 'BUY') {
      shares += txShares
    } else if (tx.transactionType === 'SELL') {
      if (shares <= 0) continue
      shares = Math.max(0, shares - Math.min(txShares, shares))
    }
  }
  return shares
}

// 保有中の全銘柄に初期残高 Transaction を生成する。
//
// 何度実行しても結果が変わらない（既に取引で説明できている株数ぶんは作らない）。
// apply = false の場合は DB を変更せず、作られる予定の内容だけを返す。
export async function createInitialBalances(apply: boolean): Promise<InitialBalanceSummary> {
  const stocks = await prisma.stock.findMany({
    where: { sharesHeld: { gt: 0 } },
    include: { transactions: { orderBy: { transactionDate: 'asc' } } },
  })

  const created: InitialBalanceCreated[] = []
  const skipped: InitialBalanceSkipped[] = []
  const mismatches: InitialBalanceSummary['mismatches'] = []

  for (const stock of stocks) {
    const sharesHeld = Number(stock.sharesHeld)
    const avgPrice = Number(stock.avgAcquisitionPrice)
    const explainedShares = replayShares(stock.transactions)
    const gap = sharesHeld - explainedShares

    if (gap <= SHARES_EPSILON) {
      skipped.push({
        stockId: stock.id,
        code: stock.code,
        stockName: stock.stockName,
        reason: '保有株数は既存の取引履歴で説明できているため初期残高は不要',
      })
      continue
    }

    // 取得単価が無いと取得原価を決められない。0 で作ると「全額が利益」という
    // 誤った実現損益を生むため、推定せず対象外にして手当てを促す。
    if (!(avgPrice > 0)) {
      skipped.push({
        stockId: stock.id,
        code: stock.code,
        stockName: stock.stockName,
        reason: `平均取得単価が未設定（${avgPrice}）のため取得原価を決められない。手動での補正が必要`,
      })
      continue
    }

    // 起点日。購入日があればそれが実データ。無ければ TSV 取り込み日で推定する。
    const fromPurchaseDate = stock.purchaseDate !== null
    let baselineDate = stock.purchaseDate ?? DEFAULT_BASELINE_DATE

    // 初期残高は既存のどの取引よりも前に置く。後ろに来ると、先行する SELL が
    // 保有ゼロの時点に取り残されて実現損益が計算できなくなる（ADR 0008）。
    const earliestTx = stock.transactions[0]?.transactionDate
    if (earliestTx && baselineDate >= earliestTx) {
      baselineDate = new Date(earliestTx.getTime() - 24 * 60 * 60 * 1000)
    }

    const entry: InitialBalanceCreated = {
      stockId: stock.id,
      code: stock.code,
      stockName: stock.stockName,
      shares: gap,
      pricePerShare: avgPrice,
      baselineDate: formatDateKey(baselineDate),
      fromPurchaseDate,
    }

    if (!apply) {
      created.push(entry)
      continue
    }

    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          stockId: stock.id,
          transactionType: 'BUY',
          shares: gap,
          pricePerShare: avgPrice,
          totalAmount: gap * avgPrice,
          fee: 0,
          transactionDate: baselineDate,
          isInitialBalance: true,
          memo: fromPurchaseDate
            ? '初期残高（購入日は TSV の実データ）'
            : '初期残高（購入日不明のため取り込み日を起点とした推定値）',
        },
      })
      await recalculateStockAggregates(stock.id, tx)
    })

    // 移行の成功条件：再計算後も保有株数・平均取得単価が移行前と一致すること。
    // ズレていれば初期残高の作り方が誤っているため、検出して報告する。
    const after = await prisma.stock.findUniqueOrThrow({
      where: { id: stock.id },
      select: { sharesHeld: true, avgAcquisitionPrice: true },
    })
    if (Math.abs(Number(after.sharesHeld) - sharesHeld) > SHARES_EPSILON) {
      mismatches.push({
        code: stock.code,
        field: 'sharesHeld',
        before: sharesHeld,
        after: Number(after.sharesHeld),
      })
    }
    if (Math.abs(Number(after.avgAcquisitionPrice) - avgPrice) > 0.0001) {
      mismatches.push({
        code: stock.code,
        field: 'avgAcquisitionPrice',
        before: avgPrice,
        after: Number(after.avgAcquisitionPrice),
      })
    }

    created.push(entry)
  }

  return { applied: apply, createdCount: created.length, created, skipped, mismatches }
}

// 保有ゼロなのに SELL を持つ銘柄を洗い出す。
//
// TSV で保有を取り込んだあとに SELL を登録すると、対応する BUY が存在しないため
// 再計算が SELL を算入できず、保有株数・取得単価が 0 に潰れる。取得原価が失われて
// おり自動では復元できないため、初期残高の生成対象にはせず報告のみ行う。
export async function findUnbackedSells() {
  const stocks = await prisma.stock.findMany({
    where: { sharesHeld: { lte: 0 }, transactions: { some: { transactionType: 'SELL' } } },
    include: { transactions: { orderBy: { transactionDate: 'asc' } } },
  })

  return stocks
    .filter((s) => replayShares(s.transactions) <= 0)
    .filter((s) => s.transactions.every((t) => t.transactionType !== 'BUY'))
    .map((s) => ({
      stockId: s.id,
      code: s.code,
      stockName: s.stockName,
      sells: s.transactions
        .filter((t) => t.transactionType === 'SELL')
        .map((t) => ({
          transactionId: t.id,
          shares: Number(t.shares),
          pricePerShare: Number(t.pricePerShare),
          transactionDate: formatDateKey(t.transactionDate),
        })),
    }))
}
