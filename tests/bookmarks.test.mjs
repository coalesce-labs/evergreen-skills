import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContainer, transform, audit, context, rows, MAX_RAW_BYTES } from '../src/bookmarks.mjs';
import { container, folder, link } from './fixtures.mjs';
const edit = (value, ops) => transform(value, ops, '2026-02-01T00:00:00Z', 'synthetic-origin');

test('unknown numeric metadata is lossless or refused before an edit', () => {
  const raw = JSON.stringify(container([link('one')]));
  const withNumber = token => raw.replace('"version":1', `"version":1,"futureMetadata":{"number":${token}}`);
  for (const token of ['1e400', '9007199254740993', '1e-400', '0.1234567890123456789', '-0', '1e999999999999'])
    assert.throws(() => parseContainer(withNumber(token)), /Lossy JSON number/);
  for (const token of ['0', '1.00', '1e3', '-2.5e-2', '0.1', '9007199254740992', '1e-300', '0e999999999999']) {
    const input = parseContainer(withNumber(token));
    const output = edit(input, [{ op: 'rename', target: '/bookmarksBar/0', title: 'renamed' }]).container;
    assert.deepEqual(parseContainer(JSON.stringify(output)).futureMetadata, input.futureMetadata);
  }
});

test('merge unequal folders preserves union, target ordering and nested union', () => {
  const input = container([folder('AI Coding', link('a'), folder('Tools', link('x'))), folder('AI Coding', link('b'), link('a'), folder('Tools', link('y')))]);
  input.providers.future = { enabled: false, unknown: [1] }; input.extra = { untouched: true };
  const result = edit(input, [{ op: 'merge-folders', source: '/bookmarksBar/1', target: '/bookmarksBar/0' }]);
  assert.deepEqual(result.container.providers.bookmarks.data.bookmarksBar, [folder('AI Coding', link('a'), folder('Tools', link('x'), link('y')), link('b'))]);
  assert.deepEqual(result.container.extra, input.extra); assert.deepEqual(result.container.providers.future, input.providers.future);
  assert.equal(input.providers.bookmarks.data.bookmarksBar.length, 2); assert.equal(result.report.mergedFolders, 2);
  assert.equal(result.report.removedExactBookmarks, 1); assert.equal(result.container.lastModifiedBy.browser, 'agent');
});
test('same URL across topics or different titles stays; exact siblings dedupe only', () => {
  const input = container([folder('A', link('a'), link('a'), link('different', 'https://example.org/a')), folder('B', link('a'))]);
  assert.equal(audit(input).duplicateUrls[0].length, 4);
  const result = edit(input, [{ op: 'dedupe', parent: '/bookmarksBar', recursive: true }]);
  assert.equal(rows(result.container).filter(n => n.type === 'bookmark').length, 3);
});
test('extra folder metadata prevents destructive merging and different bookmark metadata remains', () => {
  const input = container([folder('A', link('a')), { ...folder('A', link('b')), future: 2 }]);
  assert.throws(() => edit(input, [{ op: 'merge-folders', source: '/bookmarksBar/1', target: '/bookmarksBar/0' }]), /metadata differ/);
  const result = edit(container([link('a'), { ...link('a'), future: 1 }]), [{ op: 'dedupe', parent: '/bookmarksBar' }]);
  assert.equal(result.changed, false);
});
test('no-change preserves timestamp; disabled edits refused', () => {
  const input = container([link('a')]);
  assert.equal(edit(input, [{ op: 'rename', target: '/bookmarksBar/0', title: 'a' }]).container, input);
  input.providers.bookmarks.enabled = false;
  assert.throws(() => edit(input, [{ op: 'dedupe', parent: '/bookmarksBar' }]), /disabled/);
});
test('move handles same-array post-removal index and disallows descendant cycles', () => {
  const input = container([link('a'), link('b'), folder('F', folder('G'))]);
  const result = edit(input, [{ op: 'move', target: '/bookmarksBar/0', parent: '/bookmarksBar', index: 2 }]);
  assert.deepEqual(result.container.providers.bookmarks.data.bookmarksBar.map(n => n.title), ['b', 'F', 'a']);
  assert.throws(() => edit(input, [{ op: 'move', target: '/bookmarksBar/2', parent: '/bookmarksBar/2/children/0/children' }]), /descendant/);
  assert.throws(() => edit(input, [{ op: 'merge-folders', source: '/bookmarksBar/2', target: '/bookmarksBar/2/children/0' }]), /ancestor/);
});
test('adding references supports folders but refuses credentials and executable schemes', () => {
  for (const url of ['javascript:alert(1)', 'https://name:secret@example.org', 'file:///etc/passwd'])
    assert.throws(() => edit(container(), [{ op: 'add', parent: '/bookmarksBar', node: link('x', url) }]), /HTTP/);
  assert.equal(edit(container(), [{ op: 'add', parent: '/bookmarksBar', node: folder('R', link('x')) }]).changed, true);
  assert.throws(() => edit(container(), [{ op: 'add', parent: '/bookmarksBar', node: { type: 'folder', title: 'x', children: [null] } }]), /Invalid bookmark/);
});
test('refuse duplicate keys, future version, impossible timestamp, input size and depth', () => {
  assert.throws(() => parseContainer('{"version":1,"version":1}'), /Duplicate/);
  assert.throws(() => parseContainer(JSON.stringify({ ...container(), version: 2 })), /version 1/);
  assert.throws(() => parseContainer(JSON.stringify({ ...container(), lastModified: '2026-02-31T00:00:00Z' })), /timestamp/);
  assert.throws(() => parseContainer(' '.repeat(MAX_RAW_BYTES + 1)), /3 MiB/);
  let deep = link('leaf'); for (let i = 0; i < 129; i++) deep = folder('F', deep);
  assert.throws(() => parseContainer(JSON.stringify(container([deep]))), /depth/);
  assert.throws(() => edit(container(), [{ op: 'add', parent: '/bookmarksBar', node: deep }]), /depth/);
});
test('context bounds and selection preserve provenance pointers', () => {
  const input = container([folder('Research', link('one'), link('two')), link('elsewhere')]);
  const result = context(input, { folder: '/bookmarksBar/0', limit: 1 });
  assert.equal(result.total, 2); assert.equal(result.omitted, 1); assert.equal(result.entries[0].id, '/bookmarksBar/0/children/0');
  assert.equal(context(input, { query: 'research' }).total, 2);
  assert.throws(() => context(input, { folder: '/bookmarksBar/1' }), /root or folder/);
  assert.throws(() => context(input, { limit: 0 }), /limit/);
});
