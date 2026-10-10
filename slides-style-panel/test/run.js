// Run: node test/run.js   (no dependencies)
const assert = require('assert');
const { loadPure } = require('./load');
const { pres } = require('./fixtures');

const c = loadPure();
let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

// ---------- Rules ----------
t('scale: 10 in page is 1, 13.33 in page is 1.333', () => {
  assert.strictEqual(c.scaleForPageWidth_(9144000), 1);
  assert.ok(Math.abs(c.scaleForPageWidth_(12192000) - 1.3333) < 0.001);
});
t('classify: palette colors are core, yellow is off + yellowish, green is restricted', () => {
  assert.strictEqual(c.classifyColor_('#293a49').kind, 'core');
  assert.strictEqual(c.classifyColor_('#08A6ED').kind, 'core');           // old azure typo still close
  assert.strictEqual(c.classifyColor_('#FFFF00').kind, 'off');
  assert.ok(c.classifyColor_('#FFFF00').yellow);
  assert.ok(!c.classifyColor_('#E2672A').yellow);
  assert.strictEqual(c.classifyColor_('#0B7C58').kind, 'restricted');
  assert.strictEqual(c.classifyColor_('#6B7E8F').kind, 'off');            // mid gray flagged in the v1 notes
});
t('sentence case: the examples from the review', () => {
  assert.strictEqual(c.sentenceCase_('Magnet Mount VS Suction Cup Mount'), 'Magnet mount vs suction cup mount');
  assert.strictEqual(c.sentenceCase_('Calendar 15″ VS 13″'), 'Calendar 15″ vs 13″');
  assert.strictEqual(c.sentenceCase_('Concept 1: CAD Mock Up Comparison'), 'Concept 1: CAD mock up comparison');
  assert.strictEqual(c.sentenceCase_('Cable Routing Concept Comparison'), 'Cable routing concept comparison');
  assert.strictEqual(c.sentenceCase_('Review With PTS3 And EE'), 'Review with PTS3 and EE');
  assert.strictEqual(c.sentenceCase_('Skylight Frame Design', ['Skylight']), 'Skylight frame design');
  const s = 'Concept Comparison For BOM';
  assert.strictEqual(c.sentenceCase_(s).length, s.length);
});
t('sentence case: all-caps title loses the shouting but keeps known acronyms', () => {
  assert.strictEqual(c.sentenceCase_('CAD MOCK UP REVIEW'), 'CAD mock up review');
});
t('title-case detector: flags Title Case and VS, not sentence case', () => {
  assert.ok(c.looksTitleCase_('Magnet Mount VS Suction Cup Mount'));
  assert.ok(c.looksTitleCase_('Cable Routing Concept Comparison'));
  assert.ok(!c.looksTitleCase_('Magnet mount beats suction cup on every criterion'));
  assert.ok(!c.looksTitleCase_('Next steps'));
});
t('double spaces: only the extra spaces are reported', () => {
  assert.strictEqual(JSON.stringify(c.findDoubleSpaces_('Spanner  Confidential')), JSON.stringify([{ start: 8, len: 1 }]));
  assert.strictEqual(c.findDoubleSpaces_('one space only').length, 0);
});
t('dates: US numeric and long form normalise to ISO', () => {
  assert.strictEqual(c.normalizeDate_('09 10 2026').iso, '2026-09-10');
  assert.strictEqual(c.normalizeDate_('February 20 2026').iso, '2026-02-20');
  assert.strictEqual(c.normalizeDate_('2026-02-20').found, null);
});
t('file names: ampersand and spaces get a suggestion, a good name gets none', () => {
  assert.strictEqual(c.suggestFileName_('260304-Spanner-Skylight-H&H-Frame-Design-Kick-Off'), '260304-Spanner-Skylight-HH-Frame-Design-Kick-Off');
  assert.strictEqual(c.suggestFileName_('260910-Spanner-Skylight-Fridge-Mount-Feasibility-Wk2-3'), null);
  assert.ok(!/[ &]/.test(c.suggestFileName_('Week 2 & 3 update')));
});
t('accent methods: color+bold+italic+link is four, plain is none', () => {
  const m = c.accentMethods_([
    { len: 10, color: '#06A6ED', bold: true }, { len: 5, color: '#E2672A', italic: true, link: true }, { len: 30, color: 'inherit' }]);
  assert.ok(m.length >= 3);
  assert.strictEqual(c.accentMethods_([{ len: 20, color: 'inherit' }]).length, 0);
});
t('bbox: translate, scale and 90 degree shear', () => {
  const IN = 914400;
  const b = c.bboxFromElement_({ size: { width: { magnitude: 2 * IN, unit: 'EMU' }, height: { magnitude: 1 * IN, unit: 'EMU' } },
    transform: { scaleX: 1, scaleY: 1, translateX: IN, translateY: IN, unit: 'EMU' } });
  assert.strictEqual([b.left, b.top, b.right, b.bottom].join(), [IN, IN, 3 * IN, 2 * IN].join());
  const r = c.bboxFromElement_({ size: { width: { magnitude: 2 * IN, unit: 'EMU' }, height: { magnitude: 1 * IN, unit: 'EMU' } },
    transform: { scaleX: 0, scaleY: 0, shearX: -1, shearY: 1, translateX: 0, translateY: 0, unit: 'EMU' } });
  assert.strictEqual(Math.round(r.bottom - r.top), 2 * IN);
});

// ---------- Analyze ----------
const findings = c.analyzePresentation_(pres, {});
const byRule = (rule) => findings.filter((f) => f.rule === rule);

t('analyze: title-case on slide 2 only, with a fix', () => {
  const f = byRule('title-case');
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].slide, 2);
  assert.strictEqual(f[0].fix.type, 'sentenceCase');
  assert.strictEqual(f[0].fix.runs[0].text, 'Magnet mount vs suction cup mount');
});
t('analyze: small body text and table text are flagged with raise-to-floor fixes', () => {
  const f = byRule('text-size');
  assert.ok(f.some((x) => x.objectId === 'body2' && x.fix.items[0].size === 14));
  assert.ok(f.some((x) => x.objectId === 'tbl'));
  assert.ok(f.every((x) => x.severity === 'error' || x.severity === 'warn'));
  assert.ok(f.filter((x) => x.objectId === 'body2')[0].severity === 'error'); // 9pt < 12pt label floor
});
t('analyze: yellow table cell is flagged and fixable, and the fix is marked safe', () => {
  const f = byRule('palette').filter((x) => x.fix);
  assert.strictEqual(f.length, 1);
  assert.ok(f[0].safe);
  assert.strictEqual(f[0].fix.type, 'recolorYellow');
  assert.strictEqual(JSON.stringify(f[0].fix.targets[0].cell), JSON.stringify({ r: 0, c: 1 }));
});
t('analyze: off-palette gray fill is reported without a fix', () => {
  assert.ok(byRule('palette').some((x) => x.slide === 3 && !x.fix && /#6B7E8F/.test(x.message)));
});
t('analyze: double space, serif font, stacked emphasis, autofit shrink', () => {
  assert.ok(byRule('double-space').some((x) => x.objectId === 'body2' && x.safe));
  assert.ok(byRule('font').some((x) => /Times/.test(x.message)));
  assert.ok(byRule('accent-methods').length >= 1);
  assert.ok(byRule('autofit-shrink').some((x) => /60%/.test(x.message)));
});
t('analyze: images on the footer and on the title bar', () => {
  assert.ok(byRule('image-footer').some((x) => x.objectId === 'img_footer'));
  assert.ok(byRule('image-title-bar').some((x) => x.objectId === 'img_bar'));
});
t('analyze: blank slide 4 flagged, End slide 5 and skipped slide 6 are not', () => {
  const f = byRule('blank-slide');
  assert.strictEqual(JSON.stringify(f.map((x) => x.slide)), '[4]');
});
t('analyze: deck-level findings (hidden slide, file name, date, end tagline)', () => {
  assert.strictEqual(byRule('hidden-slides').length, 1);
  assert.strictEqual(byRule('file-name').length, 1);
  assert.strictEqual(byRule('date-format')[0].slide, 1);
  const tag = byRule('end-tagline');
  assert.strictEqual(tag.length, 1);
  assert.strictEqual(tag[0].slide, 5);
  assert.strictEqual(tag[0].fix.layoutId, 'L_end');
});
t('analyze: tagline present on the layout clears the finding', () => {
  const copy = JSON.parse(JSON.stringify(pres));
  copy.layouts[1].pageElements = [{ objectId: 'tag', size: pres.layouts[0].pageElements[1].size, transform: pres.layouts[0].pageElements[1].transform,
    shape: { shapeType: 'TEXT_BOX', text: { textElements: [{ startIndex: 0, endIndex: 13, textRun: { content: "what's next.\n", style: {} } }] } } }];
  assert.strictEqual(c.analyzePresentation_(copy, {}).filter((f) => f.rule === 'end-tagline').length, 0);
});
t('analyze: a 13.33 in deck scales the floors (11.0 pt text passes at 1.0 but fails at 1.33)', () => {
  const wide = JSON.parse(JSON.stringify(pres));
  wide.pageSize.width.magnitude = 12192000; wide.pageSize.height.magnitude = 6858000;
  const f = c.analyzePresentation_(wide, {}).filter((x) => x.rule === 'text-size' && x.objectId === 'tbl');
  assert.ok(f.length && f[0].fix.items[0].size > 14);
});
t('analyze: a clean deck has no findings above info', () => {
  const clean = { title: '261001-Spanner-Acme-Widget-Wk1', pageSize: pres.pageSize, masters: [{ objectId: 'm1' }],
    layouts: [{ objectId: 'L', layoutProperties: { displayName: 'Content', masterObjectId: 'm1' }, pageElements: [] }],
    slides: [{ objectId: 'a', slideProperties: { layoutObjectId: 'L' }, pageElements: [
      { objectId: 'x', size: pres.slides[0].pageElements[0].size, transform: pres.slides[0].pageElements[0].transform,
        shape: { shapeType: 'TEXT_BOX', text: { textElements: [{ endIndex: 0, paragraphMarker: {} },
          { startIndex: 0, endIndex: 10, textRun: { content: 'Magnet fit\n', style: { fontSize: { magnitude: 18, unit: 'PT' }, fontFamily: 'Inter' } } }] } } }] }] };
  const f = c.analyzePresentation_(clean, {}).filter((x) => x.severity !== 'info');
  assert.strictEqual(JSON.stringify(f.map((x) => x.rule)), '[]');
});

// ---------- Fixes ----------
t('fixes: bumpSize builds updateTextStyle with fixed range and cell location', () => {
  const f = byRule('text-size').filter((x) => x.objectId === 'tbl')[0].fix;
  const reqs = c.orderRequests_(c.buildFixRequests_(f));
  assert.strictEqual(reqs[0].updateTextStyle.fields, 'fontSize');
  assert.ok(reqs[0].updateTextStyle.cellLocation);
  assert.strictEqual(reqs[0].updateTextStyle.style.fontSize.magnitude, 12);
});
t('fixes: recolorYellow on a table cell fills light blue and sets navy bold text', () => {
  const f = byRule('palette').filter((x) => x.fix)[0].fix;
  const reqs = c.buildFixRequests_(f).map((x) => x.req);
  assert.ok(reqs[0].updateTableCellProperties);
  assert.ok(Math.abs(reqs[0].updateTableCellProperties.tableCellProperties.tableCellBackgroundFill.solidFill.color.rgbColor.red - 0xCA / 255) < 0.001);
  assert.ok(reqs[1].updateTextStyle.style.bold);
});
t('fixes: deleteText is ordered back to front per text, after style ops, before deleteObject', () => {
  const tagged = []
    .concat(c.buildFixRequests_({ type: 'deleteSlide', slideId: 's4' }))
    .concat(c.buildFixRequests_({ type: 'collapseSpaces', objectId: 'o', items: [{ start: 3, len: 1 }, { start: 20, len: 2 }] }))
    .concat(c.buildFixRequests_({ type: 'bumpSize', objectId: 'o', items: [{ start: 0, end: 5, size: 14 }] }));
  const reqs = c.orderRequests_(tagged);
  assert.ok(reqs[0].updateTextStyle);
  assert.strictEqual(reqs[1].deleteText.textRange.startIndex, 20);
  assert.strictEqual(reqs[2].deleteText.textRange.startIndex, 3);
  assert.ok(reqs[3].deleteObject);
});
t('fixes: sentenceCase replaces runs last to first', () => {
  const f = byRule('title-case')[0].fix;
  const reqs = c.buildFixRequests_(f).map((x) => x.req);
  assert.ok(reqs[0].deleteText && reqs[1].insertText);
  assert.strictEqual(reqs[1].insertText.text, 'Magnet mount vs suction cup mount');
});
t('fixes: end tagline is a text box on the layout with azure Inter text', () => {
  const f = byRule('end-tagline')[0].fix;
  const reqs = c.buildFixRequests_(f).map((x) => x.req);
  assert.strictEqual(reqs[0].createShape.elementProperties.pageObjectId, 'L_end');
  assert.strictEqual(reqs[1].insertText.text, "what's next.");
  assert.ok(/foregroundColor/.test(reqs[2].updateTextStyle.fields));
});
t('fixes: table style covers fill, six borders and per-cell text', () => {
  const reqs = c.buildTableStyleRequests_('tbl', 3, 2);
  assert.strictEqual(reqs.filter((r) => r.updateTableBorderProperties).length, 6);
  assert.strictEqual(reqs.filter((r) => r.updateTextStyle).length, 6);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
