import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  base: '/',
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Bundle analysis identified Three.js as the dominant stable dependency.
          // Keeping it separate improves browser caching across portfolio UI releases.
          if (id.includes('/node_modules/three/')) return 'three-core'
        }
      }
    }
  },
  server: { port: 5173, open: false }
})

