export const link = (title, url = `https://example.org/${title}`) => ({ type: 'bookmark', title, url });
export const folder = (title, ...children) => ({ type: 'folder', title, children });
export function container(bar = [], other = []) {
  return { version: 1, lastModified: '2026-01-01T00:00:00.000Z', lastModifiedBy: { instanceId: 'test', displayName: 'Synthetic', browser: 'chrome', profile: '' },
    providers: { bookmarks: { enabled: true, lastSynced: '2026-01-01T00:00:00.000Z', data: { bookmarksBar: bar, otherBookmarks: other } } } };
}
