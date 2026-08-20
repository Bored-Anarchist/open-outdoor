export type Coordinate = readonly [longitude: number, latitude: number];

export interface TrackPoint {
  readonly coordinate: Coordinate;
  readonly recordedAt: string;
}

export function assertCoordinate(value: Coordinate): Coordinate {
  const [longitude, latitude] = value;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new RangeError('coordinate is outside EPSG:4326 bounds');
  }
  return value;
}
