# Manual acceptance test plan

A single-pass, click-through checklist that exercises every user-facing feature
of the tool. It is meant to be run by hand before a release or a deployment: work
top to bottom, tick each box, and note anything that looks wrong.

The automated checks (`scripts/smoke_test.py` and the ground-truth regression)
already prove the engine and the packaging. This plan covers what they cannot:
the interface, the graphs, and the paths a person actually clicks.

## How to run the app for testing

Local (needs JDK 17 and Maven; the UniGen sampler is optional):

```
mvn -DskipTests package
java -jar target/esgfx-web-0.1.0-SNAPSHOT.jar
# then open http://localhost:8080/
```

Container (needs Docker; this is the reviewer-facing path, UniGen included):

```
docker build -t esgfx-web .
docker run --rm -p 8080:8080 esgfx-web
# then open http://localhost:8080/
```

Test in a fresh browser tab (or a private window) so a stale cached script never
stands in for the current build.

## Run record

| Field | Value |
|-------|-------|
| Date tested | 16/09/2026 |
| Tested by | dilekozturk93 |
| Build / commit | |
| Where | x local jar ☐ Docker image ☐ deployed URL |
| Browser | |
| UniGen available | x yes ☐ no (enumeration only) |

## Progress

| Section | Cases | Passed |
|---------|:-----:|:------:|
| A. Case studies and rendering | 6 | |
| B. Graph controls | 5 | |
| C. Single-product generation | 4 | |
| D. Coverage criteria | 4 | |
| E. Multi-product, all-products, sampled | 6 | |
| F. Results and export | 4 | |
| G. Draw / model editor | 9 | |
| H. Import (inside Draw) | 3 | |
| I. Validation and safety | 5 | |
| **Total** | **46** | |

Legend: tick the box when a case passes. If it fails, leave it unticked and write
what happened on the **Notes** line.

---

## A. Case studies and rendering

- [x] **A1 — Tab order.** Above the model area the tabs read, left to right:
  **Draw**, **Case studies**. The active tab is underlined. There is no separate
  Upload tab — importing a model happens inside **Draw**.
  <br>Notes: Passed

- [x] **A2 — SVM loads and renders.** Open **Case studies**, pick **SVM**.
  The feature-model tree and the ESG-Fx graph both draw. The counts read
  **15 vertices, 21 edges, 12 configurations** (features counted separately).
  <br>Notes: Passed

- [x] **A3 — eM loads and renders.** Pick **eM**. Both graphs redraw. Counts read
  **19 vertices, 35 edges, 23 configurations**.
  <br>Notes: Passed

- [x] **A4 — El (Elevator) loads and renders.** Pick **El**. Both graphs redraw.
  Counts read **21 vertices, 80 edges, 42 configurations**.
  <br>Notes: Passed

- [x] **A5 — First selection renders immediately.** Reload the page, open
  **Case studies**; the first example shown draws on its own, without having
  to switch to another example and back.
  <br>Notes: Passed

- [x] **A6 — Counts sit with the graph.** The vertex / edge counts are visible in
  the graph panel itself, not only in a summary far above it.
  <br>Notes: Passed

## B. Graph controls

- [x] **B1 — Fit to view.** With a model loaded, click the **fit** button (the
  corner-frame icon) on the feature-model panel. The whole tree is framed within
  the panel. Repeat on the ESG-Fx panel.
  <br>Notes: Passed

- [x] **B2 — Zoom in / out.** Click **+** a few times on a graph: it magnifies and
  what was in the middle stays roughly centred. Click **−**: it shrinks back.
  <br>Notes: Passed

- [x] **B3 — Sequence highlight.** Generate a test (see C1), then click a row in
  the results table. The matching path lights up on the ESG-Fx graph and a
  highlight status appears.
  <br>Notes: Passed

- [x] **B4 — Clear highlight.** With a path highlighted, click **Clear highlight**.
  The graph returns to normal and the button disables.
  <br>Notes: Passed

- [x] **B5 — Model dialog.** Click the **Event Sequence Graphs with Feature
  Expressions** link (the **?** mark). A dialog opens explaining the model, with
  the labelled example and the citation footer. **Close** dismisses it.
  <br>Notes: Passed

## C. Single-product generation

- [x] **C1 — Reference case (exact).** Load **SVM**. In **Product configuration**
  leave generation on the single-product setting, select **only** the feature
  **s** (Soda). Coverage = **Event coverage**. Click **Generate tests**. Expect
  one sequence, **100% event coverage**:
  <br>`pay → change → soda → serveSoda → open → take → close`
  <br>Notes: Passed

- [x] **C2 — Result summary.** After C1, the summary shows the product, its
  feature selection, the coverage percentage, the sequence count, the total event
  count, and a generation time.
  <br>Notes: Passed

- [x] **C3 — Different selection, different suite.** Load SVM, select **t** (Tea)
  instead of **s**. Generate. The suite differs from C1 (serveTea instead of
  serveSoda) and still reaches 100% event coverage.
  <br>Notes: Passed

- [x] **C4 — Order independence.** Generate C1, then C3, then C1 again. The third
  run reproduces the first run's suite exactly — a selection is not carried over
  from the previous run.
  <br>Notes: Passed

## D. Coverage criteria

Load **SVM**, feature **s**, single product. Run once per criterion.

- [x] **D1 — Event coverage** (length 1) produces a suite at 100%.
  <br>Notes: Passed

- [x] **D2 — Event-couple coverage** (length 2) produces a suite at 100%. It is
  generally longer / has more sequences than D1.
  <br>Notes: Passed

- [x] **D3 — Event-triple coverage** (length 3) produces a suite at 100%.
  <br>Notes: Passed

- [x] **D4 — Event-quadruple coverage** (length 4) produces a suite at 100%.
  <br>Notes: Passed

## E. Multi-product, all-products, sampled

- [x] **E1 — Add a product.** Load **El**. Click **+ Add product**. A second
  product configuration row appears with its own feature selection.
  <br>Notes: Passed

- [x] **E2 — Multi-product generation.** With two different product configurations
  set, generate. The results carry both products, each with its own coverage.
  <br>Notes: Passed

- [x] **E3 — All products (exact).** Load **El**, switch to **All products**,
  coverage **Event-couple**. Generate. Expect **42 products**, every one at
  **100% coverage**.
  <br>Notes: Passed

- [x] **E4 — All-products guard.** Switching to **All products** on a model with
  more configurations than the limit disables the option / the generate button
  rather than trying to run it.
  <br>Notes: StudentAttendanceSystem SPL is imported. Generating all products option is disabled, but it should be allowed in this case, nu I also tried to import Tesla but it is not even imported in Draw tab. It is imported in Case Studies instead of Elevator (merged with E5, when I tried E5 Tesla was the in place of El), sampled 4 products and generate the test cases, screenshots have been taken.

- [x] **E5 — Sampled, enumeration (exact).** Load **El**, choose **Sampled**,
  sampler **Enumeration**, sample size **4**, seed **42**, coverage
  **Event-couple**. Generate. Expect products **7, 9, 34, 39**.
  <br>Notes: I refresh the page, and load El. Passed.

- [x] **E6 — Sampled, UniGen.** Same as E5 but sampler **UniGen** (only if UniGen
  is available — the option is disabled otherwise). It returns up to 4 valid
  products, each at 100% coverage. Selecting UniGen when it is unavailable is not
  possible.
  <br>Notes: Failed. Could not generate tests: The UniGen bridge failed: pyunigen is not installed: No module named 'pyunigen'. Tried again after refreshing of the page, failed again. 

## F. Results and export

- [x] **F1 — Product navigation.** After a multi-product or all-products run, use
  the product picker to move between products; the table and highlight follow the
  selected product.
  <br>Notes: Passed

- [x] **F2 — CSV download.** Click **Download CSV**. A file downloads and opens in
  a spreadsheet with one row per test step, carrying the product and sequence.
  <br>Notes: Passed

- [x] **F3 — Empty state.** Before any generation, the results area shows an empty
  state rather than a broken table.
  <br>Notes: Passed

- [x] **F4 — Feature list on the result.** The result names which features the
  product has, matching what was selected.
  <br>Notes: Passed

## G. Draw / model editor

- [x] **G1 — Start from a preset.** Open **Draw**. In **Start from…** choose
  **Soda Vending Machine**. The editor fills with that model's features, events
  and edges.
  <br>Notes: Passed

- [x] **G2 — Minimal model.** Choose **Start from… → Minimal model**. A tiny valid
  model appears (a root and one child).
  <br>Notes: Passed

- [x] **G3 — Add a feature.** Click **+ Feature**, give it a name, set its parent
  and group. The row is complete and does not wrap onto a confusing second line.
  <br>Notes: Passed

- [x] **G4 — Group kind is set on the parent.** A feature's *children* form
  (and-group / or-group / alternative-group) is chosen on that feature, and its
  children follow it — there is no way to put a child into a conflicting group.
  <br>Notes: Passed. Could be tested more thoroughly if sampled inputs are given in advance, not sure if I put conflicting groups. 

- [x] **G5 — Add an event and an edge.** Add an event with a feature expression,
  then an edge between two events. `[` is the start and `]` is the end.
  <br>Notes: Passed

- [x] **G6 — Add a constraint.** Add a cross-tree constraint; it is accepted.
  <br>Notes: Failed, it doesn't reflect on the product configurations.

- [x] **G7 — Apply the model.** Click **Apply model**. The drawn model becomes the
  active model: both graphs render and it can be generated from.
  <br>Notes: Failed, it doesn't reflect on the product configurations.

- [x] **G8 — Edit on the graph.** On the feature-model graph, double-click empty
  space to add a feature, and drag one feature onto another to reparent it.
  A selected node/edge can be deleted with **Delete selected**.
  <br>Notes: Passed

- [ ] **G9 — Download the drawn model.** With a model in the editor, use the
  **Download…** menu. **FM.xml** and **ESG-Fx.xml** each download the drawn
  model as XML; **PNG**, **JPG** and **PDF** each download an image of the
  chosen graph. Re-importing the downloaded FM.xml + ESG-Fx.xml reproduces the
  same model.
  <br>Notes: Failed. FM.xml is not downloaded. All of the other are downloaded. ESG-Fx.xml imported but didn't reproduced the same. 

## H. Import (inside Draw)

- [ ] **H1 — Import a valid pair.** Open **Draw**. In the import row provide a
  feature-model XML and an ESG-Fx `.mxe`, then click **Import into editor**. The
  model renders and its features, events, edges and constraints fill the editor
  rows. (Draw a model and download its FM.xml + ESG-Fx.xml first to get a valid
  pair.)
  <br>Notes: Passed. I refreshed the page. Draw a new FM and ESG-Fx, downloaded both, imported them, they were rendered. 

- [x] **H2 — Edit an imported model.** After H1, change something (rename a
  feature, add an event), click **Apply model**, and generate — the imported
  model was fully editable, not read-only.
  <br>Notes: Passed.

- [x] **H3 — Import button gating.** The import button stays disabled until both
  files are chosen.
  <br>Notes: Passed.

## I. Validation and safety

- [x] **I1 — Mandatory features are locked.** In a product configuration,
  mandatory features appear already ticked and cannot be unticked; hovering shows
  they are mandatory in the feature model.
  <br>Notes: When it is drawn, the feature model is not reflected to the product configurations. 

- [x] **I2 — Unused feature is refused.** Import or draw a model with a concrete
  feature that labels no event. Loading it returns a clear message naming that
  feature, not a server error.
  <br>Notes: Passed "Feature F7 labels no event. Give an event the expression F7, or mark the feature abstract."

- [x] **I3 — Malformed import.** Import a file that is not a valid model. The tool
  reports that it could not read it, and stays usable.
  <br>Notes: Passed "Could not import the model: ESG-Fx file is missing or empty."

- [x] **I4 — DOCTYPE is rejected (security).** Import a feature model whose text
  begins with a document type declaration, for example:
  <br>`<!DOCTYPE featureModel [ <!ENTITY x SYSTEM "file:///etc/hostname"> ]>`
  <br>before the `<featureModel>` element. Loading is refused with a message that
  a document type is not allowed — the file is never read.
  <br>Notes: Passed "Could not import the model: Could not validate Feature model before loading it. Scanner State 24 not Recognized"

- [x] **I5 — Oversized import.** A file well over ~1 MB is refused with a size
  message rather than being processed.
  <br>Notes: Passed "Could not import the model: Feature model file is larger than the 1024 KB limit."

---

## Sign-off

- [x] All sections pass, or every failure has a note and a follow-up.

> Reference values (SVM/eM/El counts, the SVM reference sequence, the 42-product
> Elevator run, and the enumeration sample `7, 9, 34, 39`) are the same fixed
> values the automated `scripts/smoke_test.py` asserts, so a mismatch here is a
> real regression, not a matter of interpretation.
