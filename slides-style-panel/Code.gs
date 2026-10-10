// =====================================================================
// SPANNER STYLE PANEL FOR GOOGLE SLIDES - Code.gs (v2)
// Server side of the sidebar. Runs as a private Editor Add-on (installed once
// for the domain) or bound to a single deck as a fallback.
// Pure rule logic lives in Rules.gs / Analyze.gs / Fixes.gs (tested under Node).
// Deck check + fixes live in Check.gs.
// =====================================================================

var PANEL_VERSION = '2.0.0';

// ---- Built-in text styles --------------------------------------------------
// Sizes are for the 10 in Spanner master page. On any other page width they are
// scaled by page width / 10 in, so a 13.33 in deck gets 1.33x sizes.
// Brand spec: Inter Regular for all headline levels (bold only for labels,
// overlines and emphasis). Labels use Azure. Captions are Inter Italic in Navy.
var BUILTIN_TEXT = {
  'Display':     { fontFamily: 'Inter', fontSize: 40, bold: false, italic: false, color: '#293A49', lineSpacing: 110, alignment: 'LEFT' },
  'Heading 1':   { fontFamily: 'Inter', fontSize: 32, bold: false, italic: false, color: '#293A49', lineSpacing: 115, alignment: 'LEFT' },
  'Heading 2':   { fontFamily: 'Inter', fontSize: 24, bold: false, italic: false, color: '#293A49', lineSpacing: 120, alignment: 'LEFT' },
  'Heading 3':   { fontFamily: 'Inter', fontSize: 18, bold: false, italic: false, color: '#293A49', lineSpacing: 125, alignment: 'LEFT' },
  'Body Large':  { fontFamily: 'Inter', fontSize: 16, bold: false, italic: false, color: '#293A49', lineSpacing: 150, alignment: 'LEFT' },
  'Body':        { fontFamily: 'Inter', fontSize: 14, bold: false, italic: false, color: '#293A49', lineSpacing: 150, alignment: 'LEFT' },
  'Caption':     { fontFamily: 'Inter', fontSize: 12, bold: false, italic: true,  color: '#293A49', lineSpacing: 140, alignment: 'LEFT' },
  'Label':       { fontFamily: 'Inter', fontSize: 12, bold: true,  italic: false, color: '#06A6ED', lineSpacing: 130, alignment: 'LEFT' },
  'Stat / KPI':  { fontFamily: 'Inter', fontSize: 48, bold: true,  italic: false, color: '#06A6ED', lineSpacing: 100, alignment: 'CENTER' },
  'Quote':       { fontFamily: 'Inter', fontSize: 16, bold: false, italic: true,  color: '#293A49', lineSpacing: 155, alignment: 'LEFT' },
  // v2: from the 2026-10-09 slide review
  'Highlight':   { fontFamily: 'Inter', fontSize: 14, bold: true,  italic: false, color: '#293A49', lineSpacing: 150, alignment: 'LEFT', highlightColor: '#CAECF6' },
  'Delta':       { fontFamily: 'Inter', fontSize: 14, bold: true,  italic: false, color: '#E2672A', lineSpacing: 150, alignment: 'LEFT' },
  'Code':        { fontFamily: 'Roboto Mono', fontSize: 14, bold: false, italic: false, color: '#293A49', lineSpacing: 140, alignment: 'LEFT' }
};

// ---- Built-in shape styles --------------------------------------------------
// Green (#0B7C58) is restricted to sustainability content, so there is no green block.
var BUILTIN_SHAPE = {
  'Card':           { fillColor: '#FFFFFF', borderColor: '#D4D8DB', borderWeight: 1.5, contentAlignment: 'TOP',    autofit: 'NONE' },
  'Navy Block':     { fillColor: '#293A49', borderColor: 'none',    borderWeight: 0,   contentAlignment: 'MIDDLE', autofit: 'NONE' },
  'Orange Accent':  { fillColor: '#E2672A', borderColor: 'none',    borderWeight: 0,   contentAlignment: 'MIDDLE', autofit: 'NONE' },
  'Azure Block':    { fillColor: '#06A6ED', borderColor: 'none',    borderWeight: 0,   contentAlignment: 'MIDDLE', autofit: 'NONE' },
  'Info Box':       { fillColor: '#CAECF6', borderColor: '#06A6ED', borderWeight: 1.5, contentAlignment: 'TOP',    autofit: 'NONE' },
  'Ghost':          { fillColor: 'transparent', borderColor: '#D4D8DB', borderWeight: 1.5, contentAlignment: 'TOP', autofit: 'NONE' },
  // v2
  'Code Box':       { fillColor: '#D4D8DB', borderColor: 'none',    borderWeight: 0,   contentAlignment: 'TOP',    autofit: 'NONE' },
  'Image Frame':    { fillColor: 'transparent', borderColor: '#D4D8DB', borderWeight: 1, contentAlignment: 'MIDDLE', autofit: 'NONE' }
};

// ---- Menu -------------------------------------------------------------------
function onInstall(e) { onOpen(e); }

function onOpen(e) {
  var ui = SlidesApp.getUi();
  var menu;
  try { menu = ui.createAddonMenu(); }            // installed as an add-on
  catch (err) { menu = ui.createMenu('Spanner Styles'); }   // bound to one deck
  menu.addItem('Open style panel', 'showSidebar').addToUi();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Spanner Styles');
  SlidesApp.getUi().showSidebar(html);
}

// ---- Helpers ----------------------------------------------------------------
function getDocProps_() { return PropertiesService.getDocumentProperties(); }

// Page scale vs the 10 in master (page width is in points here).
function docScale_() {
  var w = SlidesApp.getActivePresentation().getPageWidth();
  return scaleForPageWidth_(w * EMU_PER_PT);
}

function getAllStyles_() {
  var props = getDocProps_();
  var custom = {
    text:  JSON.parse(props.getProperty('spannerCustomText')  || '{}'),
    shape: JSON.parse(props.getProperty('spannerCustomShape') || '{}')
  };
  return {
    text:  Object.assign({}, BUILTIN_TEXT,  custom.text),
    shape: Object.assign({}, BUILTIN_SHAPE, custom.shape),
    _custom: custom
  };
}

function ok_(msg)  { return { success: true,  message: msg }; }
function err_(msg) { return { success: false, message: msg }; }

function getColorHex_(colorObj) {
  if (!colorObj) return '';
  try {
    if (colorObj.getColorType && colorObj.getColorType() === SlidesApp.ColorType.RGB) {
      var rgb = colorObj.asRgbColor ? colorObj.asRgbColor() : colorObj;
      return rgb.asHexString().toUpperCase();
    }
  } catch (e) {}
  return '';
}

function paragraphAlignmentKey_(pa) {
  if (!pa) return 'LEFT';
  var A = SlidesApp.ParagraphAlignment;
  if (pa === A.CENTER)    return 'CENTER';
  if (pa === A.END)       return 'RIGHT';
  if (pa === A.JUSTIFIED) return 'JUSTIFY';
  return 'LEFT';
}

function selectedShapes_(sel) {
  var out = [];
  sel.getPageElementRange().getPageElements().forEach(function (el) {
    if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) out.push(el.asShape());
  });
  return out;
}

function firstShapeText_(sel) {
  try {
    var shapes = selectedShapes_(sel);
    if (shapes.length) return shapes[0].getText();
  } catch (e) {}
  return null;
}

// ---- Data for the sidebar ---------------------------------------------------
function getAllStyles() {
  var data = getAllStyles_();
  var custom = data._custom;
  function keys(o, builtin, wantBuiltin) {
    return Object.keys(o).filter(function (k) { return wantBuiltin ? !!builtin[k] : !builtin[k]; });
  }
  return {
    text: data.text,
    shape: data.shape,
    scale: docScale_(),
    version: PANEL_VERSION,
    meta: {
      overriddenText:  keys(custom.text,  BUILTIN_TEXT,  true),
      overriddenShape: keys(custom.shape, BUILTIN_SHAPE, true),
      customText:      keys(custom.text,  BUILTIN_TEXT,  false),
      customShape:     keys(custom.shape, BUILTIN_SHAPE, false)
    }
  };
}

// ---- Selection info for style matching (sizes normalised to the 10 in page) --
function getSelectionStyleInfo() {
  try {
    var scale = docScale_();
    var sel = SlidesApp.getActivePresentation().getSelection();
    var type = sel.getSelectionType();
    if (type !== SlidesApp.SelectionType.TEXT && type !== SlidesApp.SelectionType.PAGE_ELEMENT) return null;

    var info = { selType: String(type) };
    var textRange = null, firstShape = null;

    if (type === SlidesApp.SelectionType.TEXT) {
      textRange = sel.getTextRange();
    } else {
      var shapes = selectedShapes_(sel);
      if (shapes.length) { firstShape = shapes[0]; textRange = firstShape.getText(); }
    }

    if (textRange) {
      var ts = textRange.getTextStyle();
      info.fontFamily = ts.getFontFamily();
      info.fontSize   = ts.getFontSize() ? ts.getFontSize() / scale : null;
      info.bold       = ts.isBold();
      info.italic     = ts.isItalic();
      info.color      = getColorHex_(ts.getForegroundColor());
      try {
        var ps = textRange.getParagraphs()[0].getRange().getParagraphStyle();
        info.lineSpacing = ps.getLineSpacing();
        info.alignment   = paragraphAlignmentKey_(ps.getParagraphAlignment());
      } catch (e2) {}
    }

    if (firstShape) {
      try {
        var fill = firstShape.getFill();
        info.fillColor = fill.getType() === SlidesApp.FillType.SOLID
          ? getColorHex_(fill.getSolidFill().getColor()) : 'transparent';
      } catch (e3) { info.fillColor = 'transparent'; }
      try {
        info.borderColor  = getColorHex_(firstShape.getBorder().getLineFill().getSolidFill().getColor());
        info.borderWeight = firstShape.getBorder().getWeight();
      } catch (e4) { info.borderColor = 'none'; info.borderWeight = 0; }
    }
    return info;
  } catch (e) { return null; }
}

// ---- Apply text style ---------------------------------------------------------
function applyTextStyle(name) {
  var config = getAllStyles_().text[name];
  if (!config) return err_('Style "' + name + '" not found');

  var scale = docScale_();
  var sel = SlidesApp.getActivePresentation().getSelection();
  var type = sel.getSelectionType();
  try {
    var shapeIds = [];
    if (type === SlidesApp.SelectionType.TEXT) {
      applyTextConfig_(sel.getTextRange(), config, scale);
    } else if (type === SlidesApp.SelectionType.PAGE_ELEMENT) {
      var shapes = selectedShapes_(sel);
      if (!shapes.length) return err_('No shapes in selection');
      shapes.forEach(function (s) { applyTextConfig_(s.getText(), config, scale); shapeIds.push(s.getObjectId()); });
    } else {
      return err_('Select text or a shape first');
    }
    if (config.bullets && shapeIds.length) applyBulletsToIds_(shapeIds, config.bullets);
    return ok_('Style "' + name + '" applied');
  } catch (e) { return err_(e.message); }
}

function applyTextConfig_(textRange, c, scale) {
  var ts = textRange.getTextStyle();
  try { if (c.fontFamily)        ts.setFontFamily(c.fontFamily); } catch (e) {}
  try { if (c.fontSize)          ts.setFontSize(round1_(c.fontSize * scale)); } catch (e) {}
  try { if (c.bold != null)      ts.setBold(c.bold); } catch (e) {}
  try { if (c.italic != null)    ts.setItalic(c.italic); } catch (e) {}
  try { if (c.underline != null) ts.setUnderline(c.underline); } catch (e) {}
  try { if (c.color)             ts.setForegroundColor(c.color); } catch (e) {}
  try { if (c.highlightColor)    ts.setBackgroundColor(c.highlightColor); } catch (e) {}

  textRange.getParagraphs().forEach(function (p) {
    var ps = p.getRange().getParagraphStyle();
    try { if (c.lineSpacing     != null) ps.setLineSpacing(c.lineSpacing); } catch (e) {}
    try { if (c.spaceAbove      != null) ps.setSpaceAbove(c.spaceAbove); } catch (e) {}
    try { if (c.spaceBelow      != null) ps.setSpaceBelow(c.spaceBelow); } catch (e) {}
    try { if (c.indentStart     != null) ps.setIndentStart(c.indentStart); } catch (e) {}
    try { if (c.indentEnd       != null) ps.setIndentEnd(c.indentEnd); } catch (e) {}
    try { if (c.indentFirstLine != null) ps.setIndentFirstLine(c.indentFirstLine); } catch (e) {}
    try {
      if (c.alignment) {
        var A = SlidesApp.ParagraphAlignment;
        var map = { LEFT: A.START, CENTER: A.CENTER, RIGHT: A.END, JUSTIFY: A.JUSTIFIED };
        if (map[c.alignment]) ps.setParagraphAlignment(map[c.alignment]);
      }
    } catch (e) {}
  });
}

function round1_(n) { return Math.round(n * 10) / 10; }

// ---- Apply shape style --------------------------------------------------------
function applyShapeStyle(name) {
  var config = getAllStyles_().shape[name];
  if (!config) return err_('Style "' + name + '" not found');

  var sel = SlidesApp.getActivePresentation().getSelection();
  if (sel.getSelectionType() !== SlidesApp.SelectionType.PAGE_ELEMENT)
    return err_('Select one or more shapes first');
  try {
    var shapes = selectedShapes_(sel);
    shapes.forEach(function (s) { applyShapeConfig_(s, config); });
    return shapes.length ? ok_('"' + name + '" applied to ' + shapes.length + ' shape' + (shapes.length > 1 ? 's' : ''))
                         : err_('No shapes in selection');
  } catch (e) { return err_(e.message); }
}

function applyShapeConfig_(shape, c) {
  try {
    var fill = shape.getFill();
    if (c.fillColor === 'transparent' || c.fillColor === 'none') fill.setTransparent();
    else if (c.fillColor) fill.setSolidFill(c.fillColor);
  } catch (e) {}
  try {
    var border = shape.getBorder();
    if (c.borderColor === 'none' || c.borderWeight === 0) {
      border.setTransparent();
    } else {
      if (c.borderColor)          border.getLineFill().setSolidFill(c.borderColor);
      if (c.borderWeight != null) border.setWeight(c.borderWeight);
    }
  } catch (e) {}
  try {
    if (c.contentAlignment) {
      var CA = SlidesApp.ContentAlignment;
      var cam = { TOP: CA.TOP, MIDDLE: CA.MIDDLE, BOTTOM: CA.BOTTOM };
      if (cam[c.contentAlignment]) shape.setContentAlignment(cam[c.contentAlignment]);
    }
  } catch (e) {}
  try {
    if (c.autofit) {
      var AT = SlidesApp.AutofitType;
      var atm = { NONE: AT.NONE, TEXT_AUTOFIT: AT.TEXT_AUTOFIT, SHAPE_AUTOFIT: AT.SHAPE_AUTOFIT };
      if (atm[c.autofit]) shape.getAutofit().setAutofitType(atm[c.autofit]);
    }
  } catch (e) {}
}

// ---- Quick tools ---------------------------------------------------------------
function textRangeOfSelection_(sel) {
  return sel.getSelectionType() === SlidesApp.SelectionType.TEXT ? sel.getTextRange() : firstShapeText_(sel);
}

function applyAlignment(alignKey) {
  var sel = SlidesApp.getActivePresentation().getSelection();
  try {
    var tr = textRangeOfSelection_(sel);
    if (!tr) return err_('Select text or a shape first');
    var A = SlidesApp.ParagraphAlignment;
    var map = { LEFT: A.START, CENTER: A.CENTER, RIGHT: A.END, JUSTIFY: A.JUSTIFIED };
    if (!map[alignKey]) return err_('Unknown alignment');
    tr.getParagraphs().forEach(function (p) { p.getRange().getParagraphStyle().setParagraphAlignment(map[alignKey]); });
    return ok_('Alignment applied');
  } catch (e) { return err_(e.message); }
}

function adjustIndent(deltaPt) {
  var sel = SlidesApp.getActivePresentation().getSelection();
  try {
    var tr = textRangeOfSelection_(sel);
    if (!tr) return err_('Select text or a shape first');
    tr.getParagraphs().forEach(function (p) {
      var ps = p.getRange().getParagraphStyle();
      try { ps.setIndentStart(Math.max(0, (ps.getIndentStart() || 0) + deltaPt)); } catch (e) {}
    });
    return ok_('Indent adjusted');
  } catch (e) { return err_(e.message); }
}

function selectedShapeIds_() {
  var sel = SlidesApp.getActivePresentation().getSelection();
  if (sel.getSelectionType() !== SlidesApp.SelectionType.PAGE_ELEMENT) return null;
  return selectedShapes_(sel).map(function (s) { return s.getObjectId(); });
}

function applyBullets(bulletPreset) {
  var ids = selectedShapeIds_();
  if (ids === null) return err_('Select one or more shapes first');
  if (!ids.length) return err_('No shapes in selection');
  try {
    applyBulletsToIds_(ids, bulletPreset);
    return ok_(bulletPreset === 'NONE' ? 'Bullets removed' : 'Bullets applied');
  } catch (e) { return err_(e.message); }
}

function applyVerticalAlign(alignKey) {
  var sel = SlidesApp.getActivePresentation().getSelection();
  if (sel.getSelectionType() !== SlidesApp.SelectionType.PAGE_ELEMENT) return err_('Select a shape first');
  try {
    var CA = SlidesApp.ContentAlignment;
    var map = { TOP: CA.TOP, MIDDLE: CA.MIDDLE, BOTTOM: CA.BOTTOM };
    if (!map[alignKey]) return err_('Unknown alignment');
    var shapes = selectedShapes_(sel);
    shapes.forEach(function (s) { s.setContentAlignment(map[alignKey]); });
    return ok_('Vertical alignment set on ' + shapes.length + ' shape(s)');
  } catch (e) { return err_(e.message); }
}

function applyAutofit(autofitKey) {
  var sel = SlidesApp.getActivePresentation().getSelection();
  if (sel.getSelectionType() !== SlidesApp.SelectionType.PAGE_ELEMENT) return err_('Select a shape first');
  try {
    var AT = SlidesApp.AutofitType;
    var map = { NONE: AT.NONE, TEXT_AUTOFIT: AT.TEXT_AUTOFIT, SHAPE_AUTOFIT: AT.SHAPE_AUTOFIT };
    if (!map[autofitKey]) return err_('Unknown autofit type');
    var n = 0;
    selectedShapes_(sel).forEach(function (s) { try { s.getAutofit().setAutofitType(map[autofitKey]); n++; } catch (e) {} });
    return n ? ok_('Autofit set on ' + n + ' shape(s)') : err_('Autofit not supported on selection');
  } catch (e) { return err_(e.message); }
}

function applyPadding(top, right, bottom, left) {
  var ids = selectedShapeIds_();
  if (ids === null) return err_('Select a shape first');
  if (!ids.length) return err_('No shapes in selection');
  var reqs = ids.map(function (id) {
    return { updateShapeProperties: { objectId: id, fields: 'contentPadding',
      shapeProperties: { contentPadding: {
        topPadding:    { magnitude: top,    unit: 'PT' },
        rightPadding:  { magnitude: right,  unit: 'PT' },
        bottomPadding: { magnitude: bottom, unit: 'PT' },
        leftPadding:   { magnitude: left,   unit: 'PT' } } } } };
  });
  try { slidesBatch_(reqs); return ok_('Padding applied to ' + ids.length + ' shape(s)'); }
  catch (e) { return err_(e.message); }
}

// Spanner table style: navy header, white body, light gray hairlines.
function applyTableStyle() {
  var sel = SlidesApp.getActivePresentation().getSelection();
  if (sel.getSelectionType() !== SlidesApp.SelectionType.PAGE_ELEMENT) return err_('Select a table first');
  var tables = sel.getPageElementRange().getPageElements().filter(function (el) {
    return el.getPageElementType() === SlidesApp.PageElementType.TABLE;
  });
  if (!tables.length) return err_('Select a table first');
  try {
    var reqs = [];
    tables.forEach(function (el) {
      var t = el.asTable();
      reqs = reqs.concat(buildTableStyleRequests_(el.getObjectId(), t.getNumRows(), t.getNumColumns()));
    });
    slidesBatch_(reqs);
    return ok_('Table style applied to ' + tables.length + ' table(s)');
  } catch (e) { return err_(e.message); }
}

// ---- Colors ---------------------------------------------------------------------
function applyColorToText(hex) {
  var sel = SlidesApp.getActivePresentation().getSelection();
  try {
    var tr = textRangeOfSelection_(sel);
    if (!tr) return err_('Select text or a shape first');
    tr.getTextStyle().setForegroundColor(hex);
    return ok_('Text color applied');
  } catch (e) { return err_(e.message); }
}

function applyColorToFill(hex) {
  var sel = SlidesApp.getActivePresentation().getSelection();
  if (sel.getSelectionType() !== SlidesApp.SelectionType.PAGE_ELEMENT) return err_('Select a shape');
  try {
    selectedShapes_(sel).forEach(function (s) { s.getFill().setSolidFill(hex); });
    return ok_('Fill applied');
  } catch (e) { return err_(e.message); }
}

function applyColorToBorder(hex) {
  var sel = SlidesApp.getActivePresentation().getSelection();
  if (sel.getSelectionType() !== SlidesApp.SelectionType.PAGE_ELEMENT) return err_('Select a shape');
  try {
    selectedShapes_(sel).forEach(function (s) {
      var b = s.getBorder();
      b.getLineFill().setSolidFill(hex);
      b.setWeight(1.5);
    });
    return ok_('Border color applied');
  } catch (e) { return err_(e.message); }
}

// ---- Capture from selection (sizes stored normalised to the 10 in page) -------
function captureTextStyleFromSelection(name) {
  if (!name || !name.trim()) return err_('Enter a style name');
  name = name.trim();
  var scale = docScale_();
  var sel = SlidesApp.getActivePresentation().getSelection();
  try {
    var tr = textRangeOfSelection_(sel);
    if (!tr) return err_('Select text or a shape first');
    var ts = tr.getTextStyle(), ps = null;
    try { ps = tr.getParagraphs()[0].getRange().getParagraphStyle(); } catch (e) {}

    var config = {
      fontFamily: ts.getFontFamily() || 'Inter',
      fontSize:   round1_((ts.getFontSize() || 14) / scale),
      bold:       !!ts.isBold(),
      italic:     !!ts.isItalic(),
      color:      getColorHex_(ts.getForegroundColor()) || '#293A49',
      lineSpacing: 140, alignment: 'LEFT', spaceAbove: 0, spaceBelow: 0, indentStart: 0
    };
    if (ps) {
      try { config.lineSpacing = ps.getLineSpacing()  || 140; } catch (e) {}
      try { config.alignment   = paragraphAlignmentKey_(ps.getParagraphAlignment()); } catch (e) {}
      try { config.spaceAbove  = ps.getSpaceAbove()   || 0; } catch (e) {}
      try { config.spaceBelow  = ps.getSpaceBelow()   || 0; } catch (e) {}
      try { config.indentStart = ps.getIndentStart()  || 0; } catch (e) {}
    }
    saveCustom_('spannerCustomText', name, config);
    return ok_('Style "' + name + '" saved');
  } catch (e) { return err_(e.message); }
}

function captureShapeStyleFromSelection(name) {
  if (!name || !name.trim()) return err_('Enter a style name');
  name = name.trim();
  var sel = SlidesApp.getActivePresentation().getSelection();
  if (sel.getSelectionType() !== SlidesApp.SelectionType.PAGE_ELEMENT) return err_('Select a shape first');
  try {
    var shapes = selectedShapes_(sel);
    if (!shapes.length) return err_('No shape in selection');
    var shape = shapes[0];
    var config = { fillColor: '#FFFFFF', borderColor: 'none', borderWeight: 0, contentAlignment: 'TOP', autofit: 'NONE' };
    try {
      var fill = shape.getFill();
      config.fillColor = fill.getType() === SlidesApp.FillType.SOLID
        ? getColorHex_(fill.getSolidFill().getColor()) : 'transparent';
    } catch (e) {}
    try {
      config.borderColor  = getColorHex_(shape.getBorder().getLineFill().getSolidFill().getColor());
      config.borderWeight = shape.getBorder().getWeight();
    } catch (e) {}
    try {
      var ca = shape.getContentAlignment(), CA = SlidesApp.ContentAlignment;
      config.contentAlignment = ca === CA.MIDDLE ? 'MIDDLE' : ca === CA.BOTTOM ? 'BOTTOM' : 'TOP';
    } catch (e) {}
    try {
      var at = shape.getAutofit().getAutofitType(), AT = SlidesApp.AutofitType;
      config.autofit = at === AT.TEXT_AUTOFIT ? 'TEXT_AUTOFIT' : at === AT.SHAPE_AUTOFIT ? 'SHAPE_AUTOFIT' : 'NONE';
    } catch (e) {}
    saveCustom_('spannerCustomShape', name, config);
    return ok_('Style "' + name + '" saved');
  } catch (e) { return err_(e.message); }
}

// ---- Save / delete / reset ------------------------------------------------------
function saveCustom_(key, name, config) {
  var props = getDocProps_();
  var c = JSON.parse(props.getProperty(key) || '{}');
  c[name] = config;
  props.setProperty(key, JSON.stringify(c));
}

// doCascade: also update every object whose current look matches the old definition.
function updateCustomStyle(type, name, newConfig, doCascade) {
  var oldConfig = getAllStyles_()[type][name];     // read BEFORE overwrite
  saveCustom_(type === 'text' ? 'spannerCustomText' : 'spannerCustomShape', name, newConfig);
  if (doCascade && oldConfig) {
    var count = type === 'text' ? cascadeTextUpdate_(oldConfig, newConfig) : cascadeShapeUpdate_(oldConfig, newConfig);
    return ok_('Saved. Updated ' + count + ' matching object' + (count !== 1 ? 's' : '') + ' across all slides.');
  }
  return ok_('Style "' + name + '" saved');
}

function deleteCustomStyle(type, name) {
  var key = type === 'text' ? 'spannerCustomText' : 'spannerCustomShape';
  var props = getDocProps_();
  var c = JSON.parse(props.getProperty(key) || '{}');
  if (c[name] === undefined) return err_('Style not found in custom storage');
  delete c[name];
  props.setProperty(key, JSON.stringify(c));
  var wasBuiltin = !!(BUILTIN_TEXT[name] || BUILTIN_SHAPE[name]);
  return ok_((wasBuiltin ? 'Reset to default' : 'Deleted') + ': "' + name + '"');
}

// ---- Cascade --------------------------------------------------------------------
function cascadeTextUpdate_(oldConfig, newConfig) {
  var scale = docScale_(), count = 0;
  SlidesApp.getActivePresentation().getSlides().forEach(function (slide) {
    slide.getPageElements().forEach(function (el) {
      if (el.getPageElementType() !== SlidesApp.PageElementType.SHAPE) return;
      var txt = el.asShape().getText();
      if (textMatchesConfig_(txt, oldConfig, scale)) { applyTextConfig_(txt, newConfig, scale); count++; }
    });
  });
  return count;
}

function cascadeShapeUpdate_(oldConfig, newConfig) {
  var count = 0;
  SlidesApp.getActivePresentation().getSlides().forEach(function (slide) {
    slide.getPageElements().forEach(function (el) {
      if (el.getPageElementType() !== SlidesApp.PageElementType.SHAPE) return;
      if (shapeMatchesConfig_(el.asShape(), oldConfig)) { applyShapeConfig_(el.asShape(), newConfig); count++; }
    });
  });
  return count;
}

// True only if every defined property matches (font size within 0.6 pt after scaling).
function textMatchesConfig_(textRange, c, scale) {
  try {
    var ts = textRange.getTextStyle();
    if (c.fontFamily && ts.getFontFamily() !== c.fontFamily) return false;
    if (c.fontSize && Math.abs((ts.getFontSize() || 0) - c.fontSize * scale) > 0.6) return false;
    if (c.bold != null && ts.isBold() !== c.bold) return false;
    if (c.italic != null && ts.isItalic() !== c.italic) return false;
    if (c.color && normalizeHex_(c.color) !== normalizeHex_(getColorHex_(ts.getForegroundColor()))) return false;
    return true;
  } catch (e) { return false; }
}

function shapeMatchesConfig_(shape, c) {
  try {
    if (c.fillColor) {
      var fill = shape.getFill();
      var cur = fill.getType() === SlidesApp.FillType.SOLID ? getColorHex_(fill.getSolidFill().getColor()) : 'transparent';
      var want = (c.fillColor === 'transparent' || c.fillColor === 'none') ? 'transparent' : normalizeHex_(c.fillColor);
      if (want !== (cur === 'transparent' ? 'transparent' : normalizeHex_(cur))) return false;
    }
    if (c.borderColor && c.borderColor !== 'none') {
      var bc = getColorHex_(shape.getBorder().getLineFill().getSolidFill().getColor());
      if (normalizeHex_(c.borderColor) !== normalizeHex_(bc)) return false;
    }
    return true;
  } catch (e) { return false; }
}

// ---- Slides API (advanced service "Slides", declared in appsscript.json) ---------
function slidesBatch_(requests, requiredRevisionId) {
  var resource = { requests: requests };
  if (requiredRevisionId) resource.writeControl = { requiredRevisionId: requiredRevisionId };
  return Slides.Presentations.batchUpdate(resource, SlidesApp.getActivePresentation().getId());
}

function applyBulletsToIds_(objectIds, preset) {
  var reqs = objectIds.map(function (id) {
    return preset === 'NONE'
      ? { deleteParagraphBullets: { objectId: id, textRange: { type: 'ALL' } } }
      : { createParagraphBullets: { objectId: id, textRange: { type: 'ALL' }, bulletPreset: preset } };
  });
  slidesBatch_(reqs);
}
