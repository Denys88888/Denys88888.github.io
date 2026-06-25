import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-framer': ['framer-motion'],
          'vendor-map': ['leaflet', 'react-leaflet'],
          'vendor-firebase': ['firebase/app', 'firebase/messaging', 'firebase/firestore'],
        }
      }
    }
  },
  define: {
    global: 'globalThis'
  }
});
