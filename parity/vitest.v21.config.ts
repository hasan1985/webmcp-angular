import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

// Angular 21: resolve @angular/* to the aliased v21 install.
const v21 = fileURLToPath(new URL('./node_modules/@angular/core-v21', import.meta.url));

export default defineConfig({
  resolve: {alias: {'@angular/core': v21}},
  test: {
    name: 'v21',
    environment: 'jsdom',
    include: ['specs/ours.spec.ts'],
    env: {NG_LABEL: '20'},
  },
});
