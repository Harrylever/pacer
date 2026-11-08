-- Persist the encrypted owner key so a restart cannot strand vaults.
ALTER TABLE "User" ADD COLUMN "ownerSecretEnc" TEXT;
