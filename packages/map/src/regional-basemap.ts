import coverage from './assets/regional-basemap-coverage.json';

const rows = coverage.rows as Record<string, readonly (readonly number[])[]>;
const maximumLatitude = 85.05112878;

/** Use regional detail only when every visible tile exists; otherwise retain the world map. */
export function regionalBasemapCoversViewport(
  bounds: readonly [number, number, number, number],
  zoom: number,
): boolean {
  if (!Number.isFinite(zoom) || zoom < 7 || bounds.some((value) => !Number.isFinite(value)))
    return false;
  const [west, south, east, north] = bounds;
  if (south > north || south < -90 || north > 90) return false;
  const z = Math.min(9, Math.floor(zoom));
  const size = 2 ** z;
  const longitudeTile = (longitude: number) => Math.floor(((longitude + 180) / 360) * size);
  const latitudeTile = (latitude: number) => {
    const radians =
      (Math.max(-maximumLatitude, Math.min(maximumLatitude, latitude)) * Math.PI) / 180;
    return Math.max(
      0,
      Math.min(size - 1, Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * size)),
    );
  };
  const span = east - west;
  if (Math.abs(span) >= 360) return false;
  const normalizedWest = ((((west + 180) % 360) + 360) % 360) - 180;
  const x0 = longitudeTile(normalizedWest);
  const x1 = longitudeTile(normalizedWest + (span < 0 ? span + 360 : span));
  const y0 = latitudeTile(north);
  const y1 = latitudeTile(south);
  // Large mixed-coverage views use the complete worldwide archive.
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return false;
  const tileRows = rows[String(z)];
  if (!tileRows) return false;
  for (let y = y0; y <= y1; y++) {
    const ranges = tileRows.filter((range) => range[0] === y);
    for (let x = x0; x <= x1; x++) {
      const wrappedX = ((x % size) + size) % size;
      if (!ranges.some((range) => wrappedX >= range[1]! && wrappedX <= range[2]!)) return false;
    }
  }
  return true;
}
