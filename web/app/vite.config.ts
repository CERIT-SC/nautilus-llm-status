import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const VENDORS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'react-router-dom'],
  query: ['@tanstack/react-query'],
  charts: ['chart.js', 'chartjs-adapter-date-fns', 'chartjs-plugin-annotation', 'react-chartjs-2'],
  design: ['@e-infra/design-system'],
  ui: ['lucide-react', 'zustand', 'date-fns'],
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/status/',
  build: {
    outDir: '../static',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          for (const [name, pkgs] of Object.entries(VENDORS)) {
            if (pkgs.some((pkg) => id.includes(`/node_modules/${pkg}/`))) {
              return name
            }
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/status/api': {
        target: 'https://llm.ai.e-infra.cz',
        changeOrigin: true,
      },
      '/usage/api': {
        target: process.env.USAGE_API_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/usage\/api/, '/api'),
      },
    },
  },
})
