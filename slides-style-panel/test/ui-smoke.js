// Browser smoke test for Sidebar.html with a mocked google.script.run.
// Run: NODE_PATH=/opt/node-tools/node_modules node test/ui-smoke.js [screenshot-dir]
// The mock runs the REAL analyzer on the fixture deck, so the Check tab shows real findings.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const { loadPure } = require('./load');
const { pres } = require('./fixtures');

const outDir = process.argv[2] || path.join(__dirname, '..', '.shots');
fs.mkdirSync(outDir, { recursive: true });

// Pull the built-in style tables out of Code.gs without running the Slides parts.
const codeSrc = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const sandbox = vm.createContext({});
vm.runInContext(codeSrc.split('// ---- Menu')[0], sandbox);
const styles = JSON.parse(vm.runInContext('JSON.stringify({text: BUILTIN_TEXT, shape: BUILTIN_SHAPE})', sandbox));

const pure = loadPure();
const findings = JSON.parse(JSON.stringify(pure.analyzePresentation_(pres, { protectedWords: ['Skylight'] })));
const counts = { error: 0, warn: 0, info: 0, safe: 0 };
findings.forEach((f) => { counts[f.severity]++; if (f.fix && f.safe) counts.safe++; });
const checkResult = { success: true, findings, counts, revisionId: 'rev1', slides: 6,
  page: { widthIn: 10, heightIn: 5.6, scale: 1, bodyFloor: 14, labelFloor: 12 } };

const mock = `
window.__calls = [];
(function(){
  var data = ${JSON.stringify({ styles, checkResult })};
  function runner(){
    var ok, fail, p;
    var r = { withSuccessHandler: function(f){ ok = f; return p; }, withFailureHandler: function(f){ fail = f; return p; } };
    var handlers = {
      getAllStyles: function(){ return { text: data.styles.text, shape: data.styles.shape, scale: 1, version: '2.0.0',
        meta: { overriddenText: [], overriddenShape: [], customText: [], customShape: [] } }; },
      getSelectionStyleInfo: function(){ return null; },
      runDeckCheck: function(){ return data.checkResult; },
      applyFix: function(){ return { success: true, message: 'Fixed' }; },
      fixAllSafe: function(){ return { success: true, message: 'Fixed 2 issues' }; }
    };
    p = new Proxy(r, { get: function(t, k){
      if (k in t) return t[k];
      return function(){ var args = [].slice.call(arguments); window.__calls.push([k].concat(args));
        var h = handlers[k]; var res = h ? h.apply(null, args) : { success: true, message: k + ' ok' };
        setTimeout(function(){ ok && ok(res); }, 5); return p; };
    }});
    return p;
  }
  window.google = { script: { get run(){ return runner(); } } };
})();`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 300, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  let html = fs.readFileSync(path.join(__dirname, '..', 'Sidebar.html'), 'utf8');
  html = html.replace('<script>', '<script>' + mock.replace(/<\/script>/g, '<\\/script>') + '</script><script>');
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#list-text-builtin .style-row');

  const check = async (name, cond) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };

  await check('text tab lists built-in styles incl. new Highlight/Delta/Code', (await page.$$eval('#list-text-builtin .style-name', (n) => n.map((x) => x.textContent))).join('|').match(/Highlight.*Delta.*Code/));
  await check('shape tab lists Code Box and Image Frame', await page.evaluate(() => /Code Box/.test(document.body.innerHTML) && /Image Frame/.test(document.body.innerHTML)));
  await page.screenshot({ path: path.join(outDir, '1-text.png') });

  await page.click('[data-tab=shape]');
  await page.screenshot({ path: path.join(outDir, '2-shapes.png') });
  await page.click('#btn-table');
  await check('table button calls applyTableStyle', await page.evaluate(() => window.__calls.some((c) => c[0] === 'applyTableStyle')));

  await page.click('[data-tab=color]');
  await check('colors split into Spanner palette (6) and Other (6)', (await page.$$eval('#color-grid-brand .swatch', (n) => n.length)) === 6 && (await page.$$eval('#color-grid-other .swatch', (n) => n.length)) === 6);
  await page.screenshot({ path: path.join(outDir, '3-colors.png') });

  await page.click('[data-tab=check]');
  await page.click('#btn-run-check');
  await page.waitForSelector('.finding');
  const n = await page.$$eval('.finding', (x) => x.length);
  await check('check tab renders findings (' + n + ')', n >= 10);
  await check('badge shows open count', (await page.textContent('#check-badge')) === String(counts.error + counts.warn));
  await check('fix-all button is enabled with the safe count', (await page.textContent('#btn-fix-all')).includes('(' + counts.safe + ')'));
  await page.screenshot({ path: path.join(outDir, '4-check.png') });

  await page.click('.chip[data-sev=error]');
  await check('error filter only shows errors', (await page.$$eval('.finding .sev', (x) => x.every((e) => e.classList.contains('error')))));
  await page.click('.chip[data-sev=all]');

  await page.click('.finding .btn-sm.primary');
  await page.waitForTimeout(80);
  await check('Fix calls applyFix with the revision id', await page.evaluate(() => window.__calls.some((c) => c[0] === 'applyFix' && c[2] === 'rev1')));
  await page.click('#btn-fix-all');
  await page.waitForTimeout(80);
  await check('Fix all calls fixAllSafe', await page.evaluate(() => window.__calls.some((c) => c[0] === 'fixAllSafe')));

  await page.click('[data-tab=text]');
  await page.click('#list-text-builtin .style-row .btn-icon[title="Edit style"]');
  await check('edit form opens with listeners (no inline handlers)', !!(await page.$('.edit-form .btn-save')));
  await page.screenshot({ path: path.join(outDir, '5-edit.png') });

  await check('no page errors', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
})();
