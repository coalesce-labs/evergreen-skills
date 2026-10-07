import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, renameSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { container, folder, link } from './fixtures.mjs';
import { paths, openRepository, plan, apply, configure, setupStatus, setup, requireSetup } from '../src/repository.mjs';

const envBefore = { ...process.env };
const root = mkdtempSync(join(tmpdir(), 'evergreen-skills-tests-'));
process.env.XDG_STATE_HOME = join(root, 'state'); process.env.XDG_CONFIG_HOME = join(root, 'config');
after(() => { process.env = envBefore; console.log(`Synthetic test artifacts retained: ${root}`); });
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function fixture() {
  const path = mkdtempSync(join(root, 'case-')), remote = join(path, 'remote.git'), checkout = join(path, 'checkout');
  git(path, 'init', '--bare', '--initial-branch=main', remote); git(path, 'clone', remote, checkout);
  git(checkout, 'config', 'user.name', 'Synthetic Test'); git(checkout, 'config', 'user.email', 'test@example.org');
  writeFileSync(join(checkout, 'bookmarks.json'), JSON.stringify(container([folder('A', link('one')), folder('A', link('two'))])));
  git(checkout, 'add', 'bookmarks.json'); git(checkout, 'commit', '-m', 'synthetic seed'); git(checkout, 'push', 'origin', 'main');
  return { path, remote, checkout, options: { repoPath: checkout, baseCommit: git(checkout, 'rev-parse', 'HEAD') } };
}
const ops = [{ op: 'merge-folders', source: '/bookmarksBar/1', target: '/bookmarksBar/0' }];
function secondWriter(f) {
  const path = join(f.path, 'writer'); git(f.path, 'clone', f.remote, path);
  git(path, 'config', 'user.name', 'Synthetic Browser'); git(path, 'config', 'user.email', 'browser@example.org');
  writeFileSync(join(path, 'browser-marker.txt'), 'concurrent change');
  git(path, 'add', 'browser-marker.txt'); git(path, 'commit', '-m', 'concurrent writer');
  return path;
}
test('XDG defaults and relative values, configured alternate repo without secrets', () => {
  assert.deepEqual(paths({}, '/home/synthetic'), { data: '/home/synthetic/.local/share/evergreen', config: '/home/synthetic/.config/evergreen', state: '/home/synthetic/.local/state/evergreen' });
  assert.equal(paths({ XDG_DATA_HOME: 'relative' }, '/home/synthetic').data, '/home/synthetic/.local/share/evergreen');
  assert.equal(paths({ XDG_DATA_HOME: '/data' }).data, '/data/evergreen');
  const value = configure('owner/other-bookmarks'); assert.equal(JSON.parse(readFileSync(value.config)).repo, 'owner/other-bookmarks');
  assert.equal(statSync(value.config).mode & 0o777, 0o600);
  assert.throws(() => configure('https://token@github.com/owner/repo'), /owner\/name/);
  assert.throws(() => configure('owner/..'), /owner\/name/);
});
test('plan leaves data unchanged; apply commits only bookmarks and publishes on main', () => {
  const f = fixture(), before = readFileSync(join(f.checkout, 'bookmarks.json'), 'utf8');
  const p = plan(f.options, ops); assert.equal(readFileSync(join(f.checkout, 'bookmarks.json'), 'utf8'), before);
  const result = apply(p.plan); assert.equal(result.published, true);
  assert.equal(git(f.checkout, 'rev-parse', 'HEAD'), result.commit);
  assert.equal(git(f.path, '--git-dir', f.remote, 'rev-parse', 'main'), result.commit);
  assert.equal(git(f.checkout, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.commit), 'bookmarks.json');
  const data = JSON.parse(readFileSync(join(f.checkout, 'bookmarks.json')));
  assert.deepEqual(data.providers.bookmarks.data.bookmarksBar[0].children.map(n => n.title), ['one', 'two']);
  assert.equal(existsSync(join(f.checkout, '.git', 'evergreen-agent.lock')), false);
});
test('remote advancing after planning rejects stale pointers without publishing', () => {
  const f = fixture(), p = plan(f.options, ops), writer = secondWriter(f);
  git(writer, 'push', 'origin', 'main'); const remote = git(writer, 'rev-parse', 'HEAD');
  assert.throws(() => apply(p.plan), /stale/);
  assert.equal(git(f.path, '--git-dir', f.remote, 'rev-parse', 'main'), remote);
  assert.equal(JSON.parse(readFileSync(join(f.checkout, 'bookmarks.json'))).providers.bookmarks.data.bookmarksBar.length, 2);
});
test('remote advancing after inspection refuses planning before a pointer can select another node', () => {
  const f = fixture(), inspected = openRepository(f.options), writer = secondWriter(f);
  const file = join(writer, 'bookmarks.json'), value = JSON.parse(readFileSync(file));
  value.providers.bookmarks.data.bookmarksBar.unshift(folder('New', link('new')));
  writeFileSync(file, JSON.stringify(value)); git(writer, 'add', 'bookmarks.json');
  git(writer, 'commit', '-m', 'synthetic prepend'); git(writer, 'push', 'origin', 'main');
  const output = join(f.path, 'stale-plan.json'), rename = [{ op: 'rename', target: '/bookmarksBar/1', title: 'Two renamed' }];
  assert.throws(() => plan({ repoPath: f.checkout }, rename), /base-commit/);
  assert.throws(() => plan({ ...f.options, baseCommit: inspected.head, output }, rename), /Inspection is stale/);
  assert.equal(existsSync(output), false);
  const current = openRepository(f.options);
  const p = plan({ ...f.options, baseCommit: current.head }, [{ ...rename[0], target: '/bookmarksBar/2' }]);
  assert.equal(apply(p.plan).published, true);
  assert.deepEqual(JSON.parse(readFileSync(join(f.checkout, 'bookmarks.json'))).providers.bookmarks.data.bookmarksBar.map(n => n.title), ['New', 'A', 'Two renamed']);
});
test('publishing ignores push.followTags and leaves unrelated annotated tags local', () => {
  const f = fixture(); git(f.checkout, 'tag', '-a', 'unpublished-local', '-m', 'synthetic private tag');
  git(f.checkout, 'config', 'push.followTags', 'true');
  const p = plan(f.options, ops); assert.equal(apply(p.plan).published, true);
  assert.equal(git(f.path, '--git-dir', f.remote, 'tag', '--list'), '');
  assert.equal(git(f.checkout, 'tag', '--list'), 'unpublished-local');
});
test('push racing after freshness check is rejected, preserving browser commit and recovery worktree', () => {
  const f = fixture(), p = plan(f.options, ops), writer = secondWriter(f);
  const hook = join(f.checkout, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR\ngit -C '${writer}' -c core.hooksPath=/dev/null push origin main >/dev/null 2>&1\n`, { mode: 0o755 });
  let message;
  try { apply(p.plan); } catch (e) { message = e.message; }
  assert.match(message, /Transaction retained at/);
  const transaction = /Transaction retained at (.+?)\. Check/.exec(message)[1];
  assert.equal(existsSync(join(transaction, 'transaction.json')), true);
  assert.equal(existsSync(join(transaction, 'worktree', 'bookmarks.json')), true);
  assert.equal(existsSync(join(transaction, 'published.json')), false);
  assert.equal(git(f.path, '--git-dir', f.remote, 'rev-parse', 'main'), git(writer, 'rev-parse', 'HEAD'));
  assert.equal(git(f.checkout, 'rev-parse', 'HEAD'), p.baseCommit);
});
test('failed commit retains original data; dirty, wrong branch, offline edits and extra push URL refused', () => {
  const f = fixture(), p = plan(f.options, ops);
  writeFileSync(join(f.checkout, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.throws(() => apply(p.plan), /retained/); assert.equal(git(f.checkout, 'rev-parse', 'HEAD'), p.baseCommit);
  writeFileSync(join(f.checkout, 'untracked.txt'), 'user work'); assert.throws(() => openRepository(f.options), /dirty/);
  assert.throws(() => plan({ ...f.options, offline: true }, ops), /online/);
  const g = fixture(); git(g.checkout, 'switch', '-c', 'feature'); assert.throws(() => openRepository(g.options), /default branch/);
  const h = fixture(); git(h.checkout, 'config', 'remote.origin.pushurl', '/wrong/remote'); assert.throws(() => openRepository(h.options), /fetch\/push/);
});
test('no-op does not commit; audit identity and output hash tampering are constrained', () => {
  const f = fixture(), p = plan(f.options, [{ op: 'rename', target: '/bookmarksBar/0', title: 'A' }]);
  assert.equal(apply(p.plan).noChange, true); assert.equal(git(f.checkout, 'rev-parse', 'HEAD'), p.baseCommit);
  const q = plan(f.options, ops), saved = JSON.parse(readFileSync(q.plan));
  saved.operations = [{ op: 'rename', target: '/bookmarksBar/0', title: 'Tampered' }]; writeFileSync(q.plan, JSON.stringify(saved));
  assert.throws(() => apply(q.plan), /hash/);
});
test('hooks adding unrelated files cannot publish a broader commit', () => {
  const f = fixture(), p = plan(f.options, ops);
  writeFileSync(join(f.checkout, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nprintf unrelated > extra.txt\ngit add extra.txt\n', { mode: 0o755 });
  assert.throws(() => apply(p.plan), /beyond bookmarks.json/);
  assert.equal(git(f.path, '--git-dir', f.remote, 'rev-parse', 'main'), p.baseCommit);
  assert.equal(git(f.checkout, 'rev-parse', 'HEAD'), p.baseCommit);
});
test('refuse generation manifest and symlink container; clean cached read reports unverified', () => {
  const f = fixture(); assert.equal(openRepository(f.options).freshness, 'fetched');
  assert.equal(openRepository({ ...f.options, offline: true }).freshness, 'cached-unverified');
  const original = join(f.path, 'outside.json'); renameSync(join(f.checkout, 'bookmarks.json'), original); symlinkSync(original, join(f.checkout, 'bookmarks.json'));
  git(f.checkout, 'add', 'bookmarks.json'); git(f.checkout, 'commit', '-m', 'synthetic symlink'); git(f.checkout, 'push', 'origin', 'main');
  assert.throws(() => openRepository(f.options), /regular file/);
  const g = fixture(); mkdirSync(join(g.checkout, '.evergreen')); writeFileSync(join(g.checkout, '.evergreen', 'manifest.json'), '{}');
  git(g.checkout, 'add', '.evergreen'); git(g.checkout, 'commit', '-m', 'synthetic generation'); git(g.checkout, 'push', 'origin', 'main');
  assert.throws(() => openRepository(g.options), /new-generation/);
});
test('CLI context writes private bounded output; malformed flags fail', () => {
  const f = fixture(), script = new URL('../skills/evergreen-context/scripts/evergreen.mjs', import.meta.url);
  setup({ ...f.options, approved: true });
  const value = JSON.parse(execFileSync(process.execPath, [script.pathname, 'context', '--repo-path', f.checkout, '--limit', '1'], { encoding: 'utf8' }));
  assert.equal(value.entries.length, 1); assert.equal(value.omitted, 1); assert.equal(existsSync(value.export), true);
  assert.equal(statSync(value.export).mode & 0o777, 0o600);
  assert.throws(() => execFileSync(process.execPath, [script.pathname, 'inspect', '--limit', 'NaN'], { stdio: 'pipe' }));
});
function freshSetupEnvironment() {
  const before = { ...process.env }, path = mkdtempSync(join(root, 'setup-'));
  process.env.XDG_CONFIG_HOME = join(path, 'config'); process.env.XDG_DATA_HOME = join(path, 'data'); process.env.XDG_STATE_HOME = join(path, 'state');
  delete process.env.EVERGREEN_BOOKMARK_REPO;
  return { path, restore: () => { process.env = before; } };
}
const cli = (skill, ...args) => execFileSync(process.execPath, [new URL(`../skills/${skill}/scripts/evergreen.mjs`, import.meta.url).pathname, ...args], { encoding: 'utf8', stdio: 'pipe' });
test('installed CLI carries the inspection commit through planning and publication', () => {
  const f = fixture(); setup({ ...f.options, approved: true });
  const inspected = JSON.parse(cli('evergreen-bookmarks', 'inspect', '--repo-path', f.checkout));
  const file = join(f.path, 'operations.json'); writeFileSync(file, JSON.stringify(ops), { mode: 0o600 });
  assert.throws(() => cli('evergreen-bookmarks', 'plan', '--repo-path', f.checkout, '--operations', file), /base-commit/);
  const p = JSON.parse(cli('evergreen-bookmarks', 'plan', '--repo-path', f.checkout, '--base-commit', inspected.commit, '--operations', file));
  assert.equal(p.baseCommit, inspected.commit);
  const result = JSON.parse(cli('evergreen-bookmarks', 'apply', '--plan', p.plan));
  assert.equal(result.published, true);
  assert.equal(git(f.path, '--git-dir', f.remote, 'rev-parse', 'main'), result.commit);
});
test('first-use preflight is local and side-effect free; ordinary calls cannot consent implicitly', () => {
  const env = freshSetupEnvironment();
  try {
    assert.equal(setupStatus().discoveryRequired, true);
    assert.equal(setupStatus({ repo: 'owner/bookmarks' }).checkout, join(env.path, 'data', 'evergreen', 'repos', 'github.com', 'owner', 'bookmarks'));
    process.env.EVERGREEN_BOOKMARK_REPO = 'owner/env-bookmarks';
    assert.equal(setupStatus().repo, 'owner/env-bookmarks');
    assert.equal(setupStatus({ repo: 'owner/explicit' }).repo, 'owner/explicit');
    delete process.env.EVERGREEN_BOOKMARK_REPO;
    assert.throws(() => requireSetup(), /approval/);
    assert.throws(() => cli('evergreen-context', 'context'), /approval/);
    assert.throws(() => cli('evergreen-bookmarks', 'ensure'), /approval/);
    assert.throws(() => cli('evergreen-context', 'ensure', '--approved'), /only valid/);
    assert.equal(existsSync(join(env.path, 'config')), false);
    assert.equal(existsSync(join(env.path, 'data')), false);
    assert.equal(existsSync(join(env.path, 'state')), false);
    assert.throws(() => setupStatus({ repoPath: 'relative' }), /absolute/);
  } finally { env.restore(); }
});
test('approved setup is shared across skills, remembers an existing checkout and does not publish', () => {
  const env = freshSetupEnvironment(), f = fixture();
  try {
    const before = git(f.checkout, 'rev-parse', 'HEAD'), raw = readFileSync(join(f.checkout, 'bookmarks.json'), 'utf8');
    assert.equal(setupStatus(f.options).setupRequired, true);
    assert.throws(() => setup(f.options), /approval|consent/);
    assert.throws(() => setup({ ...f.options, approved: true, offline: true }), /online/);
    assert.throws(() => cli('evergreen-bookmarks', 'configure', '--repo', 'owner/bookmarks'), /consent/);
    assert.equal(existsSync(join(env.path, 'config')), false);
    const result = JSON.parse(cli('evergreen-bookmarks', 'setup', '--approved', '--repo-path', f.checkout));
    assert.equal(result.configured, true); assert.equal(result.freshness, 'fetched');
    assert.equal(statSync(result.setupReceipt).mode & 0o777, 0o600);
    assert.equal(statSync(join(paths().config, 'skills.json')).mode & 0o777, 0o600);
    assert.equal(statSync(join(paths().config, 'setups')).mode & 0o777, 0o700);
    assert.equal(JSON.parse(cli('evergreen-context', 'setup-status')).setupRequired, false);
    assert.equal(JSON.parse(cli('evergreen-context', 'ensure')).commit, before);
    assert.equal(openRepository().path, realpathSync(f.checkout));
    assert.equal(JSON.parse(cli('evergreen-bookmarks', 'audit', '--offline')).freshness, 'cached-unverified');
    assert.equal(git(f.checkout, 'rev-parse', 'HEAD'), before);
    assert.equal(git(f.path, '--git-dir', f.remote, 'rev-parse', 'main'), before);
    assert.equal(readFileSync(join(f.checkout, 'bookmarks.json'), 'utf8'), raw);
    assert.equal(git(f.checkout, 'status', '--porcelain'), '');
    const alias = join(f.path, 'alias'); symlinkSync(f.checkout, alias);
    assert.equal(setupStatus({ repoPath: alias }).setupRequired, false);
    assert.equal(setupStatus({ repo: 'owner/another-repo' }).setupRequired, true);
    assert.equal(setupStatus({ repoPath: f.checkout, repo: 'owner/wrong-origin' }).reason, 'selection-changed');
    const saved = JSON.parse(readFileSync(result.setupReceipt));
    writeFileSync(result.setupReceipt, JSON.stringify({ ...saved, version: 2 }));
    assert.equal(setupStatus().setupRequired, true);
    writeFileSync(result.setupReceipt, JSON.stringify(saved));
    git(f.checkout, 'remote', 'set-url', 'origin', join(f.path, 'different.git'));
    assert.equal(setupStatus().reason, 'selection-changed');
    assert.throws(() => cli('evergreen-context', 'ensure'), /approval/);
    git(f.checkout, 'remote', 'set-url', 'origin', f.remote);
    writeFileSync(result.setupReceipt, 'invalid'); assert.equal(setupStatus().reason, 'setup-unavailable');
  } finally { env.restore(); }
});
test('failed setup never receives a ready receipt or saved default; configured GitHub selections stay local in preflight', () => {
  const env = freshSetupEnvironment(), f = fixture();
  try {
    writeFileSync(join(f.checkout, 'bookmarks.json'), '{"version":99}');
    assert.throws(() => setup({ ...f.options, approved: true }), /dirty/);
    assert.equal(existsSync(join(env.path, 'config')), false);
    git(f.checkout, 'add', 'bookmarks.json'); git(f.checkout, 'commit', '-m', 'synthetic unsupported container'); git(f.checkout, 'push', 'origin', 'main');
    assert.throws(() => setup({ ...f.options, approved: true }), /version/);
    assert.equal(setupStatus(f.options).setupRequired, true);
    assert.equal(existsSync(join(env.path, 'config')), false);
    configure('owner/bookmarks'); assert.equal(setupStatus().repo, 'owner/bookmarks');
    assert.equal(setupStatus().setupRequired, true); // A saved name alone is not setup consent.
    assert.equal(existsSync(join(env.path, 'data')), false);
  } finally { env.restore(); }
});
test('CLI planning and publication require setup before outputs or the Git lock are created', () => {
  const env = freshSetupEnvironment(), f = fixture();
  try {
    const file = join(f.path, 'unapproved-plan.json');
    writeFileSync(file, JSON.stringify({ version: 1, checkout: f.checkout }));
    assert.throws(() => cli('evergreen-bookmarks', 'plan', '--repo-path', f.checkout, '--operations', join(f.path, 'absent.json')), /approval/);
    assert.throws(() => cli('evergreen-bookmarks', 'apply', '--plan', file), /approval/);
    assert.equal(existsSync(join(f.checkout, '.git', 'evergreen-agent.lock')), false);
    assert.equal(existsSync(join(env.path, 'state')), false);
    assert.equal(existsSync(join(env.path, 'config')), false);
  } finally { env.restore(); }
});
