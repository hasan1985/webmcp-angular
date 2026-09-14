import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

// M4: no document, no window — a server render or build-time prerender.
// Tests the BUILT artifact, so run `ng build ng-webmcp-compat` first.
const v22 = fileURLToPath(new URL('./node_modules/@angular/core', import.meta.url));

export default defineConfig({
  resolve: {alias: {'@angular/core': v22}},
  test: {
    name: 'ssr',
    environment: 'node',
    include: ['specs/ssr.spec.ts'],
  },
});
