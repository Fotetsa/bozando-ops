import { useEffect, useState } from "react"
import { createOpsSocket } from "./socket"

/**
 * Suit les étapes de provisioning d'un serveur en live (event `provision.step`
 * émis par le workflow, relayé par le WS). Actif tant qu'un serverId est fourni.
 */
export function useProvisionLog(active: boolean) {
  const [lines, setLines] = useState<{ serverId: string; message: string }[]>([])

  useEffect(() => {
    if (!active) return
    const socket = createOpsSocket()
    socket.on("provision.step", (p: { serverId: string; message: string }) => {
      setLines((prev) => [...prev.slice(-200), p])
    })
    socket.on("server.provisioned", (p: { serverId: string }) => {
      setLines((prev) => [...prev, { serverId: p.serverId, message: "✓ Provisioning terminé." }])
    })
    return () => {
      socket.disconnect()
    }
  }, [active])

  return { lines, clear: () => setLines([]) }
}
