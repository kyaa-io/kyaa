"""Validate the November survey. --apply upserts candidates to the fixed DEV endpoint."""
import argparse
import csv
import json
import os
import re
import urllib.request
from datetime import date
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("tasks", type=Path)
parser.add_argument("--apply", action="store_true")
args = parser.parse_args()
rows = {}
for country in ("JP", "KR"):
    path = args.tasks / f"IDOL-SURVEY-{country}-1124" / "idols.csv"
    with path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            jp = country == "JP"
            name = row["그룹명 원어" if jp else "그룹명(한글 / 공식 표기)"].strip()
            recent = row["최근 공연 일정" if jp else "최근 공연(공지 기준)"]
            upcoming = row["다음 공연 일정" if jp else "다음 공연(공지 기준)"]
            dates = re.findall(r"\b\d{4}-\d{2}-\d{2}\b", recent + " " + upcoming)
            if not name or not any(date(2026, 11, 1) <= date.fromisoformat(day) for day in dates):
                continue
            url = row["공식 X" if jp else "X 주소"].strip()
            rows[country, name] = dict(country=country, official_name=name,
                official_x=url if re.fullmatch(r"https://(?:x|twitter)\.com/[A-Za-z0-9_]{1,15}/?", url) else None,
                recent_show=recent or None, next_show=upcoming or None)

print(f"{len(rows)} active survey candidates")
if args.apply:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None

    token = os.environ["KYAA_DEV_SERVICE_ROLE_KEY"]
    request = urllib.request.Request(
        "https://data.dev.kyaa.io/unverified_idol_candidates?on_conflict=country,official_name",
        data=json.dumps(list(rows.values())).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=60) as response:
        print(response.status)
