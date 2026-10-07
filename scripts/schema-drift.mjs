import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

if (process.argv.includes('--help')) { console.log('node scripts/schema-drift.mjs: fetch published schemas and fail on drift; never silently re-pin.'); process.exit(0); }
const lock = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/schemas.lock.json', import.meta.url))));
let failed = false;
for (const schema of lock.schemas.filter(s => s.url)) {
  try {
    const response = await fetch(schema.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = Buffer.from(await response.arrayBuffer());
    const hash = createHash('sha256').update(raw).digest('hex');
    if (hash !== schema.sha256) { console.error(`${schema.source} ${schema.file} drifted. Review upstream before explicitly re-pinning. Expected ${schema.sha256}; received ${hash}.`); failed = true; }
    else console.log(`${schema.file}: unchanged`);
  } catch (error) { console.error(`${schema.file}: fetch failed: ${error.message}`); failed = true; }
}
process.exitCode = failed ? 1 : 0;
