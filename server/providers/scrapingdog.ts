import type {
  BusinessLead,
  HiringOpportunity,
  JobEmploymentType,
  JobListing,
  JobWorkMode,
  ProviderId,
} from '../../src/types/domain.ts';
import {
  canConsumeQuota,
  getCachedResult,
  getEffectiveProviderKey,
  isProviderConfigured,
  isProviderEnabled,
  parseCredentialFormat,
  recordProviderUsage,
  sanitizeLeadId,
  setCachedResult,
} from './types.ts';

interface ScrapingdogMapsResult {
  title?: string;
  place_id?: string;
  data_id?: string;
  ludocid?: string;
  rating?: number;
  reviews?: number;
  type?: string;
  types?: string[];
  address?: string;
  phone?: string;
  website?: string;
  google_maps_url?: string;
  open_state?: string;
  hours?: string | string[];
  gps_coordinates?: {
    latitude?: number;
    longitude?: number;
  };
}

interface ScrapingdogGoogleResult {
  position?: number;
  title?: string;
  link?: string;
  snippet?: string;
  displayed_link?: string;
}

interface ScrapingdogJobResult {
  job_id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  description?: string;
  source_link?: string;
  share_link?: string;
  detected_extensions?: {
    posted_at?: string;
    schedule_type?: string;
    salary?: string;
    work_from_home?: boolean;
  };
  job_highlights?: Array<{ title?: string; items?: string[] }>;
  apply_options?: Array<{ title?: string; link?: string }>;
}

interface ScrapingdogLinkedInJobResult {
  job_position?: string;
  job_link?: string;
  job_id?: string;
  company_name?: string;
  company_profile?: string;
  job_location?: string;
  job_posting_date?: string;
  company_logo_url?: string;
  employment_type?: string;
  seniority_level?: string;
  job_description?: string;
  salary?: string;
}

function getCountryParams(country: string): {
  countryCode: string;
  googleDomain: string;
  linkedinGeoId: string;
} {
  const lower = (country || 'India').toLowerCase();
  if (lower.includes('india')) return { countryCode: 'in', googleDomain: 'google.co.in', linkedinGeoId: '102713980' };
  if (lower.includes('united kingdom') || lower === 'uk') {
    return { countryCode: 'uk', googleDomain: 'google.co.uk', linkedinGeoId: '101165590' };
  }
  if (lower.includes('canada')) return { countryCode: 'ca', googleDomain: 'google.ca', linkedinGeoId: '101174742' };
  if (lower.includes('australia')) return { countryCode: 'au', googleDomain: 'google.com.au', linkedinGeoId: '101452733' };
  if (lower.includes('germany')) return { countryCode: 'de', googleDomain: 'google.de', linkedinGeoId: '101282230' };
  if (lower.includes('singapore')) return { countryCode: 'sg', googleDomain: 'google.com.sg', linkedinGeoId: '102454443' };
  return { countryCode: 'us', googleDomain: 'google.com', linkedinGeoId: '103644278' };
}

const SCRAPINGDOG_TIMEOUT_MS = 40000;

function formatProviderError(label: string, err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError' || /timeout|aborted/i.test(err.message)) {
      return `${label} timed out after 40s while fetching live results. Please retry or narrow your query.`;
    }
    return err.message;
  }
  return fallback;
}

function extractConfirmedCredits(res: Response): number | null {
  const headerVal =
    res.headers.get('x-credits-remaining') ||
    res.headers.get('x-remaining-credits') ||
    res.headers.get('ratelimit-remaining');
  if (!headerVal) return null;
  const num = Number(headerVal);
  return Number.isFinite(num) ? num : null;
}

// ============================================================================
// A. GOOGLE_MAPS_SEARCH_API — Business & Locality Discovery
// ============================================================================

export async function searchScrapingdogMaps(params: {
  query: string;
  country: string;
  city: string;
  state?: string;
  locality?: string;
  category: string;
  service: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  leads: BusinessLead[];
  error?: string;
}> {
  if (!isProviderEnabled('google_maps_search') && !isProviderEnabled('scrapingdog')) {
    return {
      configured: isProviderConfigured('google_maps_search') || isProviderConfigured('scrapingdog'),
      enabled: false,
      leads: [],
      error: 'Google Maps Search provider is disabled by admin.',
    };
  }

  const { key: rawKey, resolvedFrom } = getEffectiveProviderKey('google_maps_search', ['scrapingdog']);
  if (!rawKey) {
    return {
      configured: false,
      enabled: true,
      leads: [],
      error: 'GOOGLE_MAPS_SEARCH_API is not configured. Add it in server secrets or Admin Data Sources.',
    };
  }
  if (!canConsumeQuota(resolvedFrom)) {
    return {
      configured: true,
      enabled: true,
      leads: [],
      error: 'Daily quota or budget cap reached for Google Maps Search.',
    };
  }

  const cred = parseCredentialFormat(rawKey);
  const localityPart = params.locality ? `${params.locality}, ` : '';
  const fullQuery = `${params.query || params.category} in ${localityPart}${params.city}${params.state ? `, ${params.state}` : ''}, ${params.country}`;

  // Branch 1: Official Google Places API (New) if secret is AIza...
  if (cred.mode === 'google_official') {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': cred.apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.location',
        },
        body: JSON.stringify({ textQuery: fullQuery, maxResultCount: 20 }),
        signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = await res.text();
        const msg = `Google Maps Places Search HTTP ${res.status}: ${text.slice(0, 160)}`;
        recordProviderUsage(resolvedFrom, false, 0, msg, { endpoint: 'places:searchText' });
        return { configured: true, enabled: true, leads: [], error: msg };
      }
      const data = (await res.json()) as { places?: any[] };
      recordProviderUsage(resolvedFrom, true, 5, undefined, {
        endpoint: 'places:searchText',
        confirmedRemainingCredits: extractConfirmedCredits(res),
      });
      const now = new Date().toISOString();
      const leads: BusinessLead[] = (data.places || []).map((p, idx) => {
        const website = p.websiteUri ? String(p.websiteUri).slice(0, 390) : undefined;
        const phone = p.nationalPhoneNumber ? String(p.nationalPhoneNumber).slice(0, 55) : undefined;
        const hasWebsite = Boolean(website);
        return {
          id: sanitizeLeadId('gm_search', p.id, idx),
          businessName: String(p.displayName?.text || 'Unnamed Business').slice(0, 190),
          category: String(p.primaryTypeDisplayName?.text || params.category || 'Business').slice(0, 95),
          location: `${localityPart}${params.city}${params.state ? `, ${params.state}` : ''}`.slice(0, 190),
          address: p.formattedAddress ? String(p.formattedAddress).slice(0, 390) : undefined,
          country: params.country,
          state: params.state,
          city: params.city,
          locality: params.locality,
          website,
          publicPhone: phone,
          source: 'Google Maps Search',
          sourceUrl: p.googleMapsUri ? String(p.googleMapsUri).slice(0, 590) : undefined,
          providerId: p.id ? String(p.id).slice(0, 130) : undefined,
          latitude: p.location?.latitude,
          longitude: p.location?.longitude,
          rating: p.rating,
          reviewCount: p.userRatingCount,
          hasWebsite,
          hasInstagram: false,
          opportunityScore: computeInitialHeuristicScore({
            hasWebsite,
            hasPhone: Boolean(phone),
            rating: p.rating,
            reviews: p.userRatingCount,
          }),
          confidenceScore: p.formattedAddress ? 88 : 70,
          suggestedServices: params.service ? [params.service] : ['Digital Presence Audit'],
          aiExplanation: hasWebsite
            ? `Listed on Google Maps Search with website (${website}). Potential client lead for ${params.service || 'digital optimization'} (not confirmed hiring).`
            : `Listed on Google Maps Search without a linked website. Potential client lead for ${params.service || 'web & digital presence'} (not confirmed hiring).`,
          isDemo: false,
          status: 'active',
          discoveredAt: now,
          lastVerifiedAt: now,
        };
      });
      return { configured: true, enabled: true, leads };
    } catch (err) {
      const msg = formatProviderError('Google Maps Search', err, 'Google Maps Search request failed');
      recordProviderUsage(resolvedFrom, false, 0, msg, { endpoint: 'places:searchText' });
      return { configured: true, enabled: true, leads: [], error: msg };
    }
  }

  // Branch 2: Scrapingdog Google Maps endpoint (default)
  const { countryCode, googleDomain } = getCountryParams(params.country);
  const endpointBase = cred.baseUrl || 'https://api.scrapingdog.com/google_maps';
  const url = new URL(endpointBase);
  url.searchParams.set('api_key', cred.apiKey);
  url.searchParams.set('query', fullQuery);
  url.searchParams.set('country', countryCode);
  url.searchParams.set('domain', googleDomain);
  url.searchParams.set('language', 'en');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS) });
    if (!res.ok) {
      const text = await res.text();
      const msg = `Google Maps Search HTTP ${res.status}: ${text.slice(0, 160)}`;
      recordProviderUsage(resolvedFrom, false, 0, msg, { endpoint: 'google_maps' });
      return { configured: true, enabled: true, leads: [], error: msg };
    }
    const data = (await res.json()) as {
      search_results?: ScrapingdogMapsResult[];
      local_results?: ScrapingdogMapsResult[];
      message?: string;
    };
    if (data.message && !data.search_results && !data.local_results) {
      recordProviderUsage(resolvedFrom, false, 0, data.message, { endpoint: 'google_maps' });
      return { configured: true, enabled: true, leads: [], error: data.message };
    }
    recordProviderUsage(resolvedFrom, true, 5, undefined, {
      endpoint: 'google_maps',
      confirmedRemainingCredits: extractConfirmedCredits(res),
    });
    const now = new Date().toISOString();
    const raw = Array.isArray(data.search_results)
      ? data.search_results
      : Array.isArray(data.local_results)
        ? data.local_results
        : [];

    const leads: BusinessLead[] = raw.slice(0, 20).map((item, idx) => {
      const hasWebsite = Boolean(item.website && item.website.trim().length > 0);
      const baseScore = computeInitialHeuristicScore({
        hasWebsite,
        hasPhone: Boolean(item.phone),
        rating: item.rating,
        reviews: item.reviews,
      });
      const fallbackMapsUrl = item.place_id
        ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(item.place_id)}`
        : undefined;
      return {
        id: sanitizeLeadId('gm_maps', item.place_id || item.data_id, idx),
        businessName: (item.title || 'Unnamed Business').slice(0, 190),
        category: (item.type || item.types?.[0] || params.category || 'Business').slice(0, 95),
        location: `${localityPart}${params.city}${params.state ? `, ${params.state}` : ''}`.slice(0, 190),
        address: item.address ? item.address.slice(0, 390) : undefined,
        country: params.country,
        state: params.state,
        city: params.city,
        locality: params.locality,
        website: item.website ? item.website.slice(0, 390) : undefined,
        publicPhone: item.phone ? item.phone.slice(0, 55) : undefined,
        source: 'Google Maps Search',
        sourceUrl: (item.google_maps_url || fallbackMapsUrl || '').slice(0, 590) || undefined,
        providerId: (item.place_id || item.data_id) ? String(item.place_id || item.data_id).slice(0, 130) : undefined,
        dataId: item.data_id ? String(item.data_id).slice(0, 140) : undefined,
        latitude: item.gps_coordinates?.latitude,
        longitude: item.gps_coordinates?.longitude,
        rating: item.rating,
        reviewCount: item.reviews,
        openingHours: Array.isArray(item.hours) ? item.hours.slice(0, 7) : item.open_state ? [item.open_state] : undefined,
        hasWebsite,
        hasInstagram: false,
        opportunityScore: baseScore,
        confidenceScore: item.address ? 82 : 65,
        suggestedServices: params.service ? [params.service] : ['Digital Presence Audit'],
        aiExplanation: hasWebsite
          ? `Listed on Google Maps Search with website (${item.website}). Potential candidate for ${params.service || 'freelance'} optimization.`
          : `Listed on Google Maps Search without a linked website. Potential opportunity for ${params.service || 'web & digital presence'} services.`,
        isDemo: false,
        status: 'active',
        discoveredAt: now,
        lastVerifiedAt: now,
      };
    });

    return { configured: true, enabled: true, leads };
  } catch (err) {
    const msg = formatProviderError('Google Maps Search', err, 'Google Maps Search request failed');
    recordProviderUsage(resolvedFrom, false, 0, msg, { endpoint: 'google_maps' });
    return { configured: true, enabled: true, leads: [], error: msg };
  }
}

// ============================================================================
// B. GOOGLE_MAPS_PLACES_API — Selective Business Enrichment (24h Cached)
// ============================================================================

export async function enrichPlaceWithGoogleMapsPlaces(params: {
  leadId?: string;
  providerId?: string;
  dataId?: string;
  businessName: string;
  city?: string;
  country?: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  cached: boolean;
  enriched: Partial<BusinessLead> | null;
  error?: string;
}> {
  if (!isProviderEnabled('google_maps_places')) {
    return {
      configured: isProviderConfigured('google_maps_places'),
      enabled: false,
      cached: false,
      enriched: null,
      error: 'Google Maps Places API is disabled by admin.',
    };
  }

  const cacheKey = `places_enrich:${params.dataId || params.providerId || params.businessName}:${params.city || ''}`;
  const cached = getCachedResult<Partial<BusinessLead>>(cacheKey);
  if (cached) {
    return { configured: true, enabled: true, cached: true, enriched: cached };
  }

  const { key: rawKey, resolvedFrom } = getEffectiveProviderKey('google_maps_places', [
    'google_maps_search',
    'scrapingdog',
  ]);
  if (!rawKey) {
    return {
      configured: false,
      enabled: true,
      cached: false,
      enriched: null,
      error: 'GOOGLE_MAPS_PLACES_API is not configured.',
    };
  }
  if (!canConsumeQuota('google_maps_places')) {
    return {
      configured: true,
      enabled: true,
      cached: false,
      enriched: null,
      error: 'Daily quota or budget cap reached for Google Maps Places API.',
    };
  }

  const cred = parseCredentialFormat(rawKey);
  const trackId: ProviderId = resolvedFrom === 'google_maps_places' ? 'google_maps_places' : resolvedFrom;

  // Branch 1: Official Google Places API (New)
  if (cred.mode === 'google_official') {
    const placeId = params.providerId;
    if (!placeId) {
      return {
        configured: true,
        enabled: true,
        cached: false,
        enriched: null,
        error: 'No Google Place ID available on this record for Places API lookup.',
      };
    }
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: {
          'X-Goog-Api-Key': cred.apiKey,
          'X-Goog-FieldMask':
            'id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri,primaryTypeDisplayName,regularOpeningHours,rating,userRatingCount,location',
        },
        signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = await res.text();
        const msg = `Google Places API HTTP ${res.status}: ${text.slice(0, 160)}`;
        recordProviderUsage(trackId, false, 0, msg, { endpoint: 'places/details' });
        return { configured: true, enabled: true, cached: false, enriched: null, error: msg };
      }
      const p = (await res.json()) as any;
      recordProviderUsage(trackId, true, 5, undefined, {
        endpoint: 'places/details',
        confirmedRemainingCredits: extractConfirmedCredits(res),
      });
      const now = new Date().toISOString();
      const enriched: Partial<BusinessLead> = {
        businessName: p.displayName?.text || params.businessName,
        address: p.formattedAddress || undefined,
        publicPhone: p.internationalPhoneNumber || p.nationalPhoneNumber || undefined,
        website: p.websiteUri || undefined,
        hasWebsite: Boolean(p.websiteUri),
        sourceUrl: p.googleMapsUri || undefined,
        category: p.primaryTypeDisplayName?.text || undefined,
        openingHours: Array.isArray(p.regularOpeningHours?.weekdayDescriptions)
          ? p.regularOpeningHours.weekdayDescriptions.slice(0, 7)
          : undefined,
        rating: typeof p.rating === 'number' ? p.rating : undefined,
        reviewCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
        latitude: p.location?.latitude,
        longitude: p.location?.longitude,
        source: 'Google Maps Places',
        placesEnriched: true,
        placesEnrichedAt: now,
        lastVerifiedAt: now,
      };
      setCachedResult(cacheKey, enriched, 24 * 60 * 60 * 1000);
      return { configured: true, enabled: true, cached: false, enriched };
    } catch (err) {
      const msg = formatProviderError('Google Maps Places', err, 'Places lookup failed');
      recordProviderUsage(trackId, false, 0, msg, { endpoint: 'places/details' });
      return { configured: true, enabled: true, cached: false, enriched: null, error: msg };
    }
  }

  // Branch 2: Scrapingdog /google_maps/places
  const { countryCode } = getCountryParams(params.country || 'India');
  const url = new URL(cred.baseUrl || 'https://api.scrapingdog.com/google_maps/places');
  url.searchParams.set('api_key', cred.apiKey);
  if (params.dataId) {
    url.searchParams.set('data_id', params.dataId);
  } else if (params.providerId) {
    url.searchParams.set('place_id', params.providerId);
  } else {
    return {
      configured: true,
      enabled: true,
      cached: false,
      enriched: null,
      error: 'Place identifier (place_id or data_id) is missing on this record.',
    };
  }
  url.searchParams.set('country', countryCode);

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS) });
    if (!res.ok) {
      const text = await res.text();
      const msg = `Google Maps Places HTTP ${res.status}: ${text.slice(0, 160)}`;
      recordProviderUsage(trackId, false, 0, msg, { endpoint: 'google_maps/places' });
      return { configured: true, enabled: true, cached: false, enriched: null, error: msg };
    }
    const data = (await res.json()) as any;
    const place = data.place_results || data.local_results?.[0] || data;
    if (!place || data.message) {
      const msg = data.message || 'No detailed Places record returned by provider.';
      recordProviderUsage(trackId, false, 0, msg, { endpoint: 'google_maps/places' });
      return { configured: true, enabled: true, cached: false, enriched: null, error: msg };
    }
    recordProviderUsage(trackId, true, 5, undefined, {
      endpoint: 'google_maps/places',
      confirmedRemainingCredits: extractConfirmedCredits(res),
    });
    const now = new Date().toISOString();
    const hoursRaw = place.hours || place.operating_hours || place.opening_hours;
    const openingHours: string[] | undefined = Array.isArray(hoursRaw)
      ? hoursRaw.map(String).slice(0, 7)
      : typeof hoursRaw === 'object' && hoursRaw !== null
        ? Object.entries(hoursRaw).map(([d, h]) => `${d}: ${String(h)}`).slice(0, 7)
        : typeof place.open_state === 'string'
          ? [place.open_state]
          : undefined;

    const enriched: Partial<BusinessLead> = {
      businessName: place.title || params.businessName,
      address: place.address || undefined,
      publicPhone: place.phone || undefined,
      website: place.website || undefined,
      hasWebsite: Boolean(place.website),
      sourceUrl: place.google_maps_url || place.link || undefined,
      category: place.type || (Array.isArray(place.types) ? place.types[0] : undefined),
      openingHours,
      rating: typeof place.rating === 'number' ? place.rating : undefined,
      reviewCount: typeof place.reviews === 'number' ? place.reviews : undefined,
      latitude: place.gps_coordinates?.latitude,
      longitude: place.gps_coordinates?.longitude,
      source: 'Google Maps Places',
      placesEnriched: true,
      placesEnrichedAt: now,
      lastVerifiedAt: now,
    };
    setCachedResult(cacheKey, enriched, 24 * 60 * 60 * 1000);
    return { configured: true, enabled: true, cached: false, enriched };
  } catch (err) {
    const msg = formatProviderError('Google Maps Places', err, 'Places lookup failed');
    recordProviderUsage(trackId, false, 0, msg, { endpoint: 'google_maps/places' });
    return { configured: true, enabled: true, cached: false, enriched: null, error: msg };
  }
}

// ============================================================================
// PRESERVED EXISTING GOOGLE SEARCH SCRAPER (Reused for Scholarship Discovery)
// ============================================================================

export async function searchScrapingdogGoogle(params: {
  query: string;
  country: string;
  page?: number;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  results: ScrapingdogGoogleResult[];
  error?: string;
}> {
  if (!isProviderEnabled('scrapingdog')) {
    return {
      configured: isProviderConfigured('scrapingdog'),
      enabled: false,
      results: [],
      error: 'Scrapingdog Google Search provider is disabled.',
    };
  }
  const { key: rawKey } = getEffectiveProviderKey('scrapingdog');
  if (!rawKey) {
    return {
      configured: false,
      enabled: true,
      results: [],
      error: 'SCRAPINGDOG_API_KEY is not configured.',
    };
  }
  if (!canConsumeQuota('scrapingdog')) {
    return {
      configured: true,
      enabled: true,
      results: [],
      error: 'Daily Scrapingdog quota or budget cap reached.',
    };
  }

  const cred = parseCredentialFormat(rawKey);
  const { countryCode, googleDomain } = getCountryParams(params.country);
  const url = new URL('https://api.scrapingdog.com/google');
  url.searchParams.set('api_key', cred.apiKey);
  url.searchParams.set('query', params.query);
  url.searchParams.set('country', countryCode);
  url.searchParams.set('domain', googleDomain);
  url.searchParams.set('page', String(params.page ?? 0));

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS) });
    if (!res.ok) {
      const text = await res.text();
      const msg = `Scrapingdog Search HTTP ${res.status}: ${text.slice(0, 160)}`;
      recordProviderUsage('scrapingdog', false, 0, msg, { endpoint: 'google' });
      return { configured: true, enabled: true, results: [], error: msg };
    }
    const data = (await res.json()) as { organic_results?: ScrapingdogGoogleResult[]; message?: string };
    if (data.message && !data.organic_results) {
      recordProviderUsage('scrapingdog', false, 0, data.message, { endpoint: 'google' });
      return { configured: true, enabled: true, results: [], error: data.message };
    }
    recordProviderUsage('scrapingdog', true, 5, undefined, {
      endpoint: 'google',
      confirmedRemainingCredits: extractConfirmedCredits(res),
    });
    return {
      configured: true,
      enabled: true,
      results: Array.isArray(data.organic_results) ? data.organic_results : [],
    };
  } catch (err) {
    const msg = formatProviderError('Scrapingdog Google Search', err, 'Scrapingdog Search failed');
    recordProviderUsage('scrapingdog', false, 0, msg, { endpoint: 'google' });
    return { configured: true, enabled: true, results: [], error: msg };
  }
}

// ============================================================================
// C. GOOGLE_JOBS_API — Unified Job Discovery Adapter
// ============================================================================

function normalizeEmploymentType(raw: string): JobEmploymentType {
  const s = raw.toLowerCase();
  if (s.includes('intern')) return 'Internship';
  if (s.includes('freelance')) return 'Freelance';
  if (s.includes('contract')) return 'Contract';
  if (s.includes('part-time') || s.includes('part time')) return 'Part-time';
  if (s.includes('full-time') || s.includes('full time')) return 'Full-time';
  return 'Not specified';
}

function normalizeWorkMode(raw: string, wfh?: boolean): JobWorkMode {
  if (wfh) return 'Remote';
  const s = raw.toLowerCase();
  if (s.includes('remote') || s.includes('work from home')) return 'Remote';
  if (s.includes('hybrid')) return 'Hybrid';
  if (s.includes('on-site') || s.includes('onsite') || s.includes('in-office')) return 'On-site';
  return 'Not specified';
}

function extractSkillsHeuristic(text: string): string[] {
  const known = [
    'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Tailwind CSS',
    'UI/UX', 'Figma', 'Adobe Premiere', 'After Effects', 'Photoshop', 'Illustrator',
    'SEO', 'Google Ads', 'Social Media', 'Content Writing', 'Cybersecurity', 'AWS',
    'Docker', 'Kubernetes', 'DevOps', 'Machine Learning', 'Data Analytics', 'SQL',
    'Flutter', 'React Native', 'Java', 'Go', 'GraphQL',
  ];
  const lower = text.toLowerCase();
  return known.filter((k) => lower.includes(k.toLowerCase())).slice(0, 10);
}

export async function searchGoogleJobsUnified(params: {
  query: string;
  country: string;
  location?: string;
  category?: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  jobs: JobListing[];
  error?: string;
}> {
  if (!isProviderEnabled('google_jobs')) {
    return {
      configured: isProviderConfigured('google_jobs'),
      enabled: false,
      jobs: [],
      error: 'Google Jobs API is disabled by admin.',
    };
  }
  const { key: rawKey, resolvedFrom } = getEffectiveProviderKey('google_jobs', ['scrapingdog']);
  if (!rawKey) {
    return {
      configured: false,
      enabled: true,
      jobs: [],
      error: 'GOOGLE_JOBS_API is not configured. Add it in server secrets or Admin Data Sources.',
    };
  }
  if (!canConsumeQuota('google_jobs')) {
    return {
      configured: true,
      enabled: true,
      jobs: [],
      error: 'Daily quota or budget cap reached for Google Jobs API.',
    };
  }

  const cred = parseCredentialFormat(rawKey);
  const trackId: ProviderId = resolvedFrom === 'google_jobs' ? 'google_jobs' : resolvedFrom;
  const { countryCode, googleDomain } = getCountryParams(params.country);
  const fullQuery = `${params.query} ${params.location || ''}`.trim();

  const url = new URL(cred.baseUrl || 'https://api.scrapingdog.com/google_jobs');
  url.searchParams.set('api_key', cred.apiKey);
  url.searchParams.set('query', fullQuery);
  url.searchParams.set('country', countryCode);
  url.searchParams.set('domain', googleDomain);
  url.searchParams.set('language', 'en');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS) });
    if (!res.ok) {
      const text = await res.text();
      const msg = `Google Jobs HTTP ${res.status}: ${text.slice(0, 160)}`;
      recordProviderUsage(trackId, false, 0, msg, { endpoint: 'google_jobs' });
      return { configured: true, enabled: true, jobs: [], error: msg };
    }
    const data = (await res.json()) as { jobs_results?: ScrapingdogJobResult[]; message?: string };
    if (data.message && !data.jobs_results) {
      recordProviderUsage(trackId, false, 0, data.message, { endpoint: 'google_jobs' });
      return { configured: true, enabled: true, jobs: [], error: data.message };
    }
    recordProviderUsage(trackId, true, 5, undefined, {
      endpoint: 'google_jobs',
      confirmedRemainingCredits: extractConfirmedCredits(res),
    });

    const now = new Date().toISOString();
    const raw = Array.isArray(data.jobs_results) ? data.jobs_results : [];

    const jobs: JobListing[] = raw.slice(0, 20).map((job, idx) => {
      const applyLink = job.apply_options?.[0]?.link || job.source_link || job.share_link || '';
      const originalLink = job.source_link || job.share_link || applyLink;
      const desc = (job.description || job.title || '').slice(0, 3500);
      const schedule = job.detected_extensions?.schedule_type || '';
      const requirements = (job.job_highlights || [])
        .flatMap((h) => h.items || [])
        .slice(0, 8);
      return {
        id: sanitizeLeadId('gj', job.job_id, idx),
        externalJobId: job.job_id ? String(job.job_id).slice(0, 120) : undefined,
        title: (job.title || 'Job Opportunity').slice(0, 220),
        company: (job.company_name || 'Company not specified').slice(0, 150),
        description: desc,
        requirements,
        skills: extractSkillsHeuristic(`${job.title || ''} ${desc}`),
        category: params.category || undefined,
        location: (job.location || params.location || 'Not specified').slice(0, 150),
        country: params.country,
        employmentType: normalizeEmploymentType(`${schedule} ${job.title || ''}`),
        workMode: normalizeWorkMode(
          `${job.location || ''} ${desc}`,
          job.detected_extensions?.work_from_home
        ),
        salary: job.detected_extensions?.salary ? job.detected_extensions.salary.slice(0, 110) : 'Not specified',
        postedDate: job.detected_extensions?.posted_at || 'Not specified',
        deadline: 'Not specified',
        sourceProvider: 'Google Jobs',
        originalUrl: (originalLink || '').slice(0, 590) || 'Not available',
        applicationUrl: (applyLink || originalLink || '').slice(0, 590) || 'Not available',
        lastVerifiedAt: now,
        status: 'active',
        isDemo: false,
      };
    });

    return { configured: true, enabled: true, jobs };
  } catch (err) {
    const msg = formatProviderError('Google Jobs API', err, 'Google Jobs request failed');
    recordProviderUsage(trackId, false, 0, msg, { endpoint: 'google_jobs' });
    return { configured: true, enabled: true, jobs: [], error: msg };
  }
}

// Legacy wrapper preserved for existing HiringOpportunitiesView (`/api/discovery/opportunities`)
export async function searchScrapingdogJobs(params: {
  query: string;
  country: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  opportunities: HiringOpportunity[];
  error?: string;
}> {
  const res = await searchGoogleJobsUnified({ query: params.query, country: params.country });
  const opportunities: HiringOpportunity[] = res.jobs.slice(0, 15).map((j) => ({
    id: j.id,
    title: j.title,
    originalText: j.description,
    companyName: j.company !== 'Company not specified' ? j.company : undefined,
    skillsRequired: j.skills,
    budget: j.salary !== 'Not specified' ? j.salary : undefined,
    location: j.location !== 'Not specified' ? j.location : undefined,
    workMode: j.workMode !== 'Not specified' ? j.workMode : undefined,
    publishedAt: j.postedDate !== 'Not specified' ? j.postedDate : undefined,
    sourceName: j.sourceProvider,
    sourceUrl: j.originalUrl,
    aiClassification:
      j.employmentType === 'Freelance'
        ? 'Freelance Project'
        : j.employmentType === 'Contract'
          ? 'Contract Work'
          : j.employmentType === 'Internship'
            ? 'Internship'
            : j.employmentType === 'Part-time'
              ? 'Part-Time Job'
              : 'Full-Time Job',
    confidenceScore: 76,
    isDemo: false,
    discoveredAt: j.lastVerifiedAt,
  }));
  return {
    configured: res.configured,
    enabled: res.enabled,
    opportunities,
    error: res.error,
  };
}

// ============================================================================
// D. LINKEDIN_JOBS_API — Separate LinkedIn Jobs Provider
// ============================================================================

export async function searchLinkedInJobs(params: {
  query: string;
  country: string;
  location?: string;
  category?: string;
  page?: number;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  jobs: JobListing[];
  error?: string;
}> {
  if (!isProviderEnabled('linkedin_jobs')) {
    return {
      configured: isProviderConfigured('linkedin_jobs'),
      enabled: false,
      jobs: [],
      error: 'LinkedIn Jobs API is disabled by admin.',
    };
  }
  const { key: rawKey, resolvedFrom } = getEffectiveProviderKey('linkedin_jobs', ['scrapingdog']);
  if (!rawKey) {
    return {
      configured: false,
      enabled: true,
      jobs: [],
      error: 'LINKEDIN_JOBS_API is not configured. Add it in server secrets or Admin Data Sources.',
    };
  }
  if (!canConsumeQuota('linkedin_jobs')) {
    return {
      configured: true,
      enabled: true,
      jobs: [],
      error: 'Daily quota or budget cap reached for LinkedIn Jobs API.',
    };
  }

  const cred = parseCredentialFormat(rawKey);
  const trackId: ProviderId = resolvedFrom === 'linkedin_jobs' ? 'linkedin_jobs' : resolvedFrom;
  const { linkedinGeoId } = getCountryParams(params.country);

  const url = new URL(cred.baseUrl || 'https://api.scrapingdog.com/linkedinjobs/');
  url.searchParams.set('api_key', cred.apiKey);
  url.searchParams.set('field', params.query);
  url.searchParams.set('geoid', linkedinGeoId);
  if (params.location) {
    url.searchParams.set('location', params.location);
  }
  url.searchParams.set('page', String(params.page ?? 1));

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS) });
    if (!res.ok) {
      const text = await res.text();
      const msg = `LinkedIn Jobs HTTP ${res.status}: ${text.slice(0, 160)}`;
      recordProviderUsage(trackId, false, 0, msg, { endpoint: 'linkedinjobs' });
      return { configured: true, enabled: true, jobs: [], error: msg };
    }
    const payload = (await res.json()) as
      | ScrapingdogLinkedInJobResult[]
      | { jobs?: ScrapingdogLinkedInJobResult[]; data?: ScrapingdogLinkedInJobResult[]; message?: string };

    if (!Array.isArray(payload) && payload.message && !payload.jobs && !payload.data) {
      recordProviderUsage(trackId, false, 0, payload.message, { endpoint: 'linkedinjobs' });
      return { configured: true, enabled: true, jobs: [], error: payload.message };
    }

    recordProviderUsage(trackId, true, 5, undefined, {
      endpoint: 'linkedinjobs',
      confirmedRemainingCredits: extractConfirmedCredits(res),
    });

    const rawList: ScrapingdogLinkedInJobResult[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.jobs)
        ? payload.jobs
        : Array.isArray(payload.data)
          ? payload.data
          : [];

    const now = new Date().toISOString();
    const jobs: JobListing[] = rawList.slice(0, 20).map((item, idx) => {
      const title = (item.job_position || 'LinkedIn Job Opportunity').slice(0, 220);
      const desc = (item.job_description || `${title} at ${item.company_name || 'Hiring Organization'}`).slice(0, 3500);
      const link = (item.job_link || '').slice(0, 590);
      return {
        id: sanitizeLeadId('li_job', item.job_id, idx),
        externalJobId: item.job_id ? String(item.job_id).slice(0, 120) : undefined,
        title,
        company: (item.company_name || 'Company not specified').slice(0, 150),
        description: desc,
        requirements: [],
        skills: extractSkillsHeuristic(`${title} ${desc}`),
        category: params.category || undefined,
        location: (item.job_location || params.location || 'Not specified').slice(0, 150),
        country: params.country,
        employmentType: normalizeEmploymentType(`${item.employment_type || ''} ${title}`),
        workMode: normalizeWorkMode(`${item.job_location || ''} ${title} ${desc}`),
        experienceLevel: item.seniority_level || undefined,
        salary: item.salary ? String(item.salary).slice(0, 110) : 'Not specified',
        postedDate: item.job_posting_date || 'Not specified',
        deadline: 'Not specified',
        sourceProvider: 'LinkedIn Jobs',
        originalUrl: link || 'Not available',
        applicationUrl: link || 'Not available',
        lastVerifiedAt: now,
        status: 'active',
        isDemo: false,
      };
    });

    return { configured: true, enabled: true, jobs };
  } catch (err) {
    const msg = formatProviderError('LinkedIn Jobs API', err, 'LinkedIn Jobs request failed');
    recordProviderUsage(trackId, false, 0, msg, { endpoint: 'linkedinjobs' });
    return { configured: true, enabled: true, jobs: [], error: msg };
  }
}

function computeInitialHeuristicScore(input: {
  hasWebsite: boolean;
  hasPhone: boolean;
  rating?: number;
  reviews?: number;
}): number {
  let score = 45;
  if (!input.hasWebsite) score += 22;
  if (input.hasPhone) score += 10;
  if (typeof input.reviews === 'number' && input.reviews < 40) score += 12;
  else if (typeof input.reviews === 'number' && input.reviews >= 40) score += 6;
  if (typeof input.rating === 'number' && input.rating >= 3.5 && input.rating <= 4.4) score += 8;
  return Math.min(96, Math.max(20, score));
}
