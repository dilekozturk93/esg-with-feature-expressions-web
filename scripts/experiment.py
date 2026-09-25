#!/usr/bin/env python3
"""
Reproducible performance/scalability experiment for ESGFx-Gen.

Drives a running instance (local or deployed) and measures, across the case
studies and two larger product lines, how test generation scales with the
coverage criterion and the generation mode. It writes a CSV of every
measurement and prints the tables the tool paper reports.

    python3 scripts/experiment.py https://<deployment> --out results.csv

The three bundled lines are named by short name; the two larger ones (Student
Attendance System, Tesla) are read from the engine submodule and sent inline, so
the script is self-contained given a checkout with submodules.

Each timed cell is warmed up once (untimed) and then measured over 11 runs; the
reported figure is the median, which absorbs JIT warm-up and one-off jitter. A
cell whose warm-up already fails (a timeout, a refused mode) is recorded once
rather than repeated. Timings are end-to-end wall clock as seen from the client,
i.e. what a user of the instance experiences (network + server).
"""
import argparse
import csv
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = os.path.join(REPO, "lib/esg-core/files/Cases")

RUNS = 11  # timed runs per cell; the median is reported

# Coverage is reported by name, not by the engine's internal level number.
COVERAGE = {1: "event", 2: "event-couple", 3: "event-triple", 4: "event-quadruple"}
LENGTHS = [1, 2, 3, 4]

BUNDLED = {"SVM": "SVM", "eM": "eM", "El": "El"}
INLINE = {
    "SAS": ("StudentAttendanceSystem/configs/model.xml", "StudentAttendanceSystem/SAS_ESGFx.mxe"),
    "Tesla": ("Tesla/configs/model.xml", "Tesla/Te_ESGFx.mxe"),
}
MODEL_ORDER = ["SVM", "eM", "El", "SAS", "Tesla"]


def source_of(name):
    if name in BUNDLED:
        return {"splName": BUNDLED[name]}
    fm, mxe = INLINE[name]
    return {
        "featureModelXml": open(os.path.join(CASES, fm), encoding="utf-8").read(),
        "esgFxXml": open(os.path.join(CASES, mxe), encoding="utf-8").read(),
    }


class Client:
    def __init__(self, base):
        self.base = base.rstrip("/")

    def post(self, path, body, timeout=150):
        request = urllib.request.Request(
            self.base + path, data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        start = time.time()
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, json.loads(response.read()), time.time() - start
        except urllib.error.HTTPError as error:
            return error.code, _safe_json(error.read()), time.time() - start
        except Exception as error:  # noqa: BLE001  (timeouts, resets, ...)
            return None, {"error": "timeout" if "timed out" in str(error) else str(error)}, time.time() - start

    def get(self, path, timeout=90):
        try:
            with urllib.request.urlopen(self.base + path, timeout=timeout) as response:
                return json.loads(response.read())
        except Exception as error:  # noqa: BLE001
            return {"error": str(error)}


def _safe_json(raw):
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001
        return {"error": raw[:200].decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw)}


def measure(client, path, body, timeout=150):
    """One untimed warm-up, then RUNS timed calls; returns (status, last_payload, median_s).

    Bails after the warm-up if it does not succeed, so a timing-out or refused
    cell is not repeated 11 times."""
    status, payload, _ = client.post(path, body, timeout)
    if status != 200:
        return status, payload, None
    times = []
    for _ in range(RUNS):
        status, payload, wall = client.post(path, body, timeout)
        if status != 200:
            return status, payload, None
        times.append(wall)
    return 200, payload, round(statistics.median(times), 3)


def facts(client, name):
    src = source_of(name)
    if "splName" in src:
        payload = client.get("/api/example/" + src["splName"].lower())
    else:
        # Counting a very large line's configurations (Tesla) can outlast a
        # throttled instance; a short timeout keeps the run moving.
        _, payload, _ = client.post("/api/model", src, timeout=45)
    return {
        "features": len(payload.get("features", [])),
        "configurations": payload.get("configurationCount"),
        "vertices": len(payload.get("esgFx", {}).get("nodes", [])),
        "edges": len(payload.get("esgFx", {}).get("edges", [])),
        "allProductsAllowed": payload.get("allProductsAllowed"),
    }


def a_valid_selection(client, name):
    """One valid configuration, drawn with whichever sampler answers fastest."""
    for sampler in ("unigen", "enumeration"):
        body = dict(source_of(name), sampleSize=1, seed=1, sampler=sampler, coverageLength=1)
        status, payload, _ = client.post("/api/generate/sampled", body)
        if status == 200 and payload.get("products"):
            return payload["products"][0]["featureSelection"]
    return None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url")
    parser.add_argument("--out", default="results.csv")
    args = parser.parse_args(argv)
    client = Client(args.base_url)

    out = open(args.out, "w", newline="")
    writer = csv.writer(out)
    writer.writerow(["experiment", "model", "features", "configurations", "mode",
                     "coverage", "coverage_length", "runs", "median_s", "products",
                     "sequences", "total_events", "coverage_pct", "status"])

    def record(**kw):
        writer.writerow([kw.get(k, "") for k in ("experiment", "model", "features",
                         "configurations", "mode", "coverage", "coverage_length", "runs",
                         "median_s", "products", "sequences", "total_events",
                         "coverage_pct", "status")])
        out.flush()
        print(f"  [{kw['experiment']}] {kw['model']:6} {kw.get('mode',''):10} "
              f"{kw.get('coverage','-'):16} median={kw.get('median_s','?')}s  {kw.get('status','')}",
              flush=True)

    client.get("/")

    # ---- global warm-up: JIT the main generation paths before timing ----
    print("Warming up the JVM...", flush=True)
    for length in LENGTHS:
        client.post("/api/generate", dict(source_of("El"),
                    featureSelection=a_valid_selection(client, "El"), coverageLength=length))
    client.post("/api/generate/all", dict(source_of("El"), coverageLength=2))

    # ---- model facts ----
    fx = {}
    print("\nModel facts:", flush=True)
    for name in MODEL_ORDER:
        fx[name] = facts(client, name)
        show = {k: ("n/a" if v is None else v) for k, v in fx[name].items()}
        print(f"  {name:6} features={show['features']!s:>3} configs={show['configurations']!s:>7} "
              f"v={show['vertices']!s:>3} e={show['edges']!s:>4} all-products={show['allProductsAllowed']}",
              flush=True)

    # ---- Experiment A: single product across coverage criteria ----
    print("\nExperiment A - single product x coverage criterion (median of %d)" % RUNS, flush=True)
    for name in MODEL_ORDER:
        selection = a_valid_selection(client, name)
        base = dict(experiment="A", model=name, features=fx[name]["features"],
                    configurations=fx[name]["configurations"], mode="single", runs=RUNS)
        if selection is None:
            record(**base, coverage="-", status="no valid config")
            continue
        for length in LENGTHS:
            body = dict(source_of(name), featureSelection=selection, coverageLength=length)
            status, payload, med = measure(client, "/api/generate", body)
            record(**base, coverage=COVERAGE[length], coverage_length=length, median_s=med,
                   products=1, sequences=payload.get("sequenceCount"),
                   total_events=payload.get("totalEventCount"),
                   coverage_pct=payload.get("coveragePercentage"),
                   status="ok" if status == 200 else f"HTTP {status}")

    # ---- Experiment B: all products across coverage criteria ----
    print("\nExperiment B - all products x coverage criterion (median of %d)" % RUNS, flush=True)
    for name in MODEL_ORDER:
        base = dict(experiment="B", model=name, features=fx[name]["features"],
                    configurations=fx[name]["configurations"], mode="all", runs=RUNS)
        if not fx[name]["allProductsAllowed"]:
            record(**base, coverage="-", status="not allowed (>25 features)")
            continue
        for length in LENGTHS:
            body = dict(source_of(name), coverageLength=length)
            status, payload, med = measure(client, "/api/generate/all", body)
            products = payload.get("products", []) if status == 200 else []
            record(**base, coverage=COVERAGE[length], coverage_length=length, median_s=med,
                   products=len(products) or None,
                   sequences=sum(p["sequenceCount"] for p in products) or None,
                   total_events=sum(p["totalEventCount"] for p in products) or None,
                   coverage_pct=(min(p["coveragePercentage"] for p in products) if products else None),
                   status="ok" if status == 200 else f"HTTP {status}: {str(payload.get('error',''))[:50]}")

    # ---- Experiment C: enumeration vs UniGen sampling ----
    print("\nExperiment C - sampling: enumeration vs UniGen (median of %d, sample size 10, event-couple)" % RUNS,
          flush=True)
    for name in ("El", "Tesla"):
        for sampler in ("enumeration", "unigen"):
            body = dict(source_of(name), sampleSize=10, seed=42, sampler=sampler, coverageLength=2)
            status, payload, med = measure(client, "/api/generate/sampled", body, timeout=90)
            products = payload.get("products", []) if status == 200 else []
            record(experiment="C", model=name, features=fx[name]["features"],
                   configurations=fx[name]["configurations"], mode=sampler,
                   coverage=COVERAGE[2], coverage_length=2, runs=RUNS, median_s=med,
                   products=len(products) or None,
                   sequences=sum(p["sequenceCount"] for p in products) or None,
                   status="ok" if status == 200 else f"HTTP {status}: {str(payload.get('error',''))[:50]}")

    out.close()
    print(f"\nWrote results to {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
