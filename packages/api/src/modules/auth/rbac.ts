import type { FastifyReply, FastifyRequest } from "fastify"

/**
 * RBAC — autorisation par rôle (la garde registerAuthGuard authentifie déjà et
 * pose req.user = { sub, role }). Ici on vérifie le RÔLE.
 *
 * Rôles : owner (tout) > operator (projets + deploy/destroy) > viewer (lecture).
 */
export type Role = "owner" | "operator" | "viewer"

// Hiérarchie : un rôle couvre les permissions des rôles de niveau inférieur.
const RANK: Record<Role, number> = { viewer: 0, operator: 1, owner: 2 }

type AuthedRequest = FastifyRequest & { user?: { sub: string; role: Role } }

/**
 * preHandler Fastify : exige au moins le rôle `min`. À attacher sur les routes
 * sensibles, ex: `{ preHandler: requireRole("operator") }`.
 */
export function requireRole(min: Role) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as AuthedRequest).user
    if (!user) return reply.code(401).send({ error: "non authentifié" })
    if (RANK[user.role] < RANK[min]) {
      return reply.code(403).send({ error: "permission insuffisante" })
    }
  }
}

/** Récupère l'utilisateur courant (après la garde). */
export function currentUser(req: FastifyRequest): { sub: string; role: Role } | undefined {
  return (req as AuthedRequest).user
}
