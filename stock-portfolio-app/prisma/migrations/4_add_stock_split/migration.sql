-- 株式分割・併合を持つ StockSplit を追加する（ADR 0024）。
-- 表を足すだけで、既存の表とデータは変えない。

-- CreateTable
CREATE TABLE `StockSplit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `splitDate` DATE NOT NULL,
    `fromShares` DECIMAL(10, 4) NOT NULL,
    `toShares` DECIMAL(10, 4) NOT NULL,
    `memo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StockSplit_stockId_splitDate_key`(`stockId`, `splitDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockSplit` ADD CONSTRAINT `StockSplit_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

