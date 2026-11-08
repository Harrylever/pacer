-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "telegramId" TEXT NOT NULL,
    "ownerPublicKey" TEXT NOT NULL,
    "withdrawalAddress" TEXT,
    "displayCurrency" TEXT NOT NULL DEFAULT 'NGN',
    "notifyBuys" BOOLEAN NOT NULL DEFAULT false,
    "summaryCadence" TEXT NOT NULL DEFAULT 'weekly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("telegramId")
);

-- CreateTable
CREATE TABLE "VaultRecord" (
    "owner" TEXT NOT NULL,
    "vaultPda" TEXT,
    "ratePerPeriod" TEXT NOT NULL,
    "chosenMints" TEXT[],
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "totalInvested" TEXT NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultRecord_pkey" PRIMARY KEY ("owner")
);

-- CreateTable
CREATE TABLE "DepositSweep" (
    "id" SERIAL NOT NULL,
    "owner" TEXT NOT NULL,
    "amountMicro" TEXT NOT NULL,
    "signature" TEXT,
    "needsRetry" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositSweep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NudgeLog" (
    "id" SERIAL NOT NULL,
    "telegramId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NudgeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_ownerPublicKey_key" ON "User"("ownerPublicKey");

-- AddForeignKey
ALTER TABLE "VaultRecord" ADD CONSTRAINT "VaultRecord_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("ownerPublicKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositSweep" ADD CONSTRAINT "DepositSweep_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("ownerPublicKey") ON DELETE RESTRICT ON UPDATE CASCADE;
