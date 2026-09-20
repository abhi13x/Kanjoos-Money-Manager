import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/kanjoos-money-manager/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            // FIX: Correctly match HTML navigation/document requests using a callback function
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Kanjoos Web',
        short_name: 'Kanjoos',
        description: 'Local-First, privacy-focused Money Manager',
        theme_color: '#4949a0',
        background_color: '#48a86b',
        display: 'standalone',
        icons: [
          {
            src: 'kanjoos_icon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'kanjoos_icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      usePolling: true,
    },
  },
  build: {
    // Pass optimization configuration to the Rolldown engine
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Isolates heavy Material UI sets into a standalone chunk
            if (id.includes('@mui')) {
              return 'vendor-mui';
            }
            // Bundles remaining baseline dependencies (Dexie, React, Workbox, etc.)
            return 'vendor-core';
          }
        },
      },
    },
  },
}))
