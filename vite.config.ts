import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

import { tunerPlugin } from './src/devserver/tunerPlugin';
import { bugReportPlugin } from './src/devserver/bugReportPlugin';

export default defineConfig({
  // p9c/G15: `tunerPlugin` is itself `apply: 'serve'`, so this line has no
  // effect on `vite build`/`vite preview` output — kept explicit anyway so
  // the registration reads as dev-only at the call site, not just inside
  // the plugin. fb139's `bugReportPlugin` is the same shape.
  plugins: [tunerPlugin(), bugReportPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
