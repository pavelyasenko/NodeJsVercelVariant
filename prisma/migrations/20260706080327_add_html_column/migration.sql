/*
  Warnings:

  - You are about to drop the column `result` on the `GemeniResponse` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GemeniResponse" DROP COLUMN "result",
ADD COLUMN     "html" TEXT;
