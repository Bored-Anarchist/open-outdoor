"""Convert an explicitly redistributable ZIP geodatabase to WGS84 GeoJSON.

Run with uv run --frozen --group gis.
No private paths or dependencies are read by this converter.
"""
import json
import sys
import zipfile
from pathlib import Path
from tools.lib.archive_security import inspect_zip

ROOT = Path(__file__).resolve().parents[2]
import pyogrio  # noqa: E402
from pyogrio.raw import read  # noqa: E402
from pyproj import Transformer  # noqa: E402
from shapely import from_wkb  # noqa: E402
from shapely.geometry import mapping  # noqa: E402
from shapely.ops import transform  # noqa: E402

archive = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
with zipfile.ZipFile(archive) as bundle:
    inspect_zip(bundle)
    directories = {name.split("/")[0] for name in bundle.namelist() if ".gdb/" in name}
if len(directories) != 1:
    raise ValueError("expected one geodatabase directory")
source = "/vsizip/" + archive.as_posix() + "/" + directories.pop()
layers = pyogrio.list_layers(source)
if len(layers) != 1:
    raise ValueError("expected one CAL FIRE forest boundary layer")
meta, ids, shapes, values = read(source, layer=layers[0][0], return_fids=True)
project = Transformer.from_crs(meta["crs"], "EPSG:4326", always_xy=True)
features = []
for ordinal, shape in enumerate(shapes):
    if shape is None:
        continue
    properties = {}
    for field, column in zip(meta["fields"], values):
        value = column[ordinal]
        if hasattr(value, "item"):
            value = value.item()
        if value is not None and not isinstance(value, (str, int, float, bool)):
            value = str(value)
        properties[str(field)] = value
    geometry = transform(project.transform, from_wkb(shape))
    features.append({"type": "Feature", "id": int(ids[ordinal]), "geometry": mapping(geometry), "properties": properties})
output.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
print(json.dumps({"layer": str(layers[0][0]), "inputCrs": meta["crs"], "featureCount": len(features), "fields": list(meta["fields"])}))
