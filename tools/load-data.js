import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const DATA_FILES = ['documents', 'dbqs', 'saqs', 'mcqs'];

export async function loadData(dir) {
  const data = {};
  for (const name of DATA_FILES) {
    const file = path.join(dir, `${name}.json`);
    try {
      data[name] = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
  }
  return data;
}
