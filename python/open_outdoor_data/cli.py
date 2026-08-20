import argparse
import json
from pathlib import Path


def build_catalog(source: Path, output: Path) -> None:
    document = json.loads(source.read_text(encoding="utf-8"))
    if document.get("classification") != "public":
        raise ValueError("public catalog input must be classified public")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build_catalog(args.source, args.output)
