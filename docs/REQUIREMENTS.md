# ESG-Fx Web Tool — Requirements

## Target conference

SPLC 2026 Tool Track. Deliverables required:
- Public GitHub repo (MIT licensed)
- Live demo URL
- 4-page paper (IEEE format, to be confirmed)
- 3-5 minute demo video

## User personas

**Primary:** SPL test engineer or researcher familiar with feature models and basic testing concepts. Has used FeatureIDE before.

**Secondary:** Conference reviewer who wants to verify the tool works in 5 minutes without reading a manual.

## Functional requirements

### FR1: Example loading
- Three preloaded examples: SVM (4 features), e-Mail (5 features), Elevator (9 features)
- Loaded with a single dropdown selection — no upload required for examples
- Examples are loaded from the submodule at `lib/esg-core/files/Cases/<SPLName>/`

### FR2: Custom upload
- Feature model: FeatureIDE XML format (`.xml`)
- ESG-Fx model: our format (TBD — match what the original Java repo uses)
- File size limit: 1MB per file
- Validation errors shown inline, not as 500 errors

### FR3: Feature model visualization
- Hierarchical tree, top-down
- Node styling indicates: mandatory (filled circle), optional (empty circle), or-group, alternative-group
- Cytoscape.js with `dagre` layout

### FR4: ESG-Fx visualization
- Directed graph
- Vertices labeled with feature expressions (e.g., `s`, `t`, `!f ∧ c`)
- Pseudo start and pseudo end vertices marked distinctly (e.g., 
  double border or distinct shape)
- Hover on a vertex shows its full feature expression in a tooltip
- Cytoscape.js with `dagre` layout

### FR5: Coverage length selection
- Radio buttons: L=1, L=2, L=3, L=4
- **Default: L=2**
- Backend dispatches based on selected level:
  - L=1 → `EulerCycleGeneratorForEventCoverage` (event coverage)
  - L=2, 3, 4 → `EulerCycleGeneratorForEdgeCoverage` (edge coverage at the 
    corresponding level)

### FR6: Product configuration selection
- Mode A: "Single configuration" — checkboxes over all features
- Mode B: "All valid products" — only enabled if feature count ≤ 10
- Mode A is default

### FR7: Configuration validation
- Runs on every checkbox change (debounced 300ms)
- Backend endpoint: POST /api/config/validate
- Shows specific error: "Feature X is mandatory but not selected", "Features Y and Z are in alternative group", etc.
- "Generate" button disabled while invalid

### FR8: Test generation
- POST /api/generate with feature model, ESG-Fx, coverage length, and a 
  single product configuration (set of selected features)
- Returns list of test sequences
- 60-second hard timeout

**Engine adaptation needed:** The existing pipelines in 
`src/tr/edu/iyte/esgfx/cases/RQ2_ExtremeScalability_L1.java` and 
`src/tr/edu/iyte/esgfx/cases/RQ2_ExtremeScalability_L234.java` iterate over 
all valid product configurations of the feature model. For the web tool we 
need a single-product variant: take the user-selected feature set, set the 
corresponding feature truth values, then invoke the appropriate 
EulerCycleGenerator (Event or Edge based on L) once. Implement this adapter 
as a new class in the service layer of the web project; do not modify the 
submodule.

### FR9: Result display
- For the selected product configuration, show:
  - Selected features (comma-separated)
  - Number of test sequences generated
  - Total event count across all sequences
  - **Coverage metric:** event coverage % for L=1, edge coverage % for 
    L=2/3/4 (label correctly based on selected L)
  - The test sequences themselves, each shown as an ordered list of events 
    (e.g., `pay → change → soda → serveSoda → open → take → close`)
- Click on a test sequence row → highlight that sequence's traversed 
  vertices and edges on the ESG-Fx graph
- "Download CSV" button exports the full result

### FR10: Sequence highlighting (critical for paper)
- Selecting a sequence highlights its vertices and edges on ESG-Fx
- Use a distinct color (e.g., orange) that contrasts with the default styling
- "Clear highlight" button

## Non-functional requirements

### NFR1: Browser support
- Chrome 100+, Firefox 100+. No IE, no Safari testing in MVP.

### NFR2: Response times
- Page load: < 2s
- Single config test gen: < 5s for SVM/eM/BA examples
- Graph rendering: < 1s for ≤50 vertices

### NFR3: Statelessness
- No session state, no database. Every request self-contained (feature model + ESG-Fx + params in payload, or temporarily stored in server memory per-request only).

### NFR4: Deployment
- Single Docker container or fat jar
- Deployable on Render.com free tier
- HTTPS only (Render handles this)

## Constraints from the existing Java codebase

- Reuse the engine from https://github.com/esg4aspl/esg-with-feature-expressions
- Add it as a Maven local dependency OR copy `src/tr/edu/iyte/esgfx` into this project
- TBD after inspecting: class names, input/output types, how to invoke programmatically

## MVP cut line (must work by June 1)

FR1, FR3, FR4, FR5, FR6 (mode A only), FR7, FR8 (single product mode), FR9, FR10.

Deferred to V1.1: FR2 (custom upload), FR6 mode B (all products).