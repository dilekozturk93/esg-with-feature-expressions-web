#!/usr/bin/env python3
"""
Drives a running instance to check that it was packaged correctly.

Written for the container image, where nothing is on disk but the jar and the
bridge script: if the bundled models were not packaged, or generation cannot
reach them, these calls are what says so. It also serves for a deployed
instance — point it at the public URL after a deploy.

    python3 scripts/smoke_test.py http://localhost:8080
    python3 scripts/smoke_test.py http://localhost:8080 --require-unigen
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

# Fixed by the bundled models; a wrong or truncated copy shows up here.
EXAMPLES = {
    "svm": {"name": "SVM", "configurations": 12, "vertices": 15, "edges": 21},
    "em": {"name": "eM", "configurations": 23, "vertices": 19, "edges": 35},
    "el": {"name": "El", "configurations": 42, "vertices": 21, "edges": 80},
}

REFERENCE_SEQUENCE = ["pay", "change", "soda", "serveSoda", "open", "take", "close"]


class Failure(Exception):
    pass


def get(base, path):
    try:
        with urllib.request.urlopen(base + path, timeout=120) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise Failure(f"GET {path} returned {error.code}: {error.read()[:300]!r}")
    except urllib.error.URLError as error:
        raise Failure(f"GET {path} could not connect: {error.reason}")


def post(base, path, body):
    request = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise Failure(f"POST {path} returned {error.code}: {error.read()[:300]!r}")
    except urllib.error.URLError as error:
        raise Failure(f"POST {path} could not connect: {error.reason}")


def check_bundled_models(base):
    """The models ship inside the jar, so these answering proves they were packaged."""
    for slug, expected in EXAMPLES.items():
        payload = get(base, f"/api/example/{slug}")
        actual = {
            "name": payload["name"],
            "configurations": payload["configurationCount"],
            "vertices": len(payload["esgFx"]["nodes"]),
            "edges": len(payload["esgFx"]["edges"]),
        }
        if actual != expected:
            raise Failure(f"{slug}: expected {expected}, got {actual}")
        print(f"  {actual['name']}: {actual['configurations']} configurations, "
              f"{actual['vertices']} vertices, {actual['edges']} edges")


def check_generation(base):
    """
    Generation runs on a pool thread, which reaches the jar's resources through a
    different class loader than the request thread does — the path a packaging
    mistake breaks first.
    """
    result = post(base, "/api/generate", {
        "splName": "SVM",
        "coverageLength": 1,
        "featureSelection": {"s": True},
    })
    if result.get("coveragePercentage") != 100.0:
        raise Failure(f"single product: expected 100% coverage, got {result}")
    if result.get("testSequences") != [REFERENCE_SEQUENCE]:
        raise Failure(f"single product: unexpected sequence {result.get('testSequences')}")
    print("  single product: 100% event coverage, " + " -> ".join(REFERENCE_SEQUENCE))

    products = post(base, "/api/generate/all",
                    {"splName": "El", "coverageLength": 2})["products"]
    if len(products) != 42:
        raise Failure(f"all products: expected 42 Elevator products, got {len(products)}")
    if not all(p["coveragePercentage"] == 100.0 for p in products):
        raise Failure("all products: not every product reached full coverage")
    print(f"  all products: {len(products)} products, all at 100% coverage")


def check_sampling(base, require_unigen):
    products = post(base, "/api/generate/sampled", {
        "splName": "El", "sampleSize": 4, "seed": 42,
        "sampler": "enumeration", "coverageLength": 2,
    })["products"]
    if len(products) != 4:
        raise Failure(f"enumeration sampling: expected 4 products, got {len(products)}")
    print(f"  enumeration sampling: products {[p['productId'] for p in products]}")

    available = get(base, "/api/example/svm")["uniGenAvailable"]
    if not available:
        if require_unigen:
            raise Failure("UniGen did not install; only enumeration sampling works")
        print("  UniGen: not installed here, skipping")
        return

    sampled = post(base, "/api/generate/sampled", {
        "splName": "El", "sampleSize": 4, "seed": 42,
        "sampler": "unigen", "coverageLength": 2,
    })["products"]
    if not sampled:
        raise Failure("UniGen returned no samples")
    if not all(p["coveragePercentage"] == 100.0 for p in sampled):
        raise Failure("UniGen sampling: not every product reached full coverage")
    print(f"  UniGen sampling: {len(sampled)} products, all at 100% coverage")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url")
    parser.add_argument("--require-unigen", action="store_true",
                        help="fail if UniGen is not installed, rather than skipping it")
    args = parser.parse_args(argv)
    base = args.base_url.rstrip("/")

    checks = [
        ("bundled models load from inside the jar", lambda: check_bundled_models(base)),
        ("generation runs off the packaged resources", lambda: check_generation(base)),
        ("sampling", lambda: check_sampling(base, args.require_unigen)),
    ]

    for title, check in checks:
        print(title)
        try:
            check()
        except Failure as failure:
            print(f"FAILED: {failure}", file=sys.stderr)
            return 1

    print("all packaging checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
