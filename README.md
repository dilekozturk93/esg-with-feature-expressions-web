# Test Generation Tool for Software Product Lines

Model-based test generation for software product lines using **Event Sequence
Graphs with Feature Expressions (ESG-Fx)** — a single behavioural model that
captures every product in a line. Pick or draw a model, choose which products to
cover and how thoroughly, and generate test suites in the browser.

**Live demo:** https://test-generation-tool-for-spls.onrender.com

![The tool showing the Soda Vending Machine feature model and product configuration](docs/screenshot.jpg)

## What it does

- Loads an ESG-Fx model — a feature model plus an event graph whose events carry
  Boolean feature expressions over the features.
- Derives the behaviour of a single product, a sample of products, or every
  product of the line.
- Generates test suites for four coverage criteria: **event**, **event-couple**,
  **event-triple** and **event-quadruple** coverage.
- Samples product configurations by exact **enumeration**, or by **UniGen**
  (almost-uniform SAT sampling) for lines too large to enumerate.
- Lets you **draw or import** a model, edit it live, **highlight** a test on the
  graph, and export the model (XML / PNG / JPG / PDF) or the suite (CSV).

## Running it

### Use the live demo

Open the URL above. It runs on a free instance, so the first request after a
period of inactivity may take about 40 seconds to wake.

### Run the container

Reproduces the exact environment, UniGen included, and is the quickest way for a
reviewer to run the tool. Needs nothing on the host but Docker.

```bash
git clone --recurse-submodules https://github.com/dilekozturk93/esg-with-feature-expressions-web
cd esg-with-feature-expressions-web
docker build -t esgfx-web .
docker run --rm -p 8080:8080 esgfx-web
# then open http://localhost:8080/
```

The three bundled models travel inside the jar and UniGen is set up in the
image, so nothing else needs installing.

### Build from source

Needs JDK 17 and Maven 3.9+.

```bash
git clone --recurse-submodules https://github.com/dilekozturk93/esg-with-feature-expressions-web
cd esg-with-feature-expressions-web
./build.sh          # installs the engine submodule, then packages the web app
java -jar target/esgfx-web-0.1.0-SNAPSHOT.jar
# then open http://localhost:8080/
```

`./build.sh` is only needed when the submodule changes; afterwards
`mvn spring-boot:run` works on its own. The jar is self-contained and runs from
any directory.

The engine lives in the `lib/esg-core` submodule and is not on a public Maven
repository, so the clone must include it. A build that stops with
`lib/esg-core is empty` was cloned without submodules — run
`git submodule update --init --recursive`.

### Optional: UniGen sampling

Sampled generation offers two samplers. Enumeration is always available. UniGen,
a SAT-based almost-uniform sampler, keeps working on lines too large to
enumerate; it is a native tool run through a small bridge script and needs
`pyunigen` for the Python the app invokes:

```bash
python3 -m pip install pyunigen
```

Without it the tool reports UniGen as unavailable and falls back to enumeration.
`pyunigen` ships wheels for Linux and Intel macOS; point `ESGFX_UNIGEN_COMMAND`
at an interpreter that has it — for example a virtualenv — if the default
`python3` does not:

```bash
ESGFX_UNIGEN_COMMAND=/path/to/venv/bin/python,scripts/unigen_bridge.py \
  java -jar target/esgfx-web-0.1.0-SNAPSHOT.jar
```

## Using it

1. **Choose a model** — a bundled example under *Built-in Models*, or *Draw* to
   build one from scratch or import your own `FM.xml` + `ESG-Fx.mxe`.
2. **Pick what to generate** — a specific product, a sample, or all products.
3. **Choose a coverage criterion.**
4. **Generate** — read the suite on the right, click a row to highlight its path
   on the ESG-Fx graph, and export it as CSV.

Inside the app, the **How to use** button and the **?** beside *Event Sequence
Graphs with Feature Expressions* explain the workflow and the model itself.

## How it is built

Spring Boot 3 / Java 17 serving a Thymeleaf and vanilla-JavaScript front end,
with [Cytoscape.js](https://js.cytoscape.org/) for the graphs. The
test-generation engine is a separate research codebase, included as the
`lib/esg-core` submodule; the web layer is a thin wrapper over its API and does
not reimplement generation. All front-end libraries are served from the
application, so it runs without internet access.

## Verification

Generated suites are checked against the per-product test sequences the original
research pipelines recorded, so the web tool can be shown to reproduce them
rather than merely to run — **308/308 match** across three lines, 77 products and
four coverage lengths. `docs/PROGRESS.md` explains what each check establishes.

- **Against a running instance**, end to end (bundled models, single/all/sampled
  generation, and UniGen):

  ```bash
  python3 scripts/smoke_test.py http://localhost:8080
  python3 scripts/smoke_test.py https://<your-deployment> --require-unigen
  ```

  This is what CI runs against the container image on every push. Without
  `--require-unigen`, a missing UniGen is reported and skipped rather than
  failing.

- **`docs/TEST_PLAN.md`** is a manual acceptance checklist covering the
  interface — the paths a person actually clicks.

## Archiving as an artifact

For a submission that wants a citable, reviewer-runnable artifact:

1. Tag the release in both this repository and the engine submodule, so the
   artifact pins an exact engine commit.
2. Export the image, which is the whole tool with its dependencies:
   ```bash
   docker build -t esgfx-web:<version> .
   docker save esgfx-web:<version> | gzip > esgfx-web-<version>.tar.gz
   ```
   A reviewer then needs only `docker load < esgfx-web-<version>.tar.gz`.
3. Upload that tarball together with a copy of this README to Zenodo and mint a
   DOI. The engine's raw experimental data is archived the same way, at
   <https://doi.org/10.5281/zenodo.20027555>.
4. Cite the DOI in the paper's artifact section and add it here.

## License

MIT — see [LICENSE](LICENSE).

## Citation

> Öztürk, Tuğlular and Belli, "Software Product Line Testing based on Event
> Sequence Graphs with Feature Expressions," 8th International Conference on
> Computer Science and Engineering, 2023.
