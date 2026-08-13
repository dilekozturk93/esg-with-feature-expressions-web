# Progress Tracker

## Phase 0: Project setup
- [x] Create Spring Boot project structure
- [x] Add LICENSE (MIT)
- [x] Initial README with project description
- [x] First commit pushed
- **Verification:** `mvn spring-boot:run` starts a server rendering an "ESG-Fx Web Tool" Tailwind-styled card at http://localhost:8080/

## Phase 1A: Engine integration + ESG-Fx rendering
- [x] Submodule build pipeline (mvn install on lib/esg-core/)
- [x] Web project pom.xml depends on the installed esg-core artifact
- [x] EsgFxModelLoader service loads SVM feature model + ESG-Fx into memory
- [x] EsgFxJsonExporter service serializes ESG-Fx and feature model to Cytoscape.js-compatible JSON
- [x] REST endpoint GET /api/example/svm returns the JSON
- **Verification:** `curl http://localhost:8080/api/example/svm` returns JSON with 15 vertices and 21 edges in the ESG-Fx, and the SVM feature model tree

## Phase 1B: Single-product test generation
- [x] `SingleProductTestGenerationAPI` in the engine (L=1 via EulerCycleGeneratorForEventCoverage, L=2/3/4 via EulerCycleGeneratorForEdgeCoverage with transformation pipeline)
- [x] REST endpoint POST /api/generate
- [x] EsgFxModelLoader extended for eM and Elevator preloaded examples
- [x] Web service layer reduced to a thin wrapper over the engine API
- **Verification:** POST {splName:"SVM", features:["s"], coverageLength:1} returns Product P1's sequence (pay, change, soda, serveSoda, open, take, close) with 100% event coverage. SVM feature names in the engine model are short codes (`s`, `t`, `f`, `c`), not event names — sending `["soda"]` correctly rejects as invalid.

## Phase 1C: Ground-truth verification
- [x] Regenerated per-product ground truth for SVM, eM and Elevator from the original RQ1 pipelines
- [x] `SingleProductApiCheck` (engine, no server): 308/308 PASS
- [x] `scripts/verify_against_ground_truth.py` classifies MATCH / EQUIVALENT / MISMATCH instead of failing on Euler-cycle arrangement differences
- [x] Pinned the balancing step's edge ordering so generation is reproducible
- **Verification:** end-to-end over HTTP, 308/308 MATCH, 0 EQUIVALENT, 0 MISMATCH, 0 ERROR, identical across three consecutive runs. The earlier failure — the whole pipeline running on the 150% SPL model instead of the derived product model — is gone, and with it the SVM L=4 timeouts. Regenerating the ground truth twice now yields byte-identical test-sequence files, and the ordering change leaves coverage, sequence counts and event counts unchanged against the pre-change engine on all 308 files.

## Phase 2: Frontend skeleton + visualization
- [x] HTTP contract moved to a complete `featureSelection` map, response carries `productId`
- [x] `POST /api/config/validate` (FR7) and `configurationCount` on the example payload (FR3)
- [x] `GET /api/example/{name}` generic, so the dropdown drives it
- [x] Thymeleaf base layout with Tailwind via CDN
- [x] Cytoscape.js + dagre, ESG-Fx left-to-right with pseudo start/end marked and feature expression on hover
- [x] Feature model rendered as a top-down tree, styled by root/mandatory/optional/or/alternative/abstract
- [x] Dropdown to switch between SVM/eM/Elevator examples
- **Verification:** Driven in Chrome against all three examples. Both graphs render and re-render on switch, hover shows the feature expression, no console errors. Configuration counts (12/23/42) match the ground-truth product counts exactly. Regression still 308/308 MATCH under the new contract.
- **Note:** Tailwind's Play CDN generates its stylesheet at runtime, so a graph can be built before its container has a height. Graphs are fitted a frame after `layoutstop` and `cy.resize()` is called first; without that, wide graphs render cropped.

## Phase 3: Generate tests (Mode A, single product)
- [x] Feature checkbox UI, built from the `features` list on the example payload
- [x] Config validation wired to `POST /api/config/validate`, debounced 300ms, blocks Generate while invalid
- [x] Coverage length selector, default L=2
- [x] Generate button → results table
- [x] CSV download
- **Verification:** Driven in Chrome. With no feature ticked the configuration is reported invalid and Generate stays disabled; ticking `soda` turns it valid. Generating for SVM/`s` gives 100% coverage at every L, and the coverage metric is labelled event coverage at L=1 and edge coverage at L=2/3/4. L=1 returns the reference sequence (pay → change → soda → serveSoda → open → take → close); L=4 returns 5 event triples, matching the ground truth. CSV exports 9 columns per sequence as `SVM_P1_L4.csv`. Regression still 308/308 MATCH.
- **Note:** sequences keep the engine's `_N` vertex suffix at L≥2. That suffix is the vertex identity rather than part of the event name, and FR10's highlighting needs it to map a sequence back onto the graph, so it is deliberately not stripped.

## Phase 3B: Multi-product (Mode A "+" control)
- [x] `MultiProductTestGenerationAPI` in the engine, validating the whole set before generating any of it
- [x] `POST /api/generate/multi`, naming the offending product when one is invalid
- [x] "+ Add product" and per-product Remove, each product with its own feature block and validation line
- [x] Generate blocked until every product validates; results reuse the product picker and CSV covers them all
- **Verification:** Multi-product results are identical to separate single-product calls — 28 comparisons across three SPLs, several configurations and all four coverage lengths, zero differences. In the browser: two SVM products generated (P1 `s` → 1 sequence, P2 `c,t` → 2), every sequence highlights, CSV exports as `SVM_2products_L2.csv` with both product ids. Invalid product 2 blocks generation and the API reports `Product 2: …`. Removing a product renumbers the rest and clears stale results; switching example or mode resets to a single product.

## Phase 3C: All products (Mode B)
- [x] `AllProductsTestGenerationAPI` in the engine, delegating each configuration to the single-product API
- [x] `AllProductsApiCheck` alongside `SingleProductApiCheck`
- [x] `POST /api/generate/all`, refusing models above `AllProductsTestGenerator.MAX_CONFIGURATIONS` (200)
- [x] Mode selector, product picker over the generated set, CSV covering every product
- [x] Mandatory features rendered checked and locked
- **Verification:** All-products output reproduces the ground truth product for product — 308 products across three SPLs and four coverage lengths, checked both in-engine and over HTTP, zero mismatches. Product IDs line up because both the API and the research pipelines number only valid configurations. The count gate was exercised by temporarily lowering the limit to 20: SVM (12) generated, e-Mail (23) and Elevator (42) were refused with the count and limit in the message. All 12 SVM products render in the picker and all 22 of their sequences highlight.
- **Note:** locking is derived from the feature model — the root, plus mandatory children of already-forced features. Or-group and alternative-group members are never locked; which one to take is the user's choice and the validator enforces the group rule. e-Mail's root `e` is concrete, so it appears as a locked checkbox; SVM's and Elevator's roots are abstract and carry no truth value, so they do not.

## Phase 3D: Upload (Mode 2)
- [x] Every endpoint accepts either a bundled `splName` or the two model files inline
- [x] `POST /api/model` renders an uploaded pair in the same shape as a preloaded example
- [x] Source selector with two file inputs; uploaded models drive validation, all three generation modes and highlighting unchanged
- [x] 1 MB per-file limit; unreadable uploads answered as 400 with a specific message
- **Verification:** Uploading the bundled SVM files produces byte-identical graphs, feature model, configuration count and generation output to the preloaded route. In the browser, uploading the Elevator pair gives 42 configurations / 12 features / 21 vertices / 80 edges, its L=2 test suite matches the preloaded Elevator sequence for sequence, all 15 sequences highlight, and all-products returns 42 products. Rejected inputs: empty file, malformed XML, well-formed XML in the wrong schema, and over-limit content — each a 400 naming the problem.
- **Note on statelessness:** requests carry the model content rather than an upload handle. NFR3 asks for self-contained requests, and the deployment target sleeps when idle, so a server-side handle would go stale between upload and generation. The engine's converter reads paths rather than streams, so uploaded content is staged in a temp directory that is deleted before the request returns.
- **Note:** well-formed XML in the wrong schema parses into an empty model without complaint, which surfaced only later as a 500. `EsgFxModelLoader.requireUsable` now rejects it at the door — a model with no root, no features or no vertices is not usable.

## Phase 3E: Sampled products (Mode C)
- [x] `ProductConfigurationSampler` interface so a non-enumerating sampler (UniGen) can replace the default later
- [x] `UniformEnumerationSampler` — the research pipelines' method: draw positions uniformly over the valid-configuration space, then walk the enumeration to collect them
- [x] `SampledProductsTestGenerationAPI` + `SampledProductsApiCheck`
- [x] `POST /api/generate/sampled` with sample size and seed; third mode in the UI
- **Verification:** 63 PASS / 0 FAIL. A sampled product keeps its position in the full enumeration, so each sampled result is compared against the all-products result carrying the same id — identical coverage, sequence count, event count, sequences and selection across three SPLs and four coverage lengths. Seed 42 reproduces its sample (SVM `[1,3,4,7,9]`, e-Mail `[5,7,8,10,11]`, Elevator `[7,9,13,34,39]`); seed 7 draws a different one. Over-large sample sizes clamp to the configuration count (SVM asked for 50, returned 12); `sampleSize` outside [1,200] is a 400. In the browser: 6 Elevator samples generate, populate the product picker, and every sequence highlights.
- **Note:** sampled mode is deliberately *not* gated on the configuration count. That gate exists for all-products because it bounds how much gets generated; here the sample size does that, and the request timeout bounds the enumeration walk. This is also why switching to an over-limit model now falls back to sampled rather than specific-product.
- [x] UniGen behind the same interface, selectable per request

### UniGen sampler
- `FeatureModelCnf` derives the DIMACS CNF by **recording the clauses** `SATSolverGenerationFromFeatureModel` hands to a solver, rather than rebuilding them. That is the same constraint set `countValidConfigurations` and the all-products enumeration use, so the CNF cannot drift from what the rest of the API calls valid. Every variable is a feature — no auxiliary variables — so the `c ind` sampling set is all of them and a sample is already a configuration.
- `UniGenSampler` runs an external command over a small protocol (DIMACS on stdin; sample count and seed as arguments; one sample per line as signed literals). `scripts/unigen_bridge.py` implements it with `pyunigen`. Keeping the protocol ours means a new UniGen release, or a different sampler, is a config change rather than a parser rewrite.
- Configured by `esgfx.unigen.command`, overridable with `ESGFX_UNIGEN_COMMAND`. Availability is probed once and reported on the model payload, so the UI only offers the sampler when the server has it.
- **Verification:** `FeatureModelCnfCheck` enumerates the CNF's own models and requires that set to equal the engine's valid configurations — configuration by configuration, not by count: 3 PASS / 0 FAIL (12, 23, 42). Against real UniGen (pyunigen in an isolated venv): every sample is a valid configuration, all coverage 100%, the same seed reproduces its sample and a different seed does not. Asking for 60 samples of each SPL reaches every configuration (12/12, 23/23, 42/42). With UniGen absent the payload reports `uniGenAvailable: false`, a request naming it gets a message saying how to install it, and enumeration keeps working. An unknown sampler name is rejected.
- **Note — with replacement:** UniGen draws independently, so the same configuration can come up twice; 60 draws of SVM covered its 12 configurations with counts 10/6/6/6/5/5/4/4/4/4/3/3. Regenerating a repeat would produce the same suite, so repeats are dropped and the sample comes back smaller rather than padded out, which would skew the draw.
- **Note — product ids differ by sampler:** enumeration reports a configuration's position in the full enumeration, so its results cross-reference with all-products; UniGen does not enumerate and cannot know that position, so it reports the sample's own ordinal. This is the documented contract on `SampledConfiguration`.
- **Deployment:** the bridge needs `pip install pyunigen` in the image. That is one line, against building UniGen3, ApproxMC, Arjun and CryptoMiniSat from source for a CLI.

## Phase 3F: Draw in-browser (Mode 3)
- [x] Form-based editor for the feature tree, cross-tree constraints, events and edges, with live problem reporting
- [x] Serializes to FeatureIDE XML and mxGraph `.mxe`, then loads through the existing upload path — so validation, all three generation modes, highlighting and CSV are untouched
- [x] "Start from…" loads the minimal model or any bundled example into the editor
- **Verification:** Round-trip is exact for all three examples. Loading SVM/e-Mail/Elevator into the editor and writing them back reproduces the configuration count (12→12, 23→23, 42→42), the feature tree, and the ESG-Fx vertex and edge sets. Generating from the round-tripped model then matches the preloaded model product for product — 3 SPLs × 4 coverage lengths over all 77 products, zero differences once the engine's `_N` vertex-id suffix is normalised away (that suffix reflects the order vertices appear in the file, not their identity). A drawn minimal model generates at 100% coverage, and all three modes run on a drawn model.
- **Note — event names repeat:** SVM has two `take` vertices told apart only by their feature expression, so the editor keys edges on vertex ids, not names, and shows the expression beside a name that occurs twice. Keying on names silently rewired edges to the wrong vertex, and a comparison that matched edges by label could not see it.
- **Note — constraints are part of the meaning:** `<constraints>` is absent from the graph export, so an early version dropped it and e-Mail went 23→31, Elevator 42→96 configurations. The editor now carries constraints through an edit: `requires`/`excludes` are editable, and richer formulas are kept exactly as written rather than approximated.
- [x] Drag-and-drop layer over the same state
- **Canvas editing:** in draw mode both panels render from `editorState` rather than from the backend response, so an edit shows immediately without a round trip. ESG-Fx: drag from a vertex to another to connect, double-click empty canvas to add a vertex, select and delete. Feature model: drag a feature onto another to reparent, double-click to add, select and delete. The form remains the place for exact values — names, expressions, relations, abstract flags — and both write to the same state.
- **Verification:** driven with real mouse gestures in Chrome. Dragging `close` onto `pay` in SVM created that edge and the form grew from 21 to 22 edge rows; dragging feature `c` onto `b` reparented it and the validator immediately reported the resulting group-kind clash. Double-click added a vertex and a feature in the respective panels; delete removed them; deleting a feature reassigned its children to the root; the pseudo start survived a delete attempt. Connection guards hold: no self-loop, nothing into the pseudo start, nothing out of the pseudo end. Switching source back to example or upload restores read-only graphs, and generation plus highlighting still work there. Round-trip is unchanged — all three examples still reproduce their configuration count, structure and, at every coverage length, their test suites.
- **Note:** the drag gesture is written directly rather than via `cytoscape-edgehandles`. That extension's browser bundle expects `lodash.memoize` and `lodash.throttle` as externals and silently fails to register without them, which would have meant two more CDN scripts and a shim. Writing it out is ~40 lines and drops the dependency. The gesture's `mouseup` lands on the drag's own ghost node, so the drop target is found by hit-testing the position rather than by reading the event target.
- **Note:** ESG-Fx vertices are ungrabbable in draw mode. The layout positions them, so hand-positioning has nothing to preserve, and that makes every drag on that canvas unambiguously a connect gesture.

## Phase 4: Highlight + polish
- [x] Click sequence → highlight on ESG-Fx, everything else dimmed
- [x] Clear highlight button
- [x] Error states styled (red banners, no raw stack traces)
- [ ] Loading spinner during generation (button shows "Generating…" for now)
- **Verification:** Event labels repeat within an ESG-Fx — SVM has two distinct `take` vertices — so a sequence is located by following real edges and backtracking, not by matching names. Checked that SVM's walk highlights `take` v13 (reachable from `open`) and leaves v11 dimmed. Then resolved *every* sequence of every bundled example at every coverage length against its ESG-Fx: SVM 4 levels, e-Mail 2 configurations × 4 levels, Elevator 4 levels (42 sequences at L=4). Zero unresolved, and every walk had exactly `events − 1` edges, so each one is a continuous path. L=3/L=4 composite tokens decompose to the same walk as L=1.

## Phase 5: Deploy + materials
- [x] Bundled examples packaged into the jar, so it runs from any directory
- [x] `Dockerfile` (multi-stage: engine submodule → web app → JRE + UniGen), `.dockerignore`, `render.yaml`
- [x] README rewritten for a reviewer: run the image, build from source, reproduce the ground-truth checks, archive as an artifact
- **Verification of the self-contained jar:** copied alone into an empty directory with no repository anywhere near it, and driven there — all three examples load, single-product, all-products and sampled generation all work, on the default port and on `--server.port=9090`, with the bridge given an absolute path as the image does. Regression still 308/308 and all four engine checks pass.
- **Note — a packaging-only bug this surfaced:** `/api/generate` runs on a `ForkJoinPool` thread, whose context class loader is not the one Spring Boot's executable jar launches with, so a default `ClassPathResource` lookup could not see `BOOT-INF/classes`. Examples loaded fine over `/api/example` and failed under generation. Resource lookups are now pinned to the declaring class's loader. This only appears once the app is packaged, which is why running from the working tree never showed it.
- **Not verified:** Docker is not installed on the development machine, so the image has not been built or run. Every assumption inside it that could be checked without Docker was: the Maven build, `dependency:go-offline`, the bundled-resource layout, `--server.port=$PORT`, the absolute bridge path, and UniGen through it. What remains untested is the image assembly itself — base images, `apt-get`, and the `pyunigen` wheel on linux/amd64.
- [ ] Deployed on Render with public URL
- [ ] Deployed on Render with public URL
- [ ] README screenshots and the deployment URL, once it exists
- [ ] Demo video recorded
- [ ] Paper draft started
- **Verification:** Cold visit to public URL completes full flow successfully