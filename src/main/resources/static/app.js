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
    }
];

const VALIDATION_DEBOUNCE_MS = 300;

let featureModelGraph = null;
let esgFxGraph = null;
let currentSpl = null;
let currentFeatureLabels = {};
let latestResult = null;
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

function renderFeatureCheckboxes(features) {
    const container = document.getElementById('feature-checkboxes');
    container.replaceChildren();

    features.forEach((featureName) => {
        const label = document.createElement('label');
        label.className = 'inline-flex items-center gap-2 text-sm';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = featureName;
        input.addEventListener('change', scheduleValidation);

        const text = document.createElement('span');
        const display = displayNameFor(featureName);
        text.textContent = display;
        if (display !== featureName) {
            const engineName = document.createElement('span');
            engineName.className = 'text-slate-400 ml-1';
            engineName.textContent = '(' + featureName + ')';
            text.appendChild(engineName);
        }

        label.append(input, text);
        container.appendChild(label);
    });
}

function selectedFeatureNames() {
    return Array.from(document.querySelectorAll('#feature-checkboxes input:checked'))
        .map((input) => input.value);
}

// The API is handed every feature, not just the ticked ones, so it never has to
// infer a value for one the page left out.
function currentSelection() {
    const selection = {};
    document.querySelectorAll('#feature-checkboxes input').forEach((input) => {
        selection[input.value] = input.checked;
    });
    return selection;
}

function selectedCoverageLength() {
    return Number(document.querySelector('input[name="coverage-length"]:checked').value);
}

async function loadExample(name) {
    clearError();
    hideTooltip();
    clearResults();
    try {
        const response = await fetch('/api/example/' + name);
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || ('Request failed with status ' + response.status));
        }
        const payload = await response.json();

        currentSpl = payload.name;
        currentFeatureLabels = payload.featureLabels || {};

        renderFeatureModel(payload.featureModel, currentFeatureLabels);
        renderEsgFx(payload.esgFx);
        renderFeatureCheckboxes(payload.features);

        setStat('stat-configs', payload.configurationCount.toLocaleString());
        setStat('stat-features', payload.featureModel.nodes.length);
        setStat('stat-vertices', payload.esgFx.nodes.length);
        setStat('stat-edges', payload.esgFx.edges.length);

        validateSelection();
    } catch (error) {
        showError('Could not load the example: ' + error.message);
    }
}

const generateButton = document.getElementById('generate-button');
const validationStatus = document.getElementById('validation-status');
const downloadButton = document.getElementById('download-csv');

function setValidationStatus(state, message) {
    const colours = {
        valid: 'text-emerald-700',
        invalid: 'text-red-700',
        pending: 'text-slate-500'
    };
    validationStatus.className = 'text-sm ' + colours[state];
    validationStatus.textContent = message;
    generateButton.disabled = state !== 'valid';
}

function scheduleValidation() {
    setValidationStatus('pending', 'Checking configuration…');
    clearTimeout(validationTimer);
    validationTimer = setTimeout(validateSelection, VALIDATION_DEBOUNCE_MS);
}

async function validateSelection() {
    if (!currentSpl) {
        return;
    }
    try {
        const response = await fetch('/api/config/validate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({splName: currentSpl, featureSelection: currentSelection()})
        });
        const body = await response.json();
        if (body.valid) {
            setValidationStatus('valid', 'Configuration is valid.');
        } else {
            setValidationStatus('invalid', (body.errors || ['Configuration is not valid.']).join(' '));
        }
    } catch (error) {
        setValidationStatus('invalid', 'Could not validate the configuration: ' + error.message);
    }
}

function clearResults() {
    latestResult = null;
    downloadButton.disabled = true;
    document.getElementById('results').classList.add('hidden');
    document.getElementById('results-empty').classList.remove('hidden');
    document.getElementById('results-body').replaceChildren();
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
    generateButton.disabled = true;
    const originalLabel = generateButton.textContent;
    generateButton.textContent = 'Generating…';

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                splName: currentSpl,
                featureSelection: currentSelection(),
                coverageLength: selectedCoverageLength()
            })
        });
        const body = await response.json();
        if (!response.ok) {
            const message = body.errors ? body.errors.join(' ') : (body.error || 'Generation failed.');
            throw new Error(message);
        }
        renderResults(body);
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
    const enabled = Object.keys(latestResult.featureSelection)
        .filter((name) => latestResult.featureSelection[name]);

    const rows = [['spl', 'productId', 'features', 'coverageLength', 'coverageType',
        'coveragePercentage', 'sequenceIndex', 'eventCount', 'sequence']];

    latestResult.testSequences.forEach((sequence, index) => {
        rows.push([
            latestResult.splShortName,
            latestResult.productId,
            enabled.join(' '),
            latestResult.coverageLength,
            latestResult.coverageType,
            latestResult.coveragePercentage,
            index + 1,
            sequence.length,
            sequence.join(' -> ')
        ]);
    });

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));

    const link = document.createElement('a');
    link.href = url;
    link.download = latestResult.splShortName + '_P' + latestResult.productId
        + '_L' + latestResult.coverageLength + '.csv';
    link.click();
    URL.revokeObjectURL(url);
}

generateButton.addEventListener('click', generate);
downloadButton.addEventListener('click', downloadCsv);
document.getElementById('coverage-length').addEventListener('change', clearResults);

document.getElementById('example-select').addEventListener('change', (event) => {
    loadExample(event.target.value);
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
