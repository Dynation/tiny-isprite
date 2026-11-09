import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/demo/',
  plugins: [react(), {
    name: 'sprite-preview-cache',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (/\/assets\/sprite\.[a-f0-9]{20}\.svg$/.test(req.url ?? '')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        next();
      });
    },
  }],
});
