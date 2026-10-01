"""Convert checked agency ZIP shapefiles into filtered private WGS84 GeoJSON.

Run with uv run --frozen --group gis.
All raw and derived features remain under ignored PrivateData/agency-feeds.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from tools.lib.archive_security import inspect_zip

ROOT = Path(__file__).resolve().parents[2]

import shapefile  # noqa: E402
from pyproj import CRS, Transformer  # noqa: E402


SOURCES = (
    {
        "state": "FL",
        "parent_id": "registry-fl-forestry-158eb959ff",
        "input_id": "registry-fl-forestry-158eb959ff",
        "member": "state_forests_mar25",
        "partition": "fl-named-state-forest-polygons",
        "selection": "Nonempty DESCRIPT; March 2025 forest boundaries; visitor access unverified",
        "accept": lambda p: bool(str(p.get("DESCRIPT") or "").strip()),
        "expected_count": 76,
    },
    {
        "state": "GA",
        "parent_id": "registry-ga-parks-d8134b1089",
        "member": "dnr20a",
        "partition": "ga-state-parks",
        "selection": "OWNER_CODE=3100 and NAME ends in SP",
        "accept": lambda p: p.get("OWNER_CODE") == 3100
        and str(p.get("NAME") or "").strip().upper().endswith(" SP"),
    },
    {
        "state": "GA",
        "parent_id": "registry-ga-forestry-d8134b1089",
        "member": "dnr20a",
        "partition": "ga-forestry-commission-owned",
        "selection": "OWNER_CODE=3200; access unverified",
        "accept": lambda p: p.get("OWNER_CODE") == 3200,
    },
    {
        "state": "TX",
        "parent_id": "registry-tx-parks-supplement-54a5d37923",
        "member": "TPWD_StateParksBoundary",
        "partition": "tx-open-state-parks",
        "selection": "Availabili=Open for Public Use",
        "accept": lambda p: str(p.get("Availabili") or "").strip()
        == "Open for Public Use",
    },
)

STATE_BOUNDS = {
    "FL": (-87.7, 24.0, -79.7, 31.2),
    "GA": (-85.7, 30.2, -80.7, 35.2),
    "TX": (-106.8, 25.6, -93.3, 36.7),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def transform_coordinates(value, transformer: Transformer, bounds):
    if isinstance(value[0], (int, float)):
        longitude, latitude = transformer.transform(value[0], value[1])
        west, south, east, north = bounds
        if not (west <= longitude <= east and south <= latitude <= north):
            raise ValueError("projected coordinate lies outside expected state bounds")
        return [round(longitude, 8), round(latitude, 8)]
    return [transform_coordinates(item, transformer, bounds) for item in value]


def convert(source: dict) -> dict:
    parent = source["parent_id"]
    state = source["state"]
    input_id = source.get("input_id", f"resolved-{parent}")
    directory = ROOT / "PrivateData" / "agency-feeds" / "US" / state / input_id
    receipt = json.loads((directory / "receipt.json").read_text(encoding="utf-8-sig"))
    if (
        receipt["sourceId"] != input_id
        or receipt["state"] != state
        or receipt["rightsStatus"] != "Unconfirmed"
        or receipt["publicDistribution"] is not False
        or receipt.get("provisionalPrivateValidation") is not True
        or not re.fullmatch(r"[a-f0-9]{64}", receipt["sha256"])
        or receipt["rawFilename"] not in ("raw.zip", f"raw-{receipt['sha256']}.zip")
    ):
        raise ValueError(f"{parent}: unexpected input receipt")
    raw = (directory / receipt["rawFilename"]).read_bytes()
    if sha256(raw) != receipt["sha256"]:
        raise ValueError(f"{parent}: raw ZIP checksum mismatch")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        inspect_zip(archive)
        prefix = source["member"]
        parts = {
            suffix: archive.read(f"{prefix}.{suffix}") for suffix in ("shp", "shx", "dbf", "prj")
        }
    crs = CRS.from_wkt(parts["prj"].decode("utf-8-sig"))
    transformer = Transformer.from_crs(crs, CRS.from_epsg(4326), always_xy=True)
    reader = shapefile.Reader(
        shp=io.BytesIO(parts["shp"]),
        shx=io.BytesIO(parts["shx"]),
        dbf=io.BytesIO(parts["dbf"]),
    )
    features = []
    for row in reader.iterShapeRecords():
        properties = row.record.as_dict()
        if not source["accept"](properties):
            continue
        geometry = row.shape.__geo_interface__
        if geometry["type"] not in ("Polygon", "MultiPolygon"):
            raise ValueError(f"{parent}: expected polygon geometry")
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": geometry["type"],
                    "coordinates": transform_coordinates(
                        geometry["coordinates"], transformer, STATE_BOUNDS[state]
                    ),
                },
                "properties": {
                    key: value.isoformat() if hasattr(value, "isoformat") else value
                    for key, value in properties.items()
                },
            }
        )
    if not features:
        raise ValueError(f"{parent}: source filter selected no features")
    if "expected_count" in source and len(features) != source["expected_count"]:
        raise ValueError(f"{parent}: unexpected selected feature inventory")
    output = ROOT / "PrivateData" / "agency-feeds" / "US" / state / f"converted-{parent}"
    output.mkdir(parents=True, exist_ok=True)
    data = (json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")) + "\n").encode()
    derived_receipt = {
        "sourceId": f"converted-{parent}",
        "parentSourceId": parent,
        "sourceUrl": receipt["sourceUrl"],
        "sourcePartition": source["partition"],
        "state": state,
        "rightsStatus": "Unconfirmed",
        "provisionalPrivateValidation": True,
        "publicDistribution": False,
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "featureCount": len(features),
        "rawFilename": "raw.geojson",
        "bytes": len(data),
        "sha256": sha256(data),
        "inputSha256": receipt["sha256"],
        "sourceFilter": source["selection"],
        "sourceCrs": crs.to_string(),
        "outputCrs": "EPSG:4326",
    }
    (output / "raw.geojson").write_bytes(data)
    (output / "receipt.json").write_text(
        json.dumps(derived_receipt, indent=2) + "\n", encoding="utf-8"
    )
    return {"id": parent, "state": state, "count": len(features), "partition": source["partition"]}


if __name__ == "__main__":
    requested = {argument.upper() for argument in sys.argv[1:]}
    if requested and not requested <= {"FL", "GA", "TX"}:
        raise SystemExit("usage: convert-private-agency-shapefiles.py [FL] [GA] [TX]")
    for item in SOURCES:
        if not requested or item["state"] in requested:
            print(json.dumps(convert(item)))
