#!/usr/bin/env python3
"""Convert public PRTS game tables to TeamBuilder JSON. Python 3.10+, stdlib only."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://torappu.prts.wiki/gamedata/latest/excel/"


def plain_text(value: str) -> str:
    # Remove presentation markup, preserving semantic markers such as <获得时>.
    value = re.sub(r"<@[^>]+>|</>", "", value)
    return value.replace("\\n", "\n").replace("\r\n", "\n").strip()


def load_table(name: str, source_dir: Path | None) -> tuple[dict, str]:
    if source_dir:
        raw = (source_dir / name).read_bytes()
    elif curl := shutil.which("curl"):
        # Windows curl uses the system networking stack; bound total transfer time.
        result = subprocess.run([
            curl, "--silent", "--show-error", "--fail", "--location", "--compressed",
            "--connect-timeout", "15", "--max-time", "60", "--retry", "2",
            "--user-agent", "TeamBuilder-DataImporter/1.0", BASE_URL + name,
        ], capture_output=True, timeout=200)
        if result.returncode:
            raise ValueError(f"Download {name}: {result.stderr.decode('utf-8', errors='replace').strip()}")
        raw = result.stdout
    else:
        request = urllib.request.Request(BASE_URL + name, headers={
            "User-Agent": "TeamBuilder-DataImporter/1.0",
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
        })
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    raw = response.read()
                    if response.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                break
            except (urllib.error.URLError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
    return json.loads(raw.decode("utf-8-sig")), hashlib.sha256(raw).hexdigest()


def find_season(activity: dict, season: str, version: str) -> tuple[dict, str]:
    for category in ("AUTOCHESS", "AUTOCHESS_SEASON"):
        seasons = activity.get("activity", {}).get(category, {})
        if season not in seasons:
            continue
        entry = seasons[season]
        if "charChessDataDict" in entry:  # Historical schema, no version nesting.
            return entry, f"activity.{category}.{season}"
        if version not in entry:
            raise ValueError(f"Version {version!r} not found; available: {', '.join(entry)}")
        return entry[version], f"activity.{category}.{season}.{version}"
    raise ValueError(f"Season {season!r} not found in AUTOCHESS / AUTOCHESS_SEASON")


def parse_trait(bond: dict) -> dict:
    text = plain_text(bond["desc"])
    base = int(bond["activeCount"])
    if base < 1 or not text:
        raise ValueError(f"Invalid activation count / description: {bond['name']}")
    # Layer milestones are part of an effect, never extra head-count tiers.
    pattern = r"<在场\s*(\d+)\s*名(?:不同(?:的)?)?\s*【([^】]+)】\s*干员>"
    markers = [m for m in re.finditer(pattern, text)
               if m.group(2) == bond["name"] and int(m.group(1)) > base]
    thresholds = [base]
    effects = [text[:markers[0].start()].strip() if markers else text]
    for i, marker in enumerate(markers):
        threshold = int(marker.group(1))
        if threshold <= thresholds[-1]:
            raise ValueError(f"Unordered / repeated head-count tiers: {bond['name']}")
        end = markers[i + 1].start() if i + 1 < len(markers) else len(text)
        thresholds.append(threshold)
        effects.append(text[marker.start():end].strip())
    if any(not effect for effect in effects):
        raise ValueError(f"Empty tier effect: {bond['name']}")
    result = {"name": bond["name"], "thresholds": thresholds, "effects": effects}
    if bond["bondId"] in ("soloShip", "maniShip"):
        result["special"] = {"soloShip": "solo", "maniShip": "harmony"}[bond["bondId"]]
    return result


def extract_abilities(chess: dict, garrisons: dict) -> list[dict]:
    abilities = []
    for gid in chess.get("garrisonIds", []):
        if gid not in garrisons:
            raise ValueError(f"Missing garrison: {gid}")
        gar = garrisons[gid]
        description = plain_text(gar.get("garrisonDesc") or gar.get("description") or "")
        ability = {
            "text": description or None,
            "eventType": gar.get("eventType"),
            "traitType": gar.get("eventTypeDesc"),
            "effectType": gar.get("effectType"),
            "triggers": list(dict.fromkeys(re.findall(r"<([^<>]+)>", description))),
        }
        # Some elite chess entries reference identical descriptions more than once.
        # Keep every source ID while showing that identical ability only once.
        same = next((a for a in abilities if description and all(a[k] == v for k, v in ability.items())), None)
        if same:
            same["sourceIds"].append(gid)
        else:
            abilities.append({**ability, "sourceIds": [gid]})
    return abilities


def convert(activity: dict, characters: dict, season: str, version: str) -> tuple[list, dict, dict]:
    data, location = find_season(activity, season, version)
    metadata = activity["autoChessData"]["bondInfoDict"]
    bonds = data["bondInfoDict"]
    traits = {"主羁绊": [], "子羁绊": []}
    excluded_bonds = []
    included_bonds = {}
    for bid, bond in bonds.items():
        kind = metadata.get(bid, {}).get("bondType")
        if kind not in ("SEASON", "REGULAR") or bond.get("noSelect") or bond["name"] == "绝技":
            excluded_bonds.append({"id": bid, "name": bond["name"], "type": kind,
                                   "noSelect": bond.get("noSelect", False)})
            continue
        included_bonds[bid] = kind
        traits["主羁绊" if kind == "SEASON" else "子羁绊"].append(parse_trait(bond))

    operators = []
    excluded_chess = []
    chess_table = data["charChessDataDict"]
    for cid, chess in chess_table.items():
        if not chess.get("upgradeChessId") or "diy" in cid:
            continue
        shop = data["charShopChessDatas"].get(cid)
        if not shop or shop.get("isHidden"):
            excluded_chess.append(cid)
            continue
        char_id = shop["charId"]
        if char_id not in characters:
            raise ValueError(f"Missing character: {char_id}")
        main, sub = [], []
        for bid in chess.get("bondIds", []):
            if bid not in included_bonds:
                raise ValueError(f"Operator {characters[char_id]['name']} uses excluded / unknown bond {bid}")
            (main if included_bonds[bid] == "SEASON" else sub).append(bonds[bid]["name"])
        elite_id = chess["upgradeChessId"]
        if elite_id not in chess_table:
            raise ValueError(f"Missing elite chess: {elite_id}")
        operators.append({
            "id": str(len(operators) + 1),
            "name": characters[char_id]["name"],
            "cost": int(shop["chessLevel"]),
            "mainTrait": main,
            "subTraits": sub,
            "effects": {
                "normal": plain_text(chess.get("desc") or ""),
                "elite": plain_text(chess_table[elite_id].get("desc") or ""),
            },
            "abilities": {
                "normal": extract_abilities(chess, data["garrisonDataDict"]),
                "elite": extract_abilities(chess_table[elite_id], data["garrisonDataDict"]),
            },
            "source": {"charId": char_id, "chessId": cid, "eliteChessId": elite_id},
        })
    validate(operators, traits)
    return operators, traits, {
        "dataPath": location,
        "excludedBonds": excluded_bonds,
        "excludedHiddenOrUnlistedChess": excluded_chess,
    }


def validate(operators: list, traits: dict) -> None:
    if not operators or not traits["主羁绊"] or not traits["子羁绊"]:
        raise ValueError("Empty operators / core bonds / additional bonds")
    names = [t["name"] for group in traits.values() for t in group]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate bond names")
    for op in operators:
        if not 1 <= op["cost"] <= 6:
            raise ValueError(f"Unexpected tier: {op['name']} = {op['cost']}")
        if not op["mainTrait"] and not op["subTraits"]:
            raise ValueError(f"Operator has no bonds: {op['name']}")
    identities = [(o["source"]["charId"], o["cost"]) for o in operators]
    if len(identities) != len(set(identities)):
        raise ValueError("Duplicate character / tier; inspect upstream variants before importing")


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def install(output: Path, season: str, version: str) -> Path:
    data_dir = ROOT / "data"
    archive = data_dir / "legacy" / ("before-" + season + "-" + version + "-" +
                                      datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    archive.mkdir(parents=True, exist_ok=False)
    for name in ("operators.json", "traits.json"):
        shutil.copy2(data_dir / name, archive / name)
    for name in ("operators.json", "traits.json"):
        shutil.copy2(output / name, data_dir / name)
    return archive


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", default="act3autochess")
    parser.add_argument("--version", default="V3_1")
    parser.add_argument("--source-dir", type=Path, help="Read downloaded tables offline")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data" / "generated")
    parser.add_argument("--list", action="store_true", help="List available seasons / versions only")
    parser.add_argument("--install", action="store_true", help="Archive current data, then replace it")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", args.season + args.version):
        parser.error("season/version may only contain letters, numbers, underscores and hyphens")
    output = args.output_dir.resolve()
    if output == (ROOT / "data").resolve():
        parser.error("Use a separate output directory; use --install to archive and replace live data")
    print("Loading activity_table.json...", flush=True)
    activity, activity_hash = load_table("activity_table.json", args.source_dir)
    if args.list:
        for category in ("AUTOCHESS", "AUTOCHESS_SEASON"):
            for season, entry in activity.get("activity", {}).get(category, {}).items():
                versions = "(unversioned)" if "charChessDataDict" in entry else ", ".join(entry)
                print(f"{category}: {season}: {versions}")
        return
    print("Loading character_table.json...", flush=True)
    characters, character_hash = load_table("character_table.json", args.source_dir)
    operators, traits, details = convert(activity, characters, args.season, args.version)
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "operators.json", operators)
    write_json(output / "traits.json", traits)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "season": args.season, "version": args.version,
        "sources": {name: {"url": BASE_URL + name, "sha256": digest}
                    for name, digest in [("activity_table.json", activity_hash),
                                         ("character_table.json", character_hash)]},
        "counts": {"operators": len(operators), "mainTraits": len(traits["主羁绊"]),
                   "subTraits": len(traits["子羁绊"])},
        **details,
        "notes": ["Hidden and DIY chess excluded; freely selected DIY operators are not included.",
                  "Head-count tiers parsed from descriptions; layer milestones remain inside effects.",
                  "Exact duplicate abilities merged with sourceIds retained.",
                  "effects contains the full in-game chess description; abilities retains garrison metadata. Some internal garrisons have null text.",
                  "No speculative economic / stacking search tags added."],
    }
    write_json(output / "import-report.json", report)
    print(json.dumps(report["counts"], ensure_ascii=False))
    print(f"Generated: {output}")
    if args.install:
        print(f"Archived previous data: {install(output, args.season, args.version)}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        sys.exit(1)
