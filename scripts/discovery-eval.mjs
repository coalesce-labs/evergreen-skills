import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const load = file => readFileSync(resolve(root, file), 'utf8');
const cases = JSON.parse(load('evals/natural-language/cases.json')).cases;
const skills = ['evergreen-bookmarks', 'evergreen-context'].map(name => {
  const frontmatter = /^---\n([\s\S]+?)\n---\n/.exec(load(`skills/${name}/SKILL.md`));
  const skill = parse(frontmatter[1]); return { name: skill.name, description: skill.description };
});
const [command, file] = process.argv.slice(2);
if (!command || command === '--help') {
  console.log('node scripts/discovery-eval.mjs prompt [FILE] | score RESPONSE.json\nPrompt hides expected labels; score requires one prediction for every case. No model API calls or credentials.');
} else if (command === 'prompt') {
  const prompt = `Select skills for each independent user request below. You see exactly the installed pack names and descriptions, as a discovery catalog; do not read their bodies or the answer key. Other general agent abilities remain available. Return only JSON {"predictions":[{"id":"...","selected":["skill-name"],"reason":"short explanation"}]}. Select zero, one or both skills, only where the user's request warrants them. A natural user request need not mention the product or skill name.\n\nCatalog:\n${JSON.stringify(skills, null, 2)}\n\nRequests:\n${JSON.stringify(cases.map(({ id, prompt }) => ({ id, prompt })), null, 2)}\n`;
  if (file) { mkdirSync(dirname(resolve(file)), { recursive: true }); writeFileSync(resolve(file), prompt, { flag: 'wx', mode: 0o600 }); }
  else process.stdout.write(prompt);
} else if (command === 'score' && file) {
  const result = JSON.parse(readFileSync(resolve(file), 'utf8'));
  if (!Array.isArray(result.predictions) || result.predictions.length !== cases.length) throw new Error('Require exactly one prediction per case.');
  const seen = new Set(), names = new Set(skills.map(s => s.name));
  for (const prediction of result.predictions) {
    if (seen.has(prediction.id) || !cases.some(c => c.id === prediction.id) || !Array.isArray(prediction.selected) || prediction.selected.some(s => !names.has(s)) || new Set(prediction.selected).size !== prediction.selected.length) throw new Error('Unknown/duplicate case or skill selection.');
    seen.add(prediction.id);
  }
  const details = cases.map(c => {
    const prediction = result.predictions.find(p => p.id === c.id);
    return { ...c, selected: prediction.selected, correct: JSON.stringify([...c.expected].sort()) === JSON.stringify([...prediction.selected].sort()), reason: prediction.reason };
  });
  const negatives = details.filter(c => c.expected.length === 0);
  const positives = details.filter(c => c.expected.length > 0);
  console.log(JSON.stringify({ correct: details.filter(c => c.correct).length, total: cases.length,
    positiveCorrect: positives.filter(c => c.correct).length, positiveTotal: positives.length,
    falsePositives: negatives.filter(c => !c.correct).length, negativeTotal: negatives.length, details }, null, 2));
} else throw new Error('See --help for usage.');
