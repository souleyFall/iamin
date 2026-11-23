-- Journal de securite par compte et appareil lisible des sessions (ni IP ni agent brut).
-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('LOGIN_OK', 'LOGIN_FAILED', 'MFA_FAILED', 'ACCOUNT_LOCKED', 'MFA_ENABLED', 'RECOVERY_USED', 'RECOVERY_REGENERATED', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'RESET_LINK_ISSUED', 'SESSIONS_REVOKED', 'CREATOR_INVITED');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "device" TEXT;

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "SecurityEventType" NOT NULL,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
