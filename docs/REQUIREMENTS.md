# ESG-Fx Web Tool — Requirements

## Project context

A web-based tool for model-based test generation for Software Product 
Lines using Event Sequence Graphs with Feature Expressions (ESG-Fx). 
No fixed external deadline — the priority is a correct, well-architected 
tool. A future venue (conference tool track or similar) may be targeted 
once the tool is mature.

Deliverables we still want:
- Public GitHub repo (MIT licensed)
- Live demo URL
- Demo video

## User personas

**Primary:** SPL test engineer or researcher familiar with feature 
models and basic testing concepts.

**Secondary:** Someone evaluating the tool who wants to see it work in 
a few minutes without reading a manual.

## Functional requirements

### FR1: Model input — three modes

The tool always works with two models: a feature model and an ESG-Fx. 
The user supplies them in one of three ways:

**Mode 1 — Preloaded SPL.** User picks a bundled example (SVM, e-Mail, 
Elevator). Both models ship with the tool. Preloaded feature models use 
full human-readable feature names, so no short-code label mapping is 
needed.

**Mode 2 — Upload.** User uploads their own feature model file and their 
own ESG-Fx file.

**Mode 3 — Draw in-browser.** User constructs the feature model and the 
ESG-Fx directly in the tool. Lowest priority — implemented last.

Regardless of mode, the result is one feature model plus one ESG-Fx 
delivered to the backend.

### FR2: Test generation modes

After the models are loaded, the user picks a coverage length (L=1..4) 
and one of three generation modes:

**Mode A — Specific products.** User defines one product by selecting 
features, optionally adds more products via a "+" control, then 
generates tests for that set. Results are shown per product and can be 
downloaded.

**Mode B — All products.** A single action that generates tests for 
every valid product configuration of the feature model.

**Mode C — Sampled products.** Generate tests for a sample of 
configurations drawn from the feature model. Sampling integration 
(e.g., a uniform sampler such as UniGen) is a later-stage feature.

### FR3: Configuration count

As soon as a feature model is loaded, the backend computes and reports 
the number of valid product configurations. This informs the user and 
gates Mode B for very large models.

### FR4: Feature model visualization

- Hierarchical tree, top-to-bottom
- Node styling distinguishes mandatory, optional, or-group, 
  alternative-group, abstract, and root
- Cytoscape.js with a tree/dagre layout

### FR5: ESG-Fx visualization

- Directed graph, laid out left-to-right
- Vertices labeled with their event name; feature expression shown on 
  hover
- Pseudo start and pseudo end vertices marked distinctly
- Cytoscape.js with a dagre layout

### FR6: Coverage length selection

- Selectable L=1, L=2, L=3, L=4
- Default: L=2
- L=1 uses event coverage; L=2/3/4 use edge coverage at the 
  corresponding level

### FR7: Configuration validation

- A feature selection is validated against the feature model before 
  test generation
- Invalid selections are reported with a clear message and block 
  generation

### FR8: Test generation

- The backend generates tests by calling the engine's programmatic 
  API (see "Engine API layer" below)
- Returns, per product: the selected configuration, the generated test 
  sequences, sequence count, total event count, and the coverage 
  percentage
- A request that runs too long is bounded by a timeout

### FR9: Result display

- For each product: selected features, number of test sequences, total 
  event count, coverage metric (event coverage for L=1, edge coverage 
  for L=2/3/4), and the test sequences themselves as ordered event lists
- Clicking a test sequence highlights its traversed path on the ESG-Fx
- Results downloadable as CSV

### FR10: Sequence highlighting

- Selecting a sequence highlights its vertices and edges on the ESG-Fx
- A distinct highlight color, with a "clear highlight" action

## Engine API layer

Single-product test generation is exposed as a first-class programmatic 
API inside the engine (package `tr.edu.iyte.esgfx.api`), not 
re-implemented in the web layer. The web backend is a thin wrapper over 
this API.

- `SingleProductTestGenerationAPI` — load a model, validate a 
  configuration, generate tests for one product, count valid 
  configurations.
- `MultiProductTestGenerationAPI` — generate for an explicit set of 
  product configurations; delegates to the single-product API.
- `AllProductsTestGenerationAPI` — generate for every valid 
  configuration; delegates to the single-product API.

The original research pipelines (RQ1/RQ2 case classes, 
TestSequenceRecorder, and the rest) are left untouched. The API is a 
new, additive entry point. It lives in the engine repository, which is 
consumed here as a git submodule.

## Non-functional requirements

### NFR1: Browser support

Chrome and Firefox, recent versions. No IE; Safari untested.

### NFR2: Response times

- Page load under ~2s
- Single-product generation under ~5s for the bundled examples
- Graph rendering under ~1s for small models

### NFR3: Statelessness

No session state, no database. Each request is self-contained.

### NFR4: Deployment

- Single fat jar or container
- Deployable on a free-tier host
- HTTPS

## Build order (priority)

1. Engine API: `SingleProductTestGenerationAPI`, verified against the 
   original pipeline's ground-truth test sequences.
2. Web backend: thin wrapper exposing the API over REST.
3. Preloaded SPL mode (Mode 1) plus visualization of both models.
4. Specific-products generation (Mode A) with results table and CSV.
5. Sequence highlighting on the ESG-Fx.
6. All-products mode (Mode B) with configuration-count gating, plus 
   `AllProductsTestGenerationAPI`.
7. Multi-product API (`MultiProductTestGenerationAPI`) wired to Mode A's 
   multi-product UI.
8. Upload mode (Mode 2).
9. Sampled mode (Mode C) — sampler integration.
10. Draw-in-browser mode (Mode 3).