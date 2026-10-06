import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const storesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../stores');

// Same format the API loader accepts: `export const storeConfig = <JSON> as const;`
export async function readStoreFile(slug: string): Promise<unknown> {
  const raw = await readFile(resolve(storesRoot, slug, 'store.config.ts'), 'utf8');
  const match = raw.match(/^export const storeConfig = ([\s\S]*?) as const;\s*$/);
  if (!match) throw new Error(`Nieprawidłowy format ${slug}/store.config.ts`);
  return JSON.parse(match[1]);
}

export function minimalConfig(overrides: Record<string, unknown> = {}) {
  return { id: 'test-store', name: 'Test', tagline: 'Tagline', ...overrides };
}
