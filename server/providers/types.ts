import type { BusinessLead, HiringOpportunity, ProviderHealth, ProviderId } from '../../src/types/domain.ts';

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
  dailyQuotaLimit: number;
  lastSuccessfulSync: string | null;
  lastError: string | null;
  description: string;
}

const providerStates: Record<ProviderId, ProviderState> = {
  scrapingdog: {
    id: 'scrapingdog',
    name: 'Scrapingdog',
    role: 'Primary Discovery',
    enabled: true,
    requiredEnvKey: 'SCRAPINGDOG_API_KEY',
    runtimeKeyOverride: null,
    requestsMade: 0,
    successfulRequests: 0,
    failedRequests: 0,
    creditsConsumed: 0,
    dailyQuotaLimit: 200,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Primary Google Search, Google Maps, and Google Jobs discovery provider.',
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
    dailyQuotaLimit: 500,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Classifies hiring intent, scores opportunities, analyzes businesses, and drafts pitches.',
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
    dailyQuotaLimit: 150,
    lastSuccessfulSync: null,
    lastError: null,
    description: 'Optional supplementary web search for public business and hiring signals.',
  },
};

export function getProviderKey(id: ProviderId): string {
  const state = providerStates[id];
  if (id === 'openstreetmap') return 'PUBLIC_OSM';
  if (id === 'gemini') return (process.env.GEMINI_API_KEY || '').trim();
  if (state.runtimeKeyOverride && state.runtimeKeyOverride.trim()) {
    return state.runtimeKeyOverride.trim();
  }
  return (process.env[state.requiredEnvKey] || '').trim();
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
  return s.requestsMade < s.dailyQuotaLimit;
}

export function recordProviderUsage(
  id: ProviderId,
  success: boolean,
  credits = 1,
  errorMessage?: string
): void {
  const s = providerStates[id];
  s.requestsMade += 1;
  if (success) {
    s.successfulRequests += 1;
    s.creditsConsumed += credits;
    s.lastSuccessfulSync = new Date().toISOString();
    s.lastError = null;
  } else {
    s.failedRequests += 1;
    if (errorMessage) {
      s.lastError = errorMessage.slice(0, 300);
    }
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
    dailyQuotaLimit: s.dailyQuotaLimit,
    lastSuccessfulSync: s.lastSuccessfulSync,
    lastError: s.lastError,
    description: s.description,
  };
}

export function getAllProviderHealth(): ProviderHealth[] {
  return Object.values(providerStates).map(toPublicHealth);
}

// 5-minute search cache to prevent duplicate searches burning API credits
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
      host === '::1' ||
      host === '169.254.169.254' ||
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

    // Check uncertain match by normalized business name alone
    const existingByName = normName ? seenNames.get(normName) : undefined;
    let copy = { ...lead };
    if (existingByName) {
      // Do not auto-merge uncertain matches; flag for review
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
