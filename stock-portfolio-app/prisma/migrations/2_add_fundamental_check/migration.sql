-- CreateTable
CREATE TABLE `StockFundamental` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `fiscalPeriodEnd` DATE NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `equity` DECIMAL(24, 2) NULL,
    `totalAssets` DECIMAL(24, 2) NULL,
    `totalLiabilities` DECIMAL(24, 2) NULL,
    `totalDebt` DECIMAL(24, 2) NULL,
    `workingCapital` DECIMAL(24, 2) NULL,
    `retainedEarnings` DECIMAL(24, 2) NULL,
    `ebit` DECIMAL(24, 2) NULL,
    `revenue` DECIMAL(24, 2) NULL,
    `netIncome` DECIMAL(24, 2) NULL,
    `freeCashFlow` DECIMAL(24, 2) NULL,
    `sharesOutstanding` DECIMAL(24, 2) NULL,
    `fetchedAt` DATETIME(3) NOT NULL,
    `source` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `StockFundamental_stockId_key`(`stockId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FundamentalSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `transactionId` INTEGER NULL,
    `recordedOn` DATE NOT NULL,
    `isCheckStart` BOOLEAN NOT NULL DEFAULT false,
    `price` DECIMAL(15, 4) NOT NULL,
    `fiscalPeriodEnd` DATE NULL,
    `roe` DECIMAL(12, 4) NULL,
    `fcfYield` DECIMAL(12, 4) NULL,
    `equityRatio` DECIMAL(12, 4) NULL,
    `debtToEquity` DECIMAL(12, 4) NULL,
    `altmanZ` DECIMAL(12, 4) NULL,
    `movingAverage200` DECIMAL(15, 4) NULL,
    `negativeEquity` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FundamentalSnapshot_transactionId_key`(`transactionId`),
    INDEX `FundamentalSnapshot_stockId_recordedOn_idx`(`stockId`, `recordedOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockFundamental` ADD CONSTRAINT `StockFundamental_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FundamentalSnapshot` ADD CONSTRAINT `FundamentalSnapshot_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FundamentalSnapshot` ADD CONSTRAINT `FundamentalSnapshot_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `Transaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

