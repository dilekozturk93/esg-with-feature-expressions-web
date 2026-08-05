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
- **Verification:** end-to-end over HTTP, 304/308 exact MATCH, 4 EQUIVALENT (El L=1 — same coverage, same sequence and event counts, different repeated event), 0 MISMATCH, 0 ERROR. The earlier failure — the whole pipeline running on the 150% SPL model instead of the derived product model — is gone, and with it the SVM L=4 timeouts.

## Phase 2: Frontend skeleton + visualization
- [ ] Thymeleaf base layout with Tailwind via CDN
- [ ] Cytoscape.js loaded, renders SVM ESG-Fx on page load
- [ ] Dropdown to switch between SVM/eM/Elevator examples
- [ ] Feature model rendered as tree
- **Verification:** Visit /, see both graphs render, switching examples works

## Phase 3: Generate tests
- [ ] Feature checkbox UI
- [ ] Config validation endpoint + frontend integration
- [ ] Coverage length selector
- [ ] Generate button → results table
- [ ] CSV download
- **Verification:** Generate tests for SVM with the `s` feature selected, get the same output as the engine API

## Phase 4: Highlight + polish
- [ ] Click sequence → highlight on ESG-Fx
- [ ] Clear highlight button
- [ ] Error states styled (red banners, no raw stack traces)
- [ ] Loading spinner during generation
- **Verification:** Highlight visually correct against manual trace

## Phase 5: Deploy + materials
- [ ] Dockerfile or fat jar config
- [ ] Deployed on Render with public URL
- [ ] README updated with screenshots, deployment URL, usage
- [ ] Demo video recorded
- [ ] Paper draft started
- **Verification:** Cold visit to public URL completes full flow successfully