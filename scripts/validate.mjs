import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

if (process.argv.includes('--help')) { console.log('node scripts/validate.mjs: offline schema pins, manifests, skill frontmatter, references, overlays and trigger cases.'); process.exit(0); }
const root = fileURLToPath(new URL('../', import.meta.url));
const load = file => readFileSync(join(root, file), 'utf8');
const hash = raw => createHash('sha256').update(raw).digest('hex');
const lock = JSON.parse(load('schemas/schemas.lock.json'));
const validators = { old: new Ajv({ strict: false, allErrors: true }), modern: new Ajv2020({ strict: false, allErrors: true }) };
for (const validator of Object.values(validators)) addFormats(validator);
const check = (schema, value, label) => {
  const validate = (/2020-12/.test(schema.$schema) ? validators.modern : validators.old).compile(schema);
  if (!validate(value)) throw new Error(`${label}: ${JSON.stringify(validate.errors)}`);
};
for (const pin of lock.schemas) {
  const raw = load(`schemas/${pin.file}`);
  if (hash(raw) !== pin.sha256) throw new Error(`Schema pin mismatch: ${pin.file}`);
  const schema = JSON.parse(raw);
  for (const pattern of pin.targets) {
    const targets = pattern.includes('*') ? readdirSync(join(root, 'skills')).map(skill => pattern.replace('*', skill)) : [pattern];
    for (const target of targets) {
      const text = load(target);
      const value = pin.kind === 'frontmatter' ? parse(/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '') : target.endsWith('.yaml') ? parse(text) : JSON.parse(text);
      check(schema, value, target);
    }
  }
}
const frontSchema = JSON.parse(load('schemas/frontmatter.json'));
for (const skill of readdirSync(join(root, 'skills'))) {
  const relative = `skills/${skill}`, text = load(`${relative}/SKILL.md`);
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!front) throw new Error(`Missing frontmatter: ${skill}`);
  const value = parse(front[1]); check(frontSchema, value, skill);
  if (value.name !== skill || text.split('\n').length >= 500) throw new Error(`Name/length mismatch: ${skill}`);
  for (const match of text.matchAll(/\]\((references\/[^)]+)\)/g)) if (!existsSync(join(root, relative, match[1]))) throw new Error(`Dangling reference: ${match[1]}`);
  const overlay = parse(load(`${relative}/agents/openai.yaml`));
  if (!overlay.interface.default_prompt.includes(`$${skill}`) || overlay.policy?.allow_implicit_invocation !== true) throw new Error(`Invalid invocation overlay: ${skill}`);
  const portability = parse(load(`${relative}/agents/portability.yaml`));
  if (portability.identity.skill !== skill || !Array.isArray(portability.effects)) throw new Error(`Invalid portability overlay: ${skill}`);
  const cases = JSON.parse(load(`evals/${skill}/trigger-cases.json`));
  if (cases.skill !== skill || ['should_trigger', 'should_not_trigger'].some(key => cases[key]?.length < 5 || cases[key].some(v => typeof v !== 'string' || !v))) throw new Error(`Invalid trigger cases: ${skill}`);
}
console.log('Pinned schemas, manifests, skill metadata, references and trigger cases validated.');
