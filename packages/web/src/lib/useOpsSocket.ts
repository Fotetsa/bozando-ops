import { useEffect, useRef, useState } from "react"
import type { Socket } from "socket.io-client"
import { createOpsSocket } from "./socket"

/**
 * Connexion socket.io au back (path /ws). Rejoint la room du projet et appelle
 * onNodeState à chaque changement d'état Docker observé, onNodeReplicas à chaque
 * recomptage des replicas RUNNING réels d'un service (canvas live).
 *
 * Les callbacks sont gardés dans des refs : l'effet de connexion ne dépend QUE de
 * `projectId`, donc on ne reconnecte/rejoint pas la room à chaque rendu (les
 * callbacks sont recréés à chaque render dans la page appelante). Retourne aussi
 * `connected` pour afficher un état "live / reconnexion…" à l'opérateur — sinon il
 * ne sait pas si le canvas reflète le réel ou s'il est figé.
 */
export function useOpsSocket(
  projectId: string,
  onNodeState: (payload: { nodeId: string; state: string }) => void,
  onNodeReplicas?: (payload: { nodeId: string; runningReplicas: number }) => void
) {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  const stateCb = useRef(onNodeState)
  const replicasCb = useRef(onNodeReplicas)
  stateCb.current = onNodeState
  replicasCb.current = onNodeReplicas

  useEffect(() => {
    const socket = createOpsSocket()
    socketRef.current = socket

    const join = () => {
      setConnected(true)
      socket.emit("join:project", projectId)
    }
    socket.on("connect", join)
    socket.on("disconnect", () => setConnected(false))
    socket.on("node.state", (payload: { nodeId: string; state: string }) => {
      stateCb.current(payload)
    })
    socket.on("node.replicas", (payload: { nodeId: string; runningReplicas: number }) => {
      replicasCb.current?.(payload)
    })
    // Si déjà connecté au montage (réutilisation), rejoindre tout de suite.
    if (socket.connected) join()

    return () => {
      socket.emit("leave:project", projectId)
      socket.disconnect()
    }
  }, [projectId])

  return { socketRef, connected }
}
