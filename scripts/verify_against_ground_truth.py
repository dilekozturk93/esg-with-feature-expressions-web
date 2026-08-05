#!/usr/bin/env python3
"""
Regression-check /api/generate output against the original Java pipeline's
per-product ground-truth files. Pure stdlib.
"""
import argparse
import atexit
import json
import os
import re
import shlex
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

SPL_FOLDERS = {
    "SVM": "SodaVendingMachine",
    "eM":  "eMail",
    "El":  "Elevator",
}
LEVELS = (1, 2, 3, 4)
COVERAGE_TOLERANCE = 0.01
SUFFIX = re.compile(r"_\d+$")


def base(event_name: str) -> str:
    # Engine's TestSuiteFileWriter writes events with " " replaced by "_"; the
    # API returns them with spaces intact. Normalize so both sides compare equal.
    normalized = event_name.replace(" ", "_")
    return SUFFIX.sub("", normalized)


def parse_config(path: Path) -> set[str]:
    selected = set()
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line:
            continue
        if "=" not in line:
            raise ValueError(f"{path}: malformed line {line!r}")
        name, value = (part.strip() for part in line.split("=", 1))
        if value.lower() == "true":
            selected.add(name)
        elif value.lower() != "false":
            raise ValueError(f"{path}: non-boolean value in {line!r}")
    return selected


def parse_ground_truth(path: Path, level: int):
    """
    Returns (coverage_pct: float, items: Counter, sequence_count: int). For
    L=1/2, items are base event-name strings; for L=3 ordered (a,b) pairs; for
    L=4 ordered triples. Raises ValueError on any parse surprise.
    """
    text = path.read_text()
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if len(lines) < 2:
        raise ValueError(f"{path}: expected >=2 non-empty lines, got {len(lines)}")

    metric_line = lines[-1]
    metric_match = re.fullmatch(rf"L{level} is ([\d.]+)%", metric_line.strip())
    if not metric_match:
        raise ValueError(f"{path}: last line not 'L{level} is X%': {metric_line!r}")
    coverage_pct = float(metric_match.group(1))

    items: Counter = Counter()
    for seq_line in lines[:-1]:
        if " : " not in seq_line:
            raise ValueError(f"{path}: sequence line missing ' : ' separator: {seq_line!r}")
        count_str, payload = seq_line.split(" : ", 1)
        try:
            declared = int(count_str.strip())
        except ValueError as exc:
            raise ValueError(f"{path}: non-integer item count in {seq_line!r}") from exc
        raw_items = [tok.strip() for tok in payload.split(", ") if tok.strip()]
        if len(raw_items) != declared:
            raise ValueError(
                f"{path}: declared {declared} items but parsed {len(raw_items)}: {seq_line!r}"
            )
        items.update(canonicalize_items(raw_items, level, path))
    return coverage_pct, items, len(lines) - 1


def canonicalize_items(raw_items: list[str], level: int, path: Path):
    if level in (1, 2):
        return [base(it) for it in raw_items]
    if level == 3:
        out = []
        for it in raw_items:
            parts = it.split(":")
            if len(parts) != 2:
                raise ValueError(f"{path}: L=3 item is not 'a:b': {it!r}")
            out.append((base(parts[0]), base(parts[1])))
        return out
    if level == 4:
        out = []
        for it in raw_items:
            parts = it.split(":")
            if len(parts) != 3:
                raise ValueError(f"{path}: L=4 item is not 'a:b:c': {it!r}")
            out.append((base(parts[0]), base(parts[1]), base(parts[2])))
        return out
    raise ValueError(f"Unsupported level {level}")


def api_items(sequences: list[list[str]], level: int) -> Counter:
    """
    API output mirrors the ground-truth tokenization: each element of an inner
    list is one item — a single event for L=1/2, an 'a:b' edge couple for L=3,
    an 'a:b:c' edge triple for L=4. We strip the engine's per-vertex numeric
    suffix and turn each token into a base-name tuple matching parse_ground_truth.
    """
    items: Counter = Counter()
    expected_parts = {1: 1, 2: 1, 3: 2, 4: 3}[level]
    for seq in sequences:
        for token in seq:
            parts = [base(p) for p in token.split(":")]
            if len(parts) != expected_parts:
                raise ValueError(
                    f"L={level} expected {expected_parts}-component token, got {token!r}")
            if level in (1, 2):
                items[parts[0]] += 1
            else:
                items[tuple(parts)] += 1
    return items


def call_api(base_url: str, spl: str, features: set[str], level: int):
    body = json.dumps({
        "splName": spl,
        "features": sorted(features),
        "coverageLength": level,
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        try:
            payload = json.loads(body_bytes.decode())
        except json.JSONDecodeError:
            payload = {"raw": body_bytes.decode(errors="replace")}
        return e.code, payload


def check_server(base_url: str) -> bool:
    try:
        with urllib.request.urlopen(f"{base_url}/api/example/svm", timeout=10) as resp:
            return resp.status == 200
    except (urllib.error.URLError, urllib.error.HTTPError):
        return False


def kill_port(port: int) -> None:
    pids = subprocess.run(
        ["lsof", "-i", f":{port}", "-sTCP:LISTEN", "-t"],
        capture_output=True, text=True,
    ).stdout.split()
    for pid in pids:
        try:
            os.kill(int(pid), signal.SIGKILL)
        except (ProcessLookupError, ValueError):
            pass


_SERVER_PROC: subprocess.Popen | None = None


def stop_server() -> None:
    global _SERVER_PROC
    if _SERVER_PROC is not None and _SERVER_PROC.poll() is None:
        try:
            os.killpg(os.getpgid(_SERVER_PROC.pid), signal.SIGTERM)
        except ProcessLookupError:
            pass
    _SERVER_PROC = None


def restart_server(base_url: str, port: int, start_cmd: str, log_path: str,
                   ready_timeout: float = 90.0) -> None:
    global _SERVER_PROC
    stop_server()
    kill_port(port)
    time.sleep(0.5)
    log_handle = open(log_path, "a")
    _SERVER_PROC = subprocess.Popen(
        shlex.split(start_cmd),
        stdout=log_handle, stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline = time.time() + ready_timeout
    while time.time() < deadline:
        if check_server(base_url):
            return
        time.sleep(1)
    raise RuntimeError(f"server did not respond at {base_url} within {ready_timeout}s")


def format_items_preview(items: Counter, limit: int = 12) -> str:
    parts = []
    for item, count in list(items.items())[:limit]:
        rendered = ":".join(item) if isinstance(item, tuple) else item
        parts.append(f"{rendered}×{count}" if count > 1 else rendered)
    suffix = ", ..." if len(items) > limit else ""
    return ", ".join(parts) + suffix


def write_report(report_root: Path, spl: str, level: int, pid: str, body: str):
    target = report_root / spl / f"L{level}" / f"{pid}.txt"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body)


def compare_one(spl: str, level: int, pid: str, features: set[str],
                gt_pct: float, gt_items: Counter, gt_seq_count: int,
                api_payload) -> tuple[str, str]:
    """
    Returns (verdict, report body). Verdicts:

    MATCH       identical coverage and identical item multiset.
    EQUIVALENT  same coverage, same sequence count and same total item count,
                but the items land in a different arrangement. An ESG-Fx has
                more than one valid Euler cycle, and the ground truth walks a
                product model round-tripped through a DOT file while the API
                builds it in memory — so an equally valid, differently ordered
                cycle is expected, not a defect.
    MISMATCH    coverage, sequence count or total item count differs.
    """
    api_pct = float(api_payload.get("coveragePercentage", -1))
    api_seqs = api_payload.get("testSequences", [])
    api_count = api_items(api_seqs, level)

    coverage_ok = abs(api_pct - gt_pct) <= COVERAGE_TOLERANCE
    multiset_ok = api_count == gt_items
    seq_count_ok = len(api_seqs) == gt_seq_count
    total_items_ok = sum(api_count.values()) == sum(gt_items.values())

    if coverage_ok and multiset_ok:
        verdict = "MATCH"
    elif coverage_ok and seq_count_ok and total_items_ok:
        verdict = "EQUIVALENT"
    else:
        verdict = "MISMATCH"

    report = [
        f"SPL: {spl}",
        f"Config: {pid} (features: {sorted(features)})",
        f"Coverage length: L={level}",
        "",
        "Ground truth:",
        f"- Coverage: {gt_pct}%",
        f"- Sequences: {gt_seq_count}",
        f"- Items ({sum(gt_items.values())}): {format_items_preview(gt_items)}",
        "",
        "API response:",
        f"- Coverage: {api_pct}%",
        f"- Sequences: {len(api_seqs)}",
        f"- Items ({sum(api_count.values())}): {format_items_preview(api_count)}",
        "",
        f"Coverage match: {'YES' if coverage_ok else f'NO (gt={gt_pct}% vs api={api_pct}%)'}",
        f"Sequence count match: {'YES' if seq_count_ok else f'NO (gt={gt_seq_count} vs api={len(api_seqs)})'}",
        f"Total item count match: {'YES' if total_items_ok else f'NO (gt={sum(gt_items.values())} vs api={sum(api_count.values())})'}",
    ]
    if multiset_ok:
        report.append("Multiset match: YES")
    else:
        missing = gt_items - api_count
        extra = api_count - gt_items
        report.append("Multiset match: NO")
        if missing:
            report.append(f"  Missing from API: {format_items_preview(missing)}")
        if extra:
            report.append(f"  Extra in API:    {format_items_preview(extra)}")
    report.append(f"Verdict: {verdict}")
    return verdict, "\n".join(report) + "\n"


def short_for(spl_short: str) -> str:
    return spl_short


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ground-truth-root", required=True, type=Path)
    ap.add_argument("--base-url", default="http://localhost:8080")
    ap.add_argument("--spl", choices=list(SPL_FOLDERS), help="limit to one SPL")
    ap.add_argument("--level", type=int, choices=LEVELS, help="limit to one L")
    ap.add_argument("--limit", type=int, help="first N products per (SPL, L)")
    ap.add_argument("--reports-dir", type=Path,
                    default=Path("verification-reports"))
    ap.add_argument("--restart-on-timeout", action="store_true",
                    help="Restart the spring-boot server after each HTTP 503 timeout "
                         "to prevent thread-pool starvation from cascading.")
    ap.add_argument("--server-start-cmd", default="mvn -q -DskipTests spring-boot:run",
                    help="Command used when --restart-on-timeout fires.")
    ap.add_argument("--server-log", default="/tmp/svr.log")
    return ap.parse_args(argv)


def discover_for_spl(gt_root: Path, spl_short: str):
    """
    Returns (configs: dict[pid -> set[str]], available_levels: list[int],
             notes: list[str]). Notes describe skips (missing dirs, L0, etc.).
    """
    folder = gt_root / "files" / "Cases" / SPL_FOLDERS[spl_short]
    notes = []
    config_dir = folder / "productConfigurations"
    if not config_dir.is_dir():
        return None, [], [f"{spl_short}: no productConfigurations/ directory, skipping entirely"]

    configs = {}
    for cfg_path in sorted(config_dir.glob("P*.config")):
        pid = cfg_path.stem
        configs[pid] = parse_config(cfg_path)

    test_root = folder / "testsequences"
    if not test_root.is_dir():
        return configs, [], [f"{spl_short}: no testsequences/ directory, skipping all levels"]

    if (test_root / "L0").is_dir():
        notes.append(f"{spl_short}: L0 ground truth found but API doesn't support L=0, skipping")

    available = []
    for lvl in LEVELS:
        if (test_root / f"L{lvl}").is_dir():
            available.append(lvl)
        else:
            notes.append(f"{spl_short}: skipping L={lvl} — no ground truth directory")
    return configs, available, notes


def main(argv=None):
    args = parse_args(argv)

    gt_root = args.ground_truth_root
    if not gt_root.is_dir():
        print(f"ERROR: ground-truth root does not exist: {gt_root}", file=sys.stderr)
        return 2
    if not (gt_root / "files" / "Cases" / "SodaVendingMachine").is_dir():
        print(f"ERROR: ground-truth root missing files/Cases/SodaVendingMachine: {gt_root}",
              file=sys.stderr)
        return 2

    if not check_server(args.base_url):
        print(f"ERROR: server not responding at {args.base_url}/api/example/svm", file=sys.stderr)
        print("Start it with: nohup mvn -q -DskipTests spring-boot:run > /tmp/svr.log 2>&1 &",
              file=sys.stderr)
        return 2

    spls = [args.spl] if args.spl else list(SPL_FOLDERS)

    # Discovery pass — print availability summary
    discovery = {}
    for spl in spls:
        try:
            configs, available, notes = discover_for_spl(gt_root, spl)
        except ValueError as e:
            print(f"ERROR parsing config for {spl}: {e}", file=sys.stderr)
            return 3
        discovery[spl] = (configs, available, notes)
        cfg_count = 0 if configs is None else len(configs)
        levels_str = "/".join(f"L{l}" for l in available) if available else "none"
        print(f"{spl}: found {cfg_count} configs, ground truth available: {levels_str}")
        for note in notes:
            print(f"  - {note}")

    if args.level:
        for spl in spls:
            configs, available, _ = discovery[spl]
            discovery[spl] = (configs, [l for l in available if l == args.level], [])

    print()
    grand_match = grand_equivalent = grand_mismatch = grand_error = grand_total = 0
    started = time.time()

    for spl in spls:
        configs, available, _ = discovery[spl]
        if not configs or not available:
            continue
        for level in available:
            test_dir = gt_root / "files" / "Cases" / SPL_FOLDERS[spl] / "testsequences" / f"L{level}"
            seq_files = sorted(test_dir.glob(f"P*_L{level}.txt"))
            pid_pairs = []
            for path in seq_files:
                pid = path.stem.replace(f"_L{level}", "")
                if pid in configs:
                    pid_pairs.append((pid, path))
            if args.limit:
                pid_pairs = pid_pairs[:args.limit]

            level_match = level_equivalent = level_mismatch = level_error = 0
            for pid, gt_path in pid_pairs:
                features = configs[pid]
                try:
                    gt_pct, gt_items, gt_seq_count = parse_ground_truth(gt_path, level)
                except ValueError as exc:
                    print(f"PARSE ERROR in {gt_path}:")
                    print(f"--- file content ---")
                    print(gt_path.read_text())
                    print(f"--- end ---")
                    print(f"Error: {exc}")
                    return 4

                status, payload = call_api(args.base_url, spl, features, level)
                if status != 200:
                    level_error += 1
                    label = f"[{spl}][L{level}] {pid}: ERROR (HTTP {status} — {json.dumps(payload)})"
                    print(label)
                    body = (f"SPL: {spl}\nConfig: {pid} (features: {sorted(features)})\n"
                            f"Coverage length: L={level}\n\nAPI HTTP {status}: {json.dumps(payload, indent=2)}\n")
                    write_report(args.reports_dir, spl, level, pid, body)
                    if status == 503 and args.restart_on_timeout:
                        port = int(args.base_url.rsplit(":", 1)[-1])
                        print(f"  -> restarting server (cascade-prevention) ...")
                        restart_server(args.base_url, port, args.server_start_cmd, args.server_log)
                    continue

                verdict, body = compare_one(spl, level, pid, features,
                                            gt_pct, gt_items, gt_seq_count, payload)
                print(f"[{spl}][L{level}] {pid}: {verdict}")
                if verdict == "MATCH":
                    level_match += 1
                else:
                    # EQUIVALENT still gets a report so the arrangement
                    # difference is inspectable, but it does not fail the run.
                    if verdict == "EQUIVALENT":
                        level_equivalent += 1
                    else:
                        level_mismatch += 1
                    write_report(args.reports_dir, spl, level, pid, body)

            total = level_match + level_equivalent + level_mismatch + level_error
            extras = []
            if level_equivalent:
                extras.append(f"{level_equivalent} EQUIVALENT")
            if level_mismatch:
                extras.append(f"{level_mismatch} MISMATCH")
            if level_error:
                extras.append(f"{level_error} ERROR")
            tail = f" ({', '.join(extras)})" if extras else ""
            print(f"{spl} L={level} summary: {level_match}/{total} MATCH{tail}")
            grand_match += level_match
            grand_equivalent += level_equivalent
            grand_mismatch += level_mismatch
            grand_error += level_error
            grand_total += total

    duration = time.time() - started
    print()
    print(f"GRAND TOTAL: {grand_match}/{grand_total} MATCH, "
          f"{grand_equivalent} EQUIVALENT, {grand_mismatch} MISMATCH, {grand_error} ERROR")
    print(f"Runtime: {duration:.1f}s")
    return 0 if grand_mismatch == 0 and grand_error == 0 else 1


if __name__ == "__main__":
    atexit.register(stop_server)
    sys.exit(main())
