import type { BusinessLead } from '../../src/types/domain.ts';
import {
  canConsumeQuota,
  getProviderKey,
  isProviderConfigured,
  isProviderEnabled,
  recordProviderUsage,
  sanitizeLeadId,
} from './types.ts';

let lastOsmCallMs = 0;

// OpenStreetMap Nominatim + Overpass (Respects 1 req/sec public policy)
export async function searchOpenStreetMapBusinesses(params: {
  query: string;
  city: string;
  state?: string;
  country: string;
  category: string;
  service: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  leads: BusinessLead[];
  error?: string;
}> {
  if (!isProviderEnabled('openstreetmap')) {
    return { configured: true, enabled: false, leads: [], error: 'OpenStreetMap provider is disabled by admin.' };
  }
  if (!canConsumeQuota('openstreetmap')) {
    return { configured: true, enabled: true, leads: [], error: 'OpenStreetMap daily quota reached.' };
  }

  const nowMs = Date.now();
  const waitMs = Math.max(0, 1100 - (nowMs - lastOsmCallMs));
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }
  lastOsmCallMs = Date.now();

  const searchQ = [params.query || params.category, params.city, params.state, params.country]
    .filter(Boolean)
    .join(', ');
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', searchQ);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('extratags', '1');
  url.searchParams.set('limit', '12');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'ClientHuntAI/1.0 (https://clienthunt.ai)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const msg = `OpenStreetMap HTTP ${res.status}`;
      recordProviderUsage('openstreetmap', false, 0, msg);
      return { configured: true, enabled: true, leads: [], error: msg };
    }
    const rows = (await res.json()) as Array<{
      place_id: number;
      osm_type?: string;
      osm_id?: number;
      display_name: string;
      name?: string;
      type?: string;
      category?: string;
      lat: string;
      lon: string;
      extratags?: Record<string, string>;
    }>;
    recordProviderUsage('openstreetmap', true, 1);
    const nowIso = new Date().toISOString();

    const leads: BusinessLead[] = rows.map((row) => {
      const tags = row.extratags || {};
      const website = tags.website || tags['contact:website'] || undefined;
      const phone = tags.phone || tags['contact:phone'] || undefined;
      const email = tags.email || tags['contact:email'] || undefined;
      const ig = tags['contact:instagram'] || undefined;
      const name = row.name || row.display_name.split(',')[0] || 'Local Place';
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      return {
        id: sanitizeLeadId('osm', row.place_id, row.osm_id || 0),
        businessName: name.slice(0, 190),
        category: (params.category || row.type || row.category || 'Business').slice(0, 95),
        location: `${params.city}${params.state ? `, ${params.state}` : ''}`.slice(0, 190),
        address: row.display_name.slice(0, 390),
        country: params.country,
        state: params.state,
        city: params.city,
        website: website ? website.slice(0, 390) : undefined,
        publicPhone: phone ? phone.slice(0, 55) : undefined,
        publicEmail: email ? email.slice(0, 250) : undefined,
        instagramUrl: ig ? ig.slice(0, 390) : undefined,
        source: 'OpenStreetMap',
        sourceUrl: `https://www.openstreetmap.org/${row.osm_type || 'node'}/${row.osm_id || row.place_id}`.slice(0, 590),
        providerId: `osm_${row.place_id}`.slice(0, 130),
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lon) ? lon : undefined,
        hasWebsite: Boolean(website),
        hasInstagram: Boolean(ig),
        opportunityScore: website ? 58 : 74,
        confidenceScore: 78,
        suggestedServices: params.service ? [params.service] : ['Local SEO', 'Website Development'],
        aiExplanation: website
          ? `Verified OpenStreetMap record with public website (${website}).`
          : `Verified OpenStreetMap listing with no website tag recorded — potential digital presence opportunity.`,
        isDemo: false,
        status: 'active',
        discoveredAt: nowIso,
      };
    });

    return { configured: true, enabled: true, leads };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenStreetMap request failed';
    recordProviderUsage('openstreetmap', false, 0, msg);
    return { configured: true, enabled: true, leads: [], error: msg };
  }
}

export async function searchFoursquarePlaces(params: {
  query: string;
  city: string;
  country: string;
  category: string;
  service: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  leads: BusinessLead[];
  error?: string;
}> {
  if (!isProviderEnabled('foursquare')) {
    return { configured: isProviderConfigured('foursquare'), enabled: false, leads: [] };
  }
  if (!isProviderConfigured('foursquare')) {
    return { configured: false, enabled: true, leads: [], error: 'FOURSQUARE_API_KEY is not configured.' };
  }
  if (!canConsumeQuota('foursquare')) {
    return { configured: true, enabled: true, leads: [], error: 'Foursquare daily quota reached.' };
  }

  const key = getProviderKey('foursquare');
  const url = new URL('https://api.foursquare.com/v3/places/search');
  url.searchParams.set('query', params.query || params.category);
  url.searchParams.set('near', `${params.city}, ${params.country}`);
  url.searchParams.set('limit', '10');
  url.searchParams.set('fields', 'fsq_id,name,categories,location,geocodes,tel,website');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: key,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const msg = `Foursquare HTTP ${res.status}`;
      recordProviderUsage('foursquare', false, 0, msg);
      return { configured: true, enabled: true, leads: [], error: msg };
    }
    const data = (await res.json()) as {
      results?: Array<{
        fsq_id: string;
        name: string;
        categories?: Array<{ name: string }>;
        location?: { formatted_address?: string; locality?: string; region?: string };
        geocodes?: { main?: { latitude?: number; longitude?: number } };
        tel?: string;
        website?: string;
      }>;
    };
    recordProviderUsage('foursquare', true, 1);
    const nowIso = new Date().toISOString();
    const leads: BusinessLead[] = (data.results || []).map((place, idx) => ({
      id: sanitizeLeadId('fsq', place.fsq_id, idx),
      businessName: place.name.slice(0, 190),
      category: (place.categories?.[0]?.name || params.category).slice(0, 95),
      location: (place.location?.locality || params.city).slice(0, 190),
      address: place.location?.formatted_address ? place.location.formatted_address.slice(0, 390) : undefined,
      country: params.country,
      state: place.location?.region,
      city: place.location?.locality || params.city,
      website: place.website ? place.website.slice(0, 390) : undefined,
      publicPhone: place.tel ? place.tel.slice(0, 55) : undefined,
      source: 'Foursquare Places',
      sourceUrl: `https://foursquare.com/v/${place.fsq_id}`.slice(0, 590),
      providerId: place.fsq_id.slice(0, 130),
      latitude: place.geocodes?.main?.latitude,
      longitude: place.geocodes?.main?.longitude,
      hasWebsite: Boolean(place.website),
      hasInstagram: false,
      opportunityScore: place.website ? 62 : 76,
      confidenceScore: 80,
      suggestedServices: params.service ? [params.service] : ['Branding & Content'],
      aiExplanation: `Discovered via Foursquare Places API in ${params.city}.`,
      isDemo: false,
      status: 'active',
      discoveredAt: nowIso,
    }));
    return { configured: true, enabled: true, leads };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Foursquare request failed';
    recordProviderUsage('foursquare', false, 0, msg);
    return { configured: true, enabled: true, leads: [], error: msg };
  }
}

export async function verifyDomainWithHunter(domain: string): Promise<{
  configured: boolean;
  emails: Array<{ email: string; confidence: number; type: string; verificationStatus: 'verified' | 'unverified' }>;
  error?: string;
}> {
  if (!isProviderEnabled('hunter')) {
    return { configured: isProviderConfigured('hunter'), emails: [], error: 'Hunter.io provider is disabled.' };
  }
  if (!isProviderConfigured('hunter')) {
    return { configured: false, emails: [], error: 'HUNTER_API_KEY is not configured.' };
  }
  if (!canConsumeQuota('hunter')) {
    return { configured: true, emails: [], error: 'Hunter.io daily quota reached.' };
  }

  const key = getProviderKey('hunter');
  const url = new URL('https://api.hunter.io/v2/domain-search');
  url.searchParams.set('domain', domain);
  url.searchParams.set('api_key', key);
  url.searchParams.set('limit', '5');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      const msg = `Hunter.io HTTP ${res.status}`;
      recordProviderUsage('hunter', false, 0, msg);
      return { configured: true, emails: [], error: msg };
    }
    const data = (await res.json()) as {
      data?: {
        emails?: Array<{
          value: string;
          confidence: number;
          type?: string;
          verification?: { status?: string };
        }>;
      };
    };
    recordProviderUsage('hunter', true, 1);
    const emails = (data.data?.emails || []).map((e) => ({
      email: e.value,
      confidence: e.confidence,
      type: e.type || 'generic',
      verificationStatus: e.verification?.status === 'valid' ? ('verified' as const) : ('unverified' as const),
    }));
    return { configured: true, emails };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Hunter.io request failed';
    recordProviderUsage('hunter', false, 0, msg);
    return { configured: true, emails: [], error: msg };
  }
}

export async function searchBraveWeb(query: string): Promise<{
  configured: boolean;
  enabled: boolean;
  results: Array<{ title: string; url: string; description: string }>;
  error?: string;
}> {
  if (!isProviderEnabled('brave') || !isProviderConfigured('brave')) {
    return {
      configured: isProviderConfigured('brave'),
      enabled: isProviderEnabled('brave'),
      results: [],
      error: isProviderConfigured('brave') ? 'Brave Search disabled.' : 'BRAVE_SEARCH_API_KEY is not configured.',
    };
  }
  if (!canConsumeQuota('brave')) {
    return { configured: true, enabled: true, results: [], error: 'Brave Search daily quota reached.' };
  }
  const key = getProviderKey('brave');
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '10');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'X-Subscription-Token': key,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const msg = `Brave Search HTTP ${res.status}`;
      recordProviderUsage('brave', false, 0, msg);
      return { configured: true, enabled: true, results: [], error: msg };
    }
    const data = (await res.json()) as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };
    recordProviderUsage('brave', true, 1);
    return {
      configured: true,
      enabled: true,
      results: data.web?.results || [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Brave Search request failed';
    recordProviderUsage('brave', false, 0, msg);
    return { configured: true, enabled: true, results: [], error: msg };
  }
}
