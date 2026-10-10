# Spanner Style Panel: plan

Last updated: 2026-10-10

## Current Status

v2 is built and tested as far as it can be outside Google. The panel keeps its Text, Shapes and Colors tabs and gains a Check tab that turns the 2026-10-09 slide review checklist into buttons: type size floors, palette, sentence-case titles, images vs the footer and title bar, blank and hidden slides, the End slide tagline, file name and date format. Built-in sizes now scale to the deck's page size. The big change for adoption is packaging: the panel is set up to ship as one private add-on for the whole Spanner domain, so no one pastes code into a deck any more. The pure logic passes 27 tests and the sidebar passes a browser smoke test with a mocked server. The Apps Script calls and the Marketplace publish have not run yet, because they need Google.

## Complete

| Item | Notes |
|---|---|
| v1 sidebar: Text, Shapes, Colors, capture, cascade, live match | May 2026 |
| Check tab: 19 checks, per-finding Go to and Fix, Fix all safe | Rules from the slide review |
| Page-size scaling of built-in styles | 10 in is 1.0, 13.33 in is 1.33 |
| New styles: Highlight, Delta, Code (text); Code Box, Image Frame (shape); Spanner table style tool | From the review |
| Slides advanced service replaces UrlFetch + OAuth token | Fewer scopes, one read for the whole deck |
| Edit forms bound with listeners | Closes the old quote-escaping question |
| Colors tab split: Spanner palette vs Other | Off-palette swatches no longer sit beside brand ones |
| Tests: `test/run.js` (27), `test/ui-smoke.js` (12 checks) | |
| `INSTALL.md` rewritten: add-on first, template deck and paste as fallbacks | |

## In Progress

| Item | Notes |
|---|---|
| Nothing active | Waiting on a scratch-deck test and Torence for the Marketplace step |

## Next Steps

1. **Test in a scratch deck.** Copy the files in (INSTALL.md, way C), open a copy of a real 2026 client deck, run Check, and fix any `SlidesApp` or batchUpdate call that Google rejects. Likeliest trouble: `setBackgroundColor`, `updateTableBorderProperties` fields, `createShape` on a layout, `createAddonMenu`.
2. **Confirm the master's layout names** and fix `END_LAYOUT_RE` and `FREE_LAYOUT_RE` in `Analyze.gs` to match. Add a fixture from the real master.
3. **Publish the private add-on** (INSTALL.md, way A). Torence is the Workspace admin and owns this step. Needs a Spanner GCP project.
4. **Fix the Spanner master once**, using the panel on the template deck: "what's next." on the End layout, a master table style, and a Hero image layout. New decks then start correct.
5. **Run Check on the five reviewed decks** and compare with the review. Tune thresholds (dense slide at 140 words, color tolerance 30) against what it flags.
6. **Add the program-system checks** once those decisions land: persistent phase timeline slide, "decisions needed today" slide, internal vs client export.
7. **Plan the Inter font helper** (v1 next step 4): a one-click way to load Inter into a deck.
8. **Move the code repo to the Spanner GitHub org** (`spanner-product-dev`) and retire the stale v1 `Code.gs` and `Sidebar.html` in this Drive folder once v2 is tested. Drive holds the tracking files only; the code is in git.

## Key References

| What | Where |
|---|---|
| Slide review and the 8-point checklist | `alyssa-slides.md`, SpannerOS `reference/process-research-261009/` |
| Presentation methods (timeline, decisions slide, house rules) | Section 6 of `proposal-program-system-261009.md` |
| Install and publish steps | `INSTALL.md` |
| Rule logic | `Rules.gs`, `Analyze.gs`, `Fixes.gs` (in git, not in this folder) |
| Home folder | `Tools/slides-styles` (canonical as of 2026-10-10) |
