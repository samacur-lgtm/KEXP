// =====================================================================
// SPANNER STYLE PANEL - Analyze.gs
// Pure deck analysis. Input is the JSON from Slides.Presentations.get;
// output is a list of findings. No Apps Script services are used, so
// test/analyze.test.js runs it under Node against fixtures.
//
// Finding: { id, rule, severity: 'error'|'warn'|'info', slide (1-based, 0 = deck),
//            slideId, objectId, message, detail, fix, fixLabel, safe }
// A fix is plain data; buildFixRequests_ (Fixes.gs) turns it into batchUpdate requests.
// =====================================================================

var FOOTER_PLACEHOLDERS = { FOOTER: 1, SLIDE_NUMBER: 1, DATE_TIME: 1, HEADER: 1 };
var TITLE_PLACEHOLDERS = { TITLE: 1, CENTERED_TITLE: 1 };
var FREE_LAYOUT_RE = /hero|full[- ]?bleed|cover|^title\b(?!.*\bbar\b)|title slide|\bend\b|closing|section|blank/i;
var END_LAYOUT_RE = /\bend\b|closing|thank/i;

function analyzePresentation_(pres, opts) {
  opts = opts || {};
  var findings = [];
  var pageW = dimToEmu_(pres.pageSize && pres.pageSize.width);
  var pageH = dimToEmu_(pres.pageSize && pres.pageSize.height);
  var scale = scaleForPageWidth_(pageW);
  var ctx = {
    pres: pres, pageW: pageW, pageH: pageH, scale: scale,
    bodyFloor: BODY_FLOOR_PT * scale, labelFloor: LABEL_FLOOR_PT * scale,
    layouts: indexById_(pres.layouts), masters: indexById_(pres.masters),
    zones: {}, findings: findings, protectedWords: opts.protectedWords || []
  };
  var slides = pres.slides || [];
  var lastIdx = slides.length - 1;

  slides.forEach(function (slide, i) {
    ctx.slideNo = i + 1;
    ctx.slide = slide;
    ctx.layout = ctx.layouts[slide.slideProperties && slide.slideProperties.layoutObjectId];
    ctx.layoutName = (ctx.layout && ctx.layout.layoutProperties && ctx.layout.layoutProperties.displayName) || '';
    ctx.isFirst = i === 0;
    ctx.isLast = i === lastIdx;
    ctx.skipped = !!(slide.slideProperties && slide.slideProperties.isSkipped);
    checkSlide_(ctx);
  });

  checkDeck_(ctx);

  var rank = { error: 0, warn: 1, info: 2 };
  findings.sort(function (a, b) {
    return (a.slide - b.slide) || (rank[a.severity] - rank[b.severity]);
  });
  return findings;
}

// ---------- per-slide checks ----------

function checkSlide_(ctx) {
  var slide = ctx.slide;
  var els = flattenElements_(slide.pageElements || []);
  var colorUses = {};          // key: hex|where -> {hex, where, targets[], count}
  var wordCount = 0, deepBullets = false, hasContent = false;
  var titleText = null;

  els.forEach(function (item) {
    var el = item.el;
    var containers = textContainersOf_(el);
    if (el.image || el.video || el.sheetsChart || el.table || el.wordArt || el.line) hasContent = true;

    containers.forEach(function (c) {
      if (c.text && plainText_(c.text).trim()) hasContent = true;
      if (c.placeholderType && FOOTER_PLACEHOLDERS[c.placeholderType]) return;
      analyzeText_(ctx, c, colorUses);
      var tx = plainText_(c.text);
      wordCount += tx.split(/\s+/).filter(Boolean).length;
      if (c.paraDepth >= 2) deepBullets = true;
      if (TITLE_PLACEHOLDERS[c.placeholderType] && titleText === null) titleText = { c: c, text: tx };
    });

    collectShapeColors_(ctx, el, colorUses);
    checkAutofit_(ctx, el);
    if (!item.inGroup && el.image) checkImageGeometry_(ctx, el);
  });

  emitColorFindings_(ctx, colorUses);

  // Title: sentence case, "vs" lower-case. Title and end slides hold names, so skip them.
  if (titleText && !ctx.isFirst && !ctx.isLast && !END_LAYOUT_RE.test(ctx.layoutName)) {
    var t = titleText.text;
    if (looksTitleCase_(t)) {
      var fixed = sentenceCase_(t, ctx.protectedWords);
      if (fixed !== t) {
        add_(ctx, {
          rule: 'title-case', severity: 'warn', objectId: titleText.c.objectId,
          message: 'Title is in Title Case. House style is sentence case, lower-case "vs".',
          detail: '"' + t + '" -> "' + fixed + '". Check names and program words before accepting.',
          fix: { type: 'sentenceCase', objectId: titleText.c.objectId, cell: titleText.c.cell,
            runs: casedRuns_(titleText.c, fixed) },
          fixLabel: 'Sentence case', safe: false
        });
      }
    }
  }

  if (wordCount > 140 || deepBullets) {
    add_(ctx, {
      rule: 'dense-slide', severity: 'warn',
      message: deepBullets ? 'Bullets nested three levels deep. Split the slide.'
        : 'Dense slide: about ' + wordCount + ' words. Split it, or move the detail to an appendix.',
      detail: 'One idea per slide. Put supporting math and detailed tables after Next steps.'
    });
  }

  if (!hasContent && !ctx.skipped && !END_LAYOUT_RE.test(ctx.layoutName)) {
    add_(ctx, {
      rule: 'blank-slide', severity: 'warn',
      message: 'Blank slide. It will show in exports unless it is deleted or marked skipped.',
      fix: { type: 'deleteSlide', slideId: slide.objectId }, fixLabel: 'Delete slide', safe: false
    });
  }
}

function analyzeText_(ctx, c, colorUses) {
  var runs = c.runs;
  if (!runs.length) return;
  var plain = plainText_(c.text);

  // 1. Size floors (explicit sizes only; inherited sizes come from the master).
  var items = [], minSize = 999, worst = 'warn', floorUsed = 0;
  runs.forEach(function (r) {
    if (!r.content.trim() || r.size === null) return;
    var bodyish = r.para.bullet || r.para.len >= 60;
    var need = bodyish ? ctx.bodyFloor : ctx.labelFloor;
    if (r.size < need - 0.01) {
      items.push({ start: r.start, end: r.end, size: round1_(need), cell: c.cell });
      if (r.size < minSize) { minSize = r.size; floorUsed = need; }
      if (r.size < ctx.labelFloor - 0.01) worst = 'error';
    }
  });
  if (items.length) {
    add_(ctx, {
      rule: 'text-size', severity: worst, objectId: c.objectId,
      message: 'Text as small as ' + round1_(minSize) + ' pt (floor ' + round1_(floorUsed) + ' pt) in ' + c.label + '.',
      detail: 'Floors: ' + round1_(ctx.bodyFloor) + ' pt body, ' + round1_(ctx.labelFloor) + ' pt labels on this page size. Raising sizes can overflow the box.',
      fix: { type: 'bumpSize', objectId: c.objectId, items: items }, fixLabel: 'Raise to floor', safe: false
    });
  }

  // 2. Fonts other than Inter (mono allowed for code).
  var fontItems = {}, fontNames = {};
  runs.forEach(function (r) {
    if (!r.content.trim() || !r.family) return;
    if (/^inter/i.test(r.family) || isMonoFont_(r.family)) return;
    fontNames[r.family] = 1;
    fontItems['k'] = fontItems['k'] || [];
    fontItems['k'].push({ start: r.start, end: r.end, cell: c.cell });
  });
  if (fontItems.k) {
    add_(ctx, {
      rule: 'font', severity: 'warn', objectId: c.objectId,
      message: 'Font ' + Object.keys(fontNames).join(', ') + ' in ' + c.label + '. House font is Inter.',
      fix: { type: 'setFont', objectId: c.objectId, family: 'Inter', items: fontItems.k },
      fixLabel: 'Set to Inter', safe: false
    });
  }

  // 3. Double spaces.
  var ds = findDoubleSpaces_(plain);
  if (ds.length) {
    add_(ctx, {
      rule: 'double-space', severity: 'info', objectId: c.objectId,
      message: 'Double space in ' + c.label + '.',
      fix: { type: 'collapseSpaces', objectId: c.objectId, cell: c.cell,
        items: ds.map(function (d) { return { start: d.start, len: d.len }; }) },
      fixLabel: 'Remove', safe: true
    });
  }

  // 4. More than one accent method inside one text box.
  if (plain.length >= 20) {
    var methods = accentMethods_(runs.filter(function (r) { return r.content.trim(); }).map(function (r) {
      return { len: r.content.length, color: r.fg, bold: r.bold, italic: r.italic, underline: r.underline, link: r.link };
    }));
    if (methods.length >= 3) {
      add_(ctx, {
        rule: 'accent-methods', severity: 'warn', objectId: c.objectId,
        message: 'Emphasis stacked in ' + c.label + ': ' + methods.join(', ') + '. Use one accent method per slide.',
        detail: 'Keep the color code. Drop the underlines, extra bold and italics.'
      });
    }
  }

  // 5. Repeated word ("strictly strictly").
  var rep = /\b([A-Za-z]{3,})\s+\1\b/i.exec(plain);
  if (rep) {
    add_(ctx, {
      rule: 'typo', severity: 'info', objectId: c.objectId,
      message: 'Repeated word "' + rep[1] + '" in ' + c.label + '.'
    });
  }

  // 6. Text colors and highlight.
  runs.forEach(function (r) {
    if (!r.content.trim()) return;
    if (r.fg) useColor_(colorUses, r.fg, 'text', { objectId: c.objectId, cell: c.cell });
    if (r.bg) useColor_(colorUses, r.bg, 'highlight', { objectId: c.objectId, cell: c.cell, start: r.start, end: r.end });
  });

  // 7. Table cell fill is read in collectShapeColors_.
}

function collectShapeColors_(ctx, el, colorUses) {
  if (el.shape && !(el.shape.placeholder && FOOTER_PLACEHOLDERS[el.shape.placeholder.type])) {
    var sp = el.shape.shapeProperties || {};
    var fill = solidHex_(sp.shapeBackgroundFill && sp.shapeBackgroundFill.solidFill);
    if (fill && sp.shapeBackgroundFill.propertyState !== 'NOT_RENDERED') {
      useColor_(colorUses, fill, 'fill', { objectId: el.objectId });
    }
    var ol = sp.outline;
    if (ol && ol.propertyState !== 'NOT_RENDERED') {
      var oh = solidHex_(ol.outlineFill && ol.outlineFill.solidFill);
      if (oh) useColor_(colorUses, oh, 'outline', { objectId: el.objectId });
    }
  }
  if (el.table) {
    (el.table.tableRows || []).forEach(function (row, r) {
      (row.tableCells || []).forEach(function (cell, cIdx) {
        var f = cell.tableCellProperties && cell.tableCellProperties.tableCellBackgroundFill;
        var hex = f && f.propertyState !== 'NOT_RENDERED' ? solidHex_(f.solidFill) : null;
        if (hex) useColor_(colorUses, hex, 'fill', { objectId: el.objectId, cell: { r: r, c: cIdx } });
      });
    });
  }
}

function checkAutofit_(ctx, el) {
  var af = el.shape && el.shape.shapeProperties && el.shape.shapeProperties.autofit;
  if (af && typeof af.fontScale === 'number' && af.fontScale < 0.85 &&
      !(el.shape.placeholder && FOOTER_PLACEHOLDERS[el.shape.placeholder.type])) {
    add_(ctx, {
      rule: 'autofit-shrink', severity: 'warn', objectId: el.objectId,
      message: 'Autofit has shrunk text to ' + Math.round(af.fontScale * 100) + '%. Cut the copy or split the slide.'
    });
  }
}

function checkImageGeometry_(ctx, el) {
  var b = bboxFromElement_(el);
  if (!b) return;
  var area = bboxArea_(b), pageArea = ctx.pageW * ctx.pageH;
  if (pageArea && area > pageArea * 0.85) return;            // background image
  var tol = 0.02 * EMU_PER_IN * ctx.scale;
  var hero = /hero|cover/i.test(ctx.layoutName);
  if (hero) return;
  if (b.left < -tol || b.top < -tol || b.right > ctx.pageW + tol || b.bottom > ctx.pageH + tol) {
    add_(ctx, { rule: 'image-off-slide', severity: 'warn', objectId: el.objectId,
      message: 'Image runs off the slide edge.', detail: 'Crop or straighten it inside the page.' });
    return;
  }
  if (FREE_LAYOUT_RE.test(ctx.layoutName)) return;
  var z = zonesFor_(ctx);
  if (z.footerTop !== null && b.bottom > z.footerTop + tol) {
    add_(ctx, { rule: 'image-footer', severity: 'warn', objectId: el.objectId,
      message: 'Image runs into the footer.', detail: 'Keep images inside the content area, about 0.4 in above the footer.' });
  } else if (z.barBottom !== null && b.top < z.barBottom - tol && b.bottom > z.barTop) {
    add_(ctx, { rule: 'image-title-bar', severity: 'warn', objectId: el.objectId,
      message: 'Image overlaps the title bar.', detail: 'Move it into the content area.' });
  }
}

// Footer top and dark title bar bounds, read from the slide's layout and master.
function zonesFor_(ctx) {
  var key = ctx.layout ? ctx.layout.objectId : '_';
  if (ctx.zones[key]) return ctx.zones[key];
  var z = { footerTop: null, barTop: null, barBottom: null };
  var master = ctx.layout && ctx.masters[ctx.layout.layoutProperties && ctx.layout.layoutProperties.masterObjectId];
  [ctx.layout, master].forEach(function (page) {
    (page && page.pageElements || []).forEach(function (el) {
      var b = bboxFromElement_(el);
      if (!b) return;
      var ph = el.shape && el.shape.placeholder && el.shape.placeholder.type;
      var txt = el.shape ? plainText_(el.shape.text) : '';
      var isFooter = FOOTER_PLACEHOLDERS[ph] || /confidential/i.test(txt) || (el.image && b.top > ctx.pageH * 0.82);
      if (isFooter) z.footerTop = z.footerTop === null ? b.top : Math.min(z.footerTop, b.top);
      var fill = el.shape && el.shape.shapeProperties && solidHex_(el.shape.shapeProperties.shapeBackgroundFill &&
        el.shape.shapeProperties.shapeBackgroundFill.solidFill);
      if (fill && colorDistance_(fill, '#293A49') <= COLOR_TOLERANCE &&
          (b.right - b.left) >= ctx.pageW * 0.6 && b.top <= ctx.pageH * 0.05 && z.barBottom === null) {
        z.barTop = b.top; z.barBottom = b.bottom;
      }
    });
  });
  ctx.zones[key] = z;
  return z;
}

// ---------- colors ----------

function useColor_(uses, hex, where, target) {
  hex = normalizeHex_(hex);
  var key = hex + '|' + where;
  if (!uses[key]) uses[key] = { hex: hex, where: where, targets: [], count: 0 };
  uses[key].count++;
  if (uses[key].targets.length < 200) uses[key].targets.push(target);
}

function emitColorFindings_(ctx, uses) {
  Object.keys(uses).forEach(function (key) {
    var u = uses[key];
    var cls = classifyColor_(u.hex);
    if (cls.kind === 'core') return;
    var first = u.targets[0];
    if (cls.kind === 'restricted') {
      add_(ctx, { rule: 'green', severity: 'info', objectId: first.objectId,
        message: 'Green (' + u.hex + ') is for sustainability content only (' + u.count + ' use' + (u.count > 1 ? 's' : '') + ').' });
      return;
    }
    var where = u.where === 'highlight' ? 'text highlight' : u.where;
    var fixable = cls.yellow && (u.where === 'fill' || u.where === 'highlight');
    add_(ctx, {
      rule: 'palette', severity: 'warn', objectId: first.objectId,
      message: (cls.yellow ? 'Yellow ' : 'Off-palette ') + where + ' ' + u.hex + ' (' + u.count + ' use' + (u.count > 1 ? 's' : '') + ').',
      detail: cls.yellow ? 'Use light blue #CAECF6 with navy bold text. Mark a cost driver with an orange left rule instead.'
        : 'Palette is navy, azure, orange, #CAECF6, #D4D8DB and white. Nearest: ' + cls.nearest.name + ' ' + cls.nearest.hex + '.',
      fix: fixable ? { type: 'recolorYellow', where: u.where, targets: u.targets } : null,
      fixLabel: fixable ? 'Use light blue' : '', safe: fixable
    });
  });
}

// ---------- deck-level checks ----------

function checkDeck_(ctx) {
  var pres = ctx.pres, slides = pres.slides || [];
  ctx.slideNo = 0; ctx.slide = null; ctx.layoutName = '';

  var skipped = slides.filter(function (s) { return s.slideProperties && s.slideProperties.isSkipped; }).length;
  if (skipped) {
    add_(ctx, { rule: 'hidden-slides', severity: 'warn',
      message: skipped + ' hidden slide' + (skipped > 1 ? 's' : '') + '. Internal notes and risks never live in the client file.',
      detail: 'Keep an internal copy and export the client version from it.' });
  }

  var fname = suggestFileName_(pres.title);
  if (fname) {
    add_(ctx, { rule: 'file-name', severity: 'info',
      message: 'File name should be YYMMDD-Spanner-Client-Topic with no spaces or "&".',
      detail: 'Suggested: ' + fname });
  }

  var first = slides[0];
  if (first) {
    var txt = flattenElements_(first.pageElements || []).map(function (it) {
      return textContainersOf_(it.el).map(function (c) { return plainText_(c.text); }).join(' ');
    }).join(' ');
    var dt = normalizeDate_(txt);
    if (dt.found) {
      add_(ctx, { rule: 'date-format', severity: 'info', slide: 1, slideId: first.objectId,
        message: 'Title slide date "' + dt.found + '". Use one date format on every deck.',
        detail: 'Suggested: ' + dt.iso });
    }
  }

  // End slide: tagline "what's next." lives in the End layout.
  var endIdx = -1;
  slides.forEach(function (s, i) {
    var lay = ctx.layouts[s.slideProperties && s.slideProperties.layoutObjectId];
    var nm = lay && lay.layoutProperties && lay.layoutProperties.displayName;
    if (nm && END_LAYOUT_RE.test(nm)) endIdx = i;
  });
  if (endIdx >= 0) {
    var es = slides[endIdx];
    var layout = ctx.layouts[es.slideProperties.layoutObjectId];
    var master = ctx.masters[layout.layoutProperties && layout.layoutProperties.masterObjectId];
    var hasTag = [layout, master, es].some(function (page) {
      return flattenElements_(page && page.pageElements || []).some(function (it) {
        return textContainersOf_(it.el).some(function (c) { return /what.?s next/i.test(plainText_(c.text)); });
      });
    });
    if (!hasTag) {
      add_(ctx, { rule: 'end-tagline', severity: 'warn', slide: endIdx + 1, slideId: es.objectId,
        message: 'End slide is missing the "what\'s next." tagline.',
        detail: 'Add it once to the End layout and every future deck inherits it. The new text box sits mid-page: nudge it under the wordmark once.',
        fix: { type: 'addEndTagline', layoutId: layout.objectId, pageW: ctx.pageW, pageH: ctx.pageH, scale: ctx.scale },
        fixLabel: 'Add to End layout', safe: false });
    }
  } else if (slides.length > 2) {
    add_(ctx, { rule: 'end-slide', severity: 'info',
      message: 'No End slide found. Close with the End layout and "what\'s next."' });
  }
}

// ---------- helpers ----------

function add_(ctx, f) {
  f.slide = f.slide !== undefined ? f.slide : ctx.slideNo;
  f.slideId = f.slideId || (ctx.slide ? ctx.slide.objectId : '');
  f.objectId = f.objectId || '';
  f.fix = f.fix || null;
  f.fixLabel = f.fixLabel || '';
  f.safe = !!f.safe;
  f.detail = f.detail || '';
  f.id = f.rule + ':' + f.slideId + ':' + f.objectId + ':' + ctx.findings.length;
  ctx.findings.push(f);
}

function indexById_(arr) {
  var o = {};
  (arr || []).forEach(function (p) { o[p.objectId] = p; });
  return o;
}

function round1_(n) { return Math.round(n * 10) / 10; }

function flattenElements_(els, inGroup) {
  var out = [];
  (els || []).forEach(function (el) {
    if (el.elementGroup) {
      out = out.concat(flattenElements_(el.elementGroup.children, true));
    } else {
      out.push({ el: el, inGroup: !!inGroup });
    }
  });
  return out;
}

function solidHex_(solidFill) {
  var c = solidFill && solidFill.color;
  if (c && c.rgbColor) return rgbFractionToHex_(c.rgbColor);
  return null;                                   // theme colors are template-defined
}

function plainText_(text) {
  if (!text || !text.textElements) return '';
  return text.textElements.map(function (te) { return te.textRun ? te.textRun.content : ''; }).join('').replace(/\n$/, '');
}

// Text containers of a page element: a shape's text, or each table cell's text.
function textContainersOf_(el) {
  var out = [];
  if (el.shape && el.shape.text) {
    var ph = el.shape.placeholder && el.shape.placeholder.type;
    out.push(makeContainer_(el.objectId, null, el.shape.text, ph, ph ? 'the ' + String(ph).toLowerCase().replace('_', ' ') : 'a text box'));
  }
  if (el.table) {
    (el.table.tableRows || []).forEach(function (row, r) {
      (row.tableCells || []).forEach(function (cell, c) {
        if (cell.text) out.push(makeContainer_(el.objectId, { r: r, c: c }, cell.text, null, 'a table'));
      });
    });
  }
  return out;
}

function makeContainer_(objectId, cell, text, placeholderType, label) {
  var runs = [], para = { bullet: false, nest: 0, len: 0 }, paras = [para], maxNest = 0;
  (text.textElements || []).forEach(function (te) {
    if (te.paragraphMarker) {
      para = { bullet: !!te.paragraphMarker.bullet,
        nest: (te.paragraphMarker.bullet && te.paragraphMarker.bullet.nestingLevel) || 0, len: 0 };
      paras.push(para);
      if (para.bullet && para.nest > maxNest) maxNest = para.nest;
    } else if (te.textRun) {
      var st = te.textRun.style || {};
      para.len += te.textRun.content.replace(/\n$/, '').length;
      runs.push({
        start: te.startIndex || 0, end: te.endIndex, content: te.textRun.content, para: para,
        size: st.fontSize ? dimToPt_(st.fontSize) : null,
        family: (st.weightedFontFamily && st.weightedFontFamily.fontFamily) || st.fontFamily || null,
        bold: !!st.bold, italic: !!st.italic, underline: !!st.underline, link: !!st.link,
        fg: st.foregroundColor && st.foregroundColor.opaqueColor && st.foregroundColor.opaqueColor.rgbColor
          ? rgbFractionToHex_(st.foregroundColor.opaqueColor.rgbColor) : null,
        bg: st.backgroundColor && st.backgroundColor.opaqueColor && st.backgroundColor.opaqueColor.rgbColor
          ? rgbFractionToHex_(st.backgroundColor.opaqueColor.rgbColor) : null
      });
    }
  });
  return { objectId: objectId, cell: cell, text: text, runs: runs, placeholderType: placeholderType,
    label: label, paraDepth: maxNest, paras: paras };
}

function dimToPt_(dim) {
  if (!dim || typeof dim.magnitude !== 'number') return null;
  return dim.unit === 'EMU' ? dim.magnitude / EMU_PER_PT : dim.magnitude;
}

// Splits the cased title back into the existing runs (case-only change keeps the length).
function casedRuns_(c, cased) {
  var out = [], offset = 0;
  c.runs.forEach(function (r) {
    var body = r.content.replace(/\n$/, '');
    if (!body) return;
    out.push({ start: r.start, end: r.start + body.length, text: cased.substr(offset, body.length) });
    offset += body.length;
  });
  return out;
}
