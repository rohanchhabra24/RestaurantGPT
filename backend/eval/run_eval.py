"""CLI entry point for the eval harness — CI-gate usage:

    cd backend && python -m eval.run_eval

Exits non-zero if the pass rate drops below the threshold, so this can be
wired straight into a CI step per product.md's Phase 2 exit criterion.
"""

import asyncio
import sys

from app.services.eval_service import run_golden_set

PASS_THRESHOLD = 0.85


async def main() -> int:
    report = await run_golden_set()
    print(f"\nGolden set: {report['passed']}/{report['total']} passed "
          f"({report['pass_rate']:.1%}), avg citation coverage {report['avg_citation_coverage']:.1%}\n")
    for r in report["results"]:
        mark = "PASS" if r["passed"] else "FAIL"
        print(f"[{mark}] {r['id']:<28} route={r['actual_route']:<10} "
              f"grounding={r['grounding_verdict']:<10} coverage={r['citation_coverage']}")
    if report["pass_rate"] < PASS_THRESHOLD:
        print(f"\nBelow pass threshold ({PASS_THRESHOLD:.0%}) — failing CI.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
