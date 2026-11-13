-- StockFundamental を「銘柄ごとに 1 行」から「銘柄 × 決算期で 1 行」に変える（ADR 0023）。
-- 売りの判定が前の通期決算と比べるため、古い期を残せるようにする。
--
-- 索引を入れ替えるだけで、列とデータは変えない。既存の行は 1 銘柄 1 期なので、
-- 新しいユニーク索引に重複は出ない。
--
-- 順序に意味がある：StockFundamental_stockId_key は外部キー
-- StockFundamental_stockId_fkey の裏付けになっているため、先に代わりの索引を作る。
-- 新しい索引は stockId を先頭に持つので、外部キーはそのまま使える。

-- CreateIndex
CREATE UNIQUE INDEX `StockFundamental_stockId_fiscalPeriodEnd_key` ON `StockFundamental`(`stockId`, `fiscalPeriodEnd`);

-- DropIndex
DROP INDEX `StockFundamental_stockId_key` ON `StockFundamental`;
