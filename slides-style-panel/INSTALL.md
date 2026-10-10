# Spanner Style Panel: install

Three ways to get the panel into a deck, from least to most work per deck. Use the first one.

| Way | Per-deck work | Updates | Needs |
|---|---|---|---|
| **A. Private add-on for the domain** (recommended) | None. Open any deck: Extensions > Spanner Styles > Open style panel | Automatic for everyone when a new version is published | A Workspace admin, once |
| **B. Spanner template deck** | None for decks copied from the template | Manual, per deck | Edit access to the template |
| **C. Paste into one deck** (the old way) | About 5 minutes | Manual | Nothing |

## A. Private add-on (do this once, then it works on every deck)

Not tested from the build environment. The Marketplace screens and names below follow Google's documentation as of this writing; check them against the live console before you start.

1. **Push the code.** From `slides-style-panel/` on your machine:
   ```
   npm install -g @google/clasp
   clasp login
   clasp create --type standalone --title "Spanner Style Panel"
   clasp push
   ```
   `clasp create` writes a `.clasp.json` with the script id. It is git-ignored; see `.clasp.json.example`.
2. **Move the script to a Spanner Google Cloud project.** Apps Script > Project Settings > Google Cloud Platform project > Change project. Use a standard project owned by the Spanner Workspace, not the default hidden one.
3. **Enable the APIs** in that project: Google Slides API and Google Workspace Marketplace SDK.
4. **Deploy as an add-on.** Apps Script > Deploy > New deployment > type Add-on. This gives a version number.
5. **Configure the listing** in the Marketplace SDK (App Configuration):
   - Visibility: **Private** (Spanner domain only). Individual and admin install allowed.
   - Extension: Slides add-on, with the script id and version from step 4.
   - OAuth scopes: the two in `appsscript.json` (`presentations`, `script.container.ui`).
   - Store listing: name "Spanner Styles", short description, icons. Private listings need the same assets as public ones.
6. **Publish** the private listing.
7. **Install for everyone.** Admin console > Apps > Google Workspace Marketplace apps > add the app and install it for the whole domain (or an org unit).
8. **Check.** Open any deck, then Extensions > Spanner Styles > Open style panel. The first person to run it sees a one-time permission prompt. Because the app is internal to the domain, there is no Google verification review.

**Shipping an update:** `clasp push`, create a new deployment version, then point the Marketplace SDK configuration at that version. People get it the next time they open a deck.

## B. Spanner template deck (stopgap)

Open the Spanner master template, then Extensions > Apps Script, and paste the files from this folder (see C). A deck made with File > Make a copy of the template carries the script with it, so the Extensions > Spanner Styles menu appears in every new deck. Older decks do not get it. Updates mean editing the template and re-pasting in any deck you care about.

## C. Paste into one deck

1. In the deck: Extensions > Apps Script.
2. Replace `Code.gs` with this folder's `Code.gs`. Add four more script files named `Rules`, `Analyze`, `Fixes` and `Check` (File + > Script) with the matching contents. Add an HTML file named exactly `Sidebar`.
3. Project Settings > tick "Show appsscript.json manifest file" and paste in `appsscript.json`. This turns on the Slides advanced service the panel uses.
4. Save, run `onOpen` once and accept the permission prompt, then reload the deck.
5. Open **Spanner Styles > Open style panel**.

## What lives where

| Thing | Where it lives |
|---|---|
| Built-in styles, house rules, deck checks | The add-on. Updating the add-on updates them everywhere |
| Custom styles a person saves | Per deck, in the deck's document properties. They travel with the file |
| Fixing the master (End layout tagline, table style) | In the deck, from the Check tab. Fix the Spanner template once so new decks start right |

## Developing

```
node test/run.js                      # rules, analyzer and fix builders (no dependencies)
NODE_PATH=/opt/node-tools/node_modules node test/ui-smoke.js   # sidebar in a browser, mocked server
```

The Apps Script calls themselves (`SlidesApp`, the Slides API, `createAddonMenu`) cannot run outside Google. Test those in a scratch deck before publishing.
