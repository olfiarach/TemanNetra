import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static, browser-only app: relative base so it works under GitHub Pages' /<repo>/ path.
// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
