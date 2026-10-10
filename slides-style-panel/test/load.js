// Loads the pure .gs files into one vm context so tests can call their functions.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPure() {
  const ctx = vm.createContext({ console, Date, Math, JSON });
  ['Rules.gs', 'Analyze.gs', 'Fixes.gs'].forEach((f) => {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  });
  return ctx;
}

module.exports = { loadPure };
