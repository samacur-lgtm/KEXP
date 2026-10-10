// =====================================================================
// SPANNER STYLE PANEL - Check.gs
// Service layer for the "Check" tab: fetch the deck, run the pure analyzer
// (Analyze.gs), apply fixes (Fixes.gs). The one-page checklist from the
// 2026-10-09 slide review, as buttons.
// =====================================================================

function fetchPresentation_() {
  return Slides.Presentations.get(SlidesApp.getActivePresentation().getId());
}

// Protected words for sentence case: words that appear capitalised mid-sentence in
// body text, so program and client names (Skylight, Fridge) survive "Sentence case".
function protectedWordsFrom_(pres) {
  var seen = {};
  (pres.slides || []).forEach(function (s) {
    flattenElements_(s.pageElements || []).forEach(function (it) {
      textContainersOf_(it.el).forEach(function (c) {
        if (TITLE_PLACEHOLDERS[c.placeholderType]) return;
        var words = plainText_(c.text).split(/\s+/);
        words.forEach(function (w, i) {
          var core = w.replace(/[^A-Za-z]/g, '');
          if (i > 0 && core.length > 2 && /^[A-Z][a-z]+$/.test(core) && !/[.:!?]$/.test(words[i - 1])) seen[core] = 1;
        });
      });
    });
  });
  return Object.keys(seen);
}

function runDeckCheck() {
  try {
    var pres = fetchPresentation_();
    var findings = analyzePresentation_(pres, { protectedWords: protectedWordsFrom_(pres) });
    var scale = scaleForPageWidth_(dimToEmu_(pres.pageSize.width));
    var counts = { error: 0, warn: 0, info: 0, safe: 0 };
    findings.forEach(function (f) { counts[f.severity]++; if (f.fix && f.safe) counts.safe++; });
    return {
      success: true, findings: findings, counts: counts, revisionId: pres.revisionId,
      page: { widthIn: round1_(dimToEmu_(pres.pageSize.width) / EMU_PER_IN),
              heightIn: round1_(dimToEmu_(pres.pageSize.height) / EMU_PER_IN),
              scale: round1_(scale * 100) / 100,
              bodyFloor: round1_(BODY_FLOOR_PT * scale), labelFloor: round1_(LABEL_FLOOR_PT * scale) },
      slides: (pres.slides || []).length
    };
  } catch (e) { return { success: false, message: e.message }; }
}

// Apply one finding's fix. The revision id from the check guards against stale text indexes.
function applyFix(fix, revisionId) {
  try {
    var reqs = orderRequests_(buildFixRequests_(fix));
    slidesBatch_(reqs, revisionId);
    return ok_('Fixed');
  } catch (e) {
    var stale = /revision/i.test(e.message);
    return err_(stale ? 'The deck changed since the check. Run the check again.' : e.message);
  }
}

// Apply every fix marked safe (yellow to light blue, double spaces) in one batch.
function fixAllSafe(revisionId) {
  try {
    var pres = fetchPresentation_();
    if (revisionId && pres.revisionId !== revisionId)
      return err_('The deck changed since the check. Run the check again.');
    var findings = analyzePresentation_(pres, { protectedWords: protectedWordsFrom_(pres) });
    var tagged = [], n = 0;
    findings.forEach(function (f) {
      if (f.fix && f.safe) { tagged = tagged.concat(buildFixRequests_(f.fix)); n++; }
    });
    if (!n) return ok_('Nothing to fix automatically');
    slidesBatch_(orderRequests_(tagged), pres.revisionId);
    return ok_('Fixed ' + n + ' issue' + (n > 1 ? 's' : ''));
  } catch (e) { return err_(e.message); }
}

// Jump to a finding in the deck.
function selectFinding(slideId, objectId) {
  try {
    var pres = SlidesApp.getActivePresentation();
    var slide = pres.getSlideById(slideId);
    if (!slide) return err_('Slide not found');
    slide.selectAsCurrentPage();
    if (objectId) {
      var els = slide.getPageElements();
      for (var i = 0; i < els.length; i++) {
        if (els[i].getObjectId() === objectId) { els[i].select(); break; }
      }
    }
    return ok_('Selected');
  } catch (e) { return err_(e.message); }
}
