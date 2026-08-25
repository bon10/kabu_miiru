import { PrismaClient } from '@prisma/client'

// Stock.firstPurchaseDate（初回購入日）の後追い設定。
//
// 初回購入日は recalculateStockAggregates が Transaction から書くが、再計算は取引を
// 登録・編集・削除したときにしか走らない。既存の銘柄は列を追加しただけでは NULL の
// ままで銘柄詳細に初回購入日が出ないため、一度だけこのスクリプトで埋める。
//
// 書き込む値は replayTransactions の firstPurchaseDate と同じ「再生順で最初の BUY の
// 取引日」。孤立した SELL は BUY の並びに影響しないため、最初の BUY を直接引いた結果と
// 再生結果は一致する。
//
// 使い方（stock-portfolio-app ディレクトリで実行）:
//   node scripts/backfill-first-purchase-date.js           # 変更内容の確認のみ（dry-run）
//   node scripts/backfill-first-purchase-date.js --apply   # 実際に書き込む

const prisma = new PrismaClient()

async function backfillFirstPurchaseDate(apply) {
  const stocks = await prisma.stock.findMany({
    select: {
      id: true,
      code: true,
      stockName: true,
      firstPurchaseDate: true,
      purchaseDate: true,
    },
    orderBy: { id: 'asc' },
  })

  let updated = 0
  let skipped = 0

  for (const stock of stocks) {
    const firstBuy = await prisma.transaction.findFirst({
      where: { stockId: stock.id, transactionType: 'BUY' },
      // TRANSACTION_REPLAY_ORDER と同じ並び（同一取引日は登録順）
      orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
      select: { transactionDate: true },
    })

    // BUY が無い銘柄は TSV 直取り込みで Transaction を持たない可能性がある。
    // その場合はインポート経路と同じく、単一の購入日を初回購入日にも使う。
    const firstPurchaseDate = firstBuy
      ? firstBuy.transactionDate
      : stock.purchaseDate

    if (firstPurchaseDate === null) {
      skipped += 1
      continue
    }
    if (stock.firstPurchaseDate?.getTime() === firstPurchaseDate.getTime()) {
      skipped += 1
      continue
    }

    console.log(
      `${apply ? '更新' : '更新予定'}: ${stock.code} ${stock.stockName} → ${firstPurchaseDate.toISOString().slice(0, 10)}`
    )
    if (apply) {
      await prisma.stock.update({
        where: { id: stock.id },
        data: { firstPurchaseDate },
      })
    }
    updated += 1
  }

  console.log(
    `${apply ? '完了' : 'dry-run'}: 対象 ${stocks.length} 銘柄 / ${apply ? '更新' : '更新予定'} ${updated} 件 / 変更なし ${skipped} 件`
  )
  if (!apply && updated > 0) {
    console.log('書き込むには --apply を付けて再実行してください')
  }
}

backfillFirstPurchaseDate(process.argv.includes('--apply'))
  .catch((error) => {
    console.error('❌ 初回購入日の設定に失敗しました:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
