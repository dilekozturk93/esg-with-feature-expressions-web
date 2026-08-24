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
| Date tested | |
| Tested by | |
| Build / commit | |
| Where | ☐ local jar ☐ Docker image ☐ deployed URL |
| Browser | |
| UniGen available | ☐ yes ☐ no (enumeration only) |

## Progress

| Section | Cases | Passed |
|---------|:-----:|:------:|
| A. Bundled examples and rendering | 6 | |
| B. Graph controls | 5 | |
| C. Single-product generation | 4 | |
| D. Coverage criteria | 4 | |
| E. Multi-product, all-products, sampled | 6 | |
| F. Results and export | 4 | |
| G. Draw / model editor | 8 | |
| H. Upload | 3 | |
| I. Validation and safety | 5 | |
| **Total** | **45** | |

Legend: tick the box when a case passes. If it fails, leave it unticked and write
what happened on the **Notes** line.

---

## A. Bundled examples and rendering

- [ ] **A1 — Tab order.** Above the model area the tabs read, left to right:
  **Draw**, **Upload**, **Bundled examples**. The active tab is underlined.
  <br>Notes:

- [ ] **A2 — SVM loads and renders.** Open **Bundled examples**, pick **SVM**.
  The feature-model tree and the ESG-Fx graph both draw. The counts read
  **15 vertices, 21 edges, 12 configurations** (features counted separately).
  <br>Notes:

- [ ] **A3 — eM loads and renders.** Pick **eM**. Both graphs redraw. Counts read
  **19 vertices, 35 edges, 23 configurations**.
  <br>Notes:

- [ ] **A4 — El (Elevator) loads and renders.** Pick **El**. Both graphs redraw.
  Counts read **21 vertices, 80 edges, 42 configurations**.
  <br>Notes:

- [ ] **A5 — First selection renders immediately.** Reload the page, open
  **Bundled examples**; the first example shown draws on its own, without having
  to switch to another example and back.
  <br>Notes:

- [ ] **A6 — Counts sit with the graph.** The vertex / edge counts are visible in
  the graph panel itself, not only in a summary far above it.
  <br>Notes:

## B. Graph controls

- [ ] **B1 — Fit to view.** With a model loaded, click the **fit** button (the
  corner-frame icon) on the feature-model panel. The whole tree is framed within
  the panel. Repeat on the ESG-Fx panel.
  <br>Notes:

- [ ] **B2 — Zoom in / out.** Click **+** a few times on a graph: it magnifies and
  what was in the middle stays roughly centred. Click **−**: it shrinks back.
  <br>Notes:

- [ ] **B3 — Sequence highlight.** Generate a test (see C1), then click a row in
  the results table. The matching path lights up on the ESG-Fx graph and a
  highlight status appears.
  <br>Notes:

- [ ] **B4 — Clear highlight.** With a path highlighted, click **Clear highlight**.
  The graph returns to normal and the button disables.
  <br>Notes:

- [ ] **B5 — Model dialog.** Click the **Event Sequence Graphs with Feature
  Expressions** link (the **?** mark). A dialog opens explaining the model, with
  the labelled example and the citation footer. **Close** dismisses it.
  <br>Notes:

## C. Single-product generation

- [ ] **C1 — Reference case (exact).** Load **SVM**. In **Product configuration**
  leave generation on the single-product setting, select **only** the feature
  **s** (Soda). Coverage = **Event coverage**. Click **Generate tests**. Expect
  one sequence, **100% event coverage**:
  <br>`pay → change → soda → serveSoda → open → take → close`
  <br>Notes:

- [ ] **C2 — Result summary.** After C1, the summary shows the product, its
  feature selection, the coverage percentage, the sequence count, the total event
  count, and a generation time.
  <br>Notes:

- [ ] **C3 — Different selection, different suite.** Load SVM, select **t** (Tea)
  instead of **s**. Generate. The suite differs from C1 (serveTea instead of
  serveSoda) and still reaches 100% event coverage.
  <br>Notes:

- [ ] **C4 — Order independence.** Generate C1, then C3, then C1 again. The third
  run reproduces the first run's suite exactly — a selection is not carried over
  from the previous run.
  <br>Notes:

## D. Coverage criteria

Load **SVM**, feature **s**, single product. Run once per criterion.

- [ ] **D1 — Event coverage** (length 1) produces a suite at 100%.
  <br>Notes:

- [ ] **D2 — Event-couple coverage** (length 2) produces a suite at 100%. It is
  generally longer / has more sequences than D1.
  <br>Notes:

- [ ] **D3 — Event-triple coverage** (length 3) produces a suite at 100%.
  <br>Notes:

- [ ] **D4 — Event-quadruple coverage** (length 4) produces a suite at 100%.
  <br>Notes:

## E. Multi-product, all-products, sampled

- [ ] **E1 — Add a product.** Load **El**. Click **+ Add product**. A second
  product configuration row appears with its own feature selection.
  <br>Notes:

- [ ] **E2 — Multi-product generation.** With two different product configurations
  set, generate. The results carry both products, each with its own coverage.
  <br>Notes:

- [ ] **E3 — All products (exact).** Load **El**, switch to **All products**,
  coverage **Event-couple**. Generate. Expect **42 products**, every one at
  **100% coverage**.
  <br>Notes:

- [ ] **E4 — All-products guard.** Switching to **All products** on a model with
  more configurations than the limit disables the option / the generate button
  rather than trying to run it.
  <br>Notes:

- [ ] **E5 — Sampled, enumeration (exact).** Load **El**, choose **Sampled**,
  sampler **Enumeration**, sample size **4**, seed **42**, coverage
  **Event-couple**. Generate. Expect products **7, 9, 34, 39**.
  <br>Notes:

- [ ] **E6 — Sampled, UniGen.** Same as E5 but sampler **UniGen** (only if UniGen
  is available — the option is disabled otherwise). It returns up to 4 valid
  products, each at 100% coverage. Selecting UniGen when it is unavailable is not
  possible.
  <br>Notes:

## F. Results and export

- [ ] **F1 — Product navigation.** After a multi-product or all-products run, use
  the product picker to move between products; the table and highlight follow the
  selected product.
  <br>Notes:

- [ ] **F2 — CSV download.** Click **Download CSV**. A file downloads and opens in
  a spreadsheet with one row per test step, carrying the product and sequence.
  <br>Notes:

- [ ] **F3 — Empty state.** Before any generation, the results area shows an empty
  state rather than a broken table.
  <br>Notes:

- [ ] **F4 — Feature list on the result.** The result names which features the
  product has, matching what was selected.
  <br>Notes:

## G. Draw / model editor

- [ ] **G1 — Start from a preset.** Open **Draw**. In **Start from…** choose
  **Soda Vending Machine**. The editor fills with that model's features, events
  and edges.
  <br>Notes:

- [ ] **G2 — Minimal model.** Choose **Start from… → Minimal model**. A tiny valid
  model appears (a root and one child).
  <br>Notes:

- [ ] **G3 — Add a feature.** Click **+ Feature**, give it a name, set its parent
  and group. The row is complete and does not wrap onto a confusing second line.
  <br>Notes:

- [ ] **G4 — Group kind is set on the parent.** A feature's *children* form
  (and-group / or-group / alternative-group) is chosen on that feature, and its
  children follow it — there is no way to put a child into a conflicting group.
  <br>Notes:

- [ ] **G5 — Add an event and an edge.** Add an event with a feature expression,
  then an edge between two events. `[` is the start and `]` is the end.
  <br>Notes:

- [ ] **G6 — Add a constraint.** Add a cross-tree constraint; it is accepted.
  <br>Notes:

- [ ] **G7 — Apply the model.** Click **Apply model**. The drawn model becomes the
  active model: both graphs render and it can be generated from.
  <br>Notes:

- [ ] **G8 — Edit on the graph.** On the feature-model graph, double-click empty
  space to add a feature, and drag one feature onto another to reparent it.
  A selected node/edge can be deleted with **Delete selected**.
  <br>Notes:

## H. Upload

- [ ] **H1 — Upload a valid pair.** Open **Upload**. Provide a feature-model XML
  and an ESG-Fx `.mxe`. Click load. The model renders like a bundled example.
  (You can export the bundled files first to get a valid pair.)
  <br>Notes:

- [ ] **H2 — Generate from an upload.** After H1, generate a suite; it behaves the
  same as with a bundled example.
  <br>Notes:

- [ ] **H3 — Load button gating.** The load button stays disabled until both files
  are chosen.
  <br>Notes:

## I. Validation and safety

- [ ] **I1 — Mandatory features are locked.** In a product configuration,
  mandatory features appear already ticked and cannot be unticked; hovering shows
  they are mandatory in the feature model.
  <br>Notes:

- [ ] **I2 — Unused feature is refused.** Upload or draw a model with a concrete
  feature that labels no event. Loading it returns a clear message naming that
  feature, not a server error.
  <br>Notes:

- [ ] **I3 — Malformed upload.** Upload a file that is not a valid model. The tool
  reports that it could not read it, and stays usable.
  <br>Notes:

- [ ] **I4 — DOCTYPE is rejected (security).** Upload a feature model whose text
  begins with a document type declaration, for example:
  <br>`<!DOCTYPE featureModel [ <!ENTITY x SYSTEM "file:///etc/hostname"> ]>`
  <br>before the `<featureModel>` element. Loading is refused with a message that
  a document type is not allowed — the file is never read.
  <br>Notes:

- [ ] **I5 — Oversized upload.** A file well over ~1 MB is refused with a size
  message rather than being processed.
  <br>Notes:

---

## Sign-off

- [ ] All sections pass, or every failure has a note and a follow-up.

> Reference values (SVM/eM/El counts, the SVM reference sequence, the 42-product
> Elevator run, and the enumeration sample `7, 9, 34, 39`) are the same fixed
> values the automated `scripts/smoke_test.py` asserts, so a mismatch here is a
> real regression, not a matter of interpretation.
