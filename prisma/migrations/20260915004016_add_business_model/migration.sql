-- CreateTable
CREATE TABLE `Business` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `whapiBaseUrl` VARCHAR(255) NOT NULL,
    `whapiToken` VARCHAR(255) NOT NULL,
    `whapiWebhookSecret` VARCHAR(255) NOT NULL,
    `staffWaIds` VARCHAR(500) NOT NULL,
    `adminApiKey` VARCHAR(255) NOT NULL,
    `botConfig` JSON NOT NULL,
    `nextOrderSeq` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Business_slug_key`(`slug`),
    UNIQUE INDEX `Business_adminApiKey_key`(`adminApiKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
