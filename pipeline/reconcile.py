"""
Reconcile — compares computed standings from league.json against the official
standings from the stats workbook (official_standings_<year>.json).

Flags any player whose +/- or goal count disagrees.
Output: pipeline/reconcile_report.json
"""

import json
from pathlib import Path

LEAGUE_JSON = Path(__file__).parent.parent / "data" / "league.json"
PIPELINE_DIR = Path(__file__).parent
REPORT_OUT = PIPELINE_DIR / "reconcile_report.json"


def _compute_standings(games: list[dict], year: int) -> dict[str, dict]:
    """Compute per-player stats from league.json for a given year."""
    stats: dict[str, dict] = {}

    def get(n):
        stats[n] = stats.get(n) or {"nickname": n, "gp": 0, "w": 0, "l": 0, "d": 0, "g": 0}
        return stats[n]

    for g in games:
        if g.get("season") != year:
            continue
        score = g.get("score", [0, 0])
        winner = -1 if score[0] == score[1] else (0 if score[0] > score[1] else 1)
        for ti, roster in enumerate(g.get("rosters", [])):
            for name in roster:
                if not name:
                    continue
                p = get(name)
                p["gp"] += 1
                if winner == -1:
                    p["d"] += 1
                elif winner == ti:
                    p["w"] += 1
                else:
                    p["l"] += 1
        for goal in g.get("goals", []):
            scorer = goal.get("scorer")
            if scorer and not goal.get("og"):
                get(scorer)["g"] += 1

    for p in stats.values():
        p["pm"] = p["w"] - p["l"]
    return stats


def run(year: int = 2026):
    official_path = PIPELINE_DIR / f"official_standings_{year}.json"
    if not official_path.exists():
        print(f"[reconcile] No official_standings_{year}.json found — run workbook.py first")
        return

    if not LEAGUE_JSON.exists():
        print("[reconcile] league.json not found — run assemble.py first")
        return

    official = json.loads(official_path.read_text(encoding="utf-8"))
    league = json.loads(LEAGUE_JSON.read_text(encoding="utf-8"))

    computed = _compute_standings(league.get("games", []), year)
    official_map = {p["nickname"]: p for p in official.get("standings", [])}

    discrepancies = []
    for nickname, offic in official_map.items():
        comp = computed.get(nickname)
        if not comp:
            discrepancies.append({
                "nickname": nickname,
                "issue": "in workbook but no computed stats",
                "official": offic, "computed": None,
            })
            continue
        diffs = {}
        for stat in ("pm", "g", "gp"):
            ov = offic.get(stat)
            cv = comp.get(stat)
            if ov is not None and cv is not None and ov != cv:
                diffs[stat] = {"official": ov, "computed": cv}
        if diffs:
            discrepancies.append({
                "nickname": nickname,
                "issue": "stat mismatch",
                "diffs": diffs,
                "official": offic,
                "computed": comp,
            })

    report = {
        "year": year,
        "total_official_players": len(official_map),
        "total_computed_players": len(computed),
        "discrepancies": discrepancies,
    }
    REPORT_OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    if discrepancies:
        print(f"[reconcile] {len(discrepancies)} discrepancies found — see reconcile_report.json")
        for d in discrepancies[:5]:
            print(f"  {d['nickname']}: {d['issue']} {d.get('diffs', '')}")
    else:
        print(f"[reconcile] ✓ all {len(official_map)} players match")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2026)
    args = parser.parse_args()
    run(year=args.year)
