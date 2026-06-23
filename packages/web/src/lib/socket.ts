import { io, type Socket } from "socket.io-client"
import { auth } from "./api"

/**
 * Factory unique pour les connexions socket.io de l'ops-panel.
 * Centralise le path /ws, l'auth JWT (Bearer en handshake) et les transports.
 * Les hooks temps réel (useOpsSocket, useContainerLogs, useProvisionLog) passent
 * tous par ici pour ne pas dupliquer la configuration.
 */
export function createOpsSocket(): Socket {
  return io({
    path: "/ws",
    auth: { token: auth.token },
    transports: ["websocket", "polling"],
  })
}
