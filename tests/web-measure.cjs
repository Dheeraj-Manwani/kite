// What the task agent sees on web pages (docs/end-to-end-jobs.md §3.7, phase 0): Edge with a throwaway profile,
// read through the real task sidecar and formatSnapshot. Read-only: nothing is clicked or typed.
//   npm run measure:web                 the fake shop's pages, with assertions
//   npm run measure:web -- <url> [...]  other pages (real stores), report only
// Edge runs InPrivate with its own temporary --user-data-dir: a plain throwaway profile gets signed in to the user's
// Microsoft account and starts syncing their data, so InPrivate it is.
// Coordinates assume 100% display scaling.
require('./register.cjs');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { ActClient } = require('../src/main/agent/sidecar.ts');
const { formatSnapshot } = require('../src/shared/agent.ts');
const { startShop } = require('./fixtures/shop/server.cjs');

const edge = ['ProgramFiles(x86)', 'ProgramFiles'].map(v => process.env[v] && path.join(process.env[v], 'Microsoft', 'Edge', 'Application', 'msedge.exe')).find(p => p && fs.existsSync(p));
const delay = ms => new Promise(r => setTimeout(r, ms));
const urls = process.argv.slice(2).filter(a => /^https?:\/\//.test(a));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-web-measure-'));

function measure(label, snap, firstMs, secondMs, firstCount) {
  const doc = snap.elements.find(e => e.role === 'Document' && e.layer === snap.layers.find(l => l.main)?.layer);
  const inside = e => doc && e.rect.x >= doc.rect.x - 1 && e.rect.y >= doc.rect.y - 1 && e.rect.x + e.rect.width <= doc.rect.x + doc.rect.width + 1 && e.rect.y + e.rect.height <= doc.rect.y + doc.rect.height + 1;
  const page = snap.elements.filter(e => e !== doc && inside(e)), chrome = snap.elements.filter(e => e !== doc && !inside(e));
  const text = formatSnapshot(snap), shownRefs = new Set([...text.matchAll(/^\[(\d+)\]/gm)].map(m => Number(m[1])));
  const shownPage = page.filter(e => shownRefs.has(e.ref)), firstPageRef = page.length ? Math.min(...page.map(e => e.ref)) : null;
  const chromeBeforePage = firstPageRef === null ? chrome.length : chrome.filter(e => e.ref < firstPageRef).length;
  const add = page.filter(e => e.role === 'Button' && /^add to cart$/i.test(e.name.trim()));
  return { label, title: snap.window.title, firstMs: Math.round(firstMs), secondMs: Math.round(secondMs), firstCount, elements: snap.elements.length,
    chrome: chrome.length, chromeBeforePage, page: page.length, shownLines: shownRefs.size, shownPage: shownPage.length, chars: text.length,
    cut: /more controls not shown/.test(text), addToCart: add.length, addToCartShown: add.filter(e => shownRefs.has(e.ref)).length, text, snap };
}

(async () => {
  assert.ok(edge, 'Microsoft Edge is installed');
  let shop, browser, client;
  const results = [];
  try {
    shop = urls.length ? null : await startShop(0);
    const open = url => spawn(edge, [`--user-data-dir=${path.join(dir, 'profile')}`, '--inprivate', '--no-first-run', '--no-default-browser-check', '--disable-sync',
      '--disable-features=msEdgeSidebarV2,msUndersideButton,msShoppingTrigger,EdgeCollections', '--window-position=40,40', '--window-size=1400,980', url], { stdio: 'ignore', detached: false });
    client = new ActClient({ directory: path.join(dir, 'agent'), excludePid: process.pid, toDip: r => r });
    const pages = urls.length ? urls.map(u => ({ label: new URL(u).hostname + new URL(u).pathname.slice(0, 30), url: u }))
      : [{ label: 'home, pincode prompt', path: '/', title: 'Home' }, { label: 'search', path: '/search?q=whey+protein', title: 'Results for', reset: { pincode: '411045' } }, { label: 'product', path: '/p/sunfold-whey', title: 'Sunfold Whey Protein ·' },
        { label: 'cart', path: '/cart', title: 'Cart', before: s => fetch(`${s.url}/cart/add`, { method: 'POST', body: new URLSearchParams({ sku: 'sunfold-whey~60-sachets~unflavoured' }) }) },
        { label: 'login wall', path: '/login?next=/checkout', title: 'Sign in' }, { label: 'address form', path: '/checkout/address', title: 'Delivery address', reset: { pincode: '411045', signedIn: true }, cart: true },
        { label: 'payment', path: '/checkout/payment', title: 'Payment', cart: true, address: true }];
    let target = null;
    for (const p of pages) {
      if (shop) {
        if (p.reset) shop.reset(p.reset);
        if (p.before) await p.before(shop);
        if (p.cart && !shop.state().cart.length) await fetch(`${shop.url}/cart/add`, { method: 'POST', body: new URLSearchParams({ sku: 'sunfold-whey~60-sachets~unflavoured' }) });
        if (p.address) {
          await fetch(`${shop.url}/checkout/address`, { method: 'POST', body: new URLSearchParams({ name: 'Asha Rao', phone: '9876543210', pincode: '411045', line1: 'Flat 4B', line2: 'Baner Road', city: 'Pune', state: 'Maharashtra' }) });
          await fetch(`${shop.url}/checkout/delivery`, { method: 'POST', body: new URLSearchParams({ slot: 'standard' }) });
        }
      }
      const url = p.url ?? shop.url + p.path;
      const launched = open(url); browser ??= launched;
      // Find the window: the shop's title, or for other pages the throwaway browser's front window.
      let win;
      for (let i = 0; i < 80 && !win; i++) {
        await delay(250);
        const windows = (await client.windows()).filter(w => w.process === 'msedge');
        win = shop ? windows.find(w => w.title.includes(`${p.title}`) && w.title.includes('Kite Test Mart')) : windows.find(w => w.pid === browser.pid && (!target || w.hwnd === target.hwnd)) ?? windows.find(w => w.pid === browser.pid);
      }
      assert.ok(win, `Edge opened ${url}`);
      target = { hwnd: win.hwnd, pid: win.pid };
      await delay(urls.length ? 6000 : 1200);
      let started = performance.now(); const first = await client.snapshot(target); const firstMs = performance.now() - started;
      await delay(1500);
      started = performance.now(); const second = await client.snapshot(target); const secondMs = performance.now() - started;
      results.push(measure(p.label, second, firstMs, secondMs, first.elements.length));
    }
    console.log('\npage                          snapshot ms (1st/2nd)  elements (1st→2nd)  Edge UI (before page)  page  shown (page)  chars   cut  Add to cart shown');
    for (const r of results) console.log(`${r.label.padEnd(30)}${`${r.firstMs}/${r.secondMs}`.padEnd(23)}${`${r.firstCount}→${r.elements}`.padEnd(20)}${`${r.chrome} (${r.chromeBeforePage})`.padEnd(23)}${String(r.page).padEnd(6)}${`${r.shownLines} (${r.shownPage})`.padEnd(14)}${String(r.chars).padEnd(8)}${(r.cut ? 'yes' : 'no').padEnd(5)}${r.addToCart ? `${r.addToCartShown}/${r.addToCart}` : '-'}`);
    const out = path.join(os.tmpdir(), `kite-web-measure-${Date.now()}.json`);
    fs.writeFileSync(out, JSON.stringify(results.map(({ snap, ...r }) => ({ ...r, elementsList: snap.elements.map(e => `${e.ref} ${e.role} ${JSON.stringify(e.name)} ${Math.round(e.rect.y)}`) })), null, 2));
    console.log(`\nFull snapshots and model text: ${out}`);
    let footer = null;
    if (shop) {
      // find: the search page again, in a new tab; its footer is off-screen, and every background tab has the same footer.
      open(`${shop.url}/search?q=whey+protein&again=1`); await delay(2500);
      footer = await client.find(target, 'track your order');
      console.log(`find “track your order”: ${footer.elements.map(e => `${e.role} “${e.name}” at y ${Math.round(e.rect.y)}`).join('; ') || 'nothing'}`);
    }
    if (shop) {
      const byLabel = Object.fromEntries(results.map(r => [r.label, r]));
      // Every earlier page is still open in a background tab: only the visible tab's page may reach the model.
      for (const [i, r] of results.entries()) {
        const shopPages = r.snap.elements.filter(e => e.role === 'Document' && e.name.includes('Kite Test Mart'));
        assert.ok(shopPages.length <= 1, `${r.label}: one page, not the background tabs: ${shopPages.map(e => e.name).join(' | ')}`);
        // The first tab loaded before anything asked for accessibility (see "cold tab" in docs/end-to-end-jobs.md); later ones must show.
        assert.ok(shopPages[0]?.name.includes(pages[i].title), `${r.label}: the visible tab's page`);
      }
      // The first tab loaded before anything asked for accessibility: the sidecar re-selects it once, which builds its tree.
      assert.ok(results[0].page > 0, 'the first look at a cold tab sees its page');
      assert.equal(footer.elements.length, 1, 'find matches the visible tab only');
      assert.ok(footer.elements[0].rect.y > 1020, 'including controls scrolled out of view');
      assert.match(byLabel['home, pincode prompt'].text, /Pincode/, 'the pincode prompt is visible to the agent');
      assert.match(byLabel.search.text, /Search for products/);
      assert.ok(byLabel.search.addToCartShown >= 4, 'at least one row of product tiles reaches the model');
      assert.match(byLabel.product.text, /60 sachets/); assert.match(byLabel.product.text, /Add to cart/);
      assert.match(byLabel['login wall'].text, /Password[^\n]*\(password\)/, 'the password field is marked as one');
      assert.match(byLabel.payment.text, /Button “Continue”/);
      console.log('PASS the fake shop is visible to the task agent through Edge and the real sidecar.');
    }
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    client?.stop();
    if (browser?.pid) try { execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    await shop?.close();
    setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Edge may still hold its profile for a moment. */ } process.exit(process.exitCode || 0); }, 1500);
  }
})();
