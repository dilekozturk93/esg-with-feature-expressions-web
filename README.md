# ESG-Fx Web Tool

A web-based tool for model-based test generation for Software Product Lines
using Event Sequence Graphs with Feature Expressions (ESG-Fx). The user
selects a feature model and an ESG-Fx graph, picks a single product
configuration and a coverage length, and the tool invokes the underlying
Java ESG-Fx engine to generate a test suite — visualizing both the feature
model and the ESG-Fx graph, highlighting traversed paths per test sequence,
and offering CSV export of the result.

## How to build and run

The Java ESG-Fx engine is included as a git submodule at `lib/esg-core/`.
Clone with submodules, or initialize them after cloning:

```bash
git clone --recurse-submodules https://github.com/dilekozturk93/esg-with-feature-expressions-web.git
# or, if already cloned:
git submodule update --init --recursive
```

Requires Java 17 and Maven 3.9+.

Build (two steps — install the engine into your local Maven repo, then
build the web app):

```bash
./build.sh
```

`build.sh` runs `mvn install` inside `lib/esg-core/` (which targets Java 11
but compiles cleanly under JDK 17) and then packages the web app at the
project root.

Run:

```bash
mvn spring-boot:run
```

Once the engine has been installed locally, `mvn spring-boot:run` works on
its own — you only need to re-run `./build.sh` when the submodule changes.

Then open <http://localhost:8080/> in a browser.

## License

MIT — see [LICENSE](LICENSE).
