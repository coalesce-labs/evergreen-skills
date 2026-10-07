// Make a disposable, synthetic workspace for an unforced natural-language task evaluation.
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { container, folder, link } from '../tests/fixtures.mjs';

const source = dirname(dirname(fileURLToPath(import.meta.url)));
const root = mkdtempSync(join(tmpdir(), 'evergreen-natural-task-'));
const checkout = join(root, 'bookmarks'), remote = join(root, 'remote.git');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
git(root, 'init', '--bare', '--initial-branch=main', remote);
git(root, 'clone', remote, checkout);
git(checkout, 'config', 'user.name', 'Synthetic Evaluation');
git(checkout, 'config', 'user.email', 'test@example.org');
writeFileSync(join(checkout, 'bookmarks.json'), JSON.stringify(container([
  folder('Engineering',
    link('Automating pull request reviews', 'https://example.org/reviews'),
    link('Agent workflows for development', 'https://example.org/agents'),
    link('Build pipeline guide', 'https://example.org/guide')),
  folder('Travel', link('Mountain walks', 'https://example.org/walks')),
])), { mode: 0o600 });
git(checkout, 'add', 'bookmarks.json'); git(checkout, 'commit', '-m', 'synthetic evaluation seed');
git(checkout, 'push', 'origin', 'main');
git(checkout, 'remote', 'set-head', 'origin', 'main');
const baseCommit = git(checkout, 'rev-parse', 'HEAD');
const catalog = [];
for (const name of ['evergreen-bookmarks', 'evergreen-context']) {
  const target = join(root, 'skills', name);
  cpSync(join(source, 'skills', name), target, { recursive: true });
  const text = readFileSync(join(target, 'SKILL.md'), 'utf8');
  const metadata = YAML.parse(text.match(/^---\n([\s\S]*?)\n---/)[1]);
  catalog.push({ name, description: metadata.description, instructions: join(target, 'SKILL.md') });
}
const environment = {};
for (const key of ['XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME']) {
  environment[key] = join(root, key.toLowerCase()); mkdirSync(environment[key], { mode: 0o700 });
}
const prompt = `You are an assistant with the following optional installed skill catalog:\n${JSON.stringify(catalog, null, 2)}

Handle the user's request normally. Select skills only if their descriptions warrant it, then
read and follow the selected instructions. Other general-purpose tools are available.
If you need to ask the user a question, return that question in your final answer rather than
using input UI tools in this disposable evaluation.
Work only in this disposable synthetic workspace. Do not read the development repo or grading
files, use a real user's bookmarks, or access external websites. The local bare Git origin is
accessible; Git fetch/ls-remote against it is permitted and needs no external network. Set these environment variables for every
helper command: ${JSON.stringify(environment)}.

User request:
Do I have any bookmarks about software engineering automation? Have I already saved
https://example.org/guide? My bookmark checkout is ${checkout}; use that existing checkout.

Give your normal answer, and report which skills you selected and the commands you used.
Do not perform edits or publish anything; this is a lookup request.
`;
const promptPath = join(root, 'task.prompt.txt'); writeFileSync(promptPath, prompt, { mode: 0o600 });
writeFileSync(join(root, 'fixture.json'), JSON.stringify({ checkout, remote, baseCommit, environment }), { mode: 0o600 });
console.log(JSON.stringify({ root, prompt: promptPath, checkout, baseCommit }));
