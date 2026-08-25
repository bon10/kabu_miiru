import { PrismaClient } from '@prisma/client'

// 暦日カラムの時刻を揃える（docs/2-domain/time-and-dates.md）。
//
// transactionDate / paymentDate / firstPurchaseDate / purchaseDate / saleDate は
// 意味が暦日だが、かつて DATETIME 型で保存していたため、書き込み経路の違いで
// 2 種類の時刻が混在している（日本時間 0 時 = 15:00Z と、世界標準時 0 時 = 00:00Z）。
//
// これらを DATE 型へ移す前に、このスクリプトで世界標準時 0 時へ揃える。
// MySQL の DATETIME → DATE 変換は時刻を単純に切り捨てるため、15:00Z のまま
// 変換すると日付が 1 日戻る。
//
// 日本時間の暦日は変わらないため、アプリの挙動は変わらない。
// 既に揃っている行は更新しないので、何度実行しても結果は同じ。
//
// 使い方（stock-portfolio-app ディレクトリで、pnpm db:push より前に実行する）:
//   node scripts/normalize-date-columns.js           # 変更内容の確認のみ
//   node scripts/normalize-date-columns.js --apply   # 実際に書き込む

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// src/lib/date-key.ts の toDateKey と同じ計算。このスクリプトは素の Node で
// 動かすため TypeScript の実装を import できず、ここに再掲している。
function toDateKey(date) {
  return new Date(Math.floor((date.getTime() + JST_OFFSET_MS) / DAY_MS) * DAY_MS)
}

const TARGETS = [
  { model: 'transaction', label: '取引', columns: ['transactionDate'] },
  { model: 'dividendHistory', label: '配当', columns: ['paymentDate'] },
  {
    model: 'stock',
    label: '銘柄',
    columns: ['firstPurchaseDate', 'purchaseDate', 'saleDate'],
  },
]

const prisma = new PrismaClient()

async function normalize(apply) {
  let totalRows = 0

  for (const { model, label, columns } of TARGETS) {
    const rows = await prisma[model].findMany({
      select: { id: true, ...Object.fromEntries(columns.map((c) => [c, true])) },
      orderBy: { id: 'asc' },
    })

    let changedRows = 0
    for (const row of rows) {
      const data = {}
      for (const column of columns) {
        const value = row[column]
        if (!(value instanceof Date)) continue
        const key = toDateKey(value)
        if (key.getTime() !== value.getTime()) data[column] = key
      }
      if (Object.keys(data).length === 0) continue

      changedRows += 1
      if (apply) {
        await prisma[model].update({ where: { id: row.id }, data })
      }
    }

    totalRows += changedRows
    console.log(
      `${label}（${model}）: ${rows.length} 件中 ${changedRows} 件${apply ? 'を更新' : 'が更新対象'}`,
    )
  }

  console.log('')
  if (totalRows === 0) {
    console.log('揃っていない行はありません')
  } else if (apply) {
    console.log(`完了: ${totalRows} 件を更新しました。続けて pnpm db:push を実行してください`)
  } else {
    console.log('書き込むには --apply を付けて再実行してください')
  }
}

normalize(process.argv.includes('--apply'))
  .catch((error) => {
    console.error('❌ 暦日カラムの正規化に失敗しました:', error.message ?? error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
