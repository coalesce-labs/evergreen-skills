import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync, lstatSync, renameSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, isAbsolute, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, parseContainer, transform, stats } from './bookmarks.mjs';

const fail = message => { throw new Error(message); };
export function run(program, args, cwd) {
  try {
    return execFileSync(program, args, { cwd, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', GIT_NO_REPLACE_OBJECTS: '1' } }).trim();
  } catch (error) {
    // Git errors can contain credential-bearing URLs. Keep the command name, not raw stderr.
    fail(`${program} ${args[0]} failed (exit ${error.status ?? 'timeout/unavailable'}). Check authentication, network, branch protection and local Git hooks.`);
  }
}
const git = (path, ...args) => run('git', args, path);
export function paths(env = process.env, home = homedir()) {
  const base = (name, fallback) => env[name] && isAbsolute(env[name]) ? env[name] : join(home, fallback);
  return { data: join(base('XDG_DATA_HOME', '.local/share'), 'evergreen'), config: join(base('XDG_CONFIG_HOME', '.config'), 'evergreen'), state: join(base('XDG_STATE_HOME', '.local/state'), 'evergreen') };
}
function privateDir(path) { mkdirSync(path, { recursive: true, mode: 0o700 }); return path; }
export function privateJson(path, value) {
  privateDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return path;
}
function repoName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value) || ['.', '..'].includes(value.split('/')[1])) fail('Select a GitHub repository as owner/name, not a URL or token.');
  return value;
}
export function configure(repo) {
  repoName(repo);
  const file = join(privateDir(paths().config), 'skills.json');
  const tmp = `${file}.${randomUUID()}`;
  privateJson(tmp, { repo }); renameSync(tmp, file);
  return { repo, config: file };
}
function selectedRepo(options) {
  if (options.repo) return repoName(options.repo);
  if (process.env.EVERGREEN_BOOKMARK_REPO) return repoName(process.env.EVERGREEN_BOOKMARK_REPO);
  const config = join(paths().config, 'skills.json');
  if (existsSync(config)) return repoName(JSON.parse(readFileSync(config, 'utf8')).repo);
  return repoName(`${run('gh', ['api', 'user', '--jq', '.login'])}/evergreen-bookmarks`);
}
function githubOrigin(origin) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/.exec(origin);
  return match?.[1];
}
function savedPath(options) {
  if (options.repoPath || options.repo || process.env.EVERGREEN_BOOKMARK_REPO) return options;
  const file = join(paths().config, 'skills.json');
  const value = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return value.repoPath ? { ...options, repoPath: value.repoPath } : options;
}
function setupSelection(options, discover = false) {
  options = savedPath(options);
  if (options.repoPath) {
    if (!isAbsolute(options.repoPath)) fail('--repo-path must be absolute.');
    return { path: existsSync(options.repoPath) ? realpathSync(options.repoPath) : options.repoPath,
      repo: options.repo ? repoName(options.repo) : null, explicitPath: true };
  }
  const file = join(paths().config, 'skills.json');
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).repo : undefined;
  const name = options.repo || process.env.EVERGREEN_BOOKMARK_REPO || saved;
  if (!name && !discover) return { path: null, repo: null, discoveryRequired: true };
  const repo = name ? repoName(name) : selectedRepo(options);
  const path = join(paths().data, 'repos', 'github.com', repo.toLowerCase());
  return { path: existsSync(path) ? realpathSync(path) : path, repo, explicitPath: false };
}
const setupReceipt = path => join(paths().config, 'setups', `${digest(path)}.json`);
// This preflight reads local selection/receipts only: no gh, clone, fetch or directory creation.
export function setupStatus(options = {}) {
  const selection = setupSelection(options);
  const result = { setupRequired: true, checkout: selection.path, repo: selection.repo,
    discoveryRequired: Boolean(selection.discoveryRequired), reason: 'not-configured' };
  if (!selection.path || !existsSync(setupReceipt(selection.path))) return result;
  try {
    const record = JSON.parse(readFileSync(setupReceipt(selection.path), 'utf8'));
    const origin = git(selection.path, 'remote', 'get-url', '--all', 'origin');
    if (record.version !== 1 || record.checkout !== selection.path || record.origin !== origin ||
      (selection.repo && githubOrigin(origin)?.toLowerCase() !== selection.repo.toLowerCase())) {
      return { ...result, reason: 'selection-changed' };
    }
    return { ...result, setupRequired: false, reason: 'ready', completedAt: record.completedAt };
  } catch { return { ...result, reason: 'setup-unavailable' }; }
}
export function requireSetup(options = {}) {
  if (setupStatus(options).setupRequired) fail('One-time setup needs user approval. Run setup-status, ask before setup, then run setup --approved with the chosen repository.');
}
export function setup(options = {}) {
  if (options.approved !== true) fail('Ask the user before one-time setup; setup requires --approved after their consent.');
  if (options.offline) fail('One-time setup requires an online freshness check.');
  const selection = setupSelection(options, true);
  const repository = openRepository(selection.explicitPath ? { ...options, repoPath: selection.path } : { ...options, repo: selection.repo });
  const record = { version: 1, checkout: repository.path, origin: repository.origin, completedAt: new Date().toISOString() };
  if (selection.explicitPath) {
    const config = join(privateDir(paths().config), 'skills.json'), tmp = `${config}.${randomUUID()}`;
    privateJson(tmp, { repoPath: repository.path }); renameSync(tmp, config);
  } else configure(selection.repo);
  const receipt = setupReceipt(repository.path), tmp = `${receipt}.${randomUUID()}`;
  privateJson(tmp, record); renameSync(tmp, receipt);
  return { ...status(repository), setupRequired: false, configured: true, setupReceipt: receipt,
    notice: 'Setup saved for both skills on this machine. No bookmarks were edited or pushed; setup is not permission for edits, page fetching or uploads.' };
}
function clean(path) {
  if (git(path, 'status', '--porcelain', '--untracked-files=all')) fail('Checkout is dirty. Preserve its changes before using the managed workflow.');
}
function read(path) {
  if (existsSync(join(path, '.evergreen', 'manifest.json'))) fail('A new-generation Evergreen manifest is present; this v1 editor must not write a legacy container.');
  const file = join(path, 'bookmarks.json');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 3145728) fail('bookmarks.json must be a regular file within the v1 size limit.');
  const raw = readFileSync(file, 'utf8');
  return { raw, container: parseContainer(raw) };
}

// Explicit repo-path is also useful for synthetic, local-remote tests. Automatic discovery is GitHub only.
export function openRepository(options = {}) {
  options = savedPath(options);
  let path, repo;
  if (options.repoPath) {
    if (!isAbsolute(options.repoPath)) fail('--repo-path must be absolute.');
    path = realpathSync(options.repoPath);
    if (options.repo) repo = repoName(options.repo);
  } else {
    repo = selectedRepo(options);
    path = join(paths().data, 'repos', 'github.com', repo.toLowerCase());
    if (!existsSync(path)) {
      if (options.offline) fail('No cached checkout exists. Connect once with ensure.');
      privateDir(dirname(path));
      run('gh', ['repo', 'clone', repo, path]);
    }
    path = realpathSync(path);
  }
  if (realpathSync(git(path, 'rev-parse', '--show-toplevel')) !== path) fail('Use the checkout root, not a subdirectory.');
  clean(path);
  const origins = git(path, 'remote', 'get-url', '--all', 'origin').split('\n');
  const pushes = git(path, 'remote', 'get-url', '--push', '--all', 'origin').split('\n');
  if (origins.length !== 1 || pushes.length !== 1 || pushes[0] !== origins[0]) fail('Origin must have one identical fetch/push URL.');
  const origin = origins[0];
  if (repo && githubOrigin(origin)?.toLowerCase() !== repo.toLowerCase()) fail('Checkout origin does not match the selected GitHub repository.');
  if (/^https?:\/\/[^/]*@/.test(origin)) fail('Remove embedded credentials from origin; use a Git credential helper.');
  let branch;
  if (options.offline) {
    branch = git(path, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '');
  } else {
    const head = git(path, 'ls-remote', '--symref', 'origin', 'HEAD');
    branch = /^ref: refs\/heads\/(.+)\s+HEAD$/m.exec(head)?.[1];
    if (!branch) fail('Cannot discover the remote default branch.');
    git(path, 'fetch', '--no-tags', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`);
    git(path, 'remote', 'set-head', 'origin', branch);
  }
  if (git(path, 'branch', '--show-current') !== branch) fail(`Checkout must be on the remote default branch (${branch}); do not switch a user's working branch automatically.`);
  if (!options.offline) {
    if (git(path, 'rev-list', '--count', `origin/${branch}..HEAD`) !== '0') fail('Checkout has unpublished commits. Preserve them; do not reset or push them implicitly.');
    git(path, 'merge', '--ff-only', `origin/${branch}`);
    clean(path);
  }
  const head = git(path, 'rev-parse', 'HEAD');
  const { raw, container } = read(path);
  return { path, origin, branch, head, raw, container, freshness: options.offline ? 'cached-unverified' : 'fetched', fetchedAt: options.offline ? null : new Date().toISOString() };
}
export function status(repository) {
  return { path: repository.path, branch: repository.branch, commit: repository.head, freshness: repository.freshness, fetchedAt: repository.fetchedAt,
    lastModified: repository.container.lastModified, lastModifiedBy: repository.container.lastModifiedBy, ...stats(repository.container), browserFreshness: 'Not observable from Git; check each extension instance.' };
}
export function plan(options, operations) {
  if (options.offline) fail('Editing requires an online freshness check.');
  if (typeof options.baseCommit !== 'string' || !/^[a-f0-9]{40,64}$/.test(options.baseCommit)) fail('Planning requires --base-commit from the inspection used to select pointers.');
  const repository = openRepository(options);
  if (repository.head !== options.baseCommit) fail('Inspection is stale. Inspect again and regenerate operations; never replay old pointers.');
  const modifiedAt = new Date().toISOString();
  const result = transform(repository.container, operations, modifiedAt, repository.origin);
  const rawAfter = `${JSON.stringify(result.container)}\n`;
  parseContainer(rawAfter);
  const value = { version: 1, checkout: repository.path, origin: repository.origin, branch: repository.branch, baseCommit: repository.head,
    beforeHash: digest(repository.raw), afterHash: digest(rawAfter), modifiedAt, operations, changed: result.changed, report: result.report,
    before: stats(repository.container), after: stats(result.container) };
  const file = options.output ? resolve(options.output) : join(paths().state, 'plans', `${randomUUID()}.json`);
  privateJson(file, value);
  return { plan: file, ...value };
}
export function apply(file, options = {}) {
  if (options.offline) fail('Publishing cannot run offline.');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  if (saved.version !== 1 || typeof saved.checkout !== 'string' || !isAbsolute(saved.checkout)) fail('Invalid plan.');
  if (options.repoPath && realpathSync(options.repoPath) !== saved.checkout) fail('Plan belongs to another checkout.');
  const common = git(saved.checkout, 'rev-parse', '--git-common-dir');
  const lock = join(resolve(saved.checkout, common), 'evergreen-agent.lock');
  try { mkdirSync(lock, { mode: 0o700 }); } catch { fail('Another bookmark edit is active or its lock needs inspection. Do not steal its lock.'); }
  let transaction;
  try {
    const repository = openRepository({ ...options, repoPath: saved.checkout });
    if (saved.origin !== repository.origin || saved.branch !== repository.branch || saved.baseCommit !== repository.head || saved.beforeHash !== digest(repository.raw)) fail('Plan is stale or belongs to a different repository. Inspect again and regenerate; never replay old pointers.');
    const result = transform(repository.container, saved.operations, saved.modifiedAt, repository.origin);
    const rawAfter = `${JSON.stringify(result.container)}\n`;
    parseContainer(rawAfter);
    if (saved.afterHash !== digest(rawAfter)) fail('Plan output hash does not match. Regenerate the plan.');
    if (!result.changed) return { published: false, noChange: true, commit: repository.head };
    transaction = join(privateDir(join(paths().state, 'transactions')), randomUUID());
    privateDir(transaction);
    const worktree = join(transaction, 'worktree');
    git(repository.path, 'worktree', 'add', '--detach', worktree, repository.head);
    const record = { version: 1, checkout: repository.path, origin: repository.origin, branch: repository.branch, baseCommit: repository.head, worktree, plan: resolve(file) };
    privateJson(join(transaction, 'transaction.json'), record);
    // The original checkout stays untouched if commit or push fails.
    writeFileSync(join(worktree, 'bookmarks.json'), rawAfter, { mode: 0o600 });
    git(worktree, 'add', '--', 'bookmarks.json');
    git(worktree, '-c', 'user.name=Evergreen Agent', '-c', 'user.email=evergreen-agent@users.noreply.github.com', '-c', 'commit.gpgsign=false', 'commit', '-m', 'chore(bookmarks): apply requested Evergreen bookmark changes');
    const commit = git(worktree, 'rev-parse', 'HEAD');
    const changedFiles = git(worktree, 'diff-tree', '--no-commit-id', '--name-only', '-r', commit);
    if (changedFiles !== 'bookmarks.json' || git(worktree, 'rev-parse', 'HEAD^') !== repository.head) fail('Commit hooks changed the transaction beyond bookmarks.json. Refusing publication.');
    if (git(worktree, 'show', 'HEAD:bookmarks.json') !== rawAfter.trim()) fail('Git filters or hooks changed the committed container. Refusing publication.');
    clean(worktree);
    // Never force-push. Remote browser writes since the plan cause a non-fast-forward rejection.
    git(worktree, 'push', '--no-follow-tags', 'origin', `HEAD:refs/heads/${repository.branch}`);
    privateJson(join(transaction, 'published.json'), { commit, publishedAt: new Date().toISOString() });
    let warning;
    try { openRepository({ ...options, repoPath: saved.checkout }); } catch { warning = 'Published, but the local checkout could not refresh. Preserve local changes and run ensure later.'; }
    git(repository.path, 'worktree', 'remove', worktree);
    return { published: true, commit, receipt: join(transaction, 'published.json'), ...result.report, ...(warning ? { warning } : {}) };
  } catch (error) {
    if (transaction) error.message += ` Transaction retained at ${transaction}. Check published.json and remote history before retrying; regenerate a plan after any remote change.`;
    throw error;
  } finally { rmdirSync(lock); }
}
