'use strict';

// Feature-model node colours by the group the feature belongs to. The engine
// reports these on the child, not on the parent group, so they are applied per
// node rather than drawn as arcs.
const FEATURE_TYPE_COLOURS = {
    root: '#1e293b',
    mandatory: '#0f766e',
    optional: '#0ea5e9',
    or: '#d97706',
    alternative: '#7c3aed'
};

const featureModelStyle = [
    {
        selector: 'node',
        style: {
            'label': 'data(displayLabel)',
            'background-color': (node) => FEATURE_TYPE_COLOURS[node.data('type')] || '#64748b',
            'shape': 'round-rectangle',
            'width': 'label',
            'height': 24,
            'padding': '8px',
            'color': '#ffffff',
            'font-size': 12,
            'text-valign': 'center',
            'text-halign': 'center',
            'border-width': 2,
            'border-color': '#0f172a',
            'border-opacity': 0.25
        }
    },
    {
        // Abstract features carry no implementation, so they are drawn hollow
        // in the same colour as their group.
        selector: 'node[?isAbstract]',
        style: {
            'background-color': '#ffffff',
            'color': (node) => FEATURE_TYPE_COLOURS[node.data('type')] || '#334155',
            'border-width': 2,
            'border-style': 'dashed',
            'border-opacity': 1,
            'border-color': (node) => FEATURE_TYPE_COLOURS[node.data('type')] || '#64748b'
        }
    },
    {
        // The root is commonly abstract, so it needs a marker that survives the
        // hollow abstract styling.
        selector: 'node[type = "root"]',
        style: {'border-width': 4, 'border-style': 'solid', 'border-color': FEATURE_TYPE_COLOURS.root}
    },
    {
        selector: 'edge',
        style: {
            'width': 1.5,
            'line-color': '#94a3b8',
            'curve-style': 'taxi',
            'taxi-direction': 'downward',
            'target-arrow-shape': 'none'
        }
    }
];

const esgFxStyle = [
    {
        selector: 'node',
        style: {
            'label': 'data(label)',
            'background-color': '#334155',
            'shape': 'round-rectangle',
            'width': 'label',
            'height': 26,
            'padding': '10px',
            'color': '#ffffff',
            'font-size': 12,
            'text-valign': 'center',
            'text-halign': 'center'
        }
    },
    {
        selector: 'node[?isPseudoStart]',
        style: {'background-color': '#16a34a', 'shape': 'round-diamond', 'width': 34, 'height': 34, 'font-size': 14}
    },
    {
        selector: 'node[?isPseudoEnd]',
        style: {'background-color': '#dc2626', 'shape': 'round-diamond', 'width': 34, 'height': 34, 'font-size': 14}
    },
    {
        selector: 'edge',
        style: {
            'width': 1.5,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.9,
            'curve-style': 'bezier'
        }
    },
    {
        selector: '.dimmed',
        style: {'opacity': 0.2}
    },
    {
        selector: 'node.highlighted',
        style: {'background-color': '#ea580c', 'border-width': 3, 'border-color': '#7c2d12', 'z-index': 10}
    },
    {
        selector: 'edge.highlighted',
        style: {
            'line-color': '#ea580c',
            'target-arrow-color': '#ea580c',
            'width': 3,
            'opacity': 1,
            'z-index': 10
        }
    }
];

const VALIDATION_DEBOUNCE_MS = 300;
const DEFAULT_SAMPLE_SIZE = 5;

// The engine works in levels; a reader should not have to. Level L covers
// L-tuples of consecutive events: single events at 1, then couples, triples and
// quadruples.
const COVERAGE_NAMES = {
    1: 'Event coverage',
    2: 'Event-couple coverage',
    3: 'Event-triple coverage',
    4: 'Event-quadruple coverage'
};

function coverageNameFor(coverageLength) {
    return COVERAGE_NAMES[coverageLength] || 'Coverage';
}

// What each level actually covers, as a plain noun for the CSV. The engine
// reports this as "event" or "edge"; that is its internal vocabulary, not
// something an end user should have to read.
const COVERAGE_TYPE_NOUNS = {
    1: 'events',
    2: 'event couples',
    3: 'event triples',
    4: 'event quadruples'
};

function coverageTypeNoun(coverageLength) {
    return COVERAGE_TYPE_NOUNS[coverageLength] || 'events';
}

let featureModelGraph = null;
let esgFxGraph = null;
let currentSpl = null;
let currentFeatureLabels = {};
let currentExample = null;
let uploadedModel = null;
let latestResult = null;
let allProducts = null;
let lastGenerationMode = 'single';
let validationTimer = null;
let drawMode = false;

const DRAW_HINT_IDS = ['feature-model-hint', 'esg-fx-hint'];
const DELETE_BUTTON_IDS = ['delete-feature-selection', 'delete-esg-selection'];

const tooltip = document.getElementById('tooltip');
const errorBanner = document.getElementById('error-banner');

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
}

function clearError() {
    errorBanner.classList.add('hidden');
}

function setStat(id, value) {
    document.getElementById(id).textContent = value;
}

function hideTooltip() {
    tooltip.classList.add('hidden');
}

function showTooltip(text, event) {
    tooltip.textContent = text;
    tooltip.classList.remove('hidden');
    const point = event.originalEvent;
    tooltip.style.left = (point.clientX + 12) + 'px';
    tooltip.style.top = (point.clientY + 12) + 'px';
}

// Tailwind is loaded from the Play CDN, which generates the stylesheet at
// runtime, so a graph can be constructed before its container has been given a
// height. Cytoscape caches the container size it saw, and every later fit would
// use that stale value — re-reading it first is what makes the fit stick.
function fitGraph(graph) {
    graph.resize();
    graph.fit(undefined, 24);
}

function buildGraph(containerId, elements, style, rankDir) {
    const graph = cytoscape({
        container: document.getElementById(containerId),
        elements: elements,
        style: style,
        layout: {name: 'dagre', rankDir: rankDir, nodeSep: 26, rankSep: 60, padding: 24},
        wheelSensitivity: 0.2
    });

    // Node widths follow their labels, which are only measured once the graph
    // has been rendered, so the fit has to wait for a frame after the layout
    // settles or it runs against dimensions that are not final.
    graph.one('layoutstop', () => requestAnimationFrame(() => fitGraph(graph)));
    return graph;
}

// The engine's feature models use short codes for some SPLs (SVM, e-Mail).
// featureLabels carries the human-readable name; the engine name is kept in the
// tooltip so the two are never confused.
function withDisplayLabels(nodes, featureLabels) {
    return nodes.map((node) => {
        const engineName = node.data.label;
        const label = featureLabels[engineName];
        return {
            data: Object.assign({}, node.data, {
                displayLabel: label || engineName,
                engineName: engineName
            })
        };
    });
}

function renderFeatureModel(model, featureLabels) {
    if (featureModelGraph) {
        featureModelGraph.destroy();
    }
    featureModelGraph = buildGraph(
        'feature-model',
        {nodes: withDisplayLabels(model.nodes, featureLabels), edges: model.edges},
        featureModelStyle,
        'TB');

    featureModelGraph.on('mouseover', 'node', (event) => {
        const data = event.target.data();
        const parts = [data.engineName];
        if (data.displayLabel !== data.engineName) {
            parts[0] = data.displayLabel + ' (' + data.engineName + ')';
        }
        parts.push(data.type + (data.isAbstract ? ', abstract' : ''));
        showTooltip(parts.join(' — '), event);
    });
    featureModelGraph.on('mouseout', 'node', hideTooltip);
}

function renderEsgFx(esgFx) {
    if (esgFxGraph) {
        esgFxGraph.destroy();
    }
    esgFxGraph = buildGraph('esg-fx', {nodes: esgFx.nodes, edges: esgFx.edges}, esgFxStyle, 'LR');

    esgFxGraph.on('mouseover', 'node', (event) => {
        const data = event.target.data();
        if (data.isPseudoStart || data.isPseudoEnd) {
            showTooltip(data.isPseudoStart ? 'pseudo start vertex' : 'pseudo end vertex', event);
            return;
        }
        const expression = expandExpression(data.featureExpression) || 'no feature expression';
        showTooltip(data.label + ' — ' + expression, event);
    });
    esgFxGraph.on('mouseout', 'node', hideTooltip);
}

function displayNameFor(featureName) {
    return currentFeatureLabels[featureName] || featureName;
}

// A feature expression is written over feature short codes ("!f"); this
// rewrites each code to its display label ("!free") while leaving the
// operators untouched, so what shows matches the names in the feature tree.
function expandExpression(expression) {
    if (!expression) {
        return expression;
    }
    return expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g,
        (code) => currentFeatureLabels[code] || code);
}

// A feature is forced on when it is mandatory and everything above it is
// forced too, starting from the root. Or-group and alternative-group children
// are never forced individually — which of them to take is the user's choice,
// and the validator is what enforces the group's own rule.
function forcedFeatureNames(featureModel) {
    const typeOf = {};
    let root = null;
    featureModel.nodes.forEach((node) => {
        typeOf[node.data.id] = node.data.type;
        if (node.data.type === 'root') {
            root = node.data.id;
        }
    });

    const childrenOf = {};
    featureModel.edges.forEach((edge) => {
        (childrenOf[edge.data.source] = childrenOf[edge.data.source] || []).push(edge.data.target);
    });

    const forced = new Set();
    const queue = root === null ? [] : [root];
    while (queue.length) {
        const name = queue.shift();
        forced.add(name);
        (childrenOf[name] || []).forEach((child) => {
            if (typeOf[child] === 'mandatory') {
                queue.push(child);
            }
        });
    }
    return forced;
}

function createProductBlock() {
    const forced = forcedFeatureNames(currentExample.featureModel);

    const block = document.createElement('div');
    block.className = 'product-block rounded-md border border-slate-200 px-3 py-2.5';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-2';

    const title = document.createElement('span');
    title.className = 'product-title text-sm font-medium';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-product text-xs text-slate-500 hover:text-red-700';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
        block.remove();
        clearResults();
        renumberProducts();
        updateGenerateButton();
    });

    header.append(title, remove);

    const checkboxes = document.createElement('div');
    checkboxes.className = 'feature-checkboxes grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4';

    currentExample.features.forEach((featureName) => {
        const label = document.createElement('label');
        label.className = 'inline-flex items-center gap-2 text-sm';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = featureName;
        input.addEventListener('change', () => scheduleValidation(block));

        if (forced.has(featureName)) {
            input.checked = true;
            input.disabled = true;
        }

        const text = document.createElement('span');
        const display = displayNameFor(featureName);
        text.textContent = display;

        // The engine name is what the API speaks, but printing it beside every
        // readable name is noise; hovering is enough to recover it.
        const notes = [];
        if (display !== featureName) {
            notes.push('engine name: ' + featureName);
        }
        if (input.disabled) {
            notes.push('mandatory in the feature model');
            const required = document.createElement('span');
            required.className = 'text-slate-400 ml-1';
            required.textContent = '— required';
            text.appendChild(required);
        }
        if (notes.length) {
            label.title = notes.join(' · ');
        }

        label.append(input, text);
        checkboxes.appendChild(label);
    });

    const status = document.createElement('div');
    status.className = 'validation-status text-sm mt-2';

    block.append(header, checkboxes, status);
    return block;
}

function productBlocks() {
    return Array.from(document.querySelectorAll('.product-block'));
}

// Only the removal control is per-product; the numbering has to be redone from
// scratch after one goes, and a single product needs no remove button at all.
function renumberProducts() {
    const blocks = productBlocks();
    blocks.forEach((block, index) => {
        block.querySelector('.product-title').textContent = 'Product ' + (index + 1);
        block.querySelector('.remove-product').classList.toggle('hidden', blocks.length === 1);
    });
}

function resetProducts() {
    const container = document.getElementById('products');
    container.replaceChildren(createProductBlock());
    renumberProducts();
}

// The API is handed every feature, not just the ticked ones, so it never has to
// infer a value for one the page left out.
function selectionOfBlock(block) {
    const selection = {};
    block.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        selection[input.value] = input.checked;
    });
    return selection;
}

function selectedCoverageLength() {
    return Number(document.querySelector('input[name="coverage-length"]:checked').value);
}

// Requests name a bundled example or carry the uploaded files themselves.
// Nothing about an upload is kept on the server between requests, so the page
// holds the file contents and sends them every time.
function modelSourceBody() {
    return uploadedModel
        ? {featureModelXml: uploadedModel.featureModelXml, esgFxXml: uploadedModel.esgFxXml}
        : {splName: currentSpl};
}

function applyModelPayload(payload) {
    currentSpl = payload.name;
    currentExample = payload;
    currentFeatureLabels = payload.featureLabels || {};

    renderFeatureModel(payload.featureModel, currentFeatureLabels);
    renderEsgFx(payload.esgFx);
    resetProducts();

    setStat('stat-configs', payload.configurationCount.toLocaleString());
    // Abstract features carry no truth value, so counting them would overstate
    // how much there is to choose; payload.features is the selectable set.
    setStat('stat-features', payload.features.length);
    setStat('stat-vertices', payload.esgFx.nodes.length);
    setStat('stat-edges', payload.esgFx.edges.length);

    applyMode();
}

async function loadExample(name) {
    clearError();
    hideTooltip();
    clearResults();
    uploadedModel = null;
    try {
        const response = await fetch('/api/example/' + name);
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || ('Request failed with status ' + response.status));
        }
        applyModelPayload(await response.json());
    } catch (error) {
        showError('Could not load the example: ' + error.message);
    }
}

async function loadUploadedModel(featureModelXml, esgFxXml) {
    clearError();
    hideTooltip();
    clearResults();
    try {
        const response = await fetch('/api/model', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({featureModelXml: featureModelXml, esgFxXml: esgFxXml})
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.error || ('Request failed with status ' + response.status));
        }
        uploadedModel = {featureModelXml: featureModelXml, esgFxXml: esgFxXml};
        applyModelPayload(payload);
    } catch (error) {
        uploadedModel = null;
        showError('Could not load the uploaded model: ' + error.message);
    }
}

const generateButton = document.getElementById('generate-button');
const downloadButton = document.getElementById('download-csv');

const VALIDATION_COLOURS = {
    valid: 'text-emerald-700',
    invalid: 'text-red-700',
    pending: 'text-slate-500'
};

function setBlockStatus(block, state, message) {
    const status = block.querySelector('.validation-status');
    status.className = 'validation-status text-sm mt-2 ' + VALIDATION_COLOURS[state];
    status.textContent = message;
    block.dataset.valid = state === 'valid' ? 'true' : 'false';
}

function updateGenerateButton() {
    if (currentMode() === 'all') {
        return;
    }
    const blocks = productBlocks();
    generateButton.disabled = blocks.length === 0
        || blocks.some((block) => block.dataset.valid !== 'true');
}

function currentMode() {
    return document.querySelector('input[name="generation-mode"]:checked').value;
}

// All-products mode has no configuration to choose or validate — the engine
// enumerates them — so the feature list and validation line step aside, and the
// only gate left is whether the model is small enough to answer in one request.
const GENERATE_LABELS = {
    specific: 'Generate tests',
    sampled: 'Generate for the sample',
    all: 'Generate for all products'
};

function applyMode() {
    const hint = document.getElementById('all-products-hint');
    const allRadio = document.querySelector('input[name="generation-mode"][value="all"]');

    const count = currentExample ? currentExample.configurationCount : 0;
    const limit = currentExample ? currentExample.allProductsLimit : 0;
    const overLimit = currentExample !== null && count > limit;

    // Switching from a small example to one over the limit would otherwise
    // leave all-products selected but disabled, with the feature list hidden
    // and nothing to press. Sampling is the mode that still works there.
    allRadio.disabled = overLimit;
    if (overLimit && allRadio.checked) {
        document.querySelector('input[name="generation-mode"][value="sampled"]').checked = true;
    }

    const mode = currentMode();
    const needsFeatures = mode === 'specific';
    document.getElementById('feature-section').classList.toggle('hidden', !needsFeatures);
    document.getElementById('sample-settings').classList.toggle('hidden', mode !== 'sampled');
    generateButton.textContent = GENERATE_LABELS[mode];

    if (!currentExample) {
        return;
    }

    // The sample can never exceed the configuration space, so the input says so.
    // A value the user did not choose is re-derived rather than only clamped
    // down, or moving from a one-configuration model to a larger one would
    // silently leave the sample size at 1.
    const sampleSize = document.getElementById('sample-size');
    const ceiling = Math.max(1, Math.min(count, currentExample.maxSampleSize || count));
    sampleSize.max = ceiling;
    const desired = sampleSize.dataset.userSet ? Number(sampleSize.value) : DEFAULT_SAMPLE_SIZE;
    sampleSize.value = Math.max(1, Math.min(desired, ceiling));

    updateSamplerChoice();

    hint.classList.toggle('hidden', !(mode === 'all' || overLimit));
    if (overLimit) {
        hint.textContent = count.toLocaleString() + ' valid configurations, above the limit of '
            + limit.toLocaleString() + ' for all-products — sample instead.';
    } else if (mode === 'all') {
        hint.textContent = 'Generates tests for all ' + count.toLocaleString() + ' valid configurations.';
    }

    if (needsFeatures) {
        validateAllBlocks();
    } else {
        generateButton.disabled = mode === 'all' && overLimit;
    }
}

// UniGen is an external tool, so it is only offered when the server reports it.
function updateSamplerChoice() {
    const select = document.getElementById('sampler-select');
    const uniGenOption = select.querySelector('option[value="unigen"]');
    const available = Boolean(currentExample && currentExample.uniGenAvailable);

    uniGenOption.disabled = !available;
    if (!available && select.value === 'unigen') {
        select.value = 'enumeration';
    }

    document.getElementById('sampler-hint').textContent = select.value === 'unigen'
        ? 'Almost-uniform SAT sampling; does not enumerate, so it keeps working on large models.'
        : (available
            ? 'Uniform over valid configurations by enumeration; the same seed draws the same sample.'
            : 'Uniform by enumeration. UniGen is not installed on this server.');
}

document.getElementById('sampler-select').addEventListener('change', () => {
    clearResults();
    updateSamplerChoice();
});

function scheduleValidation(block) {
    setBlockStatus(block, 'pending', 'Checking configuration…');
    updateGenerateButton();
    clearTimeout(validationTimer);
    validationTimer = setTimeout(() => validateBlock(block), VALIDATION_DEBOUNCE_MS);
}

async function validateBlock(block) {
    if (!currentSpl) {
        return;
    }
    try {
        const response = await fetch('/api/config/validate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(Object.assign(modelSourceBody(), {featureSelection: selectionOfBlock(block)}))
        });
        const body = await response.json();
        if (body.valid) {
            setBlockStatus(block, 'valid', 'Configuration is valid.');
        } else {
            setBlockStatus(block, 'invalid', (body.errors || ['Configuration is not valid.']).join(' '));
        }
    } catch (error) {
        setBlockStatus(block, 'invalid', 'Could not validate the configuration: ' + error.message);
    }
    updateGenerateButton();
}

function validateAllBlocks() {
    productBlocks().forEach(validateBlock);
}

// Guards the backtracking search below against a pathological model; the walks
// we resolve for the bundled examples finish in well under a hundred steps.
const WALK_STEP_BUDGET = 20000;

function normalizeEventName(name) {
    return name.trim().replace(/\s+/g, '_');
}

function stripVertexSuffix(token) {
    return token.replace(/_\d+$/, '');
}

// A sequence token can be a single event ("soda_2") or, at L>=3, a tuple of
// them ("soda_2:serveSoda_3"). The trailing _<id> disambiguates repeated
// event names for the engine; it means nothing to a reader, so it is dropped
// from every part before the sequence is shown or exported. The raw tokens are
// kept for highlighting, which still needs the ids to find the vertices.
function readableSequence(sequence) {
    return sequence.map((token) => token.split(':').map(stripVertexSuffix).join(':'));
}

// L=1 and L=2 sequences carry one event per step. L=3 and L=4 carry overlapping
// tuples — consecutive tuples share all but one element — so the walk is the
// first tuple followed by the last element of every tuple after it.
function eventWalkOf(sequence) {
    const tuples = sequence.map((token) => token.split(':').map(stripVertexSuffix));
    if (!tuples.length) {
        return [];
    }

    const walk = tuples[0].slice();
    for (let i = 1; i < tuples.length; i++) {
        const previous = tuples[i - 1];
        const current = tuples[i];
        const overlaps = current.length > 1
            && previous.slice(1).join('\x00') === current.slice(0, -1).join('\x00');
        if (overlaps) {
            walk.push(current[current.length - 1]);
        } else {
            walk.push.apply(walk, current);
        }
    }
    return walk;
}

// Event labels repeat across an ESG-Fx — SVM has two distinct 'take' vertices —
// so a sequence cannot be located by matching names one at a time. The walk is
// resolved by following real edges and backtracking out of dead ends, which
// also gives us the traversed edges rather than just the vertices.
function resolveWalk(graph, events) {
    if (!events.length) {
        return null;
    }
    let steps = 0;

    function extend(nodePath, edgePath) {
        if (nodePath.length === events.length) {
            return {nodes: nodePath, edges: edgePath};
        }
        if (++steps > WALK_STEP_BUDGET) {
            return null;
        }

        const wanted = events[nodePath.length];
        const outgoing = nodePath[nodePath.length - 1].outgoers('edge');

        for (let i = 0; i < outgoing.length; i++) {
            const edge = outgoing[i];
            const target = edge.target();
            if (normalizeEventName(target.data('label')) !== wanted) {
                continue;
            }
            const resolved = extend(nodePath.concat(target), edgePath.concat(edge));
            if (resolved) {
                return resolved;
            }
        }
        return null;
    }

    const startCandidates = graph.nodes().filter(
        (node) => normalizeEventName(node.data('label')) === events[0]);

    for (let i = 0; i < startCandidates.length; i++) {
        const resolved = extend([startCandidates[i]], []);
        if (resolved) {
            return resolved;
        }
    }
    return null;
}

function clearHighlight() {
    if (esgFxGraph) {
        esgFxGraph.elements().removeClass('highlighted dimmed');
    }
    document.querySelectorAll('#results-body tr').forEach((row) => {
        row.classList.remove('bg-orange-50');
    });
    document.getElementById('clear-highlight').disabled = true;
    document.getElementById('highlight-status').textContent = '';
}

function highlightSequence(sequence, row) {
    if (!esgFxGraph) {
        return;
    }
    clearHighlight();

    const events = eventWalkOf(sequence);
    const resolved = resolveWalk(esgFxGraph, events);
    const status = document.getElementById('highlight-status');

    if (!resolved) {
        status.textContent = 'no matching path on this ESG-Fx';
        return;
    }

    esgFxGraph.elements().addClass('dimmed');
    esgFxGraph.collection(resolved.nodes.concat(resolved.edges))
        .removeClass('dimmed')
        .addClass('highlighted');

    row.classList.add('bg-orange-50');
    document.getElementById('clear-highlight').disabled = false;
    status.textContent = events.length + ' events highlighted';
}

function clearResults() {
    clearHighlight();
    latestResult = null;
    allProducts = null;
    downloadButton.disabled = true;
    document.getElementById('results').classList.add('hidden');
    document.getElementById('results-empty').classList.remove('hidden');
    document.getElementById('results-body').replaceChildren();
    document.getElementById('product-picker').classList.add('hidden');
}

function renderProductPicker(products) {
    const picker = document.getElementById('product-picker');
    const select = document.getElementById('product-select');
    select.replaceChildren();

    products.forEach((product, index) => {
        const enabled = Object.keys(product.featureSelection)
            .filter((name) => product.featureSelection[name])
            .map(displayNameFor);
        const option = document.createElement('option');
        option.value = index;
        option.textContent = product.productId + ' of ' + products.length
            + ' — ' + (enabled.length ? enabled.join(', ') : 'no features');
        select.appendChild(option);
    });

    picker.classList.remove('hidden');
}

function renderResults(result) {
    latestResult = result;

    document.getElementById('result-coverage-label').textContent =
        coverageNameFor(result.coverageLength);
    document.getElementById('result-coverage').textContent =
        result.coveragePercentage.toFixed(2).replace(/\.00$/, '') + '%';
    document.getElementById('result-sequences').textContent = result.sequenceCount;
    document.getElementById('result-events').textContent = result.totalEventCount;
    document.getElementById('result-time').textContent = result.generationTimeMs + ' ms';
    document.getElementById('result-product').textContent = result.productId;

    const enabled = Object.keys(result.featureSelection)
        .filter((name) => result.featureSelection[name])
        .map(displayNameFor);
    document.getElementById('result-features').textContent =
        enabled.length ? enabled.join(', ') : 'no features selected';

    const body = document.getElementById('results-body');
    body.replaceChildren();
    result.testSequences.forEach((sequence, index) => {
        const row = document.createElement('tr');
        row.className = 'cursor-pointer hover:bg-slate-50';
        row.title = 'Highlight this sequence on the ESG-Fx';
        row.addEventListener('click', () => highlightSequence(sequence, row));

        const number = document.createElement('td');
        number.className = 'px-4 py-2 text-slate-500 align-top';
        number.textContent = index + 1;

        const length = document.createElement('td');
        length.className = 'px-4 py-2 text-slate-500 align-top';
        length.textContent = sequence.length;

        const events = document.createElement('td');
        events.className = 'px-4 py-2 font-mono text-xs';
        events.textContent = readableSequence(sequence).join(' → ');

        row.append(number, length, events);
        body.appendChild(row);
    });

    document.getElementById('results-empty').classList.add('hidden');
    document.getElementById('results').classList.remove('hidden');
    downloadButton.disabled = false;
}

async function generate() {
    clearError();
    const mode = currentMode();
    const allMode = mode === 'all';
    generateButton.disabled = true;
    const originalLabel = generateButton.textContent;
    generateButton.textContent = 'Generating…';

    const blocks = productBlocks();
    const multi = mode === 'specific' && blocks.length > 1;
    let request;
    if (mode === 'sampled') {
        request = {url: '/api/generate/sampled',
            body: Object.assign(modelSourceBody(), {
                coverageLength: selectedCoverageLength(),
                sampleSize: Number(document.getElementById('sample-size').value),
                seed: Number(document.getElementById('sample-seed').value),
                sampler: document.getElementById('sampler-select').value
            })};
    } else if (allMode) {
        request = {url: '/api/generate/all',
            body: Object.assign(modelSourceBody(), {coverageLength: selectedCoverageLength()})};
    } else if (multi) {
        request = {url: '/api/generate/multi',
            body: Object.assign(modelSourceBody(),
                {coverageLength: selectedCoverageLength(), products: blocks.map(selectionOfBlock)})};
    } else {
        request = {url: '/api/generate',
            body: Object.assign(modelSourceBody(),
                {coverageLength: selectedCoverageLength(), featureSelection: selectionOfBlock(blocks[0])})};
    }

    try {
        const response = await fetch(request.url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(request.body)
        });
        const body = await response.json();
        if (!response.ok) {
            const message = body.errors ? body.errors.join(' ') : (body.error || 'Generation failed.');
            throw new Error(message);
        }

        lastGenerationMode = mode === 'sampled' ? 'sampled' : (allMode ? 'all' : (multi ? 'multi' : 'single'));
        if (mode === 'sampled' || allMode || multi) {
            allProducts = body.products;
            renderProductPicker(allProducts);
            renderResults(allProducts[0]);
        } else {
            renderResults(body);
        }
    } catch (error) {
        clearResults();
        showError('Could not generate tests: ' + error.message);
    } finally {
        generateButton.textContent = originalLabel;
        generateButton.disabled = false;
    }
}

function csvCell(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
}

function downloadCsv() {
    if (!latestResult) {
        return;
    }
    // In all-products mode the export covers the whole run, not just the
    // product currently on screen.
    const products = allProducts || [latestResult];

    const rows = [['spl', 'productId', 'features', 'coverageLength', 'coverageType',
        'coveragePercentage', 'sequenceIndex', 'eventCount', 'sequence']];

    products.forEach((product) => {
        const enabled = Object.keys(product.featureSelection)
            .filter((name) => product.featureSelection[name]);
        product.testSequences.forEach((sequence, index) => {
            rows.push([
                product.splShortName,
                product.productId,
                enabled.join(' '),
                product.coverageLength,
                coverageTypeNoun(product.coverageLength),
                product.coveragePercentage,
                index + 1,
                sequence.length,
                readableSequence(sequence).join(' -> ')
            ]);
        });
    });

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));

    const scope = lastGenerationMode === 'all' ? 'allProducts'
        : (lastGenerationMode === 'sampled' ? 'sample' + products.length
            : (lastGenerationMode === 'multi' ? products.length + 'products'
                : 'P' + latestResult.productId));

    const link = document.createElement('a');
    link.href = url;
    link.download = latestResult.splShortName + '_' + scope
        + '_L' + latestResult.coverageLength + '.csv';
    link.click();
    URL.revokeObjectURL(url);
}

generateButton.addEventListener('click', generate);
downloadButton.addEventListener('click', downloadCsv);
document.getElementById('clear-highlight').addEventListener('click', clearHighlight);
document.getElementById('coverage-length').addEventListener('change', clearResults);

document.getElementById('generation-mode').addEventListener('change', () => {
    clearResults();
    applyMode();
});

document.getElementById('add-product').addEventListener('click', () => {
    const block = createProductBlock();
    document.getElementById('products').appendChild(block);
    clearResults();
    renumberProducts();
    validateBlock(block);
});

document.getElementById('product-select').addEventListener('change', (event) => {
    clearHighlight();
    renderResults(allProducts[Number(event.target.value)]);
});

document.getElementById('example-select').addEventListener('change', (event) => {
    loadExample(event.target.value);
});

const featureModelFile = document.getElementById('feature-model-file');
const esgFxFile = document.getElementById('esgfx-file');
const loadUploadButton = document.getElementById('load-upload');

function updateLoadUploadButton() {
    loadUploadButton.disabled = !(featureModelFile.files[0] && esgFxFile.files[0]);
}

[featureModelFile, esgFxFile].forEach((input) => {
    input.addEventListener('change', updateLoadUploadButton);
});

loadUploadButton.addEventListener('click', async () => {
    loadUploadButton.disabled = true;
    try {
        const [featureModelXml, esgFxXml] = await Promise.all([
            featureModelFile.files[0].text(),
            esgFxFile.files[0].text()
        ]);
        await loadUploadedModel(featureModelXml, esgFxXml);
    } finally {
        updateLoadUploadButton();
    }
});



function graphNamed(name) {
    return name === 'feature-model' ? featureModelGraph : esgFxGraph;
}

document.querySelectorAll('[data-fit]').forEach((button) => {
    button.addEventListener('click', () => {
        const graph = graphNamed(button.dataset.fit);
        if (graph) {
            fitGraph(graph);
        }
    });
});

// One press is a noticeable step without overshooting; Cytoscape clamps the
// result to the graph's own zoom limits, so the ends need no handling here.
const ZOOM_STEP = 1.3;

document.querySelectorAll('[data-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
        const graph = graphNamed(button.dataset.zoom);
        if (!graph) {
            return;
        }
        const step = button.dataset.zoomDirection === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP;
        // Anchored on the middle of the viewport rather than the graph's own
        // centre, so whatever is being looked at stays where it is.
        graph.zoom({
            level: graph.zoom() * step,
            renderedPosition: {x: graph.width() / 2, y: graph.height() / 2}
        });
    });
});

window.addEventListener('resize', () => {
    [featureModelGraph, esgFxGraph].filter(Boolean).forEach(fitGraph);
});


// ---------------------------------------------------------------------------
// Model editor (Mode 3)
//
// The editor produces the same two files an upload would supply, so everything
// downstream — validation, the three generation modes, highlighting, CSV — runs
// unchanged.
//
// Two things the ESG-Fx format allows that a naive editor would get wrong:
// event names repeat (SVM has two `take` vertices, told apart by their feature
// expression), so edges reference vertices by id rather than by name; and a
// feature model's meaning includes its cross-tree constraints, so those are
// carried through an edit rather than dropped.
// ---------------------------------------------------------------------------

const PSEUDO_START = '[';
const PSEUDO_END = ']';

let editorState = null;
let nextEventId = 1;

function newEventId() {
    return 'v' + (nextEventId++);
}

function minimalModel() {
    const eventId = newEventId();
    return {
        features: [
            {name: 'NameOfSPL', parent: '', mandatory: true, abstract: true, childGroup: 'and'},
            {name: 'A', parent: 'NameOfSPL', mandatory: true, abstract: false, childGroup: 'and'}
        ],
        events: [{id: eventId, name: 'e1', expression: 'A'}],
        edges: [{source: PSEUDO_START, target: eventId}, {source: eventId, target: PSEUDO_END}],
        constraints: []
    };
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function featureNames() {
    return editorState.features.map((feature) => feature.name).filter((name) => name);
}

/** Children keyed by parent name, in the order the user entered them. */
function childrenByParent() {
    const children = {};
    editorState.features.forEach((feature) => {
        if (!feature.parent) {
            return;
        }
        (children[feature.parent] = children[feature.parent] || []).push(feature);
    });
    return children;
}

// FeatureIDE puts the group kind on the parent — <and>, <or>, <alt> — and so
// does the editor. Asking each child what kind of group it belongs to instead
// lets a parent's children disagree, which is not a model anyone can mean.
function groupTagOf(feature) {
    return feature.childGroup === 'or' ? 'or'
        : (feature.childGroup === 'alt' ? 'alt' : 'and');
}

/** How a feature reads in the diagram, which depends on the group it sits in. */
function displayTypeOf(feature, index, byName) {
    if (index === 0) {
        return 'root';
    }
    const parent = byName[feature.parent];
    const group = parent ? groupTagOf(parent) : 'and';
    if (group === 'or') {
        return 'or';
    }
    if (group === 'alt') {
        return 'alternative';
    }
    return feature.mandatory ? 'mandatory' : 'optional';
}

function featuresByName() {
    const byName = {};
    editorState.features.forEach((feature) => {
        byName[feature.name] = feature;
    });
    return byName;
}

function serializeFeatureModel() {
    const children = childrenByParent();
    const byName = featuresByName();
    const root = editorState.features[0];

    function emit(feature, isRoot, depth) {
        const indent = '  '.repeat(depth + 2);
        const kids = children[feature.name] || [];
        const attributes = [];
        if (feature.abstract) {
            attributes.push('abstract="true"');
        }
        // The root is mandatory by convention; elsewhere the flag only means
        // anything inside an and-group, so it is written only there.
        const parent = byName[feature.parent];
        const inAndGroup = !parent || groupTagOf(parent) === 'and';
        if (isRoot || (inAndGroup && feature.mandatory)) {
            attributes.push('mandatory="true"');
        }
        attributes.push('name="' + escapeXml(feature.name) + '"');

        if (!kids.length) {
            return indent + '<feature ' + attributes.join(' ') + '/>';
        }
        const tag = groupTagOf(feature);
        return indent + '<' + tag + ' ' + attributes.join(' ') + '>\n'
            + kids.map((kid) => emit(kid, false, depth + 1)).join('\n') + '\n'
            + indent + '</' + tag + '>';
    }

    const rules = (editorState.constraints || []).map((constraint) => '    ' + constraint.rule);
    const constraintsBlock = rules.length
        ? '  <constraints>\n' + rules.join('\n') + '\n  </constraints>\n'
        : '';

    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
        + '<featureModel>\n  <struct>\n'
        + emit(root, true, 0) + '\n'
        + '  </struct>\n'
        + constraintsBlock
        + '</featureModel>\n';
}

function serializeEsgFx() {
    // mxCell ids: 0 and 1 are the model's own scaffolding.
    const cellIds = {};
    cellIds[PSEUDO_START] = 2;
    cellIds[PSEUDO_END] = 3;
    editorState.events.forEach((event, index) => {
        cellIds[event.id] = 4 + index;
    });

    const cells = [];
    function vertex(cellId, name, x, y) {
        cells.push('<mxCell id="' + cellId + '" parent="1" style="fontSize=15" vertex="1">'
            + '<de.upb.adt.tsd.EventNode as="value" code="" description="" name="' + escapeXml(name) + '"/>'
            + '<mxGeometry as="geometry" height="30.0" width="80.0" x="' + x + '.0" y="' + y + '.0"/>'
            + '</mxCell>');
    }

    vertex(cellIds[PSEUDO_START], PSEUDO_START, 20, 300);
    vertex(cellIds[PSEUDO_END], PSEUDO_END, 20 + 140 * (editorState.events.length + 1), 300);
    editorState.events.forEach((event, index) => {
        // The parser splits the name on '/', so the expression is not optional.
        vertex(cellIds[event.id], event.name + '/' + event.expression,
            140 + 140 * index, 220 + 80 * (index % 3));
    });

    let edgeId = 4 + editorState.events.length;
    editorState.edges.forEach((edge) => {
        const source = cellIds[edge.source];
        const target = cellIds[edge.target];
        if (source === undefined || target === undefined) {
            return;
        }
        cells.push('<mxCell edge="1" id="' + (edgeId++) + '" parent="1" source="' + source
            + '" style="" target="' + target + '" value="">'
            + '<mxGeometry as="geometry" relative="1"/></mxCell>');
    });

    return '<?xml version="1.0" encoding="UTF-8"?><mxGraphModel><root>'
        + '<mxCell id="0"/><mxCell id="1" parent="0"/>'
        + cells.join('') + '</root></mxGraphModel>';
}

/** Pulls the <rule> elements out of a feature model file so they survive editing. */
function constraintsFromXml(xml) {
    if (!xml) {
        return [];
    }
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    const serializer = new XMLSerializer();
    return Array.from(parsed.getElementsByTagName('rule')).map((rule) => ({
        rule: serializer.serializeToString(rule).replace(/\s+/g, ' ').trim(),
        label: describeRule(rule),
        editable: false
    }));
}

/** A readable summary where the rule is a shape the editor itself can produce. */
function describeRule(rule) {
    const implication = rule.firstElementChild;
    if (implication && implication.tagName === 'imp' && implication.children.length === 2) {
        const left = implication.children[0];
        const right = implication.children[1];
        if (left.tagName === 'var' && right.tagName === 'var') {
            return left.textContent + ' requires ' + right.textContent;
        }
        if (left.tagName === 'var' && right.tagName === 'not'
                && right.firstElementChild && right.firstElementChild.tagName === 'var') {
            return left.textContent + ' excludes ' + right.firstElementChild.textContent;
        }
    }
    return 'constraint kept from the loaded model';
}

function constraintRule(kind, left, right) {
    return kind === 'requires'
        ? '<rule><imp><var>' + escapeXml(left) + '</var><var>' + escapeXml(right) + '</var></imp></rule>'
        : '<rule><imp><var>' + escapeXml(left) + '</var><not><var>' + escapeXml(right)
            + '</var></not></imp></rule>';
}

/** Problems the backend would only report as a parse failure or a confusing model. */
function editorProblems() {
    const problems = [];
    const names = featureNames();

    if (!editorState.features.length || !editorState.features[0].name) {
        problems.push('The first feature is the root and needs a name.');
    }
    if (new Set(names).size !== names.length) {
        problems.push('Feature names must be unique.');
    }
    editorState.features.slice(1).forEach((feature, index) => {
        if (!feature.parent) {
            problems.push('Feature ' + (feature.name || index + 2) + ' has no parent.');
        }
    });

    // Event names may repeat — the feature expression is what tells two
    // same-named vertices apart — so only the expression itself is checked.
    editorState.events.forEach((event) => {
        if (!event.name) {
            problems.push('An event has no name.');
        } else if (event.name === PSEUDO_START || event.name === PSEUDO_END) {
            problems.push('An event cannot be named ' + event.name + '.');
        } else if (event.name.indexOf('/') >= 0) {
            problems.push('Event names cannot contain "/".');
        }
        if (!event.expression) {
            problems.push('Event ' + (event.name || '?') + ' has no feature expression.');
        } else if (names.indexOf(event.expression.replace('!', '')) < 0) {
            problems.push('Event ' + (event.name || '?') + ' refers to unknown feature '
                + event.expression.replace('!', '') + '.');
        }
    });

    if (!editorState.events.length) {
        problems.push('The ESG-Fx needs at least one event.');
    }

    // A feature reaches the engine only through the events it labels, so a
    // concrete feature no event mentions cannot be part of any configuration.
    const labelled = new Set(editorState.events
        .filter((event) => event.expression)
        .map((event) => event.expression.replace('!', '')));
    editorState.features
        .filter((feature) => feature.name && !feature.abstract && !labelled.has(feature.name))
        .forEach((feature) => {
            problems.push('Feature ' + feature.name + ' labels no event. Give an event the '
                + 'expression ' + feature.name + ', or mark the feature abstract.');
        });
    if (!editorState.edges.some((edge) => edge.source === PSEUDO_START)) {
        problems.push('No edge leaves the pseudo start.');
    }
    if (!editorState.edges.some((edge) => edge.target === PSEUDO_END)) {
        problems.push('No edge reaches the pseudo end.');
    }
    return problems;
}

function editorSelect(options, value, onChange, extraClass) {
    const select = document.createElement('select');
    select.className = 'border border-slate-300 rounded px-2 py-1 text-xs bg-white ' + (extraClass || '');
    options.forEach((option) => {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        select.appendChild(element);
    });
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return select;
}

function editorInput(value, placeholder, onChange, extraClass) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.className = 'border border-slate-300 rounded px-2 py-1 text-xs ' + (extraClass || 'w-28');
    input.addEventListener('input', () => onChange(input.value));
    return input;
}

function removeButton(onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-xs text-slate-400 hover:text-red-700 px-1';
    button.textContent = '✕';
    button.addEventListener('click', onClick);
    return button;
}

function renderFeatureEditorRows() {
    const container = document.getElementById('feature-rows');
    container.replaceChildren();
    const names = featureNames();
    const byName = featuresByName();
    const children = childrenByParent();

    editorState.features.forEach((feature, index) => {
        const row = document.createElement('div');
        row.className = 'flex flex-wrap items-center gap-2';

        row.appendChild(editorInput(feature.name, 'name', (value) => {
            // Children, feature expressions and constraints all name the feature,
            // so a rename has to follow through.
            const previous = feature.name;
            feature.name = value;
            editorState.features.forEach((other) => {
                if (other.parent === previous) {
                    other.parent = value;
                }
            });
            editorState.events.forEach((event) => {
                if (event.expression === previous) {
                    event.expression = value;
                } else if (event.expression === '!' + previous) {
                    event.expression = '!' + value;
                }
            });
            (editorState.constraints || []).forEach((constraint) => {
                if (!constraint.editable) {
                    return;
                }
                if (constraint.left === previous) {
                    constraint.left = value;
                }
                if (constraint.right === previous) {
                    constraint.right = value;
                }
                constraint.rule = constraintRule(constraint.kind, constraint.left, constraint.right);
                constraint.label = constraint.left + ' ' + constraint.kind + ' ' + constraint.right;
            });
            scheduleEditorChange();
        }));

        if (index === 0) {
            const rootTag = document.createElement('span');
            rootTag.className = 'text-xs text-slate-400';
            rootTag.textContent = 'root';
            row.appendChild(rootTag);
        } else {
            const under = document.createElement('span');
            under.className = 'text-xs text-slate-400';
            under.textContent = 'under';
            row.appendChild(under);

            const parentSelect = editorSelect(
                names.filter((name) => name !== feature.name).map((name) => ({value: name, label: name})),
                feature.parent, (value) => { feature.parent = value; scheduleEditorChange(); },
                'max-w-[10rem]');
            parentSelect.title = feature.parent;
            row.appendChild(parentSelect);

            // Mandatory versus optional is only a choice inside an and-group; in an
            // or-group or an alternative-group the group itself decides.
            const parent = byName[feature.parent];
            if (!parent || groupTagOf(parent) === 'and') {
                row.appendChild(editorSelect([
                    {value: 'mandatory', label: 'mandatory'},
                    {value: 'optional', label: 'optional'}
                ], feature.mandatory ? 'mandatory' : 'optional', (value) => {
                    feature.mandatory = value === 'mandatory';
                    scheduleEditorChange();
                }));
            } else {
                const memberOf = document.createElement('span');
                memberOf.className = 'text-xs text-slate-400';
                memberOf.textContent = groupTagOf(parent) === 'or' ? 'in or-group' : 'in alternative-group';
                row.appendChild(memberOf);
            }
        }

        // Offered on every feature, so a group can be declared before its members
        // exist; it only takes effect once the feature has children.
        const forms = document.createElement('span');
        forms.className = 'text-xs text-slate-400';
        forms.textContent = 'children';
        const childGroup = editorSelect([
            {value: 'and', label: 'and-group'},
            {value: 'or', label: 'or-group'},
            {value: 'alt', label: 'alternative-group'}
        ], groupTagOf(feature), (value) => { feature.childGroup = value; scheduleEditorChange(); });
        childGroup.title = 'What this feature\'s own children make up';
        row.append(forms, childGroup);

        const abstractLabel = document.createElement('label');
        abstractLabel.className = 'inline-flex items-center gap-1 text-xs text-slate-600';
        const abstractBox = document.createElement('input');
        abstractBox.type = 'checkbox';
        abstractBox.checked = feature.abstract;
        abstractBox.addEventListener('change', () => {
            feature.abstract = abstractBox.checked;
            scheduleEditorChange();
        });
        abstractLabel.append(abstractBox, document.createTextNode('abstract'));
        row.appendChild(abstractLabel);

        if (index > 0) {
            row.appendChild(removeButton(() => {
                editorState.features = editorState.features.filter((other) => other !== feature);
                editorState.features.forEach((other) => {
                    if (other.parent === feature.name) {
                        other.parent = editorState.features[0].name;
                    }
                });
                refreshEditor();
            }));
        }

        container.appendChild(row);
    });
}

function renderConstraintRows() {
    const container = document.getElementById('constraint-rows');
    container.replaceChildren();
    const names = featureNames().map((name) => ({value: name, label: name}));

    function refresh(constraint) {
        constraint.rule = constraintRule(constraint.kind, constraint.left, constraint.right);
        constraint.label = constraint.left + ' ' + constraint.kind + ' ' + constraint.right;
        scheduleEditorChange();
    }

    (editorState.constraints || []).forEach((constraint) => {
        const row = document.createElement('div');
        row.className = 'flex flex-wrap items-center gap-2';

        if (constraint.editable) {
            row.appendChild(editorSelect(names, constraint.left,
                (value) => { constraint.left = value; refresh(constraint); }));
            row.appendChild(editorSelect([
                {value: 'requires', label: 'requires'},
                {value: 'excludes', label: 'excludes'}
            ], constraint.kind, (value) => { constraint.kind = value; refresh(constraint); }));
            row.appendChild(editorSelect(names, constraint.right,
                (value) => { constraint.right = value; refresh(constraint); }));
        } else {
            // Anything richer than requires/excludes is kept exactly as written
            // rather than approximated, so the model keeps its meaning.
            const label = document.createElement('span');
            label.className = 'text-xs text-slate-600';
            label.textContent = constraint.label;
            const kept = document.createElement('span');
            kept.className = 'text-xs text-slate-400';
            kept.textContent = '— kept as written';
            row.append(label, kept);
        }

        row.appendChild(removeButton(() => {
            editorState.constraints = editorState.constraints.filter((other) => other !== constraint);
            renderEditor();
            scheduleEditorChange();
        }));

        container.appendChild(row);
    });
}

/** Same name twice needs the expression alongside it to be tellable apart. */
function vertexLabel(event) {
    const duplicated = editorState.events.filter((other) => other.name === event.name).length > 1;
    return duplicated ? event.name + '/' + event.expression : event.name;
}

function renderEventAndEdgeRows() {
    const eventRows = document.getElementById('event-rows');
    const edgeRows = document.getElementById('edge-rows');
    eventRows.replaceChildren();
    edgeRows.replaceChildren();

    const expressionOptions = [];
    featureNames().forEach((name) => {
        expressionOptions.push({value: name, label: name});
        expressionOptions.push({value: '!' + name, label: '!' + name});
    });

    editorState.events.forEach((event) => {
        const row = document.createElement('div');
        row.className = 'flex flex-wrap items-center gap-2';

        row.appendChild(editorInput(event.name, 'event', (value) => {
            event.name = value;
            scheduleEditorChange();
        }));

        const slash = document.createElement('span');
        slash.className = 'text-xs text-slate-400';
        slash.textContent = '/';
        row.appendChild(slash);

        row.appendChild(editorSelect(expressionOptions, event.expression,
            (value) => { event.expression = value; scheduleEditorChange(); }));

        row.appendChild(removeButton(() => {
            editorState.events = editorState.events.filter((other) => other !== event);
            editorState.edges = editorState.edges.filter(
                (edge) => edge.source !== event.id && edge.target !== event.id);
            renderEditor();
            scheduleEditorChange();
        }));

        eventRows.appendChild(row);
    });

    const vertexOptions = [{value: PSEUDO_START, label: PSEUDO_START}]
        .concat(editorState.events.map((event) => ({value: event.id, label: vertexLabel(event)})))
        .concat([{value: PSEUDO_END, label: PSEUDO_END}]);

    editorState.edges.forEach((edge) => {
        const row = document.createElement('div');
        row.className = 'flex flex-wrap items-center gap-2';

        row.appendChild(editorSelect(vertexOptions, edge.source,
            (value) => { edge.source = value; scheduleEditorChange(); }));

        const arrow = document.createElement('span');
        arrow.className = 'text-xs text-slate-400';
        arrow.textContent = '→';
        row.appendChild(arrow);

        row.appendChild(editorSelect(vertexOptions, edge.target,
            (value) => { edge.target = value; scheduleEditorChange(); }));

        row.appendChild(removeButton(() => {
            editorState.edges = editorState.edges.filter((other) => other !== edge);
            renderEditor();
            scheduleEditorChange();
        }));

        edgeRows.appendChild(row);
    });
}

function renderEditor() {
    renderFeatureEditorRows();
    renderConstraintRows();
    renderEventAndEdgeRows();
}

let editorTimer = null;

function scheduleEditorChange() {
    clearTimeout(editorTimer);
    editorTimer = setTimeout(refreshEditor, VALIDATION_DEBOUNCE_MS);
}

function reportEditorProblems() {
    const status = document.getElementById('editor-status');
    const problems = editorProblems();
    const applyButton = document.getElementById('apply-model');

    if (problems.length) {
        status.className = 'px-4 py-3 border-t border-slate-200 text-sm text-red-700';
        status.textContent = problems[0]
            + (problems.length > 1 ? ' (+' + (problems.length - 1) + ' more)' : '');
        applyButton.disabled = true;
        applyButton.classList.add('opacity-40', 'cursor-not-allowed');
    } else {
        status.className = 'px-4 py-3 border-t border-slate-200 text-sm text-slate-500';
        status.textContent = editorState.features.length + ' features, '
            + editorState.events.length + ' events, ' + editorState.edges.length + ' edges, '
            + (editorState.constraints || []).length + ' constraints. Apply to load this model.';
        applyButton.disabled = false;
        applyButton.classList.remove('opacity-40', 'cursor-not-allowed');
    }
    return problems.length === 0;
}

async function applyEditorModel() {
    if (!reportEditorProblems()) {
        return;
    }
    await loadUploadedModel(serializeFeatureModel(), serializeEsgFx());
    // loadUploadedModel draws the model the backend parsed; in draw mode the
    // canvas belongs to the editor, so it is put back.
    if (drawMode) {
        renderEditorGraphs();
    }
}

/** Rebuilds editor state from a loaded model, so a bundled example can be edited. */
function editorStateFromPayload(payload) {
    const parentOf = {};
    payload.featureModel.edges.forEach((edge) => {
        parentOf[edge.data.target] = edge.data.source;
    });

    // The backend reports the group kind on each child; the editor keeps it on
    // the parent, so it is folded back up here.
    const typeOf = {};
    payload.featureModel.nodes.forEach((node) => {
        typeOf[node.data.id] = node.data.type;
    });

    const childGroupOf = {};
    payload.featureModel.edges.forEach((edge) => {
        const childType = typeOf[edge.data.target];
        if (childType === 'or' || childType === 'alternative') {
            childGroupOf[edge.data.source] = childType === 'or' ? 'or' : 'alt';
        }
    });

    const features = payload.featureModel.nodes.map((node) => ({
        name: node.data.id,
        parent: parentOf[node.data.id] || '',
        mandatory: node.data.type === 'root' || node.data.type === 'mandatory',
        abstract: Boolean(node.data.isAbstract),
        childGroup: childGroupOf[node.data.id] || 'and'
    }));

    // Vertex ids carry over from the payload, so edges keep pointing at the same
    // vertex even where two of them share an event name.
    const idOf = {};
    const events = [];
    payload.esgFx.nodes.forEach((node) => {
        if (node.data.isPseudoStart) {
            idOf[node.data.id] = PSEUDO_START;
        } else if (node.data.isPseudoEnd) {
            idOf[node.data.id] = PSEUDO_END;
        } else {
            const id = newEventId();
            idOf[node.data.id] = id;
            events.push({id: id, name: node.data.label, expression: node.data.featureExpression || ''});
        }
    });

    const edges = payload.esgFx.edges.map((edge) => ({
        source: idOf[edge.data.source],
        target: idOf[edge.data.target]
    }));

    return {
        features: features,
        events: events,
        edges: edges,
        constraints: constraintsFromXml(payload.featureModelXml)
    };
}

document.getElementById('add-feature').addEventListener('click', () => {
    addFeatureUnder(editorState.features[0].name);
});

document.getElementById('add-event').addEventListener('click', addEventVertex);

document.getElementById('add-edge').addEventListener('click', () => {
    editorState.edges.push({source: PSEUDO_START, target: PSEUDO_END});
    refreshEditor();
});

document.getElementById('add-constraint').addEventListener('click', () => {
    const names = featureNames();
    if (names.length < 2) {
        return;
    }
    const left = names[names.length - 2];
    const right = names[names.length - 1];
    editorState.constraints = editorState.constraints || [];
    editorState.constraints.push({
        kind: 'requires', left: left, right: right,
        rule: constraintRule('requires', left, right),
        label: left + ' requires ' + right,
        editable: true
    });
    refreshEditor();
});

document.getElementById('sample-size').addEventListener('input', (event) => {
    event.target.dataset.userSet = 'true';
});

// ---- Downloading the drawn model -----------------------------------------

function triggerDownload(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function dataUrlToBlob(dataUrl) {
    const [meta, base64] = dataUrl.split(',');
    const mime = meta.match(/:(.*?);/)[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], {type: mime});
}

function graphFor(which) {
    return which === 'fm' ? featureModelGraph : esgFxGraph;
}

// A white background and a 2x scale so the raster reads cleanly: JPG has no
// transparency, and PDF and slides both look better than a screen-resolution
// grab.
function graphImageDataUrl(graph, format) {
    const options = {full: true, scale: 2, bg: '#ffffff'};
    return format === 'jpg' ? graph.jpg(options) : graph.png(options);
}

function saveGraphImage(which, format) {
    const graph = graphFor(which);
    if (!graph) {
        return;
    }
    const name = which === 'fm' ? 'FeatureModel' : 'ESG-Fx';
    if (format === 'pdf') {
        const png = graphImageDataUrl(graph, 'png');
        const image = new Image();
        image.onload = () => {
            const jsPdf = window.jspdf && window.jspdf.jsPDF;
            if (!jsPdf) {
                return;
            }
            const orientation = image.width >= image.height ? 'landscape' : 'portrait';
            const pdf = new jsPdf({orientation, unit: 'pt', format: [image.width, image.height]});
            pdf.addImage(png, 'PNG', 0, 0, image.width, image.height);
            pdf.save(name + '.pdf');
        };
        image.src = png;
        return;
    }
    triggerDownload(name + '.' + format, dataUrlToBlob(graphImageDataUrl(graph, format)));
}

document.getElementById('editor-download').addEventListener('change', (event) => {
    const choice = event.target.value;
    event.target.value = '';
    if (!choice) {
        return;
    }
    if (choice === 'fm-xml') {
        triggerDownload('FM.xml', new Blob([serializeFeatureModel()],
            {type: 'application/xml;charset=utf-8'}));
        return;
    }
    if (choice === 'esg-xml') {
        triggerDownload('ESG-Fx.xml', new Blob([serializeEsgFx()],
            {type: 'application/xml;charset=utf-8'}));
        return;
    }
    const [which, format] = choice.split('-');
    saveGraphImage(which, format);
});

document.getElementById('apply-model').addEventListener('click', applyEditorModel);

document.getElementById('editor-preset').addEventListener('change', async (event) => {
    const preset = event.target.value;
    event.target.value = '';
    if (!preset) {
        return;
    }
    if (preset === 'minimal') {
        editorState = minimalModel();
    } else {
        editorState = editorStateFromPayload(
            await fetch('/api/example/' + preset).then((response) => response.json()));
    }
    refreshEditor();
});

const ACTIVE_TAB_CLASSES = ['border-slate-900', 'text-slate-900', 'font-medium'];
const IDLE_TAB_CLASSES = ['border-transparent', 'text-slate-500'];

function selectSource(source) {
    document.querySelectorAll('.source-tab').forEach((tab) => {
        const active = tab.dataset.source === source;
        tab.classList.remove(...(active ? IDLE_TAB_CLASSES : ACTIVE_TAB_CLASSES));
        tab.classList.add(...(active ? ACTIVE_TAB_CLASSES : IDLE_TAB_CLASSES));
    });

    document.getElementById('example-picker').classList.toggle('hidden', source !== 'example');
    document.getElementById('upload-picker').classList.toggle('hidden', source !== 'upload');
    document.getElementById('editor').classList.toggle('hidden', source !== 'draw');

    setDrawMode(source === 'draw');

    if (source === 'example') {
        loadExample(document.getElementById('example-select').value);
    } else if (source === 'draw') {
        if (!editorState) {
            editorState = minimalModel();
        }
        renderEditor();
        reportEditorProblems();
        // Drawn straight away, so the canvas shows the model being edited rather
        // than whichever example was on screen until the apply comes back.
        renderEditorGraphs();
        applyEditorModel();
    }
}

document.querySelectorAll('.source-tab').forEach((tab) => {
    tab.addEventListener('click', () => selectSource(tab.dataset.source));
});

const modelInfo = document.getElementById('model-info');

function toggleModelInfo(open) {
    modelInfo.classList.toggle('hidden', !open);
}

['open-model-info', 'open-model-info-mark'].forEach((id) => {
    document.getElementById(id).addEventListener('click', () => toggleModelInfo(true));
});
document.getElementById('close-model-info').addEventListener('click', () => toggleModelInfo(false));
modelInfo.addEventListener('click', (event) => {
    if (event.target === modelInfo) {
        toggleModelInfo(false);
    }
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        toggleModelInfo(false);
    }
});

// ---------------------------------------------------------------------------
// Drag-and-drop editing
//
// In draw mode the two panels stop being a read-only view of what the backend
// parsed and become the editor's own canvas: they render straight from
// editorState, so a change shows up without a round trip. The form stays the
// place for exact values (names, expressions, relations); the canvas is for
// structure. Both write to the same state, and serialization is untouched.
// ---------------------------------------------------------------------------


function editorFeatureElements() {
    const byName = featuresByName();
    const nodes = editorState.features.filter((feature) => feature.name).map((feature, index) => ({
        data: {
            id: feature.name,
            label: feature.name,
            displayLabel: feature.name,
            engineName: feature.name,
            type: displayTypeOf(feature, index, byName),
            isAbstract: feature.abstract
        }
    }));
    const names = new Set(nodes.map((node) => node.data.id));
    const edges = editorState.features
        .filter((feature) => feature.parent && names.has(feature.parent) && names.has(feature.name))
        .map((feature) => ({
            data: {
                id: feature.parent + '->' + feature.name,
                source: feature.parent,
                target: feature.name
            }
        }));
    return {nodes: nodes, edges: edges};
}

function editorEsgFxElements() {
    const nodes = [{data: {id: PSEUDO_START, label: PSEUDO_START, isPseudoStart: true}}]
        .concat(editorState.events.map((event) => ({
            data: {
                id: event.id,
                label: event.name,
                featureExpression: event.expression
            }
        })))
        .concat([{data: {id: PSEUDO_END, label: PSEUDO_END, isPseudoEnd: true}}]);

    const known = new Set(nodes.map((node) => node.data.id));
    const edges = editorState.edges
        .filter((edge) => known.has(edge.source) && known.has(edge.target))
        .map((edge, index) => ({
            data: {id: 'e' + index, source: edge.source, target: edge.target}
        }));
    return {nodes: nodes, edges: edges};
}

/** Nudges a name that is already taken, so a new node never collides. */
function uniqueName(base, taken) {
    if (taken.indexOf(base) < 0) {
        return base;
    }
    let suffix = 2;
    while (taken.indexOf(base + suffix) >= 0) {
        suffix++;
    }
    return base + suffix;
}

function addFeatureUnder(parentName) {
    const name = uniqueName('F' + (editorState.features.length + 1), featureNames());
    editorState.features.push({
        name: name,
        parent: parentName || editorState.features[0].name,
        mandatory: false,
        abstract: false,
        childGroup: 'and'
    });
    refreshEditor();
}

function addEventVertex() {
    const names = featureNames();
    editorState.events.push({
        id: newEventId(),
        name: uniqueName('e' + (editorState.events.length + 1),
            editorState.events.map((event) => event.name)),
        expression: names.length ? names[names.length - 1] : ''
    });
    refreshEditor();
}

/** Removing a feature hands its children to the root rather than orphaning them. */
function removeFeature(name) {
    if (!editorState.features.length || editorState.features[0].name === name) {
        return;
    }
    editorState.features = editorState.features.filter((feature) => feature.name !== name);
    const rootName = editorState.features[0].name;
    editorState.features.forEach((feature) => {
        if (feature.parent === name) {
            feature.parent = rootName;
        }
    });
    refreshEditor();
}

function removeEventVertex(id) {
    editorState.events = editorState.events.filter((event) => event.id !== id);
    editorState.edges = editorState.edges.filter(
        (edge) => edge.source !== id && edge.target !== id);
    refreshEditor();
}

function addEsgEdge(source, target) {
    const exists = editorState.edges.some(
        (edge) => edge.source === source && edge.target === target);
    if (!exists) {
        editorState.edges.push({source: source, target: target});
    }
    refreshEditor();
}

/** Re-renders form, canvas and problem report from the current state. */
function refreshEditor() {
    renderEditor();
    reportEditorProblems();
    if (drawMode) {
        renderEditorGraphs();
    }
}

function attachFeatureEditing(graph) {
    graph.on('dbltap', (event) => {
        if (event.target === graph) {
            addFeatureUnder(editorState.features[0].name);
        }
    });

    // Dropping a feature on top of another reparents it. Cytoscape has no notion
    // of that on its own, so the drop target is whatever node the dragged one
    // was released over.
    graph.on('dragfree', 'node', (event) => {
        const dragged = event.target;
        const feature = editorState.features.filter((f) => f.name === dragged.id())[0];
        if (!feature || feature === editorState.features[0]) {
            renderEditorGraphs();
            return;
        }

        const position = dragged.position();
        const target = graph.nodes().filter((node) => {
            if (node.id() === dragged.id()) {
                return false;
            }
            const box = node.boundingBox();
            return position.x >= box.x1 && position.x <= box.x2
                && position.y >= box.y1 && position.y <= box.y2;
        })[0];

        // Reparenting under one's own descendant would detach the subtree.
        if (target && !isDescendantOf(target.id(), feature.name)) {
            feature.parent = target.id();
            refreshEditor();
        } else {
            renderEditorGraphs();
        }
    });
}

function isDescendantOf(candidate, ancestor) {
    let current = candidate;
    const seen = new Set();
    while (current && !seen.has(current)) {
        if (current === ancestor) {
            return true;
        }
        seen.add(current);
        const feature = editorState.features.filter((f) => f.name === current)[0];
        current = feature ? feature.parent : null;
    }
    return false;
}

const GHOST_NODE_ID = '__connect_ghost';
const GHOST_EDGE_ID = '__connect_ghost_edge';

// The pseudo start has nothing before it and the pseudo end nothing after it,
// and a self-loop is not an event following itself.
function canConnect(sourceId, targetId) {
    return sourceId !== targetId && targetId !== PSEUDO_START && sourceId !== PSEUDO_END;
}

/** The real node under a point, ignoring the drag's own scaffolding. */
function nodeAt(graph, position, excludeIds) {
    return graph.nodes().filter((node) => {
        if (excludeIds.indexOf(node.id()) >= 0) {
            return false;
        }
        const box = node.boundingBox();
        return position.x >= box.x1 && position.x <= box.x2
            && position.y >= box.y1 && position.y <= box.y2;
    })[0];
}

// Drag-to-connect, written directly rather than through the edgehandles
// extension: its browser bundle expects two lodash helpers as externals and
// silently fails to register without them. Vertices are positioned by the
// layout rather than by hand, so every drag on this canvas means "connect".
function attachEsgFxEditing(graph) {
    graph.autoungrabify(true);

    let connectSource = null;

    function clearGesture() {
        graph.getElementById(GHOST_EDGE_ID).remove();
        graph.getElementById(GHOST_NODE_ID).remove();
        connectSource = null;
    }

    graph.on('dbltap', (event) => {
        if (event.target === graph) {
            addEventVertex();
        }
    });

    graph.on('mousedown', 'node', (event) => {
        const node = event.target;
        if (node.id() === PSEUDO_END) {
            return;
        }
        connectSource = node;
        graph.add([
            {group: 'nodes', data: {id: GHOST_NODE_ID}, position: Object.assign({}, event.position),
                classes: 'connect-ghost', selectable: false, grabbable: false},
            {group: 'edges', data: {id: GHOST_EDGE_ID, source: node.id(), target: GHOST_NODE_ID},
                classes: 'connect-ghost-edge', selectable: false}
        ]);
    });

    graph.on('mousemove', (event) => {
        if (!connectSource) {
            return;
        }
        const ghost = graph.getElementById(GHOST_NODE_ID);
        if (ghost.nonempty()) {
            ghost.position(event.position);
        }
    });

    graph.on('mouseup', (event) => {
        if (!connectSource) {
            return;
        }
        const source = connectSource;
        const position = event.position;
        clearGesture();

        const target = nodeAt(graph, position, [GHOST_NODE_ID, source.id()]);
        if (target && canConnect(source.id(), target.id())) {
            addEsgEdge(source.id(), target.id());
        }
    });

    // A drag released outside the canvas would otherwise leave the ghost behind.
    graph.on('mouseout', (event) => {
        if (connectSource && event.target === graph) {
            clearGesture();
        }
    });
}

function selectionOf(graph) {
    return graph.$(':selected');
}

function updateDeleteButtons() {
    const featureSelected = featureModelGraph ? selectionOf(featureModelGraph).length > 0 : false;
    const esgSelected = esgFxGraph ? selectionOf(esgFxGraph).length > 0 : false;
    document.getElementById('delete-feature-selection').disabled = !featureSelected;
    document.getElementById('delete-esg-selection').disabled = !esgSelected;
    [['delete-feature-selection', featureSelected], ['delete-esg-selection', esgSelected]]
        .forEach(([id, enabled]) => {
            const button = document.getElementById(id);
            button.classList.toggle('opacity-40', !enabled);
            button.classList.toggle('cursor-not-allowed', !enabled);
        });
}

function deleteEsgSelection() {
    if (!esgFxGraph) {
        return;
    }
    const selected = selectionOf(esgFxGraph);
    selected.filter('edge').forEach((edge) => {
        editorState.edges = editorState.edges.filter(
            (candidate) => !(candidate.source === edge.source().id()
                && candidate.target === edge.target().id()));
    });
    selected.filter('node').forEach((node) => {
        if (node.id() !== PSEUDO_START && node.id() !== PSEUDO_END) {
            editorState.events = editorState.events.filter((event) => event.id !== node.id());
            editorState.edges = editorState.edges.filter(
                (edge) => edge.source !== node.id() && edge.target !== node.id());
        }
    });
    refreshEditor();
}

function deleteFeatureSelection() {
    if (!featureModelGraph) {
        return;
    }
    selectionOf(featureModelGraph).filter('node').forEach((node) => removeFeature(node.id()));
    refreshEditor();
}

const editorGraphStyle = featureModelStyle.concat([
    {selector: 'node:selected', style: {'border-width': 4, 'border-color': '#ea580c', 'border-opacity': 1}},
    {selector: 'edge:selected', style: {'line-color': '#ea580c', 'width': 3}},
    {selector: '.connect-ghost', style: {'width': 1, 'height': 1, 'opacity': 0, 'label': ''}},
    {selector: '.connect-ghost-edge', style: {
        'line-color': '#ea580c', 'target-arrow-color': '#ea580c', 'width': 3, 'line-style': 'dashed'
    }}
]);

const editorEsgStyle = esgFxStyle.concat([
    {selector: 'node:selected', style: {'border-width': 4, 'border-color': '#ea580c', 'border-opacity': 1}},
    {selector: 'edge:selected', style: {'line-color': '#ea580c', 'target-arrow-color': '#ea580c', 'width': 3}},
    {selector: '.connect-ghost', style: {'width': 1, 'height': 1, 'opacity': 0, 'label': ''}},
    {selector: '.connect-ghost-edge', style: {
        'line-color': '#ea580c', 'target-arrow-color': '#ea580c', 'width': 3, 'line-style': 'dashed'
    }}
]);

function renderEditorGraphs() {
    if (featureModelGraph) {
        featureModelGraph.destroy();
    }
    if (esgFxGraph) {
        esgFxGraph.destroy();
    }

    featureModelGraph = buildGraph('feature-model', editorFeatureElements(), editorGraphStyle, 'TB');
    esgFxGraph = buildGraph('esg-fx', editorEsgFxElements(), editorEsgStyle, 'LR');

    attachFeatureEditing(featureModelGraph);
    attachEsgFxEditing(esgFxGraph);

    [featureModelGraph, esgFxGraph].forEach((graph) => {
        graph.on('select unselect', updateDeleteButtons);
    });

    esgFxGraph.on('mouseover', 'node', (event) => {
        const data = event.target.data();
        if (data.isPseudoStart || data.isPseudoEnd) {
            showTooltip(data.isPseudoStart ? 'pseudo start vertex' : 'pseudo end vertex', event);
            return;
        }
        showTooltip(data.label + ' — ' + (expandExpression(data.featureExpression) || 'no feature expression'), event);
    });
    esgFxGraph.on('mouseout', 'node', hideTooltip);

    updateDeleteButtons();
}

function setDrawMode(enabled) {
    drawMode = enabled;
    DRAW_HINT_IDS.forEach((id) => document.getElementById(id).classList.toggle('hidden', !enabled));
    DELETE_BUTTON_IDS.forEach((id) => document.getElementById(id).classList.toggle('hidden', !enabled));
    if (enabled) {
        updateDeleteButtons();
    }
}

document.getElementById('delete-feature-selection').addEventListener('click', deleteFeatureSelection);
document.getElementById('delete-esg-selection').addEventListener('click', deleteEsgSelection);

document.addEventListener('keydown', (event) => {
    if (!drawMode || (event.key !== 'Delete' && event.key !== 'Backspace')) {
        return;
    }
    // Backspace inside a text field means backspace, not delete-node.
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
    }
    event.preventDefault();
    deleteEsgSelection();
    deleteFeatureSelection();
});

// Everything above is declarations; this is the only thing that runs on load.
// It sits last so it cannot reach a `let` or `const` further down the file,
// which would throw and take every listener after it with it.
//
// The tabs read draw, upload, examples, but a first visit is most useful
// looking at a model, so an example is what loads.
selectSource('example');
