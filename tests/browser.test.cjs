// Browser smoke tests: boots Home and the Lab in a real (headless) Chrome or Edge and checks the
// fallbacks. Run: npm ci --prefix tests && node --test tests/*.test.cjs
// Set CHROME_PATH to pick a browser; without one (or without puppeteer-core) these tests are skipped.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BOOT_MS = 120000;  // software WebGL in CI is slow

let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) {}

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const browserPath = CANDIDATES.find(p => p && fs.existsSync(p));
const skip = !puppeteer ? 'puppeteer-core not installed (npm ci --prefix tests)' : !browserPath ? 'no Chrome/Edge found (set CHROME_PATH)' : false;

// Tiny static server for the repo root. Module scripts need a JavaScript MIME type.
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.json': 'application/json', '.map': 'application/json'
};
function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

function launch(extra = []) {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', ...extra];
  if (process.env.CI) args.push('--no-sandbox');
  return puppeteer.launch({ executablePath: browserPath, headless: true, args });
}

// Records uncaught errors and failed requests to our own server. Third-party fonts/icons are ignored.
async function openPage(browser, base, { block } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const problems = [];
  page.on('pageerror', e => problems.push('page error: ' + e.message));
  page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', r => { if (r.url().startsWith(base) && !(block && block.test(r.url()))) problems.push('failed: ' + r.url()); });
  if (block) {
    await page.setRequestInterception(true);
    page.on('request', r => (block.test(r.url()) ? r.abort() : r.continue()));
  }
  return { page, problems };
}

test('browser smoke tests', { skip, timeout: 600000 }, async t => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await launch();

    await t.test('Home boots the live 3D studio', async () => {
      const { page, problems } = await openPage(browser, base);
      await page.goto(base + 'index.html', { waitUntil: 'load' });
      await page.waitForSelector('html.studio-ready', { timeout: BOOT_MS });
      assert.match(await page.$eval('.hero .eyebrow', el => el.innerText), /online/i);
      assert.deepStrictEqual(problems, []);
      await page.close();
    });

    await t.test('Lab opens the vehicle from the link', async () => {
      const { page, problems } = await openPage(browser, base);
      await page.goto(base + 'customize.html?model=vortex', { waitUntil: 'load' });
      await page.waitForSelector('#loader.hide', { timeout: BOOT_MS });
      assert.strictEqual(await page.$eval('#err', el => getComputedStyle(el).display), 'none');
      assert.strictEqual(await page.$eval('#modelNameDisplay', el => el.textContent.trim()), 'Apex Vortex');
      assert.deepStrictEqual(problems, []);
      await page.close();
    });

    await t.test('Lab shows an error instead of hanging when three.js is missing', async () => {
      const { page, problems } = await openPage(browser, base, { block: /\/lib\/three\// });
      await page.goto(base + 'customize.html', { waitUntil: 'load' });
      await page.waitForSelector('#loader.hide', { timeout: 30000 });
      assert.strictEqual(await page.$eval('#err', el => getComputedStyle(el).display), 'flex');
      assert.match(await page.$eval('#err', el => el.innerText), /3D studio unavailable/);
      assert.deepStrictEqual(problems, []);
      await page.close();
    });
  } finally {
    if (browser) await browser.close();
  }

  await t.test('Home without WebGL shows the poster and still follows the chosen model', async () => {
    const noGL = await launch(['--disable-webgl', '--disable-3d-apis']);
    try {
      const { page, problems } = await openPage(noGL, base);
      await page.goto(base + 'index.html', { waitUntil: 'load' });
      await page.waitForSelector('html.no3d.go', { timeout: 30000 });
      assert.ok(await page.$eval('.world-poster', img => img.complete && img.naturalWidth > 0), 'poster image loaded');
      assert.doesNotMatch(await page.$eval('.hero .eyebrow', el => el.innerText), /online/i);
      await page.$eval('[data-en-pick="vortex"]', b => b.click());
      await page.waitForFunction(() => document.querySelector('[data-hud="price"]').textContent === '$250,000', { timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('[data-hud="name"]').textContent === 'Apex Vortex', { timeout: 5000 });
      assert.strictEqual(await page.$eval('[data-hud="hp"]', el => el.textContent), '820');
      assert.deepStrictEqual(problems, []);
    } finally {
      await noGL.close();
    }
  });

  server.close();
});
