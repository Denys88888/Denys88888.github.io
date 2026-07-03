import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  server: { port: 5199, strictPort: true },
  plugins: [
    react(),
    // PWA: Workbox generates the service worker (precache app shell + assets) and
    // the web app manifest; auto-registers on load.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: '/',
        name: 'Taxi Pro',
        short_name: 'TaxiPro',
        description: 'Pi Network ride-hailing',
        scope: '/',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#7B3FE4',
        background_color: '#121212',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    // Split heavy vendors into their own chunks so no single chunk trips the
    // 500 kB warning and the app shell caches/loads efficiently.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          leaflet: ['leaflet', 'react-leaflet'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          vendor: ['axios', 'zustand', 'date-fns', 'dompurify', 'lucide-react'],
        },
      },
    },
  },
});
