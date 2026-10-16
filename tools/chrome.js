// Drives a local headless Chrome for the page checks (tools/check-page.js, tools/snapshot-render.js).
// Chrome is not installed in CI, so nothing in `npm test` launches it.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// The page's DOM after its scripts have run, as Chrome serialises it.
export async function dumpDom(url) {
  const profile = await mkdtemp(path.join(tmpdir(), 'chrome-profile-'));
  try {
    const { stdout } = await execFileAsync(
      CHROME,
      ['--headless=new', `--user-data-dir=${profile}`, '--allow-file-access-from-files', '--virtual-time-budget=30000', '--dump-dom', url],
      { maxBuffer: 256 * 1024 * 1024, timeout: 180_000 },
    );
    return stdout;
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

// The harness writes its result as base64 JSON into <pre id="result">. Base64, so that entities and
// markup in the page text cannot be mangled by DOM serialisation; "running..." is not base64.
export function decodeResult(dom) {
  const match = /<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/.exec(dom);
  if (!match) throw new Error('the page harness did not finish: <pre id="result"> holds no result');
  return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
}

// Copies tools/page-harness.html next to local.html (it loads it in an iframe), runs it in Chrome
// and returns {texts, results}. config: { codes: string[], checks: boolean }.
export async function runHarness(localHtml, config) {
  const template = await readFile(path.join(HERE, 'page-harness.html'), 'utf8');
  const harness = path.join(path.dirname(localHtml), 'harness.html');
  const settings = { ...config, page: path.basename(localHtml) };
  await writeFile(harness, template.replace('__CONFIG__', () => JSON.stringify(settings)));
  return decodeResult(await dumpDom(pathToFileURL(harness).href));
}

export function snapshotOf(texts) {
  return { codes: Object.fromEntries(Object.entries(texts).map(([code, text]) => [code, { sha256: sha256(text), chars: text.length }])) };
}

// Problems found comparing freshly rendered texts with a stored snapshot; [] means identical.
export function compareSnapshot(texts, snapshot) {
  const problems = [];
  for (const [code, expected] of Object.entries(snapshot.codes)) {
    const text = texts[code];
    if (typeof text !== 'string') problems.push(`${code}: nothing was rendered`);
    else if (sha256(text) !== expected.sha256) problems.push(`${code}: rendered text changed (${text.length} characters now, ${expected.chars} in the snapshot)`);
  }
  return problems;
}
