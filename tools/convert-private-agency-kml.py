"""Convert the preserved Oklahoma parks KML into private location points.

Keep names containing 'State Park'; exclude federal sites and unclassified canoe
trails. No KML HTML, images, external styles, or network links enter the output.
The source is a historical location reference, not current ownership/access data.
"""

import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_ID = "registry-ok-parks-71807f407a"
NS = {"k": "http://www.opengis.net/kml/2.2"}


def park_points(data):
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("KML document types/entities are not supported")
    document = ET.fromstring(data)
    if document.tag != "{http://www.opengis.net/kml/2.2}kml":
        raise ValueError("expected KML 2.2 document")
    features = []
    excluded = []
    seen = set()
    for placemark in document.findall(".//k:Placemark", NS):
        name = " ".join(placemark.findtext("k:name", default="", namespaces=NS).split())
        if "state park" not in name.lower():
            excluded.append(name)
            continue
        point = placemark.find("k:Point", NS)
        if point is None:
            raise ValueError(f"{name}: expected a single Point")
        coordinate_text = point.findtext("k:coordinates", default="", namespaces=NS)
        raw = re.sub(r"\s*,\s*", ",", coordinate_text.strip()).split()
        if len(raw) != 1:
            raise ValueError(f"{name}: expected one coordinate tuple")
        components = raw[0].split(",")
        if len(components) not in (2, 3):
            raise ValueError(f"{name}: invalid coordinate tuple")
        values = [float(value) for value in components]
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"{name}: nonfinite coordinate")
        longitude, latitude = values[:2]
        if not (-103.1 <= longitude <= -94.3 and 33.5 <= latitude <= 37.1):
            raise ValueError(f"{name}: point outside Oklahoma bounds")
        key = (name, longitude, latitude)
        if key in seen:
            continue
        seen.add(key)
        features.append({
            "type": "Feature", "id": hashlib.sha256(repr(key).encode()).hexdigest()[:16],
            "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
            "properties": {"NAME": name},
        })
    return features, excluded


def convert():
    source = ROOT / "PrivateData/agency-feeds/US/OK" / SOURCE_ID
    receipt = json.loads((source / "receipt.json").read_text(encoding="utf-8-sig"))
    if (receipt["sourceId"] != SOURCE_ID or receipt["state"] != "OK"
            or receipt["rightsStatus"] != "Unconfirmed"
            or receipt.get("provisionalPrivateValidation") is not True
            or receipt["publicDistribution"] is not False
            or not re.fullmatch(r"[a-f0-9]{64}", receipt["sha256"])
            or receipt["rawFilename"] not in ("raw.kml", f"raw-{receipt['sha256']}.kml")):
        raise ValueError("unexpected private KML input receipt")
    raw = (source / receipt["rawFilename"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != receipt["sha256"]:
        raise ValueError("raw KML checksum mismatch")
    features, excluded = park_points(raw)
    if len(features) != 44 or len(excluded) != 8:
        raise ValueError("unexpected Oklahoma source inventory")
    data = (json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")) + "\n").encode()
    output = source.parent / f"converted-{SOURCE_ID}"
    output.mkdir(parents=True, exist_ok=True)
    derived = {
        "sourceId": f"converted-{SOURCE_ID}", "parentSourceId": SOURCE_ID,
        "sourceUrl": receipt["sourceUrl"], "sourcePartition": "ok-state-park-location-points",
        "state": "OK", "rightsStatus": "Unconfirmed", "provisionalPrivateValidation": True,
        "publicDistribution": False, "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "rawFilename": "raw.geojson", "featureCount": len(features), "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(), "inputSha256": receipt["sha256"],
        "sourceFilter": "Name contains State Park; no current management or access inferred",
        "sourceCrs": "EPSG:4326", "outputCrs": "EPSG:4326",
        "excludedNames": excluded, "sourceFreshness": "Unverified historical KML",
    }
    (output / "raw.geojson").write_bytes(data)
    (output / "receipt.json").write_text(json.dumps(derived, indent=2) + "\n", encoding="utf-8")
    return {"state": "OK", "count": len(features), "excluded": len(excluded)}


if __name__ == "__main__":
    print(json.dumps(convert()))
