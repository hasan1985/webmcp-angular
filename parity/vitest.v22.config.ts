import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

// Pin @angular/core to THIS project's v22 install. Without the alias, library
// sources outside parity/ resolve up to the workspace's Angular 20 and you end
// up with two Angular instances whose DI tokens do not match.
const v22 = fileURLToPath(new URL('./node_modules/@angular/core', import.meta.url));

export default defineConfig({
  resolve: {alias: {'@angular/core': v22}},
  test: {
    name: 'v22',
    environment: 'jsdom',
    include: ['specs/ours.spec.ts', 'specs/core.spec.ts'],
    env: {NG_LABEL: '22'},
  },
});
