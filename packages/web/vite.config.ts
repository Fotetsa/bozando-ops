import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      // Proxy l'api + le WS en dev (évite les soucis CORS, garde un seul origin).
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
      "/ws": { target: "http://127.0.0.1:4000", ws: true },
    },
  },
})
