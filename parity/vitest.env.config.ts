import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

// M4: environment degradation — unsupported browsers and cross-generation reads.
// Tests the BUILT artifact, so run `ng build webmcp-angular` first.
const v22 = fileURLToPath(new URL('./node_modules/@angular/core', import.meta.url));
// The polyfill entry point imports the primary entry by package name, exactly as
// it will at a consumer. Map it to the built FESM so that resolution is exercised.
const lib = fileURLToPath(
  new URL('../dist/webmcp-angular/fesm2022/webmcp-angular.mjs', import.meta.url),
);

export default defineConfig({
  resolve: {alias: {'@angular/core': v22, 'webmcp-angular': lib}},
  test: {
    name: 'env',
    environment: 'jsdom',
    include: [
      'specs/unsupported.spec.ts',
      'specs/polyfill.spec.ts',
      'specs/testing-harness.spec.ts',
      'specs/bridge.spec.ts',
      'specs/devtools.spec.ts',
    ],
  },
});
