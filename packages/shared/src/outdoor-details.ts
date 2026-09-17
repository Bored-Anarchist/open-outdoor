export interface OutdoorVisitorDetails {
  readonly description?: string;
  readonly directionsInfo?: string;
  readonly amenities?: readonly string[];
  readonly openingHours?: readonly string[];
  readonly fees?: readonly string[];
}

function plainText(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (entity) =>
        ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[
          entity
        ] ?? entity,
    )
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (entity, digits: string) => {
      const code = digits.toLowerCase().startsWith('x')
        ? parseInt(digits.slice(1), 16)
        : Number(digits);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : entity;
    })
    .replace(/[\s\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, maximum);
}

/** Keep only bounded visitor information; never retain arbitrary source fields. */
export function normalizeOutdoorVisitorDetails(value: unknown): OutdoorVisitorDetails {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const details: {
    description?: string;
    directionsInfo?: string;
    amenities?: string[];
    openingHours?: string[];
    fees?: string[];
  } = {};
  for (const key of ['description', 'directionsInfo'] as const) {
    const text = plainText(source[key], 4_000);
    if (text) details[key] = text;
  }
  for (const key of ['amenities', 'openingHours', 'fees'] as const) {
    const input = Array.isArray(source[key]) ? source[key] : [source[key]];
    const entries = [
      ...new Set(
        input
          .slice(0, 20)
          .map((item: unknown) => plainText(item, 500))
          .filter(Boolean),
      ),
    ];
    if (entries.length) details[key] = entries;
  }
  return details;
}

export function outdoorSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2_000 || /[\r\n]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** DEC geographic attributes describe access/designations, not current camping permission. */
export function decOutdoorVisitorDetails(value: Record<string, unknown>): OutdoorVisitorDetails {
  const activities = {
    FOOT: 'Walking',
    BIKE: 'Bicycling',
    HORSE: 'Horse riding',
    XC: 'Cross-country skiing',
    ATV: 'ATV',
    MOTORV: 'Motor vehicles',
    SNOWMB: 'Snowmobiles',
    ACCESSIBLE: 'Accessible designation',
  };
  return normalizeOutdoorVisitorDetails({
    description: [value.DESCRIPTIO, value.DESCRIP, value.NOTES]
      .filter((item) => typeof item === 'string' && item.trim())
      .join(' · '),
    amenities: [
      ...Object.entries(activities).flatMap(([key, label]) =>
        typeof value[key] === 'string' && ['y', 'yes'].includes(value[key].trim().toLowerCase())
          ? [label]
          : [],
      ),
      typeof value.MILES === 'number' && value.MILES > 0
        ? `Mapped segment length: ${value.MILES} miles`
        : '',
    ],
  });
}
