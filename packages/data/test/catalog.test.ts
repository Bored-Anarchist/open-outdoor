import { describe, expect, it } from 'vitest';
import { normalizePlace } from '../src/index.js';

describe('public fixture normalization', () => {
  it('is deterministic', () => {
    const input = {
      id: ' SYN-1 ',
      name: ' Synthetic Trail ',
      coordinate: [-74, 41] as const,
      synthetic: true,
    };
    expect(normalizePlace(input)).toEqual({
      id: 'syn-1',
      name: 'Synthetic Trail',
      coordinate: [-74, 41],
      synthetic: true,
    });
  });
});
