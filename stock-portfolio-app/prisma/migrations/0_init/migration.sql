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
    `firstPurchaseDate` DATE NULL,
    `purchaseDate` DATE NULL,
    `saleDate` DATE NULL,
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
CREATE TABLE `ExchangeRate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `base` VARCHAR(191) NOT NULL,
    `quote` VARCHAR(191) NOT NULL,
    `rate` DECIMAL(15, 6) NOT NULL,
    `rateDate` DATE NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExchangeRate_base_quote_rateDate_key`(`base`, `quote`, `rateDate`),
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
CREATE TABLE `DailyPrice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `close` DECIMAL(15, 4) NOT NULL,
    `priceDate` DATE NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `isFilled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DailyPrice_priceDate_idx`(`priceDate`),
    UNIQUE INDEX `DailyPrice_stockId_priceDate_key`(`stockId`, `priceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `transactionType` ENUM('BUY', 'SELL') NOT NULL,
    `shares` DECIMAL(15, 4) NOT NULL,
    `pricePerShare` DECIMAL(15, 4) NOT NULL,
    `totalAmount` DECIMAL(15, 2) NOT NULL,
    `fee` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `transactionDate` DATE NOT NULL,
    `isInitialBalance` BOOLEAN NOT NULL DEFAULT false,
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
    `shares` DECIMAL(15, 4) NULL,
    `taxAmount` DECIMAL(15, 2) NULL,
    `netAmount` DECIMAL(15, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'JPY',
    `paymentDate` DATE NOT NULL,
    `dividendType` VARCHAR(191) NULL,
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

-- CreateTable
CREATE TABLE `Broker` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Broker_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PriceHistory` ADD CONSTRAINT `PriceHistory_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyPrice` ADD CONSTRAINT `DailyPrice_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DividendHistory` ADD CONSTRAINT `DividendHistory_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

