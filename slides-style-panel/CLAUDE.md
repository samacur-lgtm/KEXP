# Spanner Style Panel (Slides styles)

Google Slides sidebar that applies Spanner brand styles and checks a deck against the house rules.

## Read first
1. `plan-slides-styles.md` (status, next steps)
2. `notes-slides-styles.md` (decisions, open questions)
3. `INSTALL.md` (how it ships)
4. House rules source: `alyssa-slides.md` in the SpannerOS `reference/process-research-261009/` folder, and section 6 of `proposal-program-system-261009.md`. The brand skills (`spanner-brand-visual`, `spanner-brand-voice`) decide anything the review does not.

## Where things live
Tracking files (`CLAUDE.md`, plan, notes, status page, install guide) live in Drive at `Tools/slides-styles`. The code lives in git, not Drive. The `Code.gs` and `Sidebar.html` still in that Drive folder are the v1 copies and are stale.

## Stack
Apps Script (V8) + HtmlService sidebar. Slides advanced service (`Slides`) for batchUpdate and for reading the whole deck. No external services, no secrets.

## Files
| File | Role |
|---|---|
| `Rules.gs`, `Analyze.gs`, `Fixes.gs` | Pure logic. No Apps Script services. Tested under Node |
| `Check.gs` | Service layer for the Check tab |
| `Code.gs` | Menu, built-in styles, apply/capture/cascade |
| `Sidebar.html` | UI |
| `test/` | `run.js` (logic), `ui-smoke.js` (browser, mocked `google.script.run`) |

## Rules for changes
- Put every new rule in `Analyze.gs` as pure code with a fixture and a test. Do not call `SlidesApp` from the analyzer.
- Built-in text sizes are for the 10 in page. They are scaled by page width at apply time, and stored styles are normalised back to the 10 in page.
- A fix goes in "Fix all safe" only if it cannot reflow text or change meaning (yellow to light blue, double spaces). Everything else is one click at a time.
- Palette is navy, azure, orange, #CAECF6, #D4D8DB, white. Green (#0B7C58) is sustainability only.
- Code stays out of Google Drive. This lives in git; Drive holds only the `.md` and `.html` tracking files.

## Gotchas
- `SlidesApp` cannot run outside Google, so the Apps Script layer is untested here. Test in a scratch deck.
- Text-range indexes go stale when the deck changes. Every fix carries the revision id from the check and is rejected if the deck moved.
- The layout-name regexes (`END_LAYOUT_RE`, `FREE_LAYOUT_RE`) are guesses at the master's layout names. Confirm them against the real master.
