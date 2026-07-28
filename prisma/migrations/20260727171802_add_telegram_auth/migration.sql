/*
  Warnings:

  - A unique constraint covering the columns `[telegramId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Made the column `html` on table `GemeniResponse` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "GemeniResponse" ALTER COLUMN "html" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramFirstName" TEXT,
ADD COLUMN     "telegramId" TEXT,
ADD COLUMN     "telegramLanguageCode" TEXT,
ADD COLUMN     "telegramLastName" TEXT,
ADD COLUMN     "telegramPhotoUrl" TEXT,
ADD COLUMN     "telegramUsername" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
