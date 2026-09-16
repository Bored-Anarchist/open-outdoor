import { describe, expect, it } from 'vitest';
import {
  normalizeOutdoorVisitorDetails,
  outdoorSourceUrl,
  decOutdoorVisitorDetails,
} from '../src/outdoor-details';

describe('visitor information normalization', () => {
  it('preserves readable visitor details while excluding unrelated fields and markup', () => {
    expect(
      normalizeOutdoorVisitorDetails({
        description: '<p>Forest &amp; lake &#x1f332;</p><script>discard()</script>',
        directionsInfo: '  Use the south entrance. ',
        amenities: ['Water', 'Water', null, { username: 'discarded' }],
        openingHours: 'Daily: 08:00–18:00',
        fees: ['Entry: USD 5'],
        contributor: 'discarded',
      }),
    ).toEqual({
      description: 'Forest & lake 🌲',
      directionsInfo: 'Use the south entrance.',
      amenities: ['Water'],
      openingHours: ['Daily: 08:00–18:00'],
      fees: ['Entry: USD 5'],
    });
  });
  it('bounds text and lists and omits absent or malformed information', () => {
    const details = normalizeOutdoorVisitorDetails({
      description: 'a'.repeat(5_000),
      amenities: Array.from({ length: 30 }, (_, i) => `${i}:` + 'b'.repeat(600)),
      fees: 50,
      openingHours: { monday: 'closed' },
    });
    expect(details.description).toHaveLength(4_000);
    expect(details.amenities).toHaveLength(20);
    expect(details.amenities?.every((entry) => entry.length <= 500)).toBe(true);
    expect(details).not.toHaveProperty('fees');
    expect(details).not.toHaveProperty('openingHours');
    expect(normalizeOutdoorVisitorDetails(null)).toEqual({});
  });
  it('preserves DEC descriptions and designations without inventing access for negative or missing flags', () => {
    expect(
      decOutdoorVisitorDetails({
        DESCRIP: 'Yellow trail markers.',
        NOTES: 'Steep section.',
        FOOT: 'Y',
        BIKE: 'N',
        ACCESSIBLE: '',
        MILES: 1.25,
      }),
    ).toEqual({
      description: 'Yellow trail markers. · Steep section.',
      amenities: ['Walking', 'Mapped segment length: 1.25 miles'],
    });
    expect(decOutdoorVisitorDetails({})).toEqual({});
  });
  it('allows browser source links and rejects executable URLs, credentials and malformed links', () => {
    expect(outdoorSourceUrl('https://www.nps.gov/test/')).toBe('https://www.nps.gov/test/');
    for (const url of [
      'javascript:alert(1)',
      'file:///secret',
      'https://user:password@example.com',
      'https://example.com/\nsecret',
      'invalid',
      null,
    ])
      expect(outdoorSourceUrl(url)).toBeUndefined();
  });
});
