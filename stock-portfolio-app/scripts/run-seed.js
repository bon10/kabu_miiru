import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedDatabase() {
  try {
    // 既存データをクリア
    await prisma.transaction.deleteMany();
    await prisma.dividendHistory.deleteMany();
    await prisma.priceHistory.deleteMany();
    await prisma.stock.deleteMany();

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
        priceUpdateStatus: 'SUCCESS'
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
        priceUpdateStatus: 'SUCCESS'
      }
    ];

    // 銘柄データを挿入
    for (const stockData of sampleStocks) {
      const stock = await prisma.stock.create({
        data: stockData
      });

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
      });
    }

    console.log('✅ サンプルデータの挿入が完了しました');
  } catch (error) {
    console.error('❌ サンプルデータの挿入に失敗しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase().catch(console.error);