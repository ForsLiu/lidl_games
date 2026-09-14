import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

import { tunerPlugin } from './src/devserver/tunerPlugin';
import { bugReportPlugin } from './src/devserver/bugReportPlugin';

export default defineConfig({
  // p9c/G15/fb139: both plugins are themselves `apply: 'serve'`, so this line
  // has no effect on `vite build`/`vite preview` output — kept explicit
  // anyway so the registration reads as dev-only at the call site, not just
  // inside the plugins.
  plugins: [tunerPlugin(), bugReportPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
