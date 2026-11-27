import type { BusinessLead, HiringOpportunity } from '../../src/types/domain.ts';
import {
  canConsumeQuota,
  getProviderKey,
  isProviderConfigured,
  isProviderEnabled,
  recordProviderUsage,
  sanitizeLeadId,
} from './types.ts';

interface ScrapingdogMapsResult {
  title?: string;
  place_id?: string;
  data_id?: string;
  rating?: number;
  reviews?: number;
  type?: string;
  types?: string[];
  address?: string;
  phone?: string;
  website?: string;
  google_maps_url?: string;
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
  };
  apply_options?: Array<{ title?: string; link?: string }>;
}

function getCountryParams(country: string): { countryCode: string; googleDomain: string } {
  const lower = (country || 'India').toLowerCase();
  if (lower.includes('india')) return { countryCode: 'in', googleDomain: 'google.co.in' };
  if (lower.includes('united kingdom') || lower === 'uk') return { countryCode: 'uk', googleDomain: 'google.co.uk' };
  if (lower.includes('canada')) return { countryCode: 'ca', googleDomain: 'google.ca' };
  if (lower.includes('australia')) return { countryCode: 'au', googleDomain: 'google.com.au' };
  return { countryCode: 'us', googleDomain: 'google.com' };
}

const SCRAPINGDOG_TIMEOUT_MS = 40000;

function formatScrapingdogError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError' || /timeout|aborted/i.test(err.message)) {
      return 'Scrapingdog timed out after 40s while fetching live results. Please retry or narrow your query.';
    }
    return err.message;
  }
  return fallback;
}

export async function searchScrapingdogMaps(params: {
  query: string;
  country: string;
  city: string;
  state?: string;
  category: string;
  service: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  leads: BusinessLead[];
  error?: string;
}> {
  if (!isProviderEnabled('scrapingdog')) {
    return { configured: isProviderConfigured('scrapingdog'), enabled: false, leads: [], error: 'Scrapingdog provider is disabled by admin.' };
  }
  if (!isProviderConfigured('scrapingdog')) {
    return {
      configured: false,
      enabled: true,
      leads: [],
      error: 'SCRAPINGDOG_API_KEY is not configured. Add it in server secrets or Admin Data Sources.',
    };
  }
  if (!canConsumeQuota('scrapingdog')) {
    return {
      configured: true,
      enabled: true,
      leads: [],
      error: 'Daily Scrapingdog quota limit reached for this server instance.',
    };
  }

  const apiKey = getProviderKey('scrapingdog');
  const { countryCode, googleDomain } = getCountryParams(params.country);
  const fullQuery = `${params.query || params.category} in ${params.city}${params.state ? `, ${params.state}` : ''}, ${params.country}`;

  const url = new URL('https://api.scrapingdog.com/google_maps');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', fullQuery);
  url.searchParams.set('country', countryCode);
  url.searchParams.set('domain', googleDomain);
  url.searchParams.set('language', 'en');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS) });
    if (!res.ok) {
      const text = await res.text();
      const msg = `Scrapingdog Maps HTTP ${res.status}: ${text.slice(0, 160)}`;
      recordProviderUsage('scrapingdog', false, 0, msg);
      return { configured: true, enabled: true, leads: [], error: msg };
    }
    const data = (await res.json()) as {
      search_results?: ScrapingdogMapsResult[];
      local_results?: ScrapingdogMapsResult[];
      message?: string;
    };
    if (data.message && !data.search_results && !data.local_results) {
      recordProviderUsage('scrapingdog', false, 0, data.message);
      return { configured: true, enabled: true, leads: [], error: data.message };
    }
    recordProviderUsage('scrapingdog', true, 5);
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
        id: sanitizeLeadId('sd_maps', item.place_id || item.data_id, idx),
        businessName: (item.title || 'Unnamed Business').slice(0, 190),
        category: (item.type || item.types?.[0] || params.category || 'Business').slice(0, 95),
        location: `${params.city}${params.state ? `, ${params.state}` : ''}`.slice(0, 190),
        address: item.address ? item.address.slice(0, 390) : undefined,
        country: params.country,
        state: params.state,
        city: params.city,
        website: item.website ? item.website.slice(0, 390) : undefined,
        publicPhone: item.phone ? item.phone.slice(0, 55) : undefined,
        source: 'Scrapingdog Google Maps',
        sourceUrl: (item.google_maps_url || fallbackMapsUrl || '').slice(0, 590) || undefined,
        providerId: (item.place_id || item.data_id) ? String(item.place_id || item.data_id).slice(0, 130) : undefined,
        latitude: item.gps_coordinates?.latitude,
        longitude: item.gps_coordinates?.longitude,
        rating: item.rating,
        reviewCount: item.reviews,
        hasWebsite,
        hasInstagram: false,
        opportunityScore: baseScore,
        confidenceScore: item.address ? 82 : 65,
        suggestedServices: params.service ? [params.service] : ['Digital Presence Audit'],
        aiExplanation: hasWebsite
          ? `Listed on Google Maps with website (${item.website}). Potential candidate for ${params.service || 'freelance'} optimization.`
          : `Listed on Google Maps without a linked website. Potential opportunity for ${params.service || 'web & digital presence'} services.`,
        isDemo: false,
        status: 'active',
        discoveredAt: now,
      };
    });

    return { configured: true, enabled: true, leads };
  } catch (err) {
    const msg = formatScrapingdogError(err, 'Scrapingdog Maps request failed');
    recordProviderUsage('scrapingdog', false, 0, msg);
    return { configured: true, enabled: true, leads: [], error: msg };
  }
}

export async function searchScrapingdogGoogle(params: {
  query: string;
  country: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  results: ScrapingdogGoogleResult[];
  error?: string;
}> {
  if (!isProviderEnabled('scrapingdog')) {
    return { configured: isProviderConfigured('scrapingdog'), enabled: false, results: [], error: 'Scrapingdog provider is disabled.' };
  }
  if (!isProviderConfigured('scrapingdog')) {
    return {
      configured: false,
      enabled: true,
      results: [],
      error: 'SCRAPINGDOG_API_KEY is not configured.',
    };
  }
  if (!canConsumeQuota('scrapingdog')) {
    return { configured: true, enabled: true, results: [], error: 'Daily Scrapingdog quota reached.' };
  }

  const apiKey = getProviderKey('scrapingdog');
  const { countryCode, googleDomain } = getCountryParams(params.country);
  const url = new URL('https://api.scrapingdog.com/google');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', params.query);
  url.searchParams.set('country', countryCode);
  url.searchParams.set('domain', googleDomain);
  url.searchParams.set('page', '0');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS) });
    if (!res.ok) {
      const text = await res.text();
      const msg = `Scrapingdog Search HTTP ${res.status}: ${text.slice(0, 160)}`;
      recordProviderUsage('scrapingdog', false, 0, msg);
      return { configured: true, enabled: true, results: [], error: msg };
    }
    const data = (await res.json()) as { organic_results?: ScrapingdogGoogleResult[] };
    recordProviderUsage('scrapingdog', true, 5);
    return {
      configured: true,
      enabled: true,
      results: Array.isArray(data.organic_results) ? data.organic_results : [],
    };
  } catch (err) {
    const msg = formatScrapingdogError(err, 'Scrapingdog Search failed');
    recordProviderUsage('scrapingdog', false, 0, msg);
    return { configured: true, enabled: true, results: [], error: msg };
  }
}

export async function searchScrapingdogJobs(params: {
  query: string;
  country: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  opportunities: HiringOpportunity[];
  error?: string;
}> {
  if (!isProviderEnabled('scrapingdog')) {
    return { configured: isProviderConfigured('scrapingdog'), enabled: false, opportunities: [], error: 'Scrapingdog provider is disabled.' };
  }
  if (!isProviderConfigured('scrapingdog')) {
    return {
      configured: false,
      enabled: true,
      opportunities: [],
      error: 'SCRAPINGDOG_API_KEY is not configured.',
    };
  }
  if (!canConsumeQuota('scrapingdog')) {
    return { configured: true, enabled: true, opportunities: [], error: 'Daily Scrapingdog quota reached.' };
  }

  const apiKey = getProviderKey('scrapingdog');
  const { countryCode, googleDomain } = getCountryParams(params.country);
  const url = new URL('https://api.scrapingdog.com/google_jobs');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', params.query);
  url.searchParams.set('country', countryCode);
  url.searchParams.set('domain', googleDomain);
  url.searchParams.set('language', 'en');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(SCRAPINGDOG_TIMEOUT_MS) });
    if (!res.ok) {
      const text = await res.text();
      const msg = `Scrapingdog Jobs HTTP ${res.status}: ${text.slice(0, 160)}`;
      recordProviderUsage('scrapingdog', false, 0, msg);
      return { configured: true, enabled: true, opportunities: [], error: msg };
    }
    const data = (await res.json()) as { jobs_results?: ScrapingdogJobResult[] };
    recordProviderUsage('scrapingdog', true, 5);
    const now = new Date().toISOString();
    const raw = Array.isArray(data.jobs_results) ? data.jobs_results : [];

    const opportunities: HiringOpportunity[] = raw.slice(0, 15).map((job, idx) => {
      const applyLink = job.apply_options?.[0]?.link || job.source_link || job.share_link || '';
      const schedule = job.detected_extensions?.schedule_type || '';
      const isFreelance = /freelance|contract|part-time/i.test(`${job.title || ''} ${schedule} ${job.description || ''}`);
      return {
        id: sanitizeLeadId('sd_job', job.job_id, idx),
        title: (job.title || 'Hiring Requirement').slice(0, 230),
        originalText: (job.description || job.title || '').slice(0, 3500),
        companyName: job.company_name ? job.company_name.slice(0, 150) : undefined,
        requiredService: undefined,
        skillsRequired: [],
        budget: job.detected_extensions?.salary ? job.detected_extensions.salary.slice(0, 110) : undefined,
        location: job.location ? job.location.slice(0, 150) : undefined,
        workMode: /remote/i.test(`${job.location || ''} ${job.description || ''}`) ? 'Remote' : undefined,
        publishedAt: job.detected_extensions?.posted_at || undefined,
        sourceName: (job.via ? `Google Jobs (${job.via})` : 'Scrapingdog Google Jobs').slice(0, 95),
        sourceUrl: (applyLink || 'https://www.google.com/search?q=' + encodeURIComponent(job.title || params.query)).slice(0, 590),
        aiClassification: isFreelance ? 'Contract Work' : 'Full-Time Job',
        confidenceScore: 72,
        isDemo: false,
        discoveredAt: now,
      };
    });

    return { configured: true, enabled: true, opportunities };
  } catch (err) {
    const msg = formatScrapingdogError(err, 'Scrapingdog Jobs failed');
    recordProviderUsage('scrapingdog', false, 0, msg);
    return { configured: true, enabled: true, opportunities: [], error: msg };
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
