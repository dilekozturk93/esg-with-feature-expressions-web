/**
 * Loads app.js the way a browser would and reports anything that throws on the
 * way in, plus any element it reaches for that the page does not have.
 *
 * A script that throws while loading stops registering the listeners below the
 * throw, so part of the interface silently goes dead — which is how a
 * `let` declared after its first use once disabled the model dialog. The DOM
 * here is a stand-in, so this says nothing about behaviour; it only catches a
 * module that cannot finish loading.
 *
 *     node scripts/check_frontend.mjs
 */
import { readFileSync } from 'node:fs';

// A stand-in for anything the script touches: every property is a function that
// returns the same stand-in, so chained calls resolve without modelling a DOM.
const anything = () => new Proxy(function () {}, {
  get(target, prop) {
    if (prop === 'then') return undefined;              // not a thenable
    if (prop === 'length') return 0;
    if (prop === 'files') return [];
    if (prop === 'classList' || prop === 'dataset' || prop === 'style') return anything();
    if (prop === 'value' || prop === 'textContent' || prop === 'className') return '';
    if (prop === 'checked' || prop === 'disabled') return false;
    if (prop === 'options') return [];
    if (prop === Symbol.iterator) return [][Symbol.iterator].bind([]);
    return anything();
  },
  apply() { return anything(); }
});

const seenIds = new Set();
const document = {
  getElementById: (id) => { seenIds.add(id); return anything(); },
  querySelectorAll: () => [],
  querySelector: () => anything(),
  createElement: () => anything(),
  addEventListener: () => {},
  activeElement: {tagName: 'BODY'}
};

const examplePayload = {
  name: 'SVM', configurationCount: 12, allProductsLimit: 200, maxSampleSize: 200,
  uniGenAvailable: false, features: ['s', 'f', 'c', 't'], featureLabels: {},
  featureModel: {nodes: [{data: {id: 'svm', label: 'svm', type: 'root', isAbstract: true}}], edges: []},
  esgFx: {nodes: [{data: {id: 'v0', label: '[', isPseudoStart: true}}], edges: []}
};

globalThis.document = document;
globalThis.window = {addEventListener: () => {}};
globalThis.cytoscape = () => anything();
globalThis.fetch = async () => ({ok: true, status: 200, json: async () => examplePayload});
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.setTimeout = (fn) => { try { fn(); } catch (e) { throw e; } return 0; };
globalThis.clearTimeout = () => {};

const source = readFileSync('src/main/resources/static/app.js', 'utf8');
try {
  new Function(source)();
  console.log('app.js loaded with no exception');
  console.log(`elements reached for: ${seenIds.size}`);
} catch (error) {
  console.error('FAILED to load app.js:', error.message);
  process.exit(1);
}

// every id the script reaches for must exist in the page
const html = readFileSync('src/main/resources/templates/index.html', 'utf8');
const present = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const missing = [...seenIds].filter((id) => !present.has(id));
console.log('elements missing from the page:', missing.length ? missing : 'none');
process.exit(missing.length ? 1 : 0);
