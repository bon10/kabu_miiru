import { prisma } from './prisma'

export async function seedDatabase() {
  try {
    // 既存データをクリア
    await prisma.transaction.deleteMany()
    await prisma.dividendHistory.deleteMany()
    await prisma.priceHistory.deleteMany()
    await prisma.stock.deleteMany()

    // サンプル銘柄データを作成
    const sampleStocks = [
      {
        no: 1,
        stockName: 'トヨタ自動車',
        holdingCompany: 'SBI証券',
        market: '国内',
        code: '7203',
        sharesHeld: 100,
        avgAcquisitionPrice: 2800,
        investmentAmount: 280000,
        currentPrice: 3200,
        profitLoss: 40000,
        profitLossRate: 0.1429,
        dividendPerShare: 220,
        dividendYield: 0.0688,
        dividendAmount: 22000,
        purchaseDate: new Date('2023-06-15'),
        targetPrice: 3500,
        marketSector: '自動車',
        purpose: '長期保有',
        lastPriceUpdate: new Date(),
        priceUpdateStatus: 'SUCCESS' as const
      },
      {
        no: 2,
        stockName: 'Apple Inc.',
        holdingCompany: '楽天証券',
        market: '米国',
        code: 'AAPL',
        sharesHeld: 50,
        avgAcquisitionPrice: 180,
        investmentAmount: 9000,
        currentPrice: 195,
        profitLoss: 750,
        profitLossRate: 0.0833,
        dividendPerShare: 0.96,
        dividendYield: 0.0049,
        dividendAmount: 48,
        purchaseDate: new Date('2023-08-20'),
        targetPrice: 220,
        marketSector: 'テクノロジー',
        purpose: '成長株投資',
        lastPriceUpdate: new Date(),
        priceUpdateStatus: 'SUCCESS' as const
      },
      {
        no: 3,
        stockName: 'ソニーグループ',
        holdingCompany: 'SBI証券',
        market: '国内',
        code: '6758',
        sharesHeld: 80,
        avgAcquisitionPrice: 12500,
        investmentAmount: 1000000,
        currentPrice: 11800,
        profitLoss: -56000,
        profitLossRate: -0.056,
        dividendPerShare: 60,
        dividendYield: 0.0051,
        dividendAmount: 4800,
        purchaseDate: new Date('2023-05-10'),
        targetPrice: 14000,
        marketSector: 'エンターテインメント',
        purpose: 'ポートフォリオ分散',
        lastPriceUpdate: new Date(),
        priceUpdateStatus: 'SUCCESS' as const
      },
      {
        no: 4,
        stockName: 'Microsoft Corporation',
        holdingCompany: 'マネックス証券',
        market: '米国',
        code: 'MSFT',
        sharesHeld: 30,
        avgAcquisitionPrice: 350,
        investmentAmount: 10500,
        currentPrice: 380,
        profitLoss: 900,
        profitLossRate: 0.0857,
        dividendPerShare: 3.00,
        dividendYield: 0.0079,
        dividendAmount: 90,
        purchaseDate: new Date('2023-07-05'),
        targetPrice: 420,
        marketSector: 'ソフトウェア',
        purpose: 'テクノロジー投資',
        lastPriceUpdate: new Date(),
        priceUpdateStatus: 'SUCCESS' as const
      },
      {
        no: 5,
        stockName: '任天堂',
        holdingCompany: '楽天証券',
        market: '国内',
        code: '7974',
        sharesHeld: 20,
        avgAcquisitionPrice: 58000,
        investmentAmount: 1160000,
        currentPrice: 62000,
        profitLoss: 80000,
        profitLossRate: 0.0690,
        dividendPerShare: 200,
        dividendYield: 0.0032,
        dividendAmount: 4000,
        purchaseDate: new Date('2023-04-12'),
        targetPrice: 70000,
        marketSector: 'ゲーム',
        purpose: 'エンターテインメント株',
        lastPriceUpdate: new Date(),
        priceUpdateStatus: 'SUCCESS' as const
      }
    ]

    // 銘柄データを挿入
    for (const stockData of sampleStocks) {
      const stock = await prisma.stock.create({
        data: stockData
      })

      // サンプル取引履歴を作成
      await prisma.transaction.create({
        data: {
          stockId: stock.id,
          transactionType: 'BUY',
          shares: stockData.sharesHeld,
          pricePerShare: stockData.avgAcquisitionPrice,
          totalAmount: stockData.investmentAmount,
          fee: stockData.investmentAmount * 0.001, // 0.1%の手数料
          transactionDate: stockData.purchaseDate,
          memo: '初回購入'
        }
      })

      // サンプル価格履歴を作成
      const today = new Date()
      for (let i = 0; i < 7; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)

        const basePrice = stockData.currentPrice
        const variation = (Math.random() - 0.5) * 0.05 // ±2.5%の変動
        const price = basePrice * (1 + variation)

        await prisma.priceHistory.create({
          data: {
            stockId: stock.id,
            price,
            recordedAt: date,
            source: 'yahoo',
            marketSession: 'AFTERNOON'
          }
        })
      }

      // 配当履歴がある場合は作成
      // 受取通貨は銘柄の市場に合わせる（米国株の配当はドル建て）
      if (stockData.dividendAmount > 0) {
        await prisma.dividendHistory.create({
          data: {
            stockId: stock.id,
            dividendAmount: stockData.dividendAmount,
            currency: stockData.market === '米国' ? 'USD' : 'JPY',
            paymentDate: new Date('2023-12-15'),
            dividendType: '期末'
          }
        })
      }
    }

    console.log('✅ サンプルデータの挿入が完了しました')
  } catch (error) {
    console.error('❌ サンプルデータの挿入に失敗しました:', error)
    throw error
  }
}