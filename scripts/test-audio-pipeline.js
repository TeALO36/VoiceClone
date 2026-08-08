#!/usr/bin/env node
/**
 * Zero-dependency unit tests for lib/services/audio-pipeline.ts.
 *
 * The pipeline is pure TypeScript with no React Native imports, so it is
 * compiled in-memory with the already-installed `typescript` devDependency and
 * exercised under plain Node:
 *
 *   node scripts/test-audio-pipeline.js
 */
'use strict';

const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const os = require('os');

const srcPath = path.join(__dirname, '..', 'lib', 'services', 'audio-pipeline.ts');
const source = fs.readFileSync(srcPath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

const tmp = path.join(os.tmpdir(), `audio-pipeline-${process.pid}-${Date.now()}.cjs`);
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

function assertClose(a, b, eps, name) {
  assert(Math.abs(a - b) <= eps, name, `expected ${b} ±${eps}, got ${a}`);
}

const {
  DEFAULT_SPEECH_PARAMS,
  segmentTextWithPauses,
  isDefaultParams,
  pauseFor,
  wavEncode,
  wavDecode,
  concatSegments,
  applyVolume,
  timeStretch,
} = m;

console.log('\nsegmentTextWithPauses');
{
  const segments = segmentTextWithPauses('Bonjour, comment ça va ? Très bien.');
  assert(segments.length === 3, 'splits on comma/question/period', JSON.stringify(segments));
  assert(segments[0].text === 'Bonjour,', 'keeps comma attached', segments[0].text);
  assert(segments[0].trailing === 'comma', 'comma kind', segments[0].trailing);
  assert(segments[1].trailing === 'question', 'question kind', segments[1].trailing);
  assert(segments[2].trailing === 'period', 'period kind', segments[2].trailing);
  assert(segments[2].text === 'Très bien.', 'keeps period attached', segments[2].text);
}

{
  const segments = segmentTextWithPauses('Attends?! Oui\nNon.');
  assert(segments.length === 3, 'collapses runs and newlines', JSON.stringify(segments));
  assert(segments[0].trailing === 'exclamation', 'run "?!" takes last kind', segments[0].trailing);
  assert(segments[0].text === 'Attends?!', 'run kept in text', segments[0].text);
  assert(segments[1].trailing === 'newline', 'newline kind', segments[1].trailing);
}

{
  const segments = segmentTextWithPauses('Un seul segment');
  assert(segments.length === 1 && segments[0].trailing === null, 'single segment, no trailing');
  assert(segmentTextWithPauses('   ').length === 0, 'whitespace only yields nothing');
  assert(segmentTextWithPauses('').length === 0, 'empty text yields nothing');
}

console.log('\nisDefaultParams / pauseFor');
{
  assert(isDefaultParams(DEFAULT_SPEECH_PARAMS) === true, 'defaults are neutral');
  assert(
    isDefaultParams({ ...DEFAULT_SPEECH_PARAMS, pauseAfterCommaMs: 300 }) === false,
    'comma pause makes params active'
  );
  assert(
    pauseFor('comma', { ...DEFAULT_SPEECH_PARAMS, pauseAfterCommaMs: 250 }) === 250,
    'pauseFor reads the right key'
  );
}

console.log('\nwav codec');
{
  const rate = 24000;
  const n = rate; // 1 second
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5;
  const bytes = wavEncode({ samples, sampleRate: rate });
  assert(bytes.length === 44 + n * 2, 'header + data length', `got ${bytes.length}`);
  assert(
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF',
    'RIFF magic'
  );
  const decoded = wavDecode(bytes);
  assert(decoded.sampleRate === rate, 'sample rate round-trip');
  assert(decoded.samples.length === n, 'sample count round-trip');
  let maxErr = 0;
  for (let i = 0; i < n; i++) maxErr = Math.max(maxErr, Math.abs(decoded.samples[i] - samples[i]));
  assert(maxErr <= 1 / 32768 + 1e-9, '16-bit quantization error bounded', `maxErr=${maxErr}`);
}

{
  let threw = false;
  try {
    wavDecode(new Uint8Array([1, 2, 3, 4]));
  } catch (_) {
    threw = true;
  }
  assert(threw, 'garbage input throws');
}

console.log('\nconcatSegments / silence');
{
  const a = new Float32Array([1, 2, 3]);
  const b = new Float32Array([4, 5]);
  const out = concatSegments([a, b], [1000], 1000); // 1s silence = 1000 samples
  assert(out.length === 3 + 1000 + 2, 'silence inserted between', `len=${out.length}`);
  assert(out[3] === 0 && out[1002] === 0, 'silence is zero');
  assert(out[1003] === 4, 'second segment after silence');
}

console.log('\napplyVolume');
{
  const out = applyVolume(new Float32Array([0.5, -0.5]), 2);
  assert(out[0] === 1 && out[1] === -1, 'doubles amplitude');
  const same = applyVolume(new Float32Array([0.5]), 1);
  assert(same[0] === 0.5, 'gain 1 returns same values');
}

console.log('\ntimeStretch (WSOLA)');
{
  const rate = 24000;
  const n = rate; // 1s
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin((2 * Math.PI * 220 * i) / rate);

  const fast = timeStretch(samples, 1.5, rate);
  const expectedFast = Math.round(n / 1.5);
  assertClose(fast.length, expectedFast, Math.round(rate * 0.05), '1.5× ≈ 2/3 length');

  const slow = timeStretch(samples, 0.75, rate);
  const expectedSlow = Math.round(n / 0.75);
  assertClose(slow.length, expectedSlow, Math.round(rate * 0.06), '0.75× ≈ 4/3 length');

  let maxAbs = 0;
  let nan = false;
  for (const v of fast) {
    if (Number.isNaN(v)) nan = true;
    maxAbs = Math.max(maxAbs, Math.abs(v));
  }
  assert(!nan, 'no NaN');
  assert(maxAbs <= 1.001, 'bounded output', `max=${maxAbs}`);

  // Pitch preservation: the fundamental frequency of a 220 Hz sine must stay
  // ~220 Hz after stretching (a naive resample would shift it to 330 or 165).
  // Autocorrelation-based estimate over the stable central region — robust to
  // the amplitude modulation WSOLA overlap-add introduces.
  function autocorrFreq(x, sr) {
    const start = Math.floor(x.length * 0.25);
    const end = Math.floor(x.length * 0.75);
    const minLag = Math.floor(sr / 400); // down to 400 Hz
    const maxLag = Math.ceil(sr / 80);   // up to 80 Hz
    let bestLag = minLag;
    let bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let score = 0;
      for (let i = start; i + lag < end; i++) score += x[i] * x[i + lag];
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    return sr / bestLag;
  }
  const f0 = autocorrFreq(samples, rate);
  const fFast = autocorrFreq(fast, rate);
  const fSlow = autocorrFreq(slow, rate);
  assert(Math.abs(f0 - 220) < 3, 'source is 220 Hz', `got ${f0.toFixed(1)}`);
  assert(Math.abs(fFast - 220) < 6, 'pitch preserved when faster', `got ${fFast.toFixed(1)}`);
  assert(Math.abs(fSlow - 220) < 6, 'pitch preserved when slower', `got ${fSlow.toFixed(1)}`);
}

console.log('\n────────────────────────────────────────');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
