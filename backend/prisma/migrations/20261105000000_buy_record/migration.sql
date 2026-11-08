-- CreateTable
CREATE TABLE "BuyRecord" (
    "id" SERIAL NOT NULL,
    "owner" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "usdcIn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyRecord_owner_createdAt_idx" ON "BuyRecord"("owner", "createdAt");
