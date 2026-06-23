/*
  Warnings:

  - You are about to drop the `GitHubApp` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GitHubInstallation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GitHubRepo` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GitHubInstallation" DROP CONSTRAINT "GitHubInstallation_appId_fkey";

-- DropForeignKey
ALTER TABLE "GitHubRepo" DROP CONSTRAINT "GitHubRepo_installationId_fkey";

-- DropTable
DROP TABLE "GitHubApp";

-- DropTable
DROP TABLE "GitHubInstallation";

-- DropTable
DROP TABLE "GitHubRepo";
