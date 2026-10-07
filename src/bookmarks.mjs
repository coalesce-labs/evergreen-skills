import { createHash } from 'node:crypto';

export const MAX_COMPACT_BYTES = 1572864;
export const MAX_RAW_BYTES = MAX_COMPACT_BYTES * 2;
export const digest = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

// Compare decimal values, not spelling: 1.00 and 1e0 are equivalent, rounded IDs are not.
function decimal(token) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) fail('Invalid JSON number.');
  const [, sign, integer, fraction = '', power = '0'] = match;
  const digits = `${integer}${fraction}`.replace(/^0+/, '');
  if (!digits) return `${sign}0`;
  const exponent = Number(power);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_RAW_BYTES + 400) fail('Lossy JSON number. Repair numeric metadata before editing.');
  const coefficient = digits.replace(/0+$/, '');
  return `${sign}${coefficient}e${exponent - fraction.length + digits.length - coefficient.length}`;
}

// Bound allocation before parsing, and reject duplicate object keys rather than silently dropping them.
export function parseContainer(raw) {
  if (Buffer.byteLength(raw) > MAX_RAW_BYTES) fail('Container exceeds the 3 MiB input limit.');
  const tokens = raw.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]|[^\s{}\[\],:]+/g) ?? [];
  if (tokens.length > 250000) fail('Container exceeds the JSON token limit.');
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^-?\d/.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value) || decimal(token) !== decimal(JSON.stringify(value))) fail('Lossy JSON number. Repair numeric metadata before editing.');
    }
    if (token === '{' || token === '[') {
      stack.push(token === '{' ? new Set() : null);
      if (stack.length > 512) fail('Container exceeds the JSON depth limit.');
    } else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ':' && stack.at(-1) instanceof Set) {
      const key = JSON.parse(token);
      if (stack.at(-1).has(key)) fail('Duplicate JSON object key. Repair the source before editing.');
      stack.at(-1).add(key);
    }
  }
  let container;
  try { container = JSON.parse(raw); } catch { fail('Invalid JSON in bookmarks.json.'); }
  validateContainer(container);
  return container;
}

function timestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, y, m, d, h, minute, second, oh = '0', om = '0'] = match;
  const year = Number(y), month = Number(m);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  // Refuse leap-second timestamps conservatively; do not normalize impossible dates.
  return Number(d) >= 1 && Number(d) <= days && Number(h) < 24 && Number(minute) < 60 && Number(second) < 60 && Number(oh) < 24 && Number(om) < 60;
}

export function validateContainer(container) {
  if (!object(container) || container.version !== 1) fail('Only Evergreen container version 1 is supported. Do not migrate or overwrite another generation.');
  if (!timestamp(container.lastModified)) fail('Invalid lastModified timestamp.');
  if (!object(container.lastModifiedBy) || ['instanceId', 'displayName', 'browser', 'profile'].some(key => typeof container.lastModifiedBy[key] !== 'string')) fail('Invalid lastModifiedBy identity.');
  const section = container.providers?.bookmarks;
  if (!object(section) || typeof section.enabled !== 'boolean' || !timestamp(section.lastSynced)) fail('Invalid bookmarks provider section.');
  const data = section.data;
  if (!object(data) || !Array.isArray(data.bookmarksBar) || !Array.isArray(data.otherBookmarks)) fail('Missing bookmark roots.');
  let nodes = 0;
  function walk(children, depth) {
    for (const node of children) {
      if (++nodes > 25000 || depth > 128) fail('Bookmark node or depth limit exceeded.');
      if (!object(node) || typeof node.title !== 'string') fail('Invalid bookmark node or title.');
      if (node.type === 'folder') {
        if (!Array.isArray(node.children) || Object.hasOwn(node, 'url')) fail('Invalid folder.');
        walk(node.children, depth + 1);
      } else if (node.type === 'bookmark') {
        if (typeof node.url !== 'string' || !node.url.trim() || Object.hasOwn(node, 'children')) fail('Invalid bookmark link.');
      } else fail('Unknown bookmark node type.');
    }
  }
  walk(data.bookmarksBar, 1); walk(data.otherBookmarks, 1);
  if (Buffer.byteLength(JSON.stringify(container)) > MAX_COMPACT_BYTES) fail('Container exceeds the frozen 1.5 MiB write limit.');
  return container;
}

export function rows(container) {
  const result = [];
  function walk(children, pointer, names) {
    children.forEach((node, i) => {
      const id = `${pointer}/${i}`;
      result.push({ id, type: node.type, title: node.title, ...(node.type === 'bookmark' ? { url: node.url } : { children: node.children.length }), path: [...names, node.title] });
      if (node.type === 'folder') walk(node.children, `${id}/children`, [...names, node.title]);
    });
  }
  for (const root of ['bookmarksBar', 'otherBookmarks']) walk(container.providers.bookmarks.data[root], `/${root}`, [root]);
  return result;
}

export function stats(container) {
  const list = rows(container);
  return { bookmarks: list.filter(node => node.type === 'bookmark').length, folders: list.filter(node => node.type === 'folder').length, compactBytes: Buffer.byteLength(JSON.stringify(container)) };
}

function segments(pointer) {
  if (typeof pointer !== 'string' || !/^\/(bookmarksBar|otherBookmarks)(\/\d+\/children)*(\/\d+)?$/.test(pointer)) fail('Use a node or children-array pointer from inspect, not a title or filesystem path.');
  return pointer.slice(1).split('/');
}
function resolve(data, pointer) {
  let value = data;
  for (const part of segments(pointer)) {
    if (Array.isArray(value)) {
      if (!/^(0|[1-9]\d*)$/.test(part) || Number(part) >= value.length) fail(`Pointer does not exist: ${pointer}`);
      value = value[Number(part)];
    } else {
      if (!object(value) || !Object.hasOwn(value, part)) fail(`Pointer does not exist: ${pointer}`);
      value = value[part];
    }
  }
  return value;
}
function children(data, pointer) {
  const value = resolve(data, pointer);
  if (!Array.isArray(value)) fail(`Expected a children-array pointer: ${pointer}`);
  return value;
}
function location(data, pointer) {
  const parts = segments(pointer);
  const index = parts.pop();
  if (!/^(0|[1-9]\d*)$/.test(index)) fail('Expected a node pointer.');
  const parent = children(data, `/${parts.join('/')}`);
  const node = parent[Number(index)];
  if (!node) fail(`Node does not exist: ${pointer}`);
  return { parent, index: Number(index), node };
}
function metadata(node) {
  return Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'children'));
}

// Exact siblings only. Keep the first order and append unseen children from later copies.
function union(childrenList, report, recursive = true) {
  const out = [];
  const seen = new Map();
  for (const node of childrenList) {
    if (node.type === 'folder' && recursive) node.children = union(node.children, report, true);
    const key = JSON.stringify(stable(node.type === 'folder' ? metadata(node) : node));
    const existing = seen.get(key);
    if (!existing) { out.push(node); seen.set(key, node); }
    else if (node.type === 'folder') {
      existing.children = union([...existing.children, ...node.children], report, recursive);
      report.mergedFolders++;
    } else report.removedExactBookmarks++;
  }
  return out;
}

export function audit(container) {
  const list = rows(container);
  const urls = new Map(), siblings = new Map();
  for (const node of list) {
    if (node.type === 'bookmark') {
      const group = urls.get(node.url) ?? []; group.push(node); urls.set(node.url, group);
    } else {
      const key = JSON.stringify([node.id.slice(0, node.id.lastIndexOf('/')), node.title]);
      const group = siblings.get(key) ?? []; group.push(node); siblings.set(key, group);
    }
  }
  return { ...stats(container), duplicateUrls: [...urls.values()].filter(group => group.length > 1), duplicateSiblingFolders: [...siblings.values()].filter(group => group.length > 1), policy: 'URL matches are findings, not permission to delete cross-folder references or differently titled links.' };
}

export function transform(container, operations, modifiedAt, origin) {
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > 1000) fail('Supply 1 to 1000 operations.');
  if (!container.providers.bookmarks.enabled) fail('Bookmarks provider is disabled. Enable it in Evergreen before editing.');
  const next = structuredClone(container), data = next.providers.bookmarks.data;
  const report = { mergedFolders: 0, removedExactBookmarks: 0 };
  for (const op of operations) {
    if (!object(op)) fail('Invalid operation.');
    if (op.op === 'add') {
      if (!object(op.node)) fail('Add requires a bookmark or folder node.');
      const node = structuredClone(op.node);
      // New links must be navigable web references, never executable bookmarklets.
      function validateNew(value) {
        if (value.type === 'bookmark') {
          let url; try { url = new URL(value.url); } catch { fail('New bookmarks require a valid HTTP(S) URL.'); }
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('New bookmarks require HTTP(S) without embedded credentials.');
        } else if (value.type === 'folder' && Array.isArray(value.children)) value.children.forEach(validateNew);
      }
      const target = children(data, op.parent);
      const index = op.index ?? target.length;
      if (!Number.isInteger(index) || index < 0 || index > target.length) fail('Invalid insertion index.');
      target.splice(index, 0, node);
      validateContainer(next);
      validateNew(node);
    } else if (op.op === 'rename') {
      if (typeof op.title !== 'string' || !op.title.trim()) fail('Rename requires a non-empty title.');
      location(data, op.target).node.title = op.title;
    } else if (op.op === 'move') {
      if (op.parent === op.target || op.parent.startsWith(`${op.target}/`)) fail('Cannot move a folder into itself or a descendant.');
      const source = location(data, op.target), target = children(data, op.parent);
      source.parent.splice(source.index, 1);
      const index = op.index ?? target.length;
      if (!Number.isInteger(index) || index < 0 || index > target.length) fail('Invalid destination index after removal.');
      target.splice(index, 0, source.node);
    } else if (op.op === 'merge-folders') {
      const source = location(data, op.source), target = location(data, op.target);
      if (source.node === target.node || source.node.type !== 'folder' || target.node.type !== 'folder') fail('Select two different folders.');
      if (op.source.startsWith(`${op.target}/`) || op.target.startsWith(`${op.source}/`)) fail('Cannot merge ancestor and descendant folders.');
      if (!same(metadata(source.node), metadata(target.node))) fail('Folder titles or additional metadata differ. Rename explicitly first or retain both folders.');
      target.node.children = union([...target.node.children, ...source.node.children], report);
      source.parent.splice(source.index, 1); report.mergedFolders++;
    } else if (op.op === 'dedupe') {
      const target = children(data, op.parent);
      const result = union(target, report, op.recursive === true);
      target.splice(0, target.length, ...result);
    } else fail(`Unknown operation: ${op.op}. Supported: add, rename, move, merge-folders, dedupe.`);
    validateContainer(next);
  }
  if (same(container.providers.bookmarks.data, data)) return { container, changed: false, report };
  if (!timestamp(modifiedAt)) fail('Invalid plan timestamp.');
  next.lastModified = modifiedAt;
  next.lastModifiedBy = { ...next.lastModifiedBy, instanceId: `evergreen-agent:${digest(origin).slice(0, 24)}`, displayName: 'Evergreen agent', browser: 'agent', profile: '' };
  next.providers.bookmarks.lastSynced = modifiedAt;
  validateContainer(next);
  return { container: next, changed: true, report };
}

export function context(container, { folder, query = '', limit = 200 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) fail('Context limit must be 1 to 1000.');
  if (folder) {
    const node = resolve(container.providers.bookmarks.data, folder);
    if (!Array.isArray(node) && node?.type !== 'folder') fail('Context selection must be a root or folder.');
  }
  const matched = rows(container).filter(node => node.type === 'bookmark' && (!folder || node.id.startsWith(`${folder}/`)) && (!query || `${node.path.join(' / ')} ${node.url}`.toLowerCase().includes(query.toLowerCase())));
  return { total: matched.length, omitted: Math.max(0, matched.length - limit), entries: matched.slice(0, limit) };
}
