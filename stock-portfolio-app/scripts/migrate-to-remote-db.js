import { PrismaClient } from '@prisma/client'

// ローカル MySQL から本番 DB（TiDB Cloud）へのデータ移送（ADR 0013）。
//
// 移送するのは人手で入力した原資料だけにする。日次終値（DailyPrice）と日次
// USD/JPY レート（ExchangeRate）は Yahoo Finance から取り直せるうえ、ローカルの
// 既存レコードは日付が 1 日前にずれているため（ADR 0012）、運び込まずに移送後の
// バッチで入れ直す。
//
//   pnpm db:push で移送先にスキーマを作る
//     ↓
//   このスクリプトで銘柄・取引・配当などを運ぶ
//     ↓
//   POST /api/batch/daily-close {"range":"2y"} で日次終値とレートを入れ直す
//
// id を保ったまま挿入する。Transaction.stockId などの参照をそのまま使うため。
//
// 使い方（stock-portfolio-app ディレクトリで実行）:
//   SOURCE_DATABASE_URL='mysql://...localhost:3406/stock_portfolio' \
//   TARGET_DATABASE_URL='mysql://...tidbcloud.com:4000/stock_portfolio?sslaccept=strict' \
//   node scripts/migrate-to-remote-db.js            # 件数の確認のみ（dry-run）
//
//   同上 node scripts/migrate-to-remote-db.js --apply   # 実際に書き込む

// 移送するテーブル。親から子の順に並べる（外部キーの参照先を先に作るため）。
const TABLES = [
  { model: 'broker', label: '証券会社' },
  { model: 'stock', label: '銘柄' },
  { model: 'transaction', label: '取引' },
  { model: 'dividendHistory', label: '配当' },
  { model: 'priceHistory', label: '価格履歴' },
  { model: 'setting', label: 'アプリ設定' },
]

// 移送せず、移送後にバッチで入れ直すテーブル。
const REFETCHED_TABLES = [
  { model: 'dailyPrice', label: '日次終値' },
  { model: 'exchangeRate', label: '日次 USD/JPY レート' },
]

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`環境変数 ${name} を指定してください`)
  }
  return value
}

// 接続先を取り違えたまま書き込まないよう、ホストとデータベース名だけ表示する。
function describeUrl(url) {
  const { host, pathname } = new URL(url)
  return `${host}${pathname}`
}

async function migrate(apply, force) {
  const sourceUrl = requireEnv('SOURCE_DATABASE_URL')
  const targetUrl = requireEnv('TARGET_DATABASE_URL')

  if (sourceUrl === targetUrl) {
    throw new Error('移送元と移送先が同じです')
  }

  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } })
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } })

  console.log(`移送元: ${describeUrl(sourceUrl)}`)
  console.log(`移送先: ${describeUrl(targetUrl)}`)
  console.log('')

  try {
    // 二重投入を防ぐ。移送先に銘柄が 1 件でもあれば、続けると id が衝突するか
    // 重複データになるため、意図的な上書き（--force）でなければ止める。
    const existingStocks = await target.stock.count()
    if (existingStocks > 0 && !force) {
      throw new Error(
        `移送先に銘柄が ${existingStocks} 件あります。` +
          '入れ直す場合は移送先を空にするか --force を付けてください',
      )
    }

    for (const { model, label } of TABLES) {
      const rows = await source[model].findMany()
      if (rows.length === 0) {
        console.log(`${label}（${model}）: 0 件 — 移送なし`)
        continue
      }

      if (!apply) {
        console.log(`${label}（${model}）: ${rows.length} 件を移送予定`)
        continue
      }

      // 既に同じ id がある行は飛ばす。--force での再実行を安全にするため。
      const created = await target[model].createMany({ data: rows, skipDuplicates: true })
      console.log(`${label}（${model}）: ${rows.length} 件中 ${created.count} 件を移送`)
    }

    console.log('')
    for (const { model, label } of REFETCHED_TABLES) {
      const count = await source[model].count()
      console.log(`${label}（${model}）: ${count} 件 — 移送しない（移送後にバッチで取り直す）`)
    }

    console.log('')
    if (apply) {
      console.log('完了。続けて日次終値とレートを入れ直してください:')
      console.log(
        '  curl -X POST -H "X-API-Key: $BATCH_API_KEY" -H "Content-Type: application/json" \\',
      )
      console.log('       -d \'{"range":"2y"}\' {本番URL}/api/batch/daily-close')
    } else {
      console.log('書き込むには --apply を付けて再実行してください')
    }
  } finally {
    await source.$disconnect()
    await target.$disconnect()
  }
}

migrate(process.argv.includes('--apply'), process.argv.includes('--force')).catch((error) => {
  console.error('❌ データ移送に失敗しました:', error.message ?? error)
  process.exitCode = 1
})
