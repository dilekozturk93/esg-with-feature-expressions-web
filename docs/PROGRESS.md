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
- [ ] `MultiProductTestGenerationAPI` in the engine
- [ ] "+" control to add product 2, 3, … and results grouped per product
- **Verification:** Two products in one request return results matching two separate single-product calls

## Phase 4: Highlight + polish
- [x] Click sequence → highlight on ESG-Fx, everything else dimmed
- [x] Clear highlight button
- [x] Error states styled (red banners, no raw stack traces)
- [ ] Loading spinner during generation (button shows "Generating…" for now)
- **Verification:** Event labels repeat within an ESG-Fx — SVM has two distinct `take` vertices — so a sequence is located by following real edges and backtracking, not by matching names. Checked that SVM's walk highlights `take` v13 (reachable from `open`) and leaves v11 dimmed. Then resolved *every* sequence of every bundled example at every coverage length against its ESG-Fx: SVM 4 levels, e-Mail 2 configurations × 4 levels, Elevator 4 levels (42 sequences at L=4). Zero unresolved, and every walk had exactly `events − 1` edges, so each one is a continuous path. L=3/L=4 composite tokens decompose to the same walk as L=1.

## Phase 5: Deploy + materials
- [ ] Dockerfile or fat jar config
- [ ] Deployed on Render with public URL
- [ ] README updated with screenshots, deployment URL, usage
- [ ] Demo video recorded
- [ ] Paper draft started
- **Verification:** Cold visit to public URL completes full flow successfully