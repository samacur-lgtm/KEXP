// =====================================================================
// SPANNER STYLE PANEL - Rules.gs
// Pure helpers for the house rules. No Apps Script services are used here,
// so test/rules.test.js can load this file as-is under Node.
// Source of the rules: Alyssa slide review (2026-10-09) + program-system
// proposal section 6 (presentation methods).
// =====================================================================

var EMU_PER_PT = 12700;
var EMU_PER_IN = 914400;
var BASE_PAGE_WIDTH_EMU = 9144000;   // Spanner master page: 10 in x 5.625 in
var BODY_FLOOR_PT = 14;              // body text floor on the 10 in page
var LABEL_FLOOR_PT = 12;             // label / caption floor on the 10 in page
var COLOR_TOLERANCE = 30;            // RGB distance that still counts as a palette color

var CORE_PALETTE = [
  { hex: '#293A49', name: 'Navy' },
  { hex: '#06A6ED', name: 'Azure' },
  { hex: '#E2672A', name: 'Orange' },
  { hex: '#CAECF6', name: 'Light blue' },
  { hex: '#D4D8DB', name: 'Light gray' },
  { hex: '#FFFFFF', name: 'White' }
];
var RESTRICTED_GREEN = '#0B7C58';    // sustainability content only

// Two-letter discipline codes and common program acronyms that keep their case.
var SPANNER_ACRONYMS = {
  ID: 1, ME: 1, EE: 1, FW: 1, SW: 1, UI: 1, UX: 1, QA: 1, QC: 1, PM: 1, TPL: 1,
  CAD: 1, PCB: 1, BOM: 1, EVT: 1, DVT: 1, PVT: 1, PRD: 1, MRD: 1, PRS: 1, ERD: 1,
  DFM: 1, DFA: 1, FAI: 1, EIL: 1, COGS: 1, MCO: 1, CMF: 1, CM: 1, POR: 1, DRI: 1,
  RFQ: 1, NRE: 1, MBU: 1, PDM: 1, FEA: 1, SBD: 1, FSD: 1, PSD: 1, USB: 1, LED: 1
};

// ---------- units and page ----------

function unitToEmu_(unit) {
  return unit === 'PT' ? EMU_PER_PT : 1;
}

function dimToEmu_(dim) {
  if (!dim || typeof dim.magnitude !== 'number') return 0;
  return dim.magnitude * unitToEmu_(dim.unit);
}

// Scale of this deck's page relative to the 10 in Spanner master.
function scaleForPageWidth_(widthEmu) {
  if (!widthEmu || widthEmu <= 0) return 1;
  var s = widthEmu / BASE_PAGE_WIDTH_EMU;
  return Math.max(0.5, Math.min(3, s));
}

// ---------- color ----------

function normalizeHex_(hex) {
  if (!hex) return '';
  hex = String(hex).trim().toUpperCase();
  return hex.charAt(0) === '#' ? hex : '#' + hex;
}

function hexToRgb_(hex) {
  hex = normalizeHex_(hex);
  if (!/^#[0-9A-F]{6}$/.test(hex)) return null;
  return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
}

// Slides API RgbColor has channels as 0..1 fractions; a missing channel is 0.
function rgbFractionToHex_(c) {
  if (!c) return '#000000';
  function ch(v) {
    var n = Math.round((v || 0) * 255);
    var s = Math.max(0, Math.min(255, n)).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }
  return '#' + ch(c.red) + ch(c.green) + ch(c.blue);
}

function hexToRgbFraction_(hex) {
  var rgb = hexToRgb_(hex) || [0, 0, 0];
  return { red: rgb[0] / 255, green: rgb[1] / 255, blue: rgb[2] / 255 };
}

function colorDistance_(a, b) {
  var x = hexToRgb_(a), y = hexToRgb_(b);
  if (!x || !y) return 999;
  var dr = x[0] - y[0], dg = x[1] - y[1], db = x[2] - y[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Hue 35-70 deg, saturated, light: the highlighter yellows found in the 2026 decks.
function isYellowish_(hex) {
  var rgb = hexToRgb_(hex);
  if (!rgb) return false;
  var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var l = (max + min) / 2, d = max - min;
  if (d === 0) return false;
  var s = d / (1 - Math.abs(2 * l - 1));
  var h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = h * 60;
  if (h < 0) h += 360;
  return h >= 35 && h <= 70 && s >= 0.5 && l >= 0.5;
}

// kind: 'core' | 'restricted' | 'off'
function classifyColor_(hex) {
  hex = normalizeHex_(hex);
  var best = null;
  CORE_PALETTE.forEach(function (p) {
    var d = colorDistance_(hex, p.hex);
    if (!best || d < best.dist) best = { hex: p.hex, name: p.name, dist: d };
  });
  var out = { hex: hex, nearest: best, kind: 'off', yellow: isYellowish_(hex) };
  if (best && best.dist <= COLOR_TOLERANCE) out.kind = 'core';
  else if (colorDistance_(hex, RESTRICTED_GREEN) <= COLOR_TOLERANCE) out.kind = 'restricted';
  return out;
}

// ---------- text ----------

function isAcronym_(word) {
  if (SPANNER_ACRONYMS[word.toUpperCase()] && word === word.toUpperCase()) return true;
  // all-caps, 3-6 letters, e.g. "NTE", "SDK"
  return /^[A-Z]{3,6}$/.test(word);
}

// Lower-cases a title to sentence case without touching acronyms, words with
// digits or internal capitals, or words in `protectedWords`. Same length out as in.
function sentenceCase_(text, protectedWords) {
  var prot = {};
  (protectedWords || []).forEach(function (w) { prot[String(w).toLowerCase()] = 1; });
  var allCaps = text === text.toUpperCase() && /[A-Z]/.test(text);
  var parts = String(text).split(/(\s+)/);
  var startOfSentence = true;
  var out = parts.map(function (tok) {
    if (/^\s*$/.test(tok)) return tok;
    var m = /^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/.exec(tok);
    var pre = m[1], core = m[2], post = m[3];
    var res;
    if (!core) {
      res = tok;
    } else if (/^vs\.?$/i.test(core)) {
      res = 'vs' + (core.slice(2) || '');
    } else if (prot[core.toLowerCase()] || /[0-9]/.test(core) || /[a-z][A-Z]/.test(core)) {
      res = core;
    } else if (core === 'I') {
      res = core;
    } else if (isAcronym_(core) && !(allCaps && core.length > 3 && !SPANNER_ACRONYMS[core])) {
      res = core;
    } else {
      res = core.toLowerCase();
      if (startOfSentence) res = res.charAt(0).toUpperCase() + res.slice(1);
    }
    var full = pre + res + post;
    startOfSentence = /[:.?!]$/.test(tok);
    // hyphenated compounds: leave the rest of the word as lowered above
    return full;
  });
  return out.join('');
}

// True when a title looks Title Case (or has a shouting "VS").
function looksTitleCase_(text) {
  text = String(text || '').trim();
  if (!text) return false;
  if (/\bVS\b/.test(text)) return true;
  var words = text.split(/\s+/).filter(function (w) { return /[A-Za-z]/.test(w); });
  if (words.length < 3) return false;
  var cands = 0, caps = 0;
  words.slice(1).forEach(function (w) {
    var core = w.replace(/[^A-Za-z]/g, '');
    if (core.length < 4) return;
    if (core === core.toUpperCase()) return;           // acronyms / shouting handled elsewhere
    if (/[a-z][A-Z]/.test(core)) return;                // SolidWorks, iPhone
    cands++;
    if (/^[A-Z]/.test(core)) caps++;
  });
  return cands >= 2 && caps / cands >= 0.6;
}

// Ranges of the extra spaces in runs of 2+ spaces between words.
function findDoubleSpaces_(text) {
  var out = [], re = /(\S)( {2,})(?=\S)/g, m;
  text = String(text || '');
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index + 2, len: m[2].length - 1 });
  }
  return out;
}

// Returns {found, iso} for the first non-ISO date on a title slide.
function normalizeDate_(text) {
  text = String(text || '');
  var m = /\b(\d{2})[ \/.](\d{2})[ \/.](\d{4})\b/.exec(text);   // MM DD YYYY (US decks)
  if (m) return { found: m[0], iso: m[3] + '-' + m[1] + '-' + m[2] };
  var months = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
    august: 8, september: 9, october: 10, november: 11, december: 12 };
  m = /\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}),? (\d{4})\b/.exec(text);
  if (m) {
    var mo = months[m[1].toLowerCase()];
    return { found: m[0], iso: m[3] + '-' + (mo < 10 ? '0' : '') + mo + '-' + (m[2].length < 2 ? '0' : '') + m[2] };
  }
  return { found: null, iso: null };
}

// null when the name already follows YYMMDD-Spanner-Client-Topic with no spaces or &.
function suggestFileName_(title) {
  title = String(title || '').trim();
  if (!title) return null;
  if (/^\d{6}-Spanner-[A-Za-z0-9-]+$/.test(title)) return null;
  var s = title.replace(/(\w)&(\w)/g, '$1$2').replace(/\s*&\s*/g, '-').replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9\-_.]/g, '').replace(/-{2,}/g, '-');
  return s === title ? null : s;
}

// runs: [{len, color, bold, italic, underline, link}]. Returns the emphasis
// methods in use beyond the majority style: color, bold, italic, underline/link.
function accentMethods_(runs) {
  var tot = { color: {}, bold: { t: 0, f: 0 }, italic: { t: 0, f: 0 } };
  var methods = {};
  runs.forEach(function (r) {
    var n = r.len || 1;
    var c = r.color || 'inherit';
    tot.color[c] = (tot.color[c] || 0) + n;
    if (r.bold) tot.bold.t += n; else tot.bold.f += n;
    if (r.italic) tot.italic.t += n; else tot.italic.f += n;
    if (r.underline || r.link) methods.link = true;
  });
  var baseColor = Object.keys(tot.color).sort(function (a, b) { return tot.color[b] - tot.color[a]; })[0];
  if (Object.keys(tot.color).length > 1 && baseColor !== undefined) methods.color = true;
  if (tot.bold.t > 0 && tot.bold.f > 0) methods.bold = true;
  if (tot.italic.t > 0 && tot.italic.f > 0) methods.italic = true;
  return Object.keys(methods);
}

function isMonoFont_(name) {
  return /mono|courier|consolas|menlo/i.test(String(name || ''));
}

// ---------- geometry (EMU) ----------

// Axis-aligned bounding box of a page element, honouring its affine transform.
function bboxFromElement_(el) {
  if (!el || !el.size || !el.transform) return null;
  var t = el.transform;
  var u = unitToEmu_(t.unit);
  var w = dimToEmu_(el.size.width), h = dimToEmu_(el.size.height);
  var a = t.scaleX === undefined ? 1 : t.scaleX, d = t.scaleY === undefined ? 1 : t.scaleY;
  var b = t.shearY || 0, c = t.shearX || 0;
  var tx = (t.translateX || 0) * u, ty = (t.translateY || 0) * u;
  var xs = [], ys = [];
  [[0, 0], [w, 0], [0, h], [w, h]].forEach(function (p) {
    xs.push(a * p[0] + c * p[1] + tx);
    ys.push(b * p[0] + d * p[1] + ty);
  });
  return {
    left: Math.min.apply(null, xs), right: Math.max.apply(null, xs),
    top: Math.min.apply(null, ys), bottom: Math.max.apply(null, ys)
  };
}

function bboxArea_(b) {
  return Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
}
