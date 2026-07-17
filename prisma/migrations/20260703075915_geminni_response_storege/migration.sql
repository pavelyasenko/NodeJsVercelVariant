-- CreateTable
CREATE TABLE "GemeniResponse" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "complexity" TEXT NOT NULL,
    "colorPalette" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GemeniResponse_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GemeniResponse" ADD CONSTRAINT "GemeniResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
