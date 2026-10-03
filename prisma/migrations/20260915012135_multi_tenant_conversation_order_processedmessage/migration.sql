-- DropIndex
DROP INDEX `Order_customerWaId_idx` ON `Order`;

-- DropIndex
DROP INDEX `Order_status_idx` ON `Order`;

-- AlterTable
ALTER TABLE `Conversation` DROP PRIMARY KEY,
    ADD COLUMN `businessId` VARCHAR(32) NOT NULL,
    ADD PRIMARY KEY (`businessId`, `waId`);

-- AlterTable
-- `code` is AUTO_INCREMENT: MySQL requires it stay indexed until the moment
-- it's dropped, so DROP INDEX and DROP COLUMN must be one statement.
ALTER TABLE `Order` DROP INDEX `Order_code_key`,
    DROP COLUMN `code`,
    ADD COLUMN `businessId` VARCHAR(32) NOT NULL,
    ADD COLUMN `businessSeq` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `ProcessedMessage` DROP PRIMARY KEY,
    ADD COLUMN `businessId` VARCHAR(32) NOT NULL,
    ADD PRIMARY KEY (`businessId`, `id`);

-- CreateIndex
CREATE INDEX `Order_businessId_status_idx` ON `Order`(`businessId`, `status`);

-- CreateIndex
CREATE INDEX `Order_businessId_customerWaId_idx` ON `Order`(`businessId`, `customerWaId`);

-- CreateIndex
CREATE UNIQUE INDEX `Order_businessId_businessSeq_key` ON `Order`(`businessId`, `businessSeq`);

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProcessedMessage` ADD CONSTRAINT `ProcessedMessage_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

