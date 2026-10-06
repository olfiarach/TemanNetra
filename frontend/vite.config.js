import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The UI calls relative /health and /predict. Forward them to the local FastAPI process
// so the browser sees one origin (no CORS, no hard-coded LAN IP).
const api = { '/health': 'http://127.0.0.1:8000', '/predict': 'http://127.0.0.1:8000' };

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: api }, // localhost only; phone setup: see README
  preview: { proxy: api },
});
