#!/usr/bin/env python3
"""
Bridge between the tool and UniGen, the SAT-based almost-uniform sampler.

UniGen ships as a native library rather than something the JVM can call, so it
runs as a separate process. The protocol is deliberately small, which is what
lets a different UniGen release — or a different sampler — be swapped in by
pointing the tool at another command.

    stdin   DIMACS CNF, including its `c ind` sampling-set line
    argv    <sample count> <seed>, or --probe to report readiness
    stdout  one sample per line, space-separated signed literals

Requires `pyunigen` (pip install pyunigen).
"""
import sys


def fail(message):
    print(message, file=sys.stderr)
    return 1


def probe():
    try:
        import pyunigen  # noqa: F401
    except ImportError as error:
        return fail("pyunigen is not installed: %s" % error)
    print("ok")
    return 0


def parse_dimacs(text):
    """Returns (clauses, sampling_set). Variables are 1-based, as in DIMACS."""
    clauses = []
    sampling_set = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("c"):
            # `c ind <vars> 0` names the sampling set; other comments are notes.
            parts = line.split()
            if len(parts) > 1 and parts[1] == "ind":
                sampling_set.extend(int(token) for token in parts[2:] if token != "0")
            continue
        if line.startswith("p"):
            continue
        literals = [int(token) for token in line.split() if token != "0"]
        if literals:
            clauses.append(literals)
    return clauses, sampling_set


def sample(count, seed):
    try:
        import pyunigen
    except ImportError as error:
        return fail("pyunigen is not installed: %s" % error)

    clauses, sampling_set = parse_dimacs(sys.stdin.read())
    if not clauses:
        return fail("no clauses were given on stdin")

    sampler = pyunigen.Sampler(seed=seed)
    for clause in clauses:
        sampler.add_clause(clause)

    if sampling_set:
        _, _, samples = sampler.sample(num=count, sampling_set=sampling_set)
    else:
        _, _, samples = sampler.sample(num=count)

    for assignment in samples:
        print(" ".join(str(literal) for literal in assignment))
    return 0


def main(argv):
    if len(argv) == 2 and argv[1] == "--probe":
        return probe()
    if len(argv) != 3:
        return fail("usage: unigen_bridge.py <sample count> <seed> | --probe")
    try:
        count = int(argv[1])
        seed = int(argv[2])
    except ValueError:
        return fail("sample count and seed must be integers")
    if count < 1:
        return fail("sample count must be at least 1")
    return sample(count, seed)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
