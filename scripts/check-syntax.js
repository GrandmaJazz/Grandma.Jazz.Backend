const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
function check(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) check(path);
    else if (path.endsWith('.js')) execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  }
}
for (const dir of ['src', 'scripts', 'tests']) check(dir);
console.log('All backend JavaScript syntax checks passed (no compilation required).');
