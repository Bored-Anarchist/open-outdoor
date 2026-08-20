import { describe, expect, it } from 'vitest';
import { assertCoordinate } from '../src/index.js';

describe('canonical coordinate', () => {
  it('uses longitude then latitude', () => {
    expect(assertCoordinate([-73.9857, 40.7484])).toEqual([-73.9857, 40.7484]);
  });

  it('rejects values outside EPSG:4326', () => {
    expect(() => assertCoordinate([181, 0])).toThrow(RangeError);
  });
});
