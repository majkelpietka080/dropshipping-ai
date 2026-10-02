import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StoreConfig } from '@dropshipping/stores';

const __dirname = dirname(fileURLToPath(import.meta.url));
const storesRoot = resolve(__dirname, '../../../stores');

function assertSafeSlug(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Nieprawidłowy identyfikator sklepu.');
  }
}

export async function findAvailableStoreSlug(name: string): Promise<string> {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'new-store';

  let candidate = slug;
  let suffix = 2;

  while (true) {
    try {
      await access(resolve(storesRoot, candidate));
      candidate = slug + '-' + suffix++;
    } catch {
      return candidate;
    }
  }
}

export async function writeStoreConfigFiles(slug: string, config: StoreConfig): Promise<void> {
  assertSafeSlug(slug);

  const storeDir = resolve(storesRoot, slug);
  await mkdir(storeDir, { recursive: true });

  const json = JSON.stringify(config, null, 2);
  const ts = `export const storeConfig = ${json} as const;\n`;

  await writeFile(resolve(storeDir, 'store.config.json'), json + '\n', 'utf8');
  await writeFile(resolve(storeDir, 'store.config.ts'), ts, 'utf8');
}

export async function loadStoreConfig(slug: string): Promise<StoreConfig> {
  assertSafeSlug(slug);

  const storeDir = resolve(storesRoot, slug);

  try {
    const rawJson = await readFile(resolve(storeDir, 'store.config.json'), 'utf8');
    return JSON.parse(rawJson) as StoreConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  try {
    const rawTs = await readFile(resolve(storeDir, 'store.config.ts'), 'utf8');
    const match = rawTs.match(/^export const storeConfig = ([\\s\\S]*?) as const;\\s*$/);
    if (!match) throw new Error('Nieprawidłowy format store.config.ts.');
    return JSON.parse(match[1]) as StoreConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Sklep "${slug}" nie posiada konfiguracji.`);
    }
    throw error;
  }
}
