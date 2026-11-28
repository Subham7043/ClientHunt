import type {
  BusinessLead,
  FailedRequestLog,
  HiringOpportunity,
  JobListing,
  ProviderHealth,
  ProviderId,
} from '../../src/types/domain.ts';

interface ProviderState {
  id: ProviderId;
  name: string;
  role: ProviderHealth['role'];
  enabled: boolean;
  requiredEnvKey: string;
  runtimeKeyOverride: string | null;
  requestsMade: number;
  successfulRequests: number;
  failedRequests: number;
  creditsConsumed: number;
  estimatedCreditsConsumed: number;
  confirmedCreditsRemaining: number | null;
  costNote: string;
  dailyQuotaLimit: number;
  lastSuccessfulSync: string | null;
  lastError: string | null;
  description: string;
}

const providerStates: Record<ProviderId, ProviderState> = {
  google_maps_search: {
    id: 'google_maps_search',
    name: 'Google Maps Search API',
    role: 'Primary Discovery',
    enabled: true,
    requiredEnvKey: 'GOOGLE_MAPS_SEARCH_API',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Estimated (~5 provider credits/search when provider omits credit header)',
    dailyQuotaLimit: 200,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Location, locality & category business discovery via GOOGLE_MAPS_SEARCH_API.',
  },
  google_maps_places: {
    id: 'google_maps_places',
    name: 'Google Maps Places API',
    role: 'Geo & Maps',
    enabled: true,
    requiredEnvKey: 'GOOGLE_MAPS_PLACES_API',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Selective per-lead enrichment (~5 provider credits/place lookup, 24h cached)',
    dailyQuotaLimit: 150,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'On-demand Places enrichment for opening hours, verified address, phone & website.',
  },
  google_jobs: {
    id: 'google_jobs',
    name: 'Google Jobs API',
    role: 'Primary Discovery',
    enabled: true,
    requiredEnvKey: 'GOOGLE_JOBS_API',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Estimated (~5 provider credits/query unless confirmed header returned)',
    dailyQuotaLimit: 200,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Public job & hiring discovery via GOOGLE_JOBS_API.',
  },
  linkedin_jobs: {
    id: 'linkedin_jobs',
    name: 'LinkedIn Jobs API',
    role: 'Primary Discovery',
    enabled: true,
    requiredEnvKey: 'LINKEDIN_JOBS_API',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Estimated (~5 provider credits/query unless confirmed header returned)',
    dailyQuotaLimit: 150,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Additional public hiring & company job discovery via LINKEDIN_JOBS_API.',
  },
  scrapingdog: {
    id: 'scrapingdog',
    name: 'Scrapingdog (Google Search Scraper)',
    role: 'Primary Discovery',
    enabled: true,
    requiredEnvKey: 'SCRAPINGDOG_API_KEY',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Estimated (~5 credits/search; reused for Scholarship Discovery & Maps fallback)',
    dailyQuotaLimit: 250,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Preserved Google Search Scraper (reused for Scholarship Discovery & web verification).',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    role: 'AI Intelligence',
    enabled: true,
    requiredEnvKey: 'GEMINI_API_KEY',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Estimated (~1 request unit per AI inference)',
    dailyQuotaLimit: 500,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'AI Opportunity Engine: eligibility, job matching, lead scoring, NLQ parsing & drafts.',
  },
  openstreetmap: {
    id: 'openstreetmap',
    name: 'OpenStreetMap (Nominatim & Overpass)',
    role: 'Geo & Maps',
    enabled: true,
    requiredEnvKey: 'PUBLIC_OPENSTREETMAP',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Free public API (rate-limited)',
    dailyQuotaLimit: 300,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Public OpenStreetMap geocoding and local POI discovery (1 req/sec policy compliant).',
  },
  foursquare: {
    id: 'foursquare',
    name: 'Foursquare Places API',
    role: 'Supplementary',
    enabled: true,
    requiredEnvKey: 'FOURSQUARE_API_KEY',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Optional supplementary provider',
    dailyQuotaLimit: 150,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Optional supplementary business category and venue metadata provider.',
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter.io',
    role: 'Supplementary',
    enabled: true,
    requiredEnvKey: 'HUNTER_API_KEY',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Optional domain verification credits',
    dailyQuotaLimit: 50,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Optional domain email lookup and verification (displays verification status).',
  },
  brave: {
    id: 'brave',
    name: 'Brave Search API',
    role: 'Supplementary',
    enabled: true,
    requiredEnvKey: 'BRAVE_SEARCH_API_KEY',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    estimatedCreditsConsumed: 0,
    confirmedCreditsRemaining: null,
    costNote: 'Optional supplementary web search',
    dailyQuotaLimit: 150,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Optional supplementary web search for public business and hiring signals.',
  },
};

const failedRequestLogs: FailedRequestLog[] = [];
let globalDailyEstimatedBudgetCap = 2500;

export function getApiBudgetConfig(): {
  dailyEstimatedCreditCap: number;
  totalEstimatedCreditsUsed: number;
} {
  const totalEstimatedCreditsUsed = Object.values(providerStates).reduce(
    (sum, p) => sum + p.estimatedCreditsConsumed,
    0
  );
  return {
    dailyEstimatedCreditCap: globalDailyEstimatedBudgetCap,
    totalEstimatedCreditsUsed,
  };
}

export function setApiBudgetCap(cap: number): number {
  if (Number.isFinite(cap) && cap >= 50 && cap <= 100000) {
    globalDailyEstimatedBudgetCap = Math.floor(cap);
  }
  return globalDailyEstimatedBudgetCap;
}

export function isBudgetCapReached(): boolean {
  const { dailyEstimatedCreditCap, totalEstimatedCreditsUsed } = getApiBudgetConfig();
  return totalEstimatedCreditsUsed >= dailyEstimatedCreditCap;
}

export function getProviderKey(id: ProviderId): string {
  const state = providerStates[id];
  if (id === 'openstreetmap') return 'PUBLIC_OSM';
  if (id === 'gemini') return (process.env.GEMINI_API_KEY || '').trim();
  if (state.runtimeKeyOverride && state.runtimeKeyOverride.trim()) {
    return state.runtimeKeyOverride.trim();
  }
  return (process.env[state.requiredEnvKey] || '').trim();
}

export function getEffectiveProviderKey(
  primaryId: ProviderId,
  fallbackIds: ProviderId[] = []
): { key: string; resolvedFrom: ProviderId } {
  const direct = getProviderKey(primaryId);
  if (direct && !direct.startsWith('MY_')) {
    return { key: direct, resolvedFrom: primaryId };
  }
  for (const fb of fallbackIds) {
    const k = getProviderKey(fb);
    if (k && !k.startsWith('MY_') && isProviderEnabled(fb)) {
      return { key: k, resolvedFrom: fb };
    }
  }
  return { key: '', resolvedFrom: primaryId };
}

export function parseCredentialFormat(rawKey: string): {
  mode: 'google_official' | 'scrapingdog' | 'url_with_key';
  apiKey: string;
  baseUrl?: string;
} {
  const trimmed = rawKey.trim();
  if (trimmed.startsWith('AIza')) {
    return { mode: 'google_official', apiKey: trimmed };
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const extractedKey =
        parsed.searchParams.get('api_key') ||
        parsed.searchParams.get('key') ||
        parsed.searchParams.get('token') ||
        '';
      return {
        mode: extractedKey.startsWith('AIza') ? 'google_official' : 'scrapingdog',
        apiKey: extractedKey || trimmed,
        baseUrl: `${parsed.origin}${parsed.pathname}`,
      };
    } catch {
      return { mode: 'scrapingdog', apiKey: trimmed };
    }
  }
  return { mode: 'scrapingdog', apiKey: trimmed };
}

export function isProviderConfigured(id: ProviderId): boolean {
  if (id === 'openstreetmap') return true;
  const key = getProviderKey(id);
  return Boolean(key && !key.startsWith('MY_'));
}

export function isProviderEnabled(id: ProviderId): boolean {
  return providerStates[id].enabled;
}

export function canConsumeQuota(id: ProviderId): boolean {
  const s = providerStates[id];
  return s.requestsMade < s.dailyQuotaLimit && !isBudgetCapReached();
}

export function recordFailedRequest(id: ProviderId, endpoint: string, errorMessage: string): void {
  const s = providerStates[id];
  failedRequestLogs.unshift({
    id: `fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    providerId: id,
    providerName: s.name,
    endpoint: endpoint.slice(0, 120),
    error: errorMessage.slice(0, 300),
    timestamp: new Date().toISOString(),
  });
  if (failedRequestLogs.length > 100) {
    failedRequestLogs.length = 100;
  }
}

export function getFailedRequestLogs(): FailedRequestLog[] {
  return [...failedRequestLogs];
}

export function recordProviderUsage(
  id: ProviderId,
  success: boolean,
  estimatedCredits = 1,
  errorMessage?: string,
  options?: { endpoint?: string; confirmedRemainingCredits?: number | null }
): void {
  const s = providerStates[id];
  s.requestsMade += 1;
  if (success) {
    s.successfulRequests += 1;
    s.creditsConsumed += estimatedCredits;
    s.estimatedCreditsConsumed += estimatedCredits;
    if (typeof options?.confirmedRemainingCredits === 'number') {
      s.confirmedCreditsRemaining = options.confirmedRemainingCredits;
    }
    s.lastSuccessfulSync = new Date().toISOString();
    s.lastError = null;
  } else {
    s.failedRequests += 1;
    const msg = (errorMessage || 'Unknown provider error').slice(0, 300);
    s.lastError = msg;
    recordFailedRequest(id, options?.endpoint || id, msg);
  }
}

export function updateProviderConfig(
  id: ProviderId,
  updates: { enabled?: boolean; apiKey?: string; dailyQuotaLimit?: number }
): ProviderHealth {
  const s = providerStates[id];
  if (typeof updates.enabled === 'boolean') {
    s.enabled = updates.enabled;
  }
  if (typeof updates.dailyQuotaLimit === 'number' && updates.dailyQuotaLimit >= 1 && updates.dailyQuotaLimit <= 10000) {
    s.dailyQuotaLimit = Math.floor(updates.dailyQuotaLimit);
  }
  // Never allow overriding GEMINI_API_KEY from UI
  if (id !== 'gemini' && id !== 'openstreetmap' && typeof updates.apiKey === 'string') {
    const trimmed = updates.apiKey.trim();
    s.runtimeKeyOverride = trimmed.length > 0 ? trimmed : null;
    if (trimmed.length > 0) {
      s.lastError = null;
    }
  }
  searchCache.clear();
  return toPublicHealth(s);
}

function toPublicHealth(s: ProviderState): ProviderHealth {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    enabled: s.enabled,
    configured: isProviderConfigured(s.id),
    requiredEnvKey: s.requiredEnvKey,
    requestsMade: s.requestsMade,
    successfulRequests: s.successfulRequests,
    failedRequests: s.failedRequests,
    creditsConsumed: s.creditsConsumed,
    estimatedCreditsConsumed: s.estimatedCreditsConsumed,
    confirmedCreditsRemaining: s.confirmedCreditsRemaining,
    costNote: s.costNote,
    dailyQuotaLimit: s.dailyQuotaLimit,
    lastSuccessfulSync: s.lastSuccessfulSync,
    lastError: s.lastError,
    description: s.description,
  };
}

export function getAllProviderHealth(): ProviderHealth[] {
  return Object.values(providerStates).map(toPublicHealth);
}

// 5-minute search cache (+ optional longer TTL for Places enrichment)
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const searchCache = new Map<string, CacheEntry<any>>();

export function getCachedResult<T>(key: string): T | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCachedResult<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
  searchCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function clearSearchCache(): void {
  searchCache.clear();
}

// SSRF guard for external URLs
export function isSafePublicUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Sanitize external IDs so they satisfy Firestore ^[a-zA-Z0-9_-]+$ (max 128 chars)
export function sanitizeLeadId(prefix: string, raw: string | number | undefined, fallback: string | number): string {
  const cleanRaw = String(raw ?? fallback)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
  const ts = Date.now().toString(36);
  return `${prefix}_${cleanRaw || String(fallback)}_${ts}`.slice(0, 120);
}

// Deduplication helpers
export function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt|ltd|llp|inc|llc|co|company|jaipur|rajasthan|india)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function extractDomain(url?: string): string {
  if (!url) return '';
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function deduplicateBusinessLeads(leads: BusinessLead[]): {
  results: BusinessLead[];
  duplicatesRemoved: number;
  flaggedCount: number;
} {
  const seenExact = new Map<string, BusinessLead>();
  const seenNames = new Map<string, BusinessLead>();
  const results: BusinessLead[] = [];
  let duplicatesRemoved = 0;
  let flaggedCount = 0;

  for (const lead of leads) {
    const domain = extractDomain(lead.website);
    const normName = normalizeBusinessName(lead.businessName);
    const exactKey = lead.providerId
      ? `pid:${lead.providerId}`
      : domain
        ? `dom:${domain}:${normName}`
        : lead.sourceUrl
          ? `url:${lead.sourceUrl}`
          : '';

    if (exactKey && seenExact.has(exactKey)) {
      duplicatesRemoved += 1;
      continue;
    }

    const existingByName = normName ? seenNames.get(normName) : undefined;
    const copy = { ...lead };
    if (existingByName) {
      copy.possibleDuplicate = true;
      copy.duplicateReason = `Matches normalized name "${existingByName.businessName}" from ${existingByName.source}`;
      flaggedCount += 1;
    }

    if (exactKey) seenExact.set(exactKey, copy);
    if (normName && !seenNames.has(normName)) seenNames.set(normName, copy);
    results.push(copy);
  }

  return { results, duplicatesRemoved, flaggedCount };
}

export function deduplicateOpportunities(items: HiringOpportunity[]): HiringOpportunity[] {
  const seen = new Set<string>();
  const out: HiringOpportunity[] = [];
  for (const item of items) {
    const key = `${item.sourceUrl}::${item.title.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function deduplicateJobListings(jobs: JobListing[]): {
  results: JobListing[];
  duplicatesRemoved: number;
  flaggedCount: number;
} {
  const seenExact = new Set<string>();
  const seenTitleCompany = new Map<string, JobListing>();
  const results: JobListing[] = [];
  let duplicatesRemoved = 0;
  let flaggedCount = 0;

  for (const job of jobs) {
    const normTitle = job.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normCompany = job.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normLoc = job.location.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanUrl = (job.originalUrl || '').split('?')[0].toLowerCase();

    const exactKeys = [
      job.externalJobId ? `ext:${job.externalJobId}` : '',
      cleanUrl && cleanUrl !== 'https://www.google.com/search' ? `url:${cleanUrl}` : '',
      `tc:${normTitle}:${normCompany}:${normLoc}`,
    ].filter(Boolean);

    if (exactKeys.some((k) => seenExact.has(k))) {
      duplicatesRemoved += 1;
      continue;
    }

    const tcKey = `${normTitle}:${normCompany}`;
    const existingTc = seenTitleCompany.get(tcKey);
    const copy = { ...job };
    if (existingTc) {
      copy.possibleDuplicate = true;
      copy.duplicateReason = `Similar title & company also listed via ${existingTc.sourceProvider}`;
      flaggedCount += 1;
    }

    exactKeys.forEach((k) => seenExact.add(k));
    if (!seenTitleCompany.has(tcKey)) seenTitleCompany.set(tcKey, copy);
    results.push(copy);
  }

  return { results, duplicatesRemoved, flaggedCount };
}
