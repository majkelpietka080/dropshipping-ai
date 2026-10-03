import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataRoot = resolve(__dirname, '../../../data');
const writeQueues = new Map<string, Promise<void>>();

export async function loadJsonArray<T>(filename: string): Promise<T[]> {
  const filePath = resolve(dataRoot, filename);

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function saveJsonArray<T>(filename: string, values: T[]): Promise<void> {
  const previous = writeQueues.get(filename) ?? Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dataRoot, { recursive: true });
      const filePath = resolve(dataRoot, filename);
      const tempPath = `${filePath}.tmp`;

      await writeFile(tempPath, JSON.stringify(values, null, 2) + '\n', 'utf8');
      await rename(tempPath, filePath);
    });

  writeQueues.set(filename, next.catch(() => undefined));
  return next;
}
