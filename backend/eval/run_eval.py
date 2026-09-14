"""CLI entry point for the eval harness — CI-gate usage:

    cd backend && python -m eval.run_eval              # English golden set only
    cd backend && python -m eval.run_eval --multilingual   # + Hindi/Hinglish gate

Exits non-zero if the pass rate drops below the threshold, so this can be
wired straight into a CI step per product.md's Phase 2 exit criterion.
`--multilingual` additionally exits non-zero if Hindi or Hinglish fails to
clear the release gate against the English baseline (Stage 2F) — that gate
is what should decide whether a language is trusted for financial/
compensation answers, not a standalone pass-rate number.
"""

import asyncio
import sys

from app.services.eval_service import run_golden_set, run_multilingual_gate

PASS_THRESHOLD = 0.85


def _print_report(label: str, report: dict) -> None:
    print(f"\n{label}: {report['passed']}/{report['total']} passed "
          f"({report['pass_rate']:.1%}), avg citation coverage {report['avg_citation_coverage']:.1%}\n")
    for r in report["results"]:
        mark = "PASS" if r["passed"] else "FAIL"
        print(f"[{mark}] {r['id']:<28} route={r['actual_route']:<10} "
              f"grounding={r['grounding_verdict']:<10} coverage={r['citation_coverage']}")


async def main() -> int:
    multilingual = "--multilingual" in sys.argv

    if not multilingual:
        report = await run_golden_set()
        _print_report("Golden set", report)
        if report["pass_rate"] < PASS_THRESHOLD:
            print(f"\nBelow pass threshold ({PASS_THRESHOLD:.0%}) — failing CI.")
            return 1
        return 0

    result = await run_multilingual_gate()
    failed = False
    for language, report in result["by_language"].items():
        _print_report(f"Golden set [{language}]", report)
        if language == "english" and report["pass_rate"] < PASS_THRESHOLD:
            print(f"\nEnglish below pass threshold ({PASS_THRESHOLD:.0%}) — failing CI.")
            failed = True

    print("\nRelease gate (non-English vs. English baseline):")
    for language, g in result["gate"].items():
        status = "CLEARED" if g["cleared"] else "BLOCKED"
        print(f"  [{status}] {language:<10} pass_rate={g['pass_rate']:.1%}  {g['reason']}")
        if not g["cleared"]:
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
