/**
 * iOverlander category identifiers and public legend labels, ordered from
 * https://ioverlander.com/legend (verified 2026-09-13).
 *
 * The text-marker glyphs below are original Open Outdoor UI primitives. They
 * preserve offline rendering without copying iOverlander's image assets.
 */
export const ioverlanderCategoryIds = [
  'campsite',
  'informal_campsite',
  'wild_campsite',
  'farm',
  'hotel',
  'hostel',
  'gas_station',
  'propane',
  'mechanic',
  'water',
  'sanitation_dump',
  'shorterm_parking',
  'ecofriendly',
  'restaurant',
  'tourist_attraction',
  'shopping',
  'financial',
  'wifi',
  'medical',
  'pet_services',
  'laundry',
  'showers',
  'customs_immigration',
  'checkpoint',
  'consulate',
  'vehicle_insurance',
  'vehicle_shipping',
  'vehicle_storage',
  'road_report',
  'warning',
  'overnight-prohibited',
  'other',
] as const;

export type IoverlanderCategory = (typeof ioverlanderCategoryIds)[number];

export interface IoverlanderCategoryDefinition {
  readonly id: IoverlanderCategory;
  readonly label: string;
  readonly icon: string;
  readonly color: string;
}

export const ioverlanderCategoryDefinitions = [
  { id: 'campsite', label: 'Established Campground', icon: 'C', color: '#cf5726' },
  { id: 'informal_campsite', label: 'Informal Campsite', icon: 'I', color: '#d97824' },
  { id: 'wild_campsite', label: 'Wild Camping', icon: '▲', color: '#a94b24' },
  { id: 'farm', label: 'Farm & Vineyard Camping', icon: 'F', color: '#657d32' },
  { id: 'hotel', label: 'Hotel', icon: 'H', color: '#73548c' },
  { id: 'hostel', label: 'Hostel', icon: 'h', color: '#8a67a3' },
  { id: 'gas_station', label: 'Fuel Station', icon: 'G', color: '#536d7c' },
  { id: 'propane', label: 'Propane', icon: 'P', color: '#687786' },
  { id: 'mechanic', label: 'Mechanic and Parts', icon: 'M', color: '#455a64' },
  { id: 'water', label: 'Water', icon: '≈', color: '#147d92' },
  { id: 'sanitation_dump', label: 'Sanitation Dump Station', icon: 'D', color: '#277182' },
  { id: 'shorterm_parking', label: 'Short-term Parking', icon: 'P', color: '#355c7d' },
  { id: 'ecofriendly', label: 'Eco-Friendly', icon: 'E', color: '#427548' },
  { id: 'restaurant', label: 'Restaurant', icon: 'R', color: '#9b5b2e' },
  { id: 'tourist_attraction', label: 'Tourist Attraction', icon: '★', color: '#5f7f31' },
  { id: 'shopping', label: 'Shopping', icon: 'S', color: '#8b633e' },
  { id: 'financial', label: 'Financial', icon: '$', color: '#50734a' },
  { id: 'wifi', label: 'Wifi', icon: '@', color: '#386b91' },
  { id: 'medical', label: 'Medical', icon: '+', color: '#a23e43' },
  { id: 'pet_services', label: 'Pet Services', icon: 'p', color: '#8d5368' },
  { id: 'laundry', label: 'Laundromat', icon: 'L', color: '#5274a2' },
  { id: 'showers', label: 'Showers', icon: 'S', color: '#2d8091' },
  { id: 'customs_immigration', label: 'Customs and Immigration', icon: 'C', color: '#59636b' },
  { id: 'checkpoint', label: 'Checkpoint', icon: '●', color: '#6b5952' },
  { id: 'consulate', label: 'Consulate / Embassy', icon: 'E', color: '#4f6180' },
  { id: 'vehicle_insurance', label: 'Vehicle Insurance', icon: 'I', color: '#536878' },
  { id: 'vehicle_shipping', label: 'Vehicle Shipping', icon: '↔', color: '#596d79' },
  { id: 'vehicle_storage', label: 'Vehicle Storage', icon: 'V', color: '#6b7278' },
  { id: 'road_report', label: 'Road Report', icon: 'R', color: '#bd6c24' },
  { id: 'warning', label: 'Warning', icon: '!', color: '#a62f32' },
  { id: 'overnight-prohibited', label: 'Overnight Prohibited', icon: '×', color: '#8b3036' },
  { id: 'other', label: 'Other', icon: '•', color: '#66757c' },
] as const satisfies readonly IoverlanderCategoryDefinition[];

const categoryIds = new Set<string>(ioverlanderCategoryIds);
const categoryDefinitions = new Map(
  ioverlanderCategoryDefinitions.map((definition) => [definition.id, definition]),
);

export function isIoverlanderCategory(value: string): value is IoverlanderCategory {
  return categoryIds.has(value);
}

export function normalizeIoverlanderCategory(value: string): IoverlanderCategory {
  const normalized = value.normalize('NFC').trim().toLocaleLowerCase('en-US');
  if (isIoverlanderCategory(normalized)) return normalized;
  if (normalized === 'shortterm_parking' || normalized === 'short-term parking') {
    return 'shorterm_parking';
  }
  return 'other';
}

export function ioverlanderCategoryDefinition(
  category: IoverlanderCategory,
): IoverlanderCategoryDefinition {
  return categoryDefinitions.get(category)!;
}
