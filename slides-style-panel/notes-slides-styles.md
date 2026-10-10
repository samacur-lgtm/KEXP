# Spanner Style Panel: notes

Last updated: 2026-10-10

## Architecture Decisions

**Decision:** Ship as one private Editor Add-on installed for the Spanner domain. Per-deck paste stays as a fallback only.
**Why:** Per-deck install was the adoption barrier, and nothing updated after install. An admin-installed add-on puts the menu in every deck and updates everywhere at once.
**Implication:** Needs the Workspace admin (Torence), a Spanner GCP project and a private Marketplace listing. Custom styles still live per deck.

**Decision:** Use the Slides advanced service (`Slides`), not `UrlFetchApp` with a hand-fetched OAuth token.
**Why:** It needs no manual token, shrinks scopes to `presentations` and `script.container.ui`, and lets the Check tab read the whole deck in one call.
**Implication:** `appsscript.json` must enable the service. Pasting into a deck (fallback C) needs the manifest too.

**Decision:** The deck check reads one `presentations.get` JSON and analyses it with pure functions. It does not loop over `SlidesApp` objects.
**Why:** `SlidesApp` is slow on big decks and cannot run outside Google. Pure code on JSON is fast and can be tested in Node with fixtures built from the review's findings.
**Implication:** Rules live in `Analyze.gs` with a fixture and a test each. Only the thin service layer (`Check.gs`, `Code.gs`) is untested locally.

**Decision:** Built-in text sizes are for the 10 in page and scale by page width at apply time. Stored and captured sizes are normalised back to 10 in.
**Why:** The review measured type against a 14 pt floor on the 10 in page. A 13.33 in deck needs 1.33x to look the same.
**Implication:** Style matching and cascade compare normalised sizes, so a style matches on any page size.

**Decision:** "Fix all safe" covers only yellow to light blue and double spaces. Size raises, font changes, sentence case, slide deletion and the End tagline are one click each.
**Why:** The unsafe ones can reflow text, lowercase a program name or remove content.
**Implication:** Each finding says whether its fix is safe. Fixes carry the revision id and are refused if the deck changed since the check.

**Decision:** Palette is six colors (navy, azure, orange, #CAECF6, #D4D8DB, white) with a 30-point RGB tolerance. Green is allowed for sustainability content only.
**Why:** The review's palette-only rule, plus the earlier brand audit that removed the green Success Box.
**Implication:** Theme colors are treated as template-defined and not flagged. Black and mid gray are flagged. The Colors tab lists them under "Other".

**Decision:** The "what's next." tagline is added once to the End layout, not slide by slide.
**Why:** The review found it missing on every deck, which points at the master.
**Implication:** The new text box is placed mid-page and needs one nudge. Fixing the Spanner template removes the need.

**Superseded:** "Install per presentation by copying two files" (v1, May 2026) is now fallback C. "Custom styles do not sync across decks" still holds.

## Schema Decisions

Text style config (stored per deck): `fontFamily, fontSize (10 in page points), bold, italic, color, lineSpacing, alignment, spaceAbove, spaceBelow, indentStart, indentFirstLine, bullets, highlightColor`. The bullet key is `bullets` (the v1 notes wrongly said `bulletPreset`).

Shape style config: `fillColor, borderColor, borderWeight, contentAlignment, autofit`.

Document properties: `spannerCustomText`, `spannerCustomShape` (JSON maps of name to config; a custom entry with a built-in name is an override).

Finding: `id, rule, severity (error|warn|info), slide, slideId, objectId, message, detail, fix, fixLabel, safe`. A fix is plain data turned into batchUpdate requests by `Fixes.gs`.

## Session History

| Date | Work done |
|---|---|
| 2026-05-11 | v1: sidebar, built-in styles, capture, cascade, live match, brand audit |
| 2026-10-10 | Moved tracking files and install guide into `Tools/slides-styles`; code stays in git per the org standard |
| 2026-10-10 | v2: read the Oct 9 process work, built the Check tab from the slide review, page scaling, new styles, table style, advanced service, add-on packaging plan, tests |

## Open Questions

1. Torence is the Workspace admin (Mason, 2026-10-10), so he owns the private Marketplace listing and install. Is a Spanner GCP project already set up for internal tools?
2. What are the exact layout names in the Spanner master (End, title, hero)? The check guesses with regexes.
3. Should the check run automatically when the panel opens, or stay a button?
4. Is 140 words per slide the right "dense" threshold, and is color tolerance 30 right? Tune on the five reviewed decks.
5. Should the template's table style become the master default so the Shapes tab tool is rarely needed?
6. Should the panel read Spanner-wide custom styles from one place (a shared sheet) so decks share them, or is per-deck enough?
7. Resolved 2026-10-10: `Tools/slides-styles` is the canonical Drive folder (Mason's call). The older `Slides styles` folder is a stale duplicate and can be retired.
8. The code lives in a personal GitHub repo for now. The org standard is `spanner-product-dev`. Where should it go?
