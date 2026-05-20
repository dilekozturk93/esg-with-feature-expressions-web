# Progress Tracker

## Phase 0: Project setup
- [x] Create Spring Boot project structure
- [x] Add LICENSE (MIT)
- [x] Initial README with project description
- [x] First commit pushed
- **Verification:** `mvn spring-boot:run` starts a server rendering an "ESG-Fx Web Tool" Tailwind-styled card at http://localhost:8080/

## Phase 1: Java core integration
- [ ] Inspect original repo: identify ESG, Vertex, Edge, FeatureModel classes
- [ ] Copy or depend on the core
- [ ] Write `EsgFxService.java` wrapping the engine
- [ ] One REST endpoint: GET /api/example/svm returns SVM ESG-Fx as JSON
- **Verification:** curl localhost:8080/api/example/svm returns valid JSON with nodes and edges

## Phase 2: Frontend skeleton + visualization
- [ ] Thymeleaf base layout with Tailwind via CDN
- [ ] Cytoscape.js loaded, renders SVM ESG-Fx on page load
- [ ] Dropdown to switch between SVM/eM/BA examples
- [ ] Feature model rendered as tree
- **Verification:** Visit /, see both graphs render, switching examples works

## Phase 3: Generate tests
- [ ] Feature checkbox UI
- [ ] Config validation endpoint + frontend integration
- [ ] Coverage length selector
- [ ] Generate button → results table
- [ ] CSV download
- **Verification:** Generate tests for SVM with `soda` selected, get same output as Java CLI

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