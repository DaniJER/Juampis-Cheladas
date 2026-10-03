/*
  Warnings:

  - Added the required column `metaAccessToken` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `metaAppSecret` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `metaPhoneNumberId` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `metaVerifyToken` to the `Business` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Business` ADD COLUMN `metaAccessToken` VARCHAR(512) NOT NULL,
    ADD COLUMN `metaAppSecret` VARCHAR(255) NOT NULL,
    ADD COLUMN `metaPhoneNumberId` VARCHAR(64) NOT NULL,
    ADD COLUMN `metaVerifyToken` VARCHAR(255) NOT NULL;
