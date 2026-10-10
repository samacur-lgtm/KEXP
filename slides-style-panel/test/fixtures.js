// Synthetic Slides API presentation JSON that reproduces the problems found in the
// 2026 client decks (alyssa-slides.md). 10 in x 5.625 in page, EMU units.
const IN = 914400;
const PT = 12700;

const rgb = (r, g, b) => ({ red: r / 255, green: g / 255, blue: b / 255 });
const NAVY = rgb(0x29, 0x3a, 0x49);
const YELLOW = rgb(0xff, 0xff, 0x00);
const AZURE = rgb(0x06, 0xa6, 0xed);

function el(objectId, o) {
  return Object.assign({
    objectId,
    size: { width: { magnitude: 3 * IN, unit: 'EMU' }, height: { magnitude: 1 * IN, unit: 'EMU' } },
    transform: { scaleX: 1, scaleY: 1, translateX: IN, translateY: IN, unit: 'EMU' }
  }, o);
}

function run(content, start, style) {
  return { startIndex: start, endIndex: start + content.length, textRun: { content, style: style || {} } };
}

function textShape(objectId, runs, extra) {
  // runs: [[content, style]...] ; the final run must end with "\n"
  let idx = 0;
  const tes = [{ endIndex: 0, paragraphMarker: { style: {} } }];
  runs.forEach(([c, s]) => { tes.push(run(c, idx, s)); idx += c.length; });
  return el(objectId, Object.assign({ shape: { shapeType: 'TEXT_BOX', text: { textElements: tes }, shapeProperties: {} } }, extra || {}));
}

const pres = {
  title: '260910-Spanner-Skylight-Fridge-Mount-ID-Feasibility-Week 2 & 3',
  revisionId: 'rev1',
  pageSize: { width: { magnitude: 10 * IN, unit: 'EMU' }, height: { magnitude: 5.625 * IN, unit: 'EMU' } },
  masters: [{ objectId: 'm1', pageElements: [] }],
  layouts: [
    {
      objectId: 'L_content',
      layoutProperties: { displayName: 'Content - Light w Dark Title Bar', masterObjectId: 'm1' },
      pageElements: [
        { objectId: 'bar', size: { width: { magnitude: 10 * IN, unit: 'EMU' }, height: { magnitude: 0.9 * IN, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0, unit: 'EMU' },
          shape: { shapeType: 'RECTANGLE', shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: NAVY } } } } } },
        { objectId: 'foot', size: { width: { magnitude: 3 * IN, unit: 'EMU' }, height: { magnitude: 0.3 * IN, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 0.4 * IN, translateY: 5.2 * IN, unit: 'EMU' },
          shape: { shapeType: 'TEXT_BOX', text: { textElements: [run('Spanner Confidential\n', 0)] } } }
      ]
    },
    { objectId: 'L_end', layoutProperties: { displayName: 'End', masterObjectId: 'm1' }, pageElements: [] },
    { objectId: 'L_title', layoutProperties: { displayName: 'Title - Client', masterObjectId: 'm1' }, pageElements: [] }
  ],
  slides: [
    // 1 title slide with a non-ISO date
    { objectId: 's1', slideProperties: { layoutObjectId: 'L_title' }, pageElements: [
      textShape('t1', [['Skylight | Fridge Mount ID Feasibility\n', { fontSize: { magnitude: 28, unit: 'PT' } }]],
        { shape: { shapeType: 'TEXT_BOX', placeholder: { type: 'CENTERED_TITLE' }, text: { textElements: [run('Skylight | Fridge Mount ID Feasibility\n', 0)] } } }),
      textShape('d1', [['09 10 2026\n', {}]])
    ] },
    // 2 Title Case title, 9 pt body, yellow cell, double space
    { objectId: 's2', slideProperties: { layoutObjectId: 'L_content' }, pageElements: [
      textShape('title2', [['Magnet Mount VS Suction Cup Mount\n', {}]],
        { shape: { shapeType: 'TEXT_BOX', placeholder: { type: 'TITLE' }, text: { textElements: [run('Magnet Mount VS Suction Cup Mount\n', 0)] } } }),
      textShape('body2', [
        ['Force at the recommended  spec is 1.5x the minimum and holds the full panel weight with margin.\n',
          { fontSize: { magnitude: 9, unit: 'PT' }, fontFamily: 'Inter' }]
      ]),
      el('tbl', { table: { rows: 2, columns: 2, tableRows: [
        { tableCells: [
          { text: { textElements: [run('Item\n', 0, { fontSize: { magnitude: 10, unit: 'PT' } })] } },
          { text: { textElements: [run('Cost\n', 0, { fontSize: { magnitude: 10, unit: 'PT' } })] },
            tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: { rgbColor: YELLOW } } } } }
        ] },
        { tableCells: [ { text: { textElements: [run('Magnet\n', 0)] } }, { text: { textElements: [run('$4\n', 0)] } } ] }
      ] } }),
      // image on the footer
      el('img_footer', { image: { contentUrl: 'x' },
        size: { width: { magnitude: 3 * IN, unit: 'EMU' }, height: { magnitude: 2 * IN, unit: 'EMU' } },
        transform: { scaleX: 1, scaleY: 1, translateX: 5 * IN, translateY: 3.6 * IN, unit: 'EMU' } }),
      // image on the title bar
      el('img_bar', { image: { contentUrl: 'x' },
        size: { width: { magnitude: 2 * IN, unit: 'EMU' }, height: { magnitude: 1.5 * IN, unit: 'EMU' } },
        transform: { scaleX: 1, scaleY: 1, translateX: 6 * IN, translateY: 0.3 * IN, unit: 'EMU' } })
    ] },
    // 3 shrunk autofit, off-palette hex, serif font, stacked emphasis
    { objectId: 's3', slideProperties: { layoutObjectId: 'L_content' }, pageElements: [
      textShape('tx3', [
        ['Recommended ', { bold: true, foregroundColor: { opaqueColor: { rgbColor: AZURE } } }],
        ['spec', { italic: true, underline: true, link: { url: 'http://x' }, foregroundColor: { opaqueColor: { rgbColor: rgb(0xe2, 0x67, 0x2a) } } }],
        [' is the plan of record for this concept.\n', { fontFamily: 'Times New Roman' }]
      ], { shape: { shapeType: 'TEXT_BOX', text: null, shapeProperties: { autofit: { fontScale: 0.6 },
        shapeBackgroundFill: { solidFill: { color: { rgbColor: rgb(0x6b, 0x7e, 0x8f) } } } } } })
    ] },
    // 4 blank
    { objectId: 's4', slideProperties: { layoutObjectId: 'L_content' }, pageElements: [] },
    // 5 End slide, no tagline
    { objectId: 's5', slideProperties: { layoutObjectId: 'L_end' }, pageElements: [] },
    // 6 trailing blank (hidden)
    { objectId: 's6', slideProperties: { layoutObjectId: 'L_content', isSkipped: true }, pageElements: [] }
  ]
};

// textShape builds shape.text from runs, but the override above replaces it for s3; rebuild it.
(function fixS3() {
  const s = pres.slides[2].pageElements[0];
  const runs = [
    ['Recommended ', { bold: true, foregroundColor: { opaqueColor: { rgbColor: AZURE } } }],
    ['spec', { italic: true, underline: true, link: { url: 'http://x' }, foregroundColor: { opaqueColor: { rgbColor: rgb(0xe2, 0x67, 0x2a) } } }],
    [' is the plan of record for this concept.\n', { fontFamily: 'Times New Roman' }]
  ];
  let idx = 0;
  const tes = [{ endIndex: 0, paragraphMarker: { style: {} } }];
  runs.forEach(([c, st]) => { tes.push(run(c, idx, st)); idx += c.length; });
  s.shape.text = { textElements: tes };
})();

module.exports = { pres, IN, PT };
