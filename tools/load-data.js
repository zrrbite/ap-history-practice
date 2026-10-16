import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const DATA_FILES = ['documents', 'dbqs', 'saqs', 'mcqs'];
const UNIT_FOLDER = /^unit-(\d+)$/;

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

// Reads one unit's folder. A missing unit.json leaves data.unit undefined so that validate() can report it.
export async function loadData(dir) {
  const data = {};
  const unitFile = path.join(dir, 'unit.json');
  try {
    data.unit = JSON.parse(await readFile(unitFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`${unitFile}: ${error.message}`);
  }
  for (const name of DATA_FILES) data[name] = await readJson(path.join(dir, `${name}.json`));
  return data;
}

// The unit folders under data/, in numeric order (unit-4, unit-5, unit-10).
export async function listUnits(dataRoot) {
  const entries = await readdir(dataRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && UNIT_FOLDER.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(UNIT_FOLDER.exec(a)[1]) - Number(UNIT_FOLDER.exec(b)[1]));
}

// Every unit, or just `only`: [{id, dir}].
export async function selectUnits(dataRoot, only = null) {
  const ids = await listUnits(dataRoot);
  if (only !== null && !ids.includes(only)) throw new Error(`no such unit "${only}" (known: ${ids.join(', ') || 'none'})`);
  return (only === null ? ids : [only]).map((id) => ({ id, dir: path.join(dataRoot, id) }));
}

// loadData for a {id, dir} from selectUnits, refusing a unit.json that names a different unit.
export async function loadUnit({ id, dir }) {
  const data = await loadData(dir);
  if (data.unit && typeof data.unit === 'object' && data.unit.id !== id) {
    throw new Error(`${path.join(dir, 'unit.json')}: id is "${data.unit.id}" but the folder is ${id}`);
  }
  return data;
}

// Splits "--unit <id>" out of a command line: { unit: id | null, args: the rest }.
export function takeUnit(argv) {
  const at = argv.indexOf('--unit');
  if (at < 0) return { unit: null, args: [...argv] };
  const unit = argv[at + 1];
  if (!unit || unit.startsWith('--')) throw new Error('--unit needs a unit id such as unit-5');
  return { unit, args: [...argv.slice(0, at), ...argv.slice(at + 2)] };
}

// A file argument given relative to a unit's folder; absolute paths are used as they are.
export const inUnit = (dir, file) => (path.isAbsolute(file) ? file : path.join(dir, file));
