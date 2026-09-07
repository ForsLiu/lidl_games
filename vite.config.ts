import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

import { tunerPlugin } from './src/devserver/tunerPlugin';
import { inboxPlugin } from './src/devserver/inboxPlugin';

export default defineConfig({
  // p9c/G15: `tunerPlugin` (and fb139's `inboxPlugin`) are themselves
  // `apply: 'serve'`, so this line has no effect on `vite build`/`vite
  // preview` output — kept explicit anyway so the registration reads as
  // dev-only at the call site, not just inside the plugin.
  plugins: [tunerPlugin(), inboxPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
