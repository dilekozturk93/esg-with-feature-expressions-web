#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

mvn -q -DskipTests -f lib/esg-core/pom.xml install
mvn -q -DskipTests package
