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
        const expression = data.featureExpression || 'no feature expression';
        showTooltip(data.label + ' — ' + expression, event);
    });
    esgFxGraph.on('mouseout', 'node', hideTooltip);
}

function displayNameFor(featureName) {
    return currentFeatureLabels[featureName] || featureName;
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
            label.title = 'Mandatory in the feature model';
        }

        const text = document.createElement('span');
        const display = displayNameFor(featureName);
        text.textContent = display;
        if (display !== featureName) {
            const engineName = document.createElement('span');
            engineName.className = 'text-slate-400 ml-1';
            engineName.textContent = '(' + featureName + ')';
            text.appendChild(engineName);
        }
        if (input.disabled) {
            const required = document.createElement('span');
            required.className = 'text-slate-400 ml-1';
            required.textContent = '— required';
            text.appendChild(required);
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
    setStat('stat-features', payload.featureModel.nodes.length);
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
function applyMode() {
    const hint = document.getElementById('all-products-hint');
    const allRadio = document.querySelector('input[name="generation-mode"][value="all"]');

    const count = currentExample ? currentExample.configurationCount : 0;
    const limit = currentExample ? currentExample.allProductsLimit : 0;
    const overLimit = currentExample !== null && count > limit;

    // Switching from a small example to one over the limit would otherwise
    // leave all-products selected but disabled, with the feature list hidden
    // and nothing to press.
    allRadio.disabled = overLimit;
    if (overLimit && allRadio.checked) {
        document.querySelector('input[name="generation-mode"][value="specific"]').checked = true;
    }

    const allMode = currentMode() === 'all';
    document.getElementById('feature-section').classList.toggle('hidden', allMode);
    generateButton.textContent = allMode ? 'Generate for all products' : 'Generate tests';

    if (!currentExample) {
        return;
    }

    hint.classList.toggle('hidden', !allMode && !overLimit);
    if (overLimit) {
        hint.textContent = count.toLocaleString() + ' valid configurations, above the limit of '
            + limit.toLocaleString() + ' — use a specific product.';
    } else if (allMode) {
        hint.textContent = 'Generates tests for all ' + count.toLocaleString() + ' valid configurations.';
    }

    if (allMode) {
        generateButton.disabled = overLimit;
    } else {
        validateAllBlocks();
    }
}

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
            && previous.slice(1).join(' ') === current.slice(0, -1).join(' ');
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
        result.coverageType === 'event' ? 'Event coverage' : 'Edge coverage';
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
        events.textContent = sequence.join(' → ');

        row.append(number, length, events);
        body.appendChild(row);
    });

    document.getElementById('results-empty').classList.add('hidden');
    document.getElementById('results').classList.remove('hidden');
    downloadButton.disabled = false;
}

async function generate() {
    clearError();
    const allMode = currentMode() === 'all';
    generateButton.disabled = true;
    const originalLabel = generateButton.textContent;
    generateButton.textContent = 'Generating…';

    const blocks = productBlocks();
    const multi = !allMode && blocks.length > 1;
    let request;
    if (allMode) {
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

        lastGenerationMode = allMode ? 'all' : (multi ? 'multi' : 'single');
        if (allMode || multi) {
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
                product.coverageType,
                product.coveragePercentage,
                index + 1,
                sequence.length,
                sequence.join(' -> ')
            ]);
        });
    });

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));

    const scope = lastGenerationMode === 'all' ? 'allProducts'
        : (lastGenerationMode === 'multi' ? products.length + 'products'
            : 'P' + latestResult.productId);

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

document.getElementById('source-select').addEventListener('change', (event) => {
    const upload = event.target.value === 'upload';
    document.getElementById('example-picker').classList.toggle('hidden', upload);
    document.getElementById('upload-picker').classList.toggle('hidden', !upload);
    if (!upload) {
        loadExample(document.getElementById('example-select').value);
    }
});

document.querySelectorAll('[data-fit]').forEach((button) => {
    button.addEventListener('click', () => {
        const graph = button.dataset.fit === 'feature-model' ? featureModelGraph : esgFxGraph;
        if (graph) {
            fitGraph(graph);
        }
    });
});

window.addEventListener('resize', () => {
    [featureModelGraph, esgFxGraph].filter(Boolean).forEach(fitGraph);
});

loadExample(document.getElementById('example-select').value);
