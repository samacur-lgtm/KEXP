# Handoff 261010: Spanner Style Panel v2, move to spanner-product-dev and ship the add-on

For a session with access to the `spanner-product-dev` GitHub org. Written 2026-10-10 by a session that only had access to `samacur-lgtm/KEXP`. Mason is the user. Torence is the Google Workspace admin.

## Goal

1. Put the v2 code in a repo in `spanner-product-dev`, following the Spanner security standard.
2. Test the Apps Script layer in a scratch deck, then publish it as a private add-on for the whole Spanner domain.
3. Tidy the Drive folder and the portfolio file.

## What this is

A Google Slides sidebar (Apps Script) that applies Spanner brand styles and, in v2, has a Check tab that checks a deck against the house rules from the 2026-10-09 slide review (type size floors, palette, sentence-case titles, images vs footer and title bar, blank and hidden slides, End slide tagline, file name, date format). It is meant to ship once as a private add-on so no one pastes code into a deck. Decisions and open questions are in `notes-slides-styles.md`; status and next steps are in `plan-slides-styles.md` (both in Drive, `Tools/slides-styles`).

## Start of session (org rules)

1. Read every file in `_SpannerClaude/ClaudeFolders/Shared-Claude/portfolio/` (`PORTFOLIO-shared.md` and one per person), then `CLAUDE.md`, `plan-slides-styles.md`, `notes-slides-styles.md` in `Tools/slides-styles`.
2. If `ClaudeFolders/` or its `portfolio/` folder is missing or empty, stop and tell Mason. Never create or rebuild it.
3. Apply the `spanner-security-standard` skill when you create the repo and push.

## Where the code is now

- Repo `samacur-lgtm/KEXP`, branch `claude/slides-style-panel-v2`, folder `slides-style-panel/`. Draft PR #1. Commits `27a2d24` (the work) and `090a8c0` (docs).
- If your session cannot read that repo, ask Mason to download the folder or add the repo to the session. Do not rewrite the code from the plan; it exists.
- Files: `Code.gs`, `Check.gs`, `Rules.gs`, `Analyze.gs`, `Fixes.gs`, `Sidebar.html`, `appsscript.json`, `.claspignore`, `.clasp.json.example`, `test/` (`run.js`, `ui-smoke.js`, `fixtures.js`, `load.js`), `INSTALL.md`, `CLAUDE.md`, plus plan, notes and status-page copies.

## Tasks, in order

### 1. Create the repo
- Create a **private** repo in `spanner-product-dev`, suggested name `slides-style-panel`. Put the contents of `slides-style-panel/` at the repo root (not nested).
- Keep in the repo: the code, `test/`, `appsscript.json`, `.claspignore`, `.clasp.json.example`, `.gitignore`, `package.json`, `INSTALL.md`, `CLAUDE.md`. Drop the plan, notes and status-page copies and this handoff: the Drive copies are the source of truth, so a second copy would drift.
- Apply the security standard: branch protection on `main`, secret scanning and push protection on, no secrets in the tree (there should be none; confirm with a search), `.clasp.json` stays git-ignored.
- Run `node test/run.js` before the first push. Expect `27 passed`. `test/ui-smoke.js` is optional and needs Playwright (`NODE_PATH=/opt/node-tools/node_modules` in the original environment).
- In `CLAUDE.md`, update the "Where things live" section with the new repo name.

### 2. Close out the old PR
- Comment on `samacur-lgtm/KEXP` PR #1 pointing to the new repo, then close it. Do not delete the branch unless Mason says so.

### 3. Test the Apps Script layer in a scratch deck (needs Mason in a browser)
Nothing that calls Google has run yet. Use a copy of a real 2026 client deck (for example one of the Skylight decks) and follow way C in `INSTALL.md`, or `clasp push` to a scratch project. Then:
- Open the panel from the Extensions menu. Check the menu fallback (`createAddonMenu`, then `createMenu`).
- Text and Shapes tabs: apply a built-in style, capture a custom style, edit one with cascade, apply the table style.
- Check tab: run it, use Go to and Fix on single findings, then Fix all safe.
- Likeliest failures, in order: `TextStyle.setBackgroundColor` (Highlight style), `updateTableBorderProperties` fields (table style), `createShape` on a layout (End tagline fix), and the `revisionId` guard on `batchUpdate`.
- Fix what breaks. Any new rule or fix gets a fixture and a test in `test/`.

### 4. Confirm the master's layout names
`END_LAYOUT_RE` and `FREE_LAYOUT_RE` in `Analyze.gs` are guesses. Read the real layout names from a deck (`presentations.get`, `layoutProperties.displayName`), fix the regexes, and add a fixture. Wrong names mean false "blank slide" and "image in footer" findings.

### 5. Publish the private add-on (with Torence)
Mason already has a Google Cloud project set up for other things. Use it if it fits. Check these first, since the add-on shares the project:
- **One Marketplace listing per Cloud project.** If that project already has a Google Workspace Marketplace SDK configuration for another app, make a new project for this one.
- **OAuth consent screen** must be user type Internal. Adding the two scopes (`presentations`, `script.container.ui`) changes the consent screen for every other app on that project. Confirm with Mason that is fine.
- Steps are in `INSTALL.md` way A, in order: `clasp login`, `clasp create --type standalone`, `clasp push`; change the Apps Script project to the Cloud project number; enable the Google Slides API and the Google Workspace Marketplace SDK; deploy as an add-on; configure a Private listing; publish; Torence installs it for the domain in the Admin console.
- Those Marketplace steps follow Google's documentation and were not tested. Check them against the live console, and correct `INSTALL.md` where they differ.

### 6. Tidy Drive and the portfolio
- **Archive the v1 files.** In Drive `Tools/slides-styles` there is an empty folder `_archive-rev1-261010`. Move these into it: `Code.gs`, `Sidebar.html`, `plan.md`, `notes.md`, `plan.html`, `notes.html`, `INSTALL.md`. The Drive connector in the first session could not move them (it can only change files it created), so do it in the Drive UI or through Drive for Desktop. Leave the v2 files (`CLAUDE.md`, `plan-slides-styles.md`, `notes-slides-styles.md`, `plan_notes-slides-styles.html`, `INSTALL-v2.md`) where they are. Once archived, rename `INSTALL-v2.md` to `INSTALL.md` and update the references in `CLAUDE.md` and `plan-slides-styles.md`.
- The older folder `Slides styles` is a stale duplicate; Mason can retire it.
- Update the "Slides styles" row in `PORTFOLIO-mason.md` (Mason's own file, so you may write it): new repo name, status "v2 built; add-on publish pending".
- Update `plan-slides-styles.md` and `notes-slides-styles.md` as work lands: Current Status, Next Steps, a Session History row. Rebuild `plan_notes-slides-styles.html` if architecture changes. Use `/spanner-design-loop` for visual work.

## Do not
- Do not run `npm install` or any build inside a Drive folder. Code stays out of Drive.
- Do not paste secrets or script ids into git. `.clasp.json` is ignored on purpose.
- Do not create or rebuild `ClaudeFolders/` if it is missing.
- Do not call the Apps Script layer tested until it has run in a real deck.

## Done when
- The repo exists in `spanner-product-dev`, tests pass, protections are on, and PR #1 is closed with a pointer.
- A scratch-deck run of every tab has passed, with fixes pushed.
- The add-on is installed for the domain and **Extensions > Spanner Styles > Open style panel** works on a fresh deck for a person other than Mason.
- v1 files are archived and the plan, notes and portfolio row are current.

## Open questions for Mason
1. Repo name: `slides-style-panel`, or something under a tools naming pattern?
2. Is the existing Cloud project free of a Marketplace listing, and OK to take two more scopes?
3. Should the check run automatically when the panel opens, or stay a button? (`notes-slides-styles.md`, open question 3)
