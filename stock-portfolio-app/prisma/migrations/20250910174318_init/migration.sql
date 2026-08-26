-- CreateTable
CREATE TABLE `Stock` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `no` INTEGER NULL,
    `stockName` VARCHAR(191) NOT NULL,
    `holdingCompany` VARCHAR(191) NOT NULL,
    `market` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `sharesHeld` DECIMAL(15, 4) NOT NULL DEFAULT 0,
    `avgAcquisitionPrice` DECIMAL(15, 4) NOT NULL DEFAULT 0,
    `investmentAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `currentPrice` DECIMAL(15, 4) NOT NULL DEFAULT 0,
    `profitLoss` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `profitLossRate` DECIMAL(8, 4) NOT NULL DEFAULT 0,
    `dividendPerShare` DECIMAL(10, 4) NOT NULL DEFAULT 0,
    `dividendYield` DECIMAL(8, 4) NOT NULL DEFAULT 0,
    `dividendAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `purchaseDate` DATETIME(3) NULL,
    `saleDate` DATETIME(3) NULL,
    `realizedProfitLoss` DECIMAL(15, 2) NULL,
    `targetPrice` DECIMAL(15, 4) NULL,
    `marketSector` VARCHAR(191) NULL,
    `purpose` VARCHAR(191) NULL,
    `lastPriceUpdate` DATETIME(3) NULL,
    `priceUpdateStatus` ENUM('SUCCESS', 'ERROR', 'PENDING') NOT NULL DEFAULT 'PENDING',
    `priceUpdateError` VARCHAR(191) NULL,
    `priceSource` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Stock_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `price` DECIMAL(15, 4) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `marketSession` ENUM('MORNING', 'AFTERNOON', 'AFTER_HOURS') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PriceHistory_stockId_recordedAt_idx`(`stockId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `transactionType` ENUM('BUY', 'SELL', 'DIVIDEND') NOT NULL,
    `shares` DECIMAL(15, 4) NOT NULL,
    `pricePerShare` DECIMAL(15, 4) NOT NULL,
    `totalAmount` DECIMAL(15, 2) NOT NULL,
    `fee` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `transactionDate` DATETIME(3) NOT NULL,
    `memo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Transaction_stockId_transactionDate_idx`(`stockId`, `transactionDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DividendHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `dividendAmount` DECIMAL(15, 2) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `dividendType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DividendHistory_stockId_paymentDate_idx`(`stockId`, `paymentDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PortfolioSummary` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `totalInvestment` DECIMAL(15, 2) NOT NULL,
    `totalProfitLoss` DECIMAL(15, 2) NOT NULL,
    `totalDividend` DECIMAL(15, 2) NOT NULL,
    `totalProfitRate` DECIMAL(8, 4) NOT NULL,
    `summaryDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PortfolioSummary_summaryDate_key`(`summaryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PriceHistory` ADD CONSTRAINT `PriceHistory_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DividendHistory` ADD CONSTRAINT `DividendHistory_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
