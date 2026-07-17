/*
  Warnings:

  - You are about to drop the column `token` on the `UserBalance` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `UserBalance` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `UserBalance` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "UserBalance_token_key";

-- AlterTable
ALTER TABLE "UserBalance" DROP COLUMN "token",
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserBalance_userId_key" ON "UserBalance"("userId");

-- AddForeignKey
ALTER TABLE "UserBalance" ADD CONSTRAINT "UserBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
