import { useEffect, useState } from "react"
import { createOpsSocket } from "./socket"

/**
 * Stream des logs d'un conteneur via WebSocket (back : subscribe:logs).
 * Ouvre une connexion dédiée tant que le panneau de logs est ouvert.
 */
export function useContainerLogs(dockerId: string | null) {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    if (!dockerId) {
      setLines([])
      return
    }
    const socket = createOpsSocket()
    socket.on("connect", () => socket.emit("subscribe:logs", dockerId))
    socket.on("log", (payload: { containerId: string; line: string }) => {
      if (payload.containerId === dockerId) {
        setLines((prev) => [...prev.slice(-500), payload.line])
      }
    })
    return () => {
      socket.emit("unsubscribe:logs")
      socket.disconnect()
    }
  }, [dockerId])

  return lines
}
