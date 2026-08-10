#!/usr/bin/env node
/**
 * Zero-dependency unit tests for lib/services/version.ts (used by the
 * self-update service).
 *
 * The helpers are pure TypeScript with no React Native imports, so they are
 * compiled in-memory with the already-installed `typescript` devDependency and
 * exercised under plain Node:
 *
 *   node scripts/test-updates.js
 */
'use strict';

const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const os = require('os');

const srcPath = path.join(__dirname, '..', 'lib', 'services', 'version.ts');
const source = fs.readFileSync(srcPath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

const tmp = path.join(os.tmpdir(), `version-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(tmp, output);
let m;
try {
  m = require(tmp);
} finally {
  fs.unlinkSync(tmp);
}

let passed = 0;
let failed = 0;

function assert(cond, name, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function sign(n) {
  return n < 0 ? -1 : n > 0 ? 1 : 0;
}

console.log('parseVersion');
assert(JSON.stringify(m.parseVersion('v4.3.5')) === JSON.stringify([4, 3, 5]), 'v4.3.5 → [4,3,5]');
assert(JSON.stringify(m.parseVersion('4.3.5')) === JSON.stringify([4, 3, 5]), '4.3.5 → [4,3,5]');
assert(JSON.stringify(m.parseVersion('4.3')) === JSON.stringify([4, 3]), '4.3 → [4,3]');
assert(JSON.stringify(m.parseVersion('garbage')) === JSON.stringify([0, 0, 0]), 'garbage → [0,0,0]');
assert(JSON.stringify(m.parseVersion(null)) === JSON.stringify([0, 0, 0]), 'null → [0,0,0]');
assert(JSON.stringify(m.parseVersion(undefined)) === JSON.stringify([0, 0, 0]), 'undefined → [0,0,0]');
assert(JSON.stringify(m.parseVersion('4.x.5')) === JSON.stringify([0, 0, 0]), '4.x.5 → [0,0,0]');

console.log('compareVersions');
assert(m.compareVersions('4.3.5', '4.3.5') === 0, 'equal versions');
assert(m.compareVersions('4.3.6', '4.3.5') > 0, 'newer patch wins');
assert(m.compareVersions('4.3.5', '4.3.6') < 0, 'older patch loses');
assert(m.compareVersions('4.10.0', '4.9.9') > 0, '10 > 9 (no lexicographic trap)');
assert(m.compareVersions('v4.3.5', '4.3.5') === 0, 'v prefix ignored');
assert(m.compareVersions('5.0.0', '4.9.9') > 0, 'major wins');
assert(m.compareVersions('4.3', '4.3.0') === 0, 'shorter version equals padded');
assert(m.compareVersions('garbage', '4.3.5') < 0, 'malformed never wins');
assert(m.compareVersions('4.3.5', 'garbage') > 0, 'malformed never wins (reversed)');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
