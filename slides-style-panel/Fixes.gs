// =====================================================================
// SPANNER STYLE PANEL - Fixes.gs
// Turns a finding's fix (plain data from Analyze.gs) into Slides API
// batchUpdate requests. Pure: no Apps Script services, testable under Node.
// =====================================================================

var NAVY = '#293A49';
var LIGHT_BLUE = '#CAECF6';
var AZURE = '#06A6ED';

function fixRange_(start, end) {
  return { type: 'FIXED_RANGE', startIndex: start, endIndex: end };
}

function cellLoc_(cell) {
  return cell ? { rowIndex: cell.r, columnIndex: cell.c } : undefined;
}

function withCell_(req, cell) {
  if (cell) req.cellLocation = cellLoc_(cell);
  return req;
}

function rgbOpaque_(hex) {
  return { opaqueColor: { rgbColor: hexToRgbFraction_(hex) } };
}

// Returns an array of {req, pri, key, idx}; pri 0 = style, 1 = deleteText, 2 = deleteObject.
function buildFixRequests_(fix) {
  var out = [];
  function push(req, pri, key, idx) { out.push({ req: req, pri: pri, key: key || '', idx: idx || 0 }); }

  switch (fix.type) {
    case 'bumpSize':
      fix.items.forEach(function (it) {
        push({ updateTextStyle: withCell_({ objectId: fix.objectId, textRange: fixRange_(it.start, it.end),
          style: { fontSize: { magnitude: it.size, unit: 'PT' } }, fields: 'fontSize' }, it.cell) }, 0);
      });
      break;

    case 'setFont':
      fix.items.forEach(function (it) {
        push({ updateTextStyle: withCell_({ objectId: fix.objectId, textRange: fixRange_(it.start, it.end),
          style: { fontFamily: fix.family }, fields: 'fontFamily' }, it.cell) }, 0);
      });
      break;

    case 'collapseSpaces':
      fix.items.forEach(function (it) {
        var key = fix.objectId + '|' + (fix.cell ? fix.cell.r + ',' + fix.cell.c : '');
        push({ deleteText: withCell_({ objectId: fix.objectId,
          textRange: fixRange_(it.start, it.start + it.len) }, fix.cell) }, 1, key, it.start);
      });
      break;

    case 'sentenceCase':
      // Per run, last run first, so earlier indexes stay valid.
      fix.runs.slice().sort(function (a, b) { return b.start - a.start; }).forEach(function (r) {
        push({ deleteText: withCell_({ objectId: fix.objectId, textRange: fixRange_(r.start, r.end) }, fix.cell) }, 0);
        push({ insertText: withCell_({ objectId: fix.objectId, insertionIndex: r.start, text: r.text }, fix.cell) }, 0);
      });
      break;

    case 'recolorYellow':
      fix.targets.forEach(function (t) {
        if (fix.where === 'highlight') {
          push({ updateTextStyle: withCell_({ objectId: t.objectId, textRange: fixRange_(t.start, t.end),
            style: { backgroundColor: rgbOpaque_(LIGHT_BLUE), foregroundColor: rgbOpaque_(NAVY), bold: true },
            fields: 'backgroundColor,foregroundColor,bold' }, t.cell) }, 0);
        } else if (t.cell) {
          push({ updateTableCellProperties: { objectId: t.objectId,
            tableRange: { location: cellLoc_(t.cell), rowSpan: 1, columnSpan: 1 },
            tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: { rgbColor: hexToRgbFraction_(LIGHT_BLUE) } } } },
            fields: 'tableCellBackgroundFill.solidFill.color' } }, 0);
          push({ updateTextStyle: { objectId: t.objectId, cellLocation: cellLoc_(t.cell), textRange: { type: 'ALL' },
            style: { foregroundColor: rgbOpaque_(NAVY), bold: true }, fields: 'foregroundColor,bold' } }, 0);
        } else {
          push({ updateShapeProperties: { objectId: t.objectId,
            shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: hexToRgbFraction_(LIGHT_BLUE) } } } },
            fields: 'shapeBackgroundFill.solidFill.color' } }, 0);
          push({ updateTextStyle: { objectId: t.objectId, textRange: { type: 'ALL' },
            style: { foregroundColor: rgbOpaque_(NAVY), bold: true }, fields: 'foregroundColor,bold' } }, 0);
        }
      });
      break;

    case 'deleteSlide':
      push({ deleteObject: { objectId: fix.slideId } }, 2);
      break;

    case 'addEndTagline':
      var id = 'spanner_endtag_' + Date.now().toString(36);
      var w = Math.round(fix.pageW * 0.6), h = Math.round(0.6 * EMU_PER_IN * fix.scale);
      push({ createShape: { objectId: id, shapeType: 'TEXT_BOX',
        elementProperties: { pageObjectId: fix.layoutId,
          size: { width: { magnitude: w, unit: 'EMU' }, height: { magnitude: h, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: Math.round((fix.pageW - w) / 2),
            translateY: Math.round(fix.pageH * 0.62), unit: 'EMU' } } } }, 0);
      push({ insertText: { objectId: id, insertionIndex: 0, text: "what's next." } }, 0);
      push({ updateTextStyle: { objectId: id, textRange: { type: 'ALL' },
        style: { fontFamily: 'Inter', fontSize: { magnitude: Math.round(24 * fix.scale), unit: 'PT' },
          bold: false, foregroundColor: rgbOpaque_(AZURE) },
        fields: 'fontFamily,fontSize,bold,foregroundColor' } }, 0);
      push({ updateParagraphStyle: { objectId: id, textRange: { type: 'ALL' },
        style: { alignment: 'CENTER' }, fields: 'alignment' } }, 0);
      break;

    default:
      throw new Error('Unknown fix type: ' + fix.type);
  }
  return out;
}

// Style ops first, then text deletions from the end of each text backwards,
// then slide deletions. Keeps every index valid inside one batchUpdate.
function orderRequests_(tagged) {
  return tagged.slice().sort(function (a, b) {
    if (a.pri !== b.pri) return a.pri - b.pri;
    if (a.pri === 1) {
      if (a.key !== b.key) return a.key < b.key ? -1 : 1;
      return b.idx - a.idx;
    }
    return 0;
  }).map(function (t) { return t.req; });
}

// Spanner table style for the Shapes tab: navy header, white body, light gray hairlines.
function buildTableStyleRequests_(tableId, rows, cols) {
  var reqs = [];
  var all = { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: rows, columnSpan: cols };
  var head = { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: cols };
  var line = { solidFill: { color: { rgbColor: hexToRgbFraction_('#D4D8DB') } } };
  reqs.push({ updateTableCellProperties: { objectId: tableId, tableRange: all,
    tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: { rgbColor: hexToRgbFraction_('#FFFFFF') } } } },
    fields: 'tableCellBackgroundFill.solidFill.color' } });
  reqs.push({ updateTableCellProperties: { objectId: tableId, tableRange: head,
    tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: { rgbColor: hexToRgbFraction_(NAVY) } } } },
    fields: 'tableCellBackgroundFill.solidFill.color' } });
  ['INNER_HORIZONTAL', 'INNER_VERTICAL', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT'].forEach(function (pos) {
    reqs.push({ updateTableBorderProperties: { objectId: tableId, tableRange: all, borderPosition: pos,
      tableBorderProperties: { tableBorderFill: line, weight: { magnitude: 1, unit: 'PT' }, dashStyle: 'SOLID' },
      fields: 'tableBorderFill.solidFill.color,weight,dashStyle' } });
  });
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      reqs.push({ updateTextStyle: { objectId: tableId, cellLocation: { rowIndex: r, columnIndex: c },
        textRange: { type: 'ALL' },
        style: { fontFamily: 'Inter', foregroundColor: rgbOpaque_(r === 0 ? '#FFFFFF' : NAVY), bold: r === 0 },
        fields: 'fontFamily,foregroundColor,bold' } });
    }
  }
  return reqs;
}
