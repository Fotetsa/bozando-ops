import { PrismaClient } from "@prisma/client"

/** Client Prisma singleton (réutilisé sur tout le process long-running). */
export const prisma = new PrismaClient()
