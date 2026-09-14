import {defineConfig} from 'vitest/config';

// M5: the migrate schematic, run against the BUILT collection in dist.
// Requires `npm run build:lib` first.
export default defineConfig({
  test: {
    name: 'schematics',
    environment: 'node',
    include: ['specs/migrate-schematic.spec.ts'],
  },
});
