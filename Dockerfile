# Reviewer-runnable image for the ESG-Fx Web Tool.
#
#   docker build -t esgfx-web .
#   docker run --rm -p 8080:8080 esgfx-web
#   open http://localhost:8080/
#
# The build needs the engine submodule checked out, since the engine is not
# published to a public Maven repository and the bundled example models are
# copied from it into the jar:
#
#   git clone --recurse-submodules <repo>
#   # or, in an existing clone:
#   git submodule update --init --recursive

# ---------------------------------------------------------------------------
# Build: install the engine, then package the web app.
# ---------------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /build

# The engine first and on its own, so editing the web app does not invalidate
# the layer that installs it.
COPY lib/esg-core lib/esg-core
RUN test -f lib/esg-core/pom.xml \
      || (echo "lib/esg-core is empty — clone with --recurse-submodules" >&2; exit 1) \
    && mvn -B -q -DskipTests -f lib/esg-core/pom.xml install

COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src src
RUN mvn -B -q -DskipTests package \
    && cp target/esgfx-web-*.jar /build/app.jar

# ---------------------------------------------------------------------------
# Run: a JRE, plus Python for the UniGen bridge.
# ---------------------------------------------------------------------------
# Pinned to the Ubuntu 24.04 variant rather than the floating tag. The floating
# tag follows the newest Ubuntu, and its python3 has already moved past 3.12 —
# the last version pyunigen publishes wheels for. On such a base pip falls back
# to building from source, which needs a toolchain this image does not carry, so
# the image silently loses its sampler. Noble carries Python 3.12.
FROM eclipse-temurin:17-jre-noble

# The sampler goes in its own virtualenv. That keeps it clear of the distro's
# Python, which newer Debian and Ubuntu images refuse to let pip touch, and it
# is the arrangement this was tested under.
#
# --only-binary refuses a source build outright: where a wheel exists this
# changes nothing, and where none does it fails immediately and plainly instead
# of after a long compile. pyunigen publishes manylinux x86_64 wheels but no
# arm64 one, so an arm64 build legitimately has no sampler; that is tolerated,
# and the tool reports UniGen as unavailable rather than refusing to start. The
# check afterwards makes which of the two happened visible in the build log.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/unigen \
    && (/opt/unigen/bin/pip install --no-cache-dir --only-binary :all: pyunigen \
        || echo "pyunigen has no wheel for $(uname -m); enumeration sampling only") \
    && (/opt/unigen/bin/python -c "import pyunigen; print('UniGen available')" \
        || echo "UniGen NOT available in this image")

WORKDIR /app
COPY --from=build /build/app.jar app.jar
COPY scripts/unigen_bridge.py scripts/unigen_bridge.py

# The models travel inside the jar, so nothing here depends on the working
# directory except the bridge script, which this path pins.
ENV ESGFX_UNIGEN_COMMAND=/opt/unigen/bin/python,/app/scripts/unigen_bridge.py

# Render and most free-tier hosts inject the port to bind.
ENV PORT=8080
EXPOSE 8080

RUN useradd --system --create-home esgfx
USER esgfx

ENTRYPOINT ["sh", "-c", "exec java -XX:MaxRAMPercentage=75 -jar /app/app.jar --server.port=${PORT}"]
