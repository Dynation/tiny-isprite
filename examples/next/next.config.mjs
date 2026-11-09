import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default {
  basePath: '/demo',
  // Include the locally linked library when running this example in the repo.
  turbopack: { root: path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..') },
  experimental: { cpus: 2 },
  async headers() {
    return [{ source: '/assets/:file*', headers: [
      { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
    ] }, { source: '/assets/sprite.:hash([a-f0-9]{20}).svg', headers: [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ] }];
  },
};
