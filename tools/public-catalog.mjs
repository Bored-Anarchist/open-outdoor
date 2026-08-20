import { copyFile, mkdir } from 'node:fs/promises';

const output = new URL('../dist/catalogs/', import.meta.url);
await mkdir(output, { recursive: true });
await copyFile(
  new URL('../fixtures/public/catalog.json', import.meta.url),
  new URL('public.json', output),
);
console.log('wrote synthetic public catalog to dist/catalogs/public.json');
