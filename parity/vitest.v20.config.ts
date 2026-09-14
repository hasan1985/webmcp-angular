import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

// Angular 20 floor: resolve @angular/* to the aliased v20 install.
const v20 = fileURLToPath(new URL('./node_modules/@angular/core-v20', import.meta.url));

export default defineConfig({
  resolve: {alias: {'@angular/core': v20}},
  test: {
    name: 'v20',
    environment: 'jsdom',
    include: ['specs/ours.spec.ts'],
    env: {NG_LABEL: '20'},
  },
});
