#!/usr/bin/env node
/**
 * Wiring tests for the model catalog and the per-engine call paths.
 *
 * These exist because of the class of bug that keeps reaching users: nothing
 * here is about audio quality, it is about an engine being handed something it
 * cannot use — a quality tier that maps to `undefined`, a preset pointing at a
 * file the catalog never downloads, two catalog names fed by one URL. Each
 * assertion below corresponds to a defect that actually shipped:
 *
 *  - six Pocket voice presets resolving to one identical file (4.3.19)
 *  - a catalog size that counted the same download twice (4.3.19)
 *  - renamed quality tiers leaving an engine's step map without the key it is
 *    asked for, which reaches the user as "the function has been rejected"
 *    because `undefined` fails the native Int argument
 *
 * The engines themselves cannot run here — they are native. What CAN be
 * checked without a device is that every value the JS layer will hand across
 * the bridge is well-formed, and that what the catalog installs is what the
 * native loaders look for.
 *
 *   node scripts/test-engine-wiring.js
 */
'use strict';

const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── load the TS sources under test ───
// local-tts.ts pulls in React Native and expo-file-system, which cannot load
// under plain Node. The catalog and the pure helpers are what matter here, so
// the imports are stubbed and only the pure exports are exercised.
function loadModule(relPath, stubs = {}) {
  const srcPath = path.join(__dirname, '..', relPath);
  const source = fs.readFileSync(srcPath, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const tmp = path.join(os.tmpdir(), `wiring-${process.pid}-${Math.random().toString(36).slice(2)}.cjs`);
  fs.writeFileSync(tmp, out);
  const Module = require('module');
  const origResolve = Module._resolveFilename;
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    for (const key of Object.keys(stubs)) {
      if (request.endsWith(key) || request.startsWith(key)) return stubs[key];
    }
    return origLoad.apply(this, arguments);
  };
  try {
    return require(tmp);
  } finally {
    Module._load = origLoad;
    Module._resolveFilename = origResolve;
    fs.unlinkSync(tmp);
  }
}

let passed = 0;
let failed = 0;
const failures = [];

function check(cond, name, detail) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(detail ? `${name}\n      ${detail}` : name);
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
    return;
  }
  console.log(`  ✓ ${name}`);
}

const FS_STUB = {
  documentDirectory: 'file:///doc/',
  getInfoAsync: async () => ({ exists: false }),
  readAsStringAsync: async () => '',
  makeDirectoryAsync: async () => {},
  deleteAsync: async () => {},
  createDownloadResumable: () => ({ downloadAsync: async () => ({ status: 200 }) }),
  getFreeDiskStorageAsync: async () => 1e12,
};

const stubs = {
  'expo-file-system/legacy': FS_STUB,
  'expo-file-system': FS_STUB,
  '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {} } },
  'react-native': { Platform: { OS: 'android' } },
  'expo-modules-core': { requireNativeModule: () => ({}) },
};

const models = loadModule('lib/services/models.ts', stubs);
const catalog = models.modelsService.getCatalog();

console.log('\nCatalogue — cohérence interne');
console.log('─'.repeat(60));

check(catalog.length > 0, 'le catalogue n’est pas vide', `${catalog.length} entrées`);

// A catalog entry whose advertised size disagrees with its own file list makes
// the free-space check demand the wrong amount — it counted one Pocket voice
// twice, inflating every multilingual entry.
for (const m of catalog) {
  const summed = m.ggufFiles.reduce((n, f) => n + (f.expectedSize ?? 0), 0);
  const allKnown = m.ggufFiles.every((f) => f.expectedSize != null);
  if (!allKnown) continue;
  check(
    summed === m.size,
    `${m.id} : taille annoncée = somme des fichiers`,
    summed === m.size ? '' : `annoncé ${m.size.toLocaleString()}, somme ${summed.toLocaleString()} (écart ${(m.size - summed).toLocaleString()})`
  );
}

// Two names fed by one URL is how six voice presets became one voice.
for (const m of catalog) {
  const byUrl = new Map();
  for (const f of m.ggufFiles) {
    if (!byUrl.has(f.url)) byUrl.set(f.url, []);
    byUrl.get(f.url).push(f.name);
  }
  const dupes = [...byUrl.entries()].filter(([, names]) => names.length > 1);
  check(
    dupes.length === 0,
    `${m.id} : aucun fichier téléchargé deux fois sous des noms différents`,
    dupes.map(([url, names]) => `${names.join(' et ')} ← ${url}`).join('; ')
  );
}

// Duplicate destination names silently overwrite each other mid-install.
for (const m of catalog) {
  const names = m.ggufFiles.map((f) => f.name);
  check(
    new Set(names).size === names.length,
    `${m.id} : noms de destination uniques`,
    names.filter((n, i) => names.indexOf(n) !== i).join(', ')
  );
}

for (const m of catalog) {
  check(
    m.ggufFiles.every((f) => /^https:\/\//.test(f.url)),
    `${m.id} : toutes les URL sont en HTTPS`
  );
}

console.log('\nMoteurs — ce que chaque moteur charge doit être installé');
console.log('─'.repeat(60));

// Filenames the native loaders hardcode. A catalog that stops shipping one of
// these produces a load failure the JS layer reports only as "rejected".
const ENGINE_REQUIRED = {
  f5: ['F5_Preprocess.onnx', 'F5_Decode.onnx', 'vocab.txt'],
  pocket: ['encoder.onnx', 'text_conditioner.onnx', 'vocab.json', 'token_scores.json'],
};

for (const m of catalog) {
  const required = ENGINE_REQUIRED[m.type];
  if (!required) continue;
  const names = new Set(m.ggufFiles.map((f) => f.name));
  const missing = required.filter((r) => !names.has(r));
  check(
    missing.length === 0,
    `${m.id} : fournit les fichiers que le moteur ${m.type} charge`,
    missing.length ? `manquant : ${missing.join(', ')}` : ''
  );
}

// F5TtsEngine.load() accepts any F5_Transformer*.onnx; Pocket needs an lm_main
// and a decoder whatever the quantisation suffix.
for (const m of catalog.filter((x) => x.type === 'f5')) {
  check(
    m.ggufFiles.some((f) => /^F5_Transformer.*\.onnx$/.test(f.name)),
    `${m.id} : fournit un F5_Transformer*.onnx`
  );
}
for (const m of catalog.filter((x) => x.type === 'pocket')) {
  check(
    m.ggufFiles.some((f) => /^lm_main.*\.onnx$/.test(f.name)) &&
      m.ggufFiles.some((f) => /^decoder.*\.onnx$/.test(f.name)) &&
      m.ggufFiles.some((f) => /^lm_flow.*\.onnx$/.test(f.name)),
    `${m.id} : fournit lm_main / lm_flow / decoder`
  );
}

// Pocket always speaks through a reference voice, so a bundled one must exist
// or plain synthesis has nothing to condition on.
for (const m of catalog.filter((x) => x.type === 'pocket')) {
  check(
    m.ggufFiles.some((f) => f.name.startsWith('voices/')),
    `${m.id} : embarque au moins une voix de référence`
  );
}
for (const m of catalog.filter((x) => x.type === 'f5')) {
  check(
    m.ggufFiles.some((f) => f.name === 'voices/ref.wav') &&
      m.ggufFiles.some((f) => f.name === 'voices/ref.txt'),
    `${m.id} : embarque la voix par défaut ET sa transcription`,
    'F5 aligne l’audio de référence sur son texte — la transcription n’est pas optionnelle pour la voix fournie'
  );
}

console.log('\nPaliers de qualité — aucun ne doit valoir undefined');
console.log('─'.repeat(60));

// The bug this guards: renaming the tiers left an engine's map without a key
// the UI still asks for. `undefined` then crosses the bridge into a native
// `Int` parameter and Expo answers "the function has been rejected" — with no
// hint that a quality tier was the cause.
const qwen3Mod = loadModule('modules/expo-qwen3-tts/src/ExpoQwen3TtsModule.ts', stubs);
const f5Mod = loadModule('modules/expo-f5-tts/src/ExpoF5TtsModule.ts', stubs);

const STEP_MAPS = {
  'QUALITY_STEPS (OmniVoice)': qwen3Mod.QUALITY_STEPS,
  'POCKET_QUALITY_STEPS': qwen3Mod.POCKET_QUALITY_STEPS,
  'F5_QUALITY_STEPS': f5Mod.F5_QUALITY_STEPS,
};

const tiers = Object.keys(qwen3Mod.QUALITY_STEPS);
check(tiers.length > 0, `les paliers sont définis`, tiers.join(', '));

for (const [label, map] of Object.entries(STEP_MAPS)) {
  check(
    tiers.every((t) => typeof map[t] === 'number' && Number.isInteger(map[t]) && map[t] > 0),
    `${label} : un entier > 0 pour chaque palier (${tiers.join('/')})`,
    tiers.filter((t) => typeof map[t] !== 'number').map((t) => `${t} → ${map[t]}`).join(', ')
  );
}

// Every engine must agree on the SAME tier names, or a tier valid in the UI
// resolves to undefined the moment another engine is selected.
for (const [label, map] of Object.entries(STEP_MAPS)) {
  check(
    JSON.stringify(Object.keys(map).sort()) === JSON.stringify([...tiers].sort()),
    `${label} : mêmes noms de paliers que les autres moteurs`,
    `a [${Object.keys(map).join(', ')}], attendu [${tiers.join(', ')}]`
  );
}

// A tier called "best" that is not the most converged one is a mislabel.
for (const [label, map] of Object.entries(STEP_MAPS)) {
  check(
    map.best === Math.max(...Object.values(map)),
    `${label} : « best » est bien le palier le plus élevé`,
    `best=${map.best}, max=${Math.max(...Object.values(map))}`
  );
}

// Pocket loses pitch fidelity below 4 flow steps: 2 steps measured 2.44
// semitones of error against 0.75 at 4, which is an audibly different voice.
check(
  Math.min(...Object.values(qwen3Mod.POCKET_QUALITY_STEPS)) >= 2,
  'POCKET_QUALITY_STEPS : pas de palier sous 2 étapes',
  `min=${Math.min(...Object.values(qwen3Mod.POCKET_QUALITY_STEPS))}`
);

console.log('\n' + '─'.repeat(60));
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nÉchecs :');
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
