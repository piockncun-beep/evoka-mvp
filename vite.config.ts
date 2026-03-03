import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const DEV_HOST = '0.0.0.0'
const DEV_PORT = 5173

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'log-dev-server',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const address = server.httpServer?.address()
          const actualPort = typeof address === 'object' && address ? address.port : DEV_PORT
          console.log(`[dev] Vite running at http://${DEV_HOST}:${actualPort}`)
        })
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
