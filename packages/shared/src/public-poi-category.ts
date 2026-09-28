import { ioverlanderCategoryIds, type IoverlanderCategory } from './ioverlander.js';

/** Source type, never a place name or an inferred permission to camp. */
export function publicPoiCategory(value: string): IoverlanderCategory {
  const raw = value.normalize('NFC').trim().toLowerCase();
  if (ioverlanderCategoryIds.includes(raw as IoverlanderCategory))
    return raw as IoverlanderCategory;
  const type = raw.replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ');
  if (/overnight.*prohibit|no overnight/.test(type)) return 'overnight-prohibited';
  if (
    /primitive camp|backcountry camp|wild camp|undeveloped camp/.test(type) ||
    /campsite.*primitive|campsite.*undeveloped/.test(type)
  )
    return 'wild_campsite';
  if (/informal camp/.test(type)) return 'informal_campsite';
  if (/campground|campsite|camping area|horse camp|cabin campground/.test(type)) return 'campsite';
  if (/dump station|sanitation dump/.test(type)) return 'sanitation_dump';
  if (/parking|pullout|pull off|turnout|snowpark/.test(type)) return 'shorterm_parking';
  if (/water drinking|drinking water|potable water/.test(type)) return 'water';
  if (/shower/.test(type)) return 'showers';
  if (/laundry/.test(type)) return 'laundry';
  if (/gas station|fuel station/.test(type)) return 'gas_station';
  if (/propane/.test(type)) return 'propane';
  if (/hotel|lodging|lodge|resort|cabin/.test(type)) return 'hotel';
  if (/hostel/.test(type)) return 'hostel';
  if (/restaurant|food service/.test(type)) return 'restaurant';
  if (/store|gift shop|shopping|grocer/.test(type)) return 'shopping';
  if (/hospital|first aid|medical/.test(type)) return 'medical';
  if (/wifi|wi fi/.test(type)) return 'wifi';
  if (/recycl|waste bin|trash|dumpster/.test(type)) return 'ecofriendly';
  if (
    /trailhead|trail head|access point|water access|visitor center|interpretive|overlook|viewpoint|observation|picnic|day use|historic|museum|monument|memorial|waterfall|geyser|scenic|attraction|information|info site|park area|state park|state forest|boat launch|boat ramp|boating site|fishing site|swimming site|beach|climbing area|wildlife viewing|education center|natural feature|site of interest|fire tower|scenic vista/.test(
      type,
    )
  )
    return 'tourist_attraction';
  // Toilets, navigation markers, infrastructure and unknown future types have no
  // equivalent legend category. Preserve their source type and amenity separately.
  return 'other';
}
