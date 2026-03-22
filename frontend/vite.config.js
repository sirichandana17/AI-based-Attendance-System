import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
    port: 5173,
    host: true,   // expose on 0.0.0.0 so phones on same network can reach it
  },
})
