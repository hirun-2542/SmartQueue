import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5179, strictPort: true, proxy: { '/api': 'http://127.0.0.1:5290', '/live': {target:'http://127.0.0.1:5290',ws:true} } },
  build: { outDir: '../server/wwwroot', emptyOutDir: true }
});
