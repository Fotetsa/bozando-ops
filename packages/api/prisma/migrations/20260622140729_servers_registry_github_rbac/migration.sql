-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "ip" TEXT,
ADD COLUMN     "serverId" TEXT;

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "user" TEXT NOT NULL DEFAULT 'root',
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'provisioning',
    "swarmNodeId" TEXT,
    "privateKeyEnc" TEXT,
    "publicKey" TEXT,
    "hostKeyFp" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryCredential" (
    "id" TEXT NOT NULL,
    "registry" TEXT NOT NULL DEFAULT 'ghcr.io',
    "username" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubApp" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "slug" TEXT,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "privateKeyEnc" TEXT NOT NULL,
    "webhookSecretEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubInstallation" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubRepo" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GitHubRepo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitHubInstallation_appId_idx" ON "GitHubInstallation"("appId");

-- CreateIndex
CREATE INDEX "GitHubRepo_installationId_idx" ON "GitHubRepo"("installationId");

-- AddForeignKey
ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_appId_fkey" FOREIGN KEY ("appId") REFERENCES "GitHubApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubRepo" ADD CONSTRAINT "GitHubRepo_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
