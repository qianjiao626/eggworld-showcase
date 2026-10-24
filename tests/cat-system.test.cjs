const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/cat-system.js', 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(fetcher) {
  const body = { innerHTML: '' };
  const messages = [];
  const window = { USER: { registered: true }, toast: s => messages.push(s), confirm: () => true };
  const ctx = { window, document: { getElementById: id => id === 'catBody' ? body : null, querySelector: () => null },
    sessionStorage: { getItem: () => 'token' }, fetch: fetcher, console };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { window, body, messages };
}
const ok = data => Promise.resolve({ json: async () => ({ code: 200, data }) });
const room = id => ({ id, name: `Cat ${id}`, look: { body:1,ear:1,eye:1,tail:1,pattern:1,face:1 },
  votes: 0, adopts: 0, status: 2, isPublic: true });
test('market offers next page and appends it without losing the first page', async () => {
  const paths = [];
  const { window, body } = setup((path) => {
    paths.push(path);
    if (path.includes('/market?')) return ok(path.includes('page=2') ? [room(49)] : Array.from({length:48}, (_, i) => room(i+1)));
    return ok(3);
  });
  window.catTab('market'); await flush(); await flush();
  assert.match(body.innerHTML, /catLoadMore/);
  window.catLoadMore(); await flush(); await flush();
  assert.match(paths.join(' '), /page=2/);
  assert.match(body.innerHTML, /Cat 1/);
  assert.match(body.innerHTML, /Cat 49/);
});
test('network errors on save are reported rather than rejected silently', async () => {
  const { window, messages } = setup(() => Promise.reject(new Error('offline')));
  window.catName('Kitty'); window.catSave(); await flush(); await flush();
  assert.ok(messages.some(s => s.includes('网络异常')));
});
test('pending cat cannot be resubmitted from mine', async () => {
  const { window, body } = setup(path => path.includes('/mine') ? ok([{...room(1), status:1}]) : ok(3));
  window.catTab('mine'); await flush(); await flush();
  assert.doesNotMatch(body.innerHTML, /catSubmit\(1\)/);
});

test('my cat room shows the separate cat reputation score', async () => {
  const { window, body } = setup(path => path.includes('/reputation') ? ok(60) : ok([]));
  window.catTab('mine'); await flush(); await flush();
  assert.match(body.innerHTML, /60/);
  assert.match(body.innerHTML, /声望/);
});
