# ESG-Fx Web Tool

A web-based tool for model-based test generation for Software Product Lines
using Event Sequence Graphs with Feature Expressions (ESG-Fx). It wraps the
Java ESG-Fx engine, which does the generation, and adds the parts a tool needs:
both models drawn as graphs, configurations chosen and validated in the browser,
test suites for one product or many, the path a test sequence walks highlighted
on the ESG-Fx, and CSV export.

## Running the packaged tool

The quickest way to run the tool, and the one an artifact reviewer should use,
is the container image. It needs nothing on the host but Docker.

```bash
git clone --recurse-submodules https://github.com/dilekozturk93/esg-with-feature-expressions-web.git
cd esg-with-feature-expressions-web
docker build -t esgfx-web .
docker run --rm -p 8080:8080 esgfx-web
```

Then open <http://localhost:8080/>. Nothing else needs installing: the three
bundled example models travel inside the jar, and UniGen is set up in the image.

The clone must include the submodule. The engine is not published to a public
Maven repository, and the example models are copied from it into the jar at
build time, so `git clone` without `--recurse-submodules` gives a build that
stops with a message saying exactly that. In an existing clone:

```bash
git submodule update --init --recursive
```

### What the tool does

Pick a bundled example (Soda Vending Machine, e-Mail, Elevator), upload your own
FeatureIDE XML and `.mxe` pair, or draw a model in the browser. Choose a coverage
length (L=1 event coverage; L=2/3/4 edge coverage) and generate tests for one
product, several products, every valid configuration, or a sample of them.
Clicking a test sequence highlights the path it walks on the ESG-Fx, and results
export as CSV.

## Building from source

Requires Java 17 and Maven 3.9+.

```bash
./build.sh          # installs the engine submodule, then packages the web app
java -jar target/esgfx-web-0.1.0-SNAPSHOT.jar
```

The jar is self-contained and runs from any directory.

`./build.sh` is only needed when the submodule changes; afterwards
`mvn spring-boot:run` works on its own.

### Optional: UniGen sampling

Sampled generation offers two samplers. Enumeration is always available. UniGen,
a SAT-based almost-uniform sampler, keeps working on models too large to
enumerate; it is a native tool, so it runs through a small bridge script:

```bash
python3 -m pip install pyunigen
```

The tool reports UniGen as unavailable and falls back to enumeration if that is
not installed. Point `ESGFX_UNIGEN_COMMAND` at another interpreter if needed, for
example a virtualenv:

```bash
ESGFX_UNIGEN_COMMAND=/path/to/venv/bin/python,scripts/unigen_bridge.py \
  java -jar target/esgfx-web-0.1.0-SNAPSHOT.jar
```

## Verifying the tool against the published results

Generated test suites are checked against the per-product test sequences the
original research pipelines recorded, so the web tool can be shown to reproduce
them rather than merely to run.

The ground truth is generated output and is not committed. To recreate it, run
these from `lib/esg-core` for each SPL (`SVM`, `eM`, `El`) — the engine resolves
`files/Cases/...` relative to the working directory:

1. `AutomaticProductConfigurationGenerator_<SPL>`
2. `ProductESGFxToEFGAndDOTFileWriter_<SPL>`
3. `RQ1_ComparativeEfficiency_ESGFx_L1_<SPL>`
4. `RQ1_ComparativeEfficiency_ESGFx_L234_<SPL>` with `L_LEVEL=2`, `3`, `4`

Then check the API against it, without a server:

```bash
cd lib/esg-core
java -cp target/classes:<deps> tr.edu.iyte.esgfx.api.SingleProductApiCheck
java -cp target/classes:<deps> tr.edu.iyte.esgfx.api.AllProductsApiCheck
java -cp target/classes:<deps> tr.edu.iyte.esgfx.api.SampledProductsApiCheck
java -cp target/classes:<deps> tr.edu.iyte.esgfx.api.FeatureModelCnfCheck
```

and over HTTP, against a running server:

```bash
python3 scripts/verify_against_ground_truth.py --ground-truth-root lib/esg-core
```

The expected result is 308/308 MATCH across three SPLs, 77 products and four
coverage lengths. See `docs/PROGRESS.md` for what each check establishes and how
to read a MATCH, EQUIVALENT or MISMATCH verdict.

### Checking a packaged instance

`scripts/smoke_test.py` drives a running instance and checks what packaging can
break: that the bundled models are inside the jar, that generation reaches them,
and that both samplers work. It is what CI runs against the container image, and
it works against a deployed instance too.

```bash
python3 scripts/smoke_test.py http://localhost:8080
python3 scripts/smoke_test.py https://<your-deployment> --require-unigen
```

Without `--require-unigen` a missing UniGen is reported and skipped rather than
failing, since enumeration sampling still works without it.

The `Container image` workflow builds the image on every push, starts it, and
runs this script against it — so the image is exercised even though it is not
built during development.

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
4. Cite the DOI in the paper's artifact section and add it to this README.

## License

MIT — see [LICENSE](LICENSE).
