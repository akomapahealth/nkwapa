import type { GhanaRegion, PatientLocationStatus } from '@prisma/client';

/**
 * Shared reference data for a patient's residential location.
 *
 * This is the single source of truth consumed by the API (DTO validation +
 * service normalization) and the web app (region/district dropdowns), so the
 * two layers can never drift. It is intentionally free of any GPS/coordinate
 * concept — v1 captures administrative geography only.
 */

/** Ghana's 16 administrative regions, in a stable display order. */
export const GHANA_REGIONS: GhanaRegion[] = [
  'AHAFO',
  'ASHANTI',
  'BONO',
  'BONO_EAST',
  'CENTRAL',
  'EASTERN',
  'GREATER_ACCRA',
  'NORTH_EAST',
  'NORTHERN',
  'OTI',
  'SAVANNAH',
  'UPPER_EAST',
  'UPPER_WEST',
  'VOLTA',
  'WESTERN',
  'WESTERN_NORTH',
];

/** Human-readable labels for each region. */
export const GHANA_REGION_LABELS: Record<GhanaRegion, string> = {
  AHAFO: 'Ahafo',
  ASHANTI: 'Ashanti',
  BONO: 'Bono',
  BONO_EAST: 'Bono East',
  CENTRAL: 'Central',
  EASTERN: 'Eastern',
  GREATER_ACCRA: 'Greater Accra',
  NORTH_EAST: 'North East',
  NORTHERN: 'Northern',
  OTI: 'Oti',
  SAVANNAH: 'Savannah',
  UPPER_EAST: 'Upper East',
  UPPER_WEST: 'Upper West',
  VOLTA: 'Volta',
  WESTERN: 'Western',
  WESTERN_NORTH: 'Western North',
};

/** Human-readable labels for the deliberate capture state. */
export const PATIENT_LOCATION_STATUS_LABELS: Record<PatientLocationStatus, string> = {
  RECORDED: 'Recorded',
  UNKNOWN: 'Unknown',
  NOT_RECORDED: 'Not recorded',
};

/**
 * Metropolitan / Municipal / District assemblies (MMDAs) per region.
 *
 * Used to drive the dependent district dropdown and to validate that a captured
 * district belongs to its region. Names are stored/compared case-insensitively
 * (see {@link normalizeDistrict}) so that assembly-suffix casing does not cause
 * spurious validation failures.
 */
export const GHANA_DISTRICTS_BY_REGION: Record<GhanaRegion, string[]> = {
  AHAFO: [
    'Asunafo North',
    'Asunafo South',
    'Asutifi North',
    'Asutifi South',
    'Tano North',
    'Tano South',
  ],
  ASHANTI: [
    'Adansi Asokwa',
    'Adansi North',
    'Adansi South',
    'Afigya Kwabre North',
    'Afigya Kwabre South',
    'Ahafo Ano North',
    'Ahafo Ano South East',
    'Ahafo Ano South West',
    'Amansie Central',
    'Amansie South',
    'Amansie West',
    'Asante Akim Central',
    'Asante Akim North',
    'Asante Akim South',
    'Asokore Mampong',
    'Asokwa',
    'Atwima Kwanwoma',
    'Atwima Mponua',
    'Atwima Nwabiagya',
    'Atwima Nwabiagya North',
    'Bekwai',
    'Bosome Freho',
    'Bosomtwe',
    'Ejisu',
    'Ejura Sekyedumase',
    'Juaben',
    'Kumasi Metropolitan',
    'Kwabre East',
    'Kwadaso',
    'Mampong',
    'Obuasi East',
    'Obuasi Municipal',
    'Offinso Municipal',
    'Offinso North',
    'Oforikrom',
    'Old Tafo',
    'Sekyere Afram Plains',
    'Sekyere Central',
    'Sekyere East',
    'Sekyere Kumawu',
    'Sekyere South',
    'Suame',
  ],
  BONO: [
    'Banda',
    'Berekum East',
    'Berekum West',
    'Dormaa Central',
    'Dormaa East',
    'Dormaa West',
    'Jaman North',
    'Jaman South',
    'Sunyani Municipal',
    'Sunyani West',
    'Tain',
    'Wenchi',
  ],
  BONO_EAST: [
    'Atebubu Amantin',
    'Kintampo North',
    'Kintampo South',
    'Nkoranza North',
    'Nkoranza South',
    'Pru East',
    'Pru West',
    'Sene East',
    'Sene West',
    'Techiman Municipal',
    'Techiman North',
  ],
  CENTRAL: [
    'Abura Asebu Kwamankese',
    'Agona East',
    'Agona West',
    'Ajumako Enyan Essiam',
    'Asikuma Odoben Brakwa',
    'Assin Central',
    'Assin North',
    'Assin South',
    'Awutu Senya East',
    'Awutu Senya West',
    'Cape Coast Metropolitan',
    'Effutu',
    'Ekumfi',
    'Gomoa Central',
    'Gomoa East',
    'Gomoa West',
    'Komenda Edina Eguafo Abirem',
    'Mfantsiman',
    'Twifo Atti Morkwa',
    'Twifo Hemang Lower Denkyira',
    'Upper Denkyira East',
    'Upper Denkyira West',
  ],
  EASTERN: [
    'Abuakwa North',
    'Abuakwa South',
    'Achiase',
    'Akuapem North',
    'Akuapem South',
    'Akyemansa',
    'Asene Manso Akroso',
    'Asuogyaman',
    'Atiwa East',
    'Atiwa West',
    'Ayensuano',
    'Birim Central',
    'Birim North',
    'Birim South',
    'Denkyembour',
    'Fanteakwa North',
    'Fanteakwa South',
    'Kwaebibirem',
    'Kwahu Afram Plains North',
    'Kwahu Afram Plains South',
    'Kwahu East',
    'Kwahu South',
    'Kwahu West',
    'Lower Manya Krobo',
    'New Juaben North',
    'New Juaben South',
    'Nsawam Adoagyiri',
    'Okere',
    'Suhum',
    'Upper Manya Krobo',
    'Upper West Akim',
    'West Akim',
    'Yilo Krobo',
  ],
  GREATER_ACCRA: [
    'Accra Metropolitan',
    'Ada East',
    'Ada West',
    'Adentan',
    'Ashaiman',
    'Ayawaso Central',
    'Ayawaso East',
    'Ayawaso North',
    'Ayawaso West',
    'Ga Central',
    'Ga East',
    'Ga North',
    'Ga South',
    'Ga West',
    'Korle Klottey',
    'Kpone Katamanso',
    'Krowor',
    'La Dade Kotopon',
    'La Nkwantanang Madina',
    'Ledzokuku',
    'Ningo Prampram',
    'Okaikwei North',
    'Shai Osudoku',
    'Tema Metropolitan',
    'Tema West',
    'Weija Gbawe',
  ],
  NORTH_EAST: [
    'Bunkpurugu Nakpanduri',
    'Chereponi',
    'East Mamprusi',
    'Mamprugu Moagduri',
    'West Mamprusi',
    'Yunyoo Nasuan',
  ],
  NORTHERN: [
    'Gushegu',
    'Karaga',
    'Kpandai',
    'Kumbungu',
    'Mion',
    'Nanton',
    'Nanumba North',
    'Nanumba South',
    'Saboba',
    'Sagnarigu',
    'Savelugu',
    'Tamale Metropolitan',
    'Tatale Sanguli',
    'Tolon',
    'Yendi',
    'Zabzugu',
  ],
  OTI: [
    'Biakoye',
    'Jasikan',
    'Kadjebi',
    'Krachi East',
    'Krachi Nchumuru',
    'Krachi West',
    'Nkwanta North',
    'Nkwanta South',
    'Guan',
  ],
  SAVANNAH: [
    'Bole',
    'Central Gonja',
    'East Gonja',
    'North East Gonja',
    'North Gonja',
    'Sawla Tuna Kalba',
    'West Gonja',
  ],
  UPPER_EAST: [
    'Bawku Municipal',
    'Bawku West',
    'Binduri',
    'Bolgatanga Municipal',
    'Bolgatanga East',
    'Bongo',
    'Builsa North',
    'Builsa South',
    'Garu',
    'Kassena Nankana Municipal',
    'Kassena Nankana West',
    'Nabdam',
    'Pusiga',
    'Talensi',
    'Tempane',
  ],
  UPPER_WEST: [
    'Daffiama Bussie Issa',
    'Jirapa',
    'Lambussie Karni',
    'Lawra',
    'Nadowli Kaleo',
    'Nandom',
    'Sissala East',
    'Sissala West',
    'Wa East',
    'Wa Municipal',
    'Wa West',
  ],
  VOLTA: [
    'Adaklu',
    'Afadzato South',
    'Agotime Ziope',
    'Akatsi North',
    'Akatsi South',
    'Anloga',
    'Central Tongu',
    'Ho Municipal',
    'Ho West',
    'Hohoe Municipal',
    'Keta Municipal',
    'Ketu North',
    'Ketu South',
    'Kpando',
    'North Dayi',
    'North Tongu',
    'South Dayi',
    'South Tongu',
  ],
  WESTERN: [
    'Ahanta West',
    'Amenfi Central',
    'Amenfi East',
    'Amenfi West',
    'Effia Kwesimintsim',
    'Ellembelle',
    'Jomoro',
    'Mpohor',
    'Nzema East',
    'Prestea Huni Valley',
    'Sekondi Takoradi Metropolitan',
    'Shama',
    'Tarkwa Nsuaem',
    'Wassa East',
  ],
  WESTERN_NORTH: [
    'Aowin',
    'Bia East',
    'Bia West',
    'Bibiani Anhwiaso Bekwai',
    'Bodi',
    'Juaboso',
    'Sefwi Akontombra',
    'Sefwi Wiawso',
    'Suaman',
  ],
};

/** Type guard for a valid region enum value. */
export function isGhanaRegion(value: unknown): value is GhanaRegion {
  return typeof value === 'string' && (GHANA_REGIONS as string[]).includes(value);
}

/**
 * Case-insensitively resolve a district string to its canonical spelling within
 * a region. Returns the canonical name if the district belongs to the region,
 * otherwise `null`.
 */
export function normalizeDistrict(
  region: GhanaRegion | null | undefined,
  district: string | null | undefined,
): string | null {
  if (!region || !district) {
    return null;
  }
  const target = district.trim().toLowerCase();
  if (!target) {
    return null;
  }
  const match = GHANA_DISTRICTS_BY_REGION[region].find((name) => name.toLowerCase() === target);
  return match ?? null;
}

/** True when `district` is a known MMDA within `region`. */
export function isDistrictInRegion(
  region: GhanaRegion | null | undefined,
  district: string | null | undefined,
): boolean {
  return normalizeDistrict(region, district) !== null;
}

/**
 * Ghana Digital Address (GhanaPostGPS), e.g. `GA-183-8164`: a region letter and a district
 * letter, an area code, then a four-digit unique code. Source: the GhanaPostGPS FAQ
 * (https://ghanapostgps.com/get-help/, checked 2026-11-15). Secondary sources disagree on the
 * area-code length, so we accept 3 to 5 digits: a refused real address is worse than an odd one.
 */
const DIGITAL_ADDRESS_PATTERN = /^([A-Z][A-Z0-9])-?(\d{3,5})-?(\d{4})$/;

export const DIGITAL_ADDRESS_EXAMPLE = 'GA-183-8164';

/**
 * Uppercase, drop spaces and accept hyphens or none; return the hyphenated form, or `null`
 * when the text is not shaped like a Digital Address.
 */
export function normalizeDigitalAddress(value: string | null | undefined): string | null {
  const compact = (value ?? '').toUpperCase().replace(/\s+/g, '');
  const match = DIGITAL_ADDRESS_PATTERN.exec(compact);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** Ghana's bounding box, roughly. A position outside it is refused. */
export const GHANA_BOUNDS = { minLat: 4.5, maxLat: 11.5, minLng: -3.5, maxLng: 1.5 } as const;

export function isInGhana(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= GHANA_BOUNDS.minLat &&
    latitude <= GHANA_BOUNDS.maxLat &&
    longitude >= GHANA_BOUNDS.minLng &&
    longitude <= GHANA_BOUNDS.maxLng
  );
}

export type ParsedPosition =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: 'no-coordinates' | 'short-link' | 'outside-ghana' };

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
// Most specific first: `!3d..!4d..` is the dropped pin; `@lat,lng` is only the map's centre.
const POSITION_PATTERNS = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|query|ll|destination|center|daddr)=(?:loc:)?${NUM}\\s*,\\s*${NUM}`),
  new RegExp(`^geo:${NUM}\\s*,\\s*${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
  new RegExp(`^${NUM}\\s*[,\\s]\\s*${NUM}$`),
];

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Pull a latitude and longitude out of a pasted Google Maps link or a "latitude, longitude"
 * pair. Short share links (maps.app.goo.gl) carry no coordinates until opened, so they get
 * their own reason and the caller can ask for the full link instead.
 */
export function parsePosition(input: string | null | undefined): ParsedPosition {
  let text = (input ?? '').trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // A stray % is fine; parse the text as typed.
  }
  for (const pattern of POSITION_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const latitude = round6(Number(match[1]));
    const longitude = round6(Number(match[2]));
    return isInGhana(latitude, longitude)
      ? { ok: true, latitude, longitude }
      : { ok: false, reason: 'outside-ghana' };
  }
  if (/goo\.gl\/|maps\.app\./i.test(text)) return { ok: false, reason: 'short-link' };
  return { ok: false, reason: 'no-coordinates' };
}
