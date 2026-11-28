import type {
  ScholarshipFundingType,
  ScholarshipRecord,
  ScholarshipSourceType,
  ScholarshipVerificationStatus,
} from '../../src/types/domain.ts';
import { isSafePublicUrl, sanitizeLeadId } from './types.ts';
import { searchScrapingdogGoogle } from './scrapingdog.ts';

export function classifyScholarshipSource(rawUrl: string): {
  sourceType: ScholarshipSourceType;
  verificationLabel: ScholarshipVerificationStatus;
} {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (
      host.endsWith('.gov') ||
      host.endsWith('.gov.in') ||
      host.endsWith('.nic.in') ||
      host.endsWith('.gov.uk') ||
      host.endsWith('.gc.ca') ||
      host.endsWith('.gov.au') ||
      host.includes('scholarships.gov.in') ||
      host.includes('nsp.gov.in')
    ) {
      return { sourceType: 'Official Government Portal', verificationLabel: 'Pending Review' };
    }
    if (
      host.endsWith('.edu') ||
      host.endsWith('.edu.in') ||
      host.endsWith('.ac.in') ||
      host.endsWith('.ac.uk') ||
      host.endsWith('.edu.au') ||
      host.includes('university') ||
      host.includes('iit') ||
      host.includes('nit')
    ) {
      return { sourceType: 'Official University Source', verificationLabel: 'Pending Review' };
    }
    if (
      host.endsWith('.org') ||
      host.includes('foundation') ||
      host.includes('trust') ||
      host.includes('fulbright') ||
      host.includes('chevening') ||
      host.includes('daad') ||
      host.includes('inlak') ||
      host.includes('tata') ||
      host.includes('reliancefoundation') ||
      host.includes('buddy4study')
    ) {
      if (host.includes('buddy4study') || host.includes('scholarships.com') || host.includes('fastweb')) {
        return { sourceType: 'Secondary Source', verificationLabel: 'Unverified' };
      }
      return { sourceType: 'Official Scholarship Provider', verificationLabel: 'Pending Review' };
    }
    return { sourceType: 'Secondary Source', verificationLabel: 'Unverified' };
  } catch {
    return { sourceType: 'Unverified Source', verificationLabel: 'Unverified' };
  }
}

function stripHtmlToReadableText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: title.slice(0, 220), text: cleaned.slice(0, 9000) };
}

export async function fetchOfficialScholarshipPageText(
  rawUrl: string
): Promise<{ ok: boolean; title?: string; text?: string; error?: string }> {
  if (!isSafePublicUrl(rawUrl)) {
    return { ok: false, error: 'Blocked unsafe or non-public URL.' };
  }
  try {
    const res = await fetch(rawUrl, {
      headers: {
        'User-Agent': 'ClientHuntAI-ScholarshipVerifier/1.0 (+https://clienthunt.ai)',
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return { ok: false, error: `Source page returned HTTP ${res.status}` };
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('xhtml')) {
      return { ok: false, error: `Unsupported content type (${contentType.slice(0, 40)})` };
    }
    const rawText = await res.text();
    const stripped = stripHtmlToReadableText(rawText.slice(0, 250000));
    if (stripped.text.length < 80) {
      return { ok: false, error: 'Page returned insufficient readable text (may require JS).' };
    }
    return { ok: true, title: stripped.title, text: stripped.text };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch official scholarship page.',
    };
  }
}

export async function discoverScholarshipsViaGoogleSearch(params: {
  query: string;
  country: string;
  state?: string;
  category?: string;
}): Promise<{
  configured: boolean;
  enabled: boolean;
  candidates: Array<{
    title: string;
    link: string;
    snippet: string;
    displayedLink?: string;
    sourceType: ScholarshipSourceType;
    sourceVerificationStatus: ScholarshipVerificationStatus;
  }>;
  error?: string;
}> {
  // Strictly reuse the preserved Scrapingdog Google Search Scraper
  const statePart = params.state && params.state !== 'All' ? ` ${params.state}` : '';
  const searchQuery = `${params.query}${statePart} ${params.country} scholarship official`.trim();
  const res = await searchScrapingdogGoogle({
    query: searchQuery,
    country: params.country || 'India',
  });

  if (!res.configured || !res.enabled || res.error) {
    return {
      configured: res.configured,
      enabled: res.enabled,
      candidates: [],
      error: res.error,
    };
  }

  const seenUrls = new Set<string>();
  const candidates = [];
  for (const r of res.results) {
    if (!r.link || !r.title || !isSafePublicUrl(r.link)) continue;
    const cleanUrl = r.link.split('#')[0];
    if (seenUrls.has(cleanUrl)) continue;
    seenUrls.add(cleanUrl);
    const cls = classifyScholarshipSource(cleanUrl);
    candidates.push({
      title: r.title.slice(0, 220),
      link: cleanUrl,
      snippet: (r.snippet || '').slice(0, 600),
      displayedLink: r.displayed_link,
      sourceType: cls.sourceType,
      sourceVerificationStatus: cls.verificationLabel,
    });
  }

  // Sort official portals/universities ahead of secondary directories
  const rank = (t: ScholarshipSourceType) => {
    if (t === 'Official Government Portal') return 0;
    if (t === 'Official University Source') return 1;
    if (t === 'Official Scholarship Provider') return 2;
    if (t === 'Secondary Source') return 3;
    return 4;
  };
  candidates.sort((a, b) => rank(a.sourceType) - rank(b.sourceType));

  return {
    configured: true,
    enabled: true,
    candidates: candidates.slice(0, 12),
  };
}

export function buildFallbackScholarshipFromSignal(
  candidate: {
    title: string;
    link: string;
    snippet: string;
    sourceType: ScholarshipSourceType;
    sourceVerificationStatus: ScholarshipVerificationStatus;
  },
  defaults: {
    country: string;
    state?: string;
    category?: ScholarshipRecord['category'];
  },
  idx: number
): ScholarshipRecord {
  const now = new Date().toISOString();
  const isOfficial =
    candidate.sourceType === 'Official Government Portal' ||
    candidate.sourceType === 'Official University Source' ||
    candidate.sourceType === 'Official Scholarship Provider';
  let hostname = 'Provider Portal';
  try {
    hostname = new URL(candidate.link).hostname.replace(/^www\./, '');
  } catch {
    // ignore
  }

  const fundingType: ScholarshipFundingType = /full\s*fund|100%\s*tuition|fully\s*funded/i.test(
    `${candidate.title} ${candidate.snippet}`
  )
    ? 'Full Funding'
    : /partial|stipend|grant|tuition/i.test(`${candidate.title} ${candidate.snippet}`)
      ? 'Partial Funding'
      : 'Not specified';

  return {
    id: sanitizeLeadId('sch', hostname, idx),
    title: candidate.title,
    provider: hostname,
    description:
      candidate.snippet ||
      'Discovered via Google Search signal. Open the official source page or run Source Verification to inspect full eligibility details.',
    category:
      defaults.category ||
      (candidate.sourceType === 'Official Government Portal'
        ? 'Government'
        : candidate.sourceType === 'Official University Source'
          ? 'University'
          : 'Private'),
    country: defaults.country || 'India',
    state: defaults.state || 'Not specified',
    eligibleLocations: [defaults.country || 'Not specified'],
    educationLevels: ['Not specified'],
    degrees: ['Not specified'],
    courses: ['Not specified'],
    subjects: ['Not specified'],
    academicRequirements: 'Not specified',
    financialRequirements: 'Not specified',
    otherEligibilityCriteria: 'Verify full eligibility rules directly on the official provider page.',
    amount: 'Not specified',
    currency: 'Not specified',
    fundingType,
    benefits: [],
    startDate: 'Not specified',
    deadline: 'Not specified',
    requiredDocuments: [],
    applicationInstructions: 'Review requirements and apply directly through the linked source URL.',
    officialApplicationUrl: isOfficial ? candidate.link : 'Not specified',
    sourceUrl: candidate.link,
    sourceType: candidate.sourceType,
    sourceVerificationStatus: isOfficial ? 'Pending Review' : 'Unverified',
    publicationDate: 'Not specified',
    lastVerifiedAt: now,
    status: 'Open',
    verifiedFacts: [
      `Search signal title: ${candidate.title}`,
      `Source domain: ${hostname} (${candidate.sourceType})`,
    ],
    isDemo: false,
  };
}
