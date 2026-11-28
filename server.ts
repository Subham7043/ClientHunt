import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createRateLimiter, requireAdmin, requireAuth } from './server/auth.ts';
import {
  analyzeBusinessWithGemini,
  classifyHiringPosts,
  evaluateScholarshipEligibility,
  extractScholarshipFromPageText,
  generateJobApplicationDraft,
  generatePitchWithGemini,
  getAiTelemetry,
  matchJobToFreelancer,
  parseScholarshipNaturalLanguageQuery,
} from './server/ai.ts';
import {
  enrichPlaceWithGoogleMapsPlaces,
  searchGoogleJobsUnified,
  searchLinkedInJobs,
  searchScrapingdogGoogle,
  searchScrapingdogJobs,
  searchScrapingdogMaps,
} from './server/providers/scrapingdog.ts';
import {
  buildFallbackScholarshipFromSignal,
  classifyScholarshipSource,
  discoverScholarshipsViaGoogleSearch,
  fetchOfficialScholarshipPageText,
} from './server/providers/scholarships.ts';
import {
  searchBraveWeb,
  searchFoursquarePlaces,
  searchOpenStreetMapBusinesses,
  verifyDomainWithHunter,
} from './server/providers/secondary.ts';
import {
  deduplicateBusinessLeads,
  deduplicateJobListings,
  deduplicateOpportunities,
  extractDomain,
  getAllProviderHealth,
  getApiBudgetConfig,
  getCachedResult,
  getFailedRequestLogs,
  isProviderConfigured,
  isProviderEnabled,
  isSafePublicUrl,
  sanitizeLeadId,
  setApiBudgetCap,
  setCachedResult,
  updateProviderConfig,
} from './server/providers/types.ts';
import type {
  BusinessLead,
  EducationInstitution,
  HiringOpportunity,
  JobListing,
  ProviderId,
  ScholarshipRecord,
} from './src/types/domain.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

const discoveryLimiter = createRateLimiter('discovery', 20, 60 * 1000);
const aiLimiter = createRateLimiter('ai', 25, 60 * 1000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Public provider readiness flags (never exposes keys)
  app.get('/api/providers/public-status', (_req, res) => {
    res.json({
      googleMapsSearchConfigured:
        (isProviderConfigured('google_maps_search') && isProviderEnabled('google_maps_search')) ||
        (isProviderConfigured('scrapingdog') && isProviderEnabled('scrapingdog')),
      googleMapsPlacesConfigured:
        (isProviderConfigured('google_maps_places') && isProviderEnabled('google_maps_places')) ||
        (isProviderConfigured('google_maps_search') && isProviderEnabled('google_maps_search')) ||
        (isProviderConfigured('scrapingdog') && isProviderEnabled('scrapingdog')),
      googleJobsConfigured:
        (isProviderConfigured('google_jobs') && isProviderEnabled('google_jobs')) ||
        (isProviderConfigured('scrapingdog') && isProviderEnabled('scrapingdog')),
      linkedinJobsConfigured:
        (isProviderConfigured('linkedin_jobs') && isProviderEnabled('linkedin_jobs')) ||
        (isProviderConfigured('scrapingdog') && isProviderEnabled('scrapingdog')),
      scrapingdogConfigured: isProviderConfigured('scrapingdog') && isProviderEnabled('scrapingdog'),
      openstreetmapEnabled: isProviderEnabled('openstreetmap'),
      foursquareConfigured: isProviderConfigured('foursquare') && isProviderEnabled('foursquare'),
      hunterConfigured: isProviderConfigured('hunter') && isProviderEnabled('hunter'),
      braveConfigured: isProviderConfigured('brave') && isProviderEnabled('brave'),
      geminiConfigured: isProviderConfigured('gemini') && isProviderEnabled('gemini'),
    });
  });

  // =========================================================================
  // 1. BUSINESS LEAD DISCOVERY & SELECTIVE PLACES ENRICHMENT
  // =========================================================================
  app.post('/api/discovery/businesses', requireAuth, discoveryLimiter, async (req, res) => {
    try {
      const {
        query = '',
        country = 'India',
        state = 'Rajasthan',
        city = 'Jaipur',
        area = '',
        locality = '',
        category = 'Restaurants',
        service = 'Social Media Management',
        includeOsm = true,
        includeFoursquare = false,
      } = req.body || {};

      const cleanCity = String(city).trim().slice(0, 80) || 'Jaipur';
      const cleanCategory = String(category).trim().slice(0, 80) || 'Businesses';
      const cleanService = String(service).trim().slice(0, 100);
      const cleanLocality = String(locality || area).trim().slice(0, 80);
      const locationCity = cleanLocality ? `${cleanLocality}, ${cleanCity}` : cleanCity;
      const searchQuery = String(query).trim().slice(0, 120) || cleanCategory;

      const providerStateKey = `${isProviderConfigured('google_maps_search')}:${isProviderEnabled('google_maps_search')}:${isProviderConfigured('scrapingdog')}:${isProviderEnabled('scrapingdog')}`;
      const cacheKey = `biz:${providerStateKey}:${country}:${state}:${locationCity}:${searchQuery}:${cleanService}:${includeOsm}:${includeFoursquare}`;
      const cached = getCachedResult<any>(cacheKey);
      if (cached) {
        res.json({ ...cached, cached: true });
        return;
      }

      const providerMessages: Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }> = [];
      let allLeads: BusinessLead[] = [];

      const [mapsResult, osmResult, fsqResult] = await Promise.all([
        searchScrapingdogMaps({
          query: searchQuery,
          country: String(country),
          state: String(state),
          city: cleanCity,
          locality: cleanLocality || undefined,
          category: cleanCategory,
          service: cleanService,
        }),
        includeOsm
          ? searchOpenStreetMapBusinesses({
              query: searchQuery,
              city: locationCity,
              state: String(state),
              country: String(country),
              category: cleanCategory,
              service: cleanService,
            })
          : Promise.resolve(null),
        includeFoursquare && isProviderConfigured('foursquare')
          ? searchFoursquarePlaces({
              query: searchQuery,
              city: locationCity,
              country: String(country),
              category: cleanCategory,
              service: cleanService,
            })
          : Promise.resolve(null),
      ]);

      providerMessages.push({
        provider: 'Google Maps Search',
        configured: mapsResult.configured,
        enabled: mapsResult.enabled,
        error: mapsResult.error,
      });
      allLeads = allLeads.concat(mapsResult.leads);

      if (osmResult) {
        providerMessages.push({
          provider: 'OpenStreetMap',
          configured: osmResult.configured,
          enabled: osmResult.enabled,
          error: osmResult.error,
        });
        allLeads = allLeads.concat(osmResult.leads);
      }

      if (fsqResult) {
        providerMessages.push({
          provider: 'Foursquare',
          configured: fsqResult.configured,
          enabled: fsqResult.enabled,
          error: fsqResult.error,
        });
        allLeads = allLeads.concat(fsqResult.leads);
      }

      const deduped = deduplicateBusinessLeads(allLeads);
      const payload = {
        leads: deduped.results,
        duplicatesRemoved: deduped.duplicatesRemoved,
        flaggedCount: deduped.flaggedCount,
        providers: providerMessages,
        cached: false,
      };

      if (deduped.results.length > 0) {
        setCachedResult(cacheKey, payload);
      }
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Business discovery failed.',
      });
    }
  });

  // Selective Places enrichment (conserves API credits by running on user-selected leads only)
  app.post('/api/discovery/places-enrich', requireAuth, discoveryLimiter, async (req, res) => {
    try {
      const { leadId, providerId, dataId, businessName, city, country } = req.body || {};
      if (!businessName) {
        res.status(400).json({ error: 'Business name is required for Places enrichment.' });
        return;
      }
      const result = await enrichPlaceWithGoogleMapsPlaces({
        leadId: leadId ? String(leadId) : undefined,
        providerId: providerId ? String(providerId) : undefined,
        dataId: dataId ? String(dataId) : undefined,
        businessName: String(businessName).slice(0, 180),
        city: city ? String(city).slice(0, 80) : undefined,
        country: country ? String(country).slice(0, 80) : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Places enrichment failed.',
      });
    }
  });

  // =========================================================================
  // 2. PRESERVED HIRING OPPORTUNITY DETECTION ENGINE
  // =========================================================================
  app.post('/api/discovery/opportunities', requireAuth, discoveryLimiter, async (req, res) => {
    try {
      const {
        keywords = 'Looking for a freelance video editor',
        location = 'Jaipur, India',
        country = 'India',
        classifyWithAi = true,
      } = req.body || {};

      const cleanKeywords = String(keywords).trim().slice(0, 140);
      if (!cleanKeywords) {
        res.status(400).json({ error: 'Search keywords are required.' });
        return;
      }
      const cleanLocation = String(location).trim().slice(0, 100);
      const sdState = `${isProviderConfigured('scrapingdog')}:${isProviderEnabled('scrapingdog')}:${isProviderConfigured('google_jobs')}`;
      const cacheKey = `opp:${sdState}:${country}:${cleanLocation}:${cleanKeywords}:${classifyWithAi}`;
      const cached = getCachedResult<any>(cacheKey);
      if (cached) {
        res.json({ ...cached, cached: true });
        return;
      }

      const providerMessages: Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }> = [];
      let opportunities: HiringOpportunity[] = [];
      const rawPostsForAi: Array<{ title: string; snippet: string; link: string; sourceName: string }> = [];

      const [jobsRes, searchRes, braveRes] = await Promise.all([
        searchScrapingdogJobs({
          query: `${cleanKeywords} ${cleanLocation}`.trim(),
          country: String(country),
        }),
        searchScrapingdogGoogle({
          query: `"${cleanKeywords}" ${cleanLocation} (freelance OR contract OR project)`.trim(),
          country: String(country),
        }),
        isProviderConfigured('brave') && isProviderEnabled('brave')
          ? searchBraveWeb(`${cleanKeywords} ${cleanLocation} freelance`)
          : Promise.resolve(null),
      ]);

      providerMessages.push({
        provider: 'Google Jobs',
        configured: jobsRes.configured,
        enabled: jobsRes.enabled,
        error: jobsRes.error,
      });
      for (const job of jobsRes.opportunities) {
        rawPostsForAi.push({
          title: job.title,
          snippet: `${job.companyName ? `Company: ${job.companyName}. ` : ''}${job.location ? `Location: ${job.location}. ` : ''}${job.budget ? `Budget: ${job.budget}. ` : ''}${job.originalText}`,
          link: job.sourceUrl,
          sourceName: job.sourceName,
        });
      }

      providerMessages.push({
        provider: 'Scrapingdog Google Search',
        configured: searchRes.configured,
        enabled: searchRes.enabled,
        error: searchRes.error,
      });
      for (const r of searchRes.results.slice(0, 8)) {
        if (r.title && r.link) {
          rawPostsForAi.push({
            title: r.title,
            snippet: r.snippet || r.title,
            link: r.link,
            sourceName: r.displayed_link || 'Google Search',
          });
        }
      }

      if (braveRes) {
        providerMessages.push({
          provider: 'Brave Search',
          configured: braveRes.configured,
          enabled: braveRes.enabled ?? true,
          error: braveRes.error,
        });
        for (const r of braveRes.results.slice(0, 5)) {
          rawPostsForAi.push({
            title: r.title,
            snippet: r.description || r.title,
            link: r.url,
            sourceName: 'Brave Search',
          });
        }
      }

      const now = new Date().toISOString();
      if (rawPostsForAi.length > 0 && classifyWithAi && isProviderConfigured('gemini') && isProviderEnabled('gemini')) {
        try {
          const classified = await classifyHiringPosts(rawPostsForAi.slice(0, 12));
          opportunities = rawPostsForAi.slice(0, 12).map((raw, i) => {
            const c = classified[i];
            return {
              id: `opp_${i}_${Date.now()}`,
              title: c?.title || raw.title,
              originalText: raw.snippet,
              companyName: c?.companyName || undefined,
              requiredService: c?.requiredService || cleanKeywords,
              skillsRequired: Array.isArray(c?.skillsRequired) ? c.skillsRequired.slice(0, 10) : [],
              budget: c?.budget || undefined,
              location: c?.location || undefined,
              workMode: c?.workMode || undefined,
              deadline: c?.deadline || undefined,
              sourceName: raw.sourceName,
              sourceUrl: raw.link,
              aiClassification: c?.aiClassification || 'Freelance Project',
              confidenceScore: Math.min(100, Math.max(0, Number(c?.confidenceScore) || 70)),
              isDemo: false,
              discoveredAt: now,
            };
          });
        } catch {
          opportunities = jobsRes.opportunities;
        }
      } else {
        opportunities = jobsRes.opportunities;
      }

      const deduped = deduplicateOpportunities(opportunities);
      const payload = {
        opportunities: deduped,
        providers: providerMessages,
        cached: false,
      };
      if (deduped.length > 0) {
        setCachedResult(cacheKey, payload);
      }
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Opportunity discovery failed.',
      });
    }
  });

  // =========================================================================
  // 3. UNIFIED JOB & PROJECT DISCOVERY (Google Jobs + LinkedIn Jobs)
  // =========================================================================
  app.post('/api/discovery/jobs', requireAuth, discoveryLimiter, async (req, res) => {
    try {
      const {
        query = 'Web Development',
        category = '',
        country = 'India',
        location = 'Jaipur, India',
        includeGoogleJobs = true,
        includeLinkedInJobs = true,
        page = 1,
      } = req.body || {};

      const cleanQuery = String(query || category).trim().slice(0, 140);
      if (!cleanQuery) {
        res.status(400).json({ error: 'Job title, skill, or category is required.' });
        return;
      }
      const cleanLocation = String(location).trim().slice(0, 100);
      const cleanCountry = String(country).trim().slice(0, 60) || 'India';
      const stateKey = `${isProviderConfigured('google_jobs')}:${isProviderConfigured('linkedin_jobs')}:${isProviderConfigured('scrapingdog')}`;
      const cacheKey = `jobs_unified:${stateKey}:${cleanCountry}:${cleanLocation}:${cleanQuery}:${includeGoogleJobs}:${includeLinkedInJobs}:${page}`;
      const cached = getCachedResult<any>(cacheKey);
      if (cached) {
        res.json({ ...cached, cached: true });
        return;
      }

      const [googleRes, linkedinRes] = await Promise.all([
        includeGoogleJobs
          ? searchGoogleJobsUnified({
              query: cleanQuery,
              country: cleanCountry,
              location: cleanLocation,
              category: category ? String(category) : undefined,
            })
          : Promise.resolve(null),
        includeLinkedInJobs
          ? searchLinkedInJobs({
              query: cleanQuery,
              country: cleanCountry,
              location: cleanLocation,
              category: category ? String(category) : undefined,
              page: Number(page) || 1,
            })
          : Promise.resolve(null),
      ]);

      const providers: Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }> = [];
      let allJobs: JobListing[] = [];

      if (googleRes) {
        providers.push({
          provider: 'Google Jobs',
          configured: googleRes.configured,
          enabled: googleRes.enabled,
          error: googleRes.error,
        });
        allJobs = allJobs.concat(googleRes.jobs);
      }

      if (linkedinRes) {
        providers.push({
          provider: 'LinkedIn Jobs',
          configured: linkedinRes.configured,
          enabled: linkedinRes.enabled,
          error: linkedinRes.error,
        });
        allJobs = allJobs.concat(linkedinRes.jobs);
      }

      const deduped = deduplicateJobListings(allJobs);
      const payload = {
        jobs: deduped.results,
        duplicatesRemoved: deduped.duplicatesRemoved,
        flaggedCount: deduped.flaggedCount,
        providers,
        cached: false,
      };
      if (deduped.results.length > 0) {
        setCachedResult(cacheKey, payload);
      }
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unified job discovery failed.',
      });
    }
  });

  // =========================================================================
  // 4. SCHOLARSHIP DISCOVERY (Strictly reuses Scrapingdog Google Search Scraper)
  // =========================================================================
  app.post('/api/discovery/scholarships', requireAuth, discoveryLimiter, async (req, res) => {
    try {
      const {
        naturalQuery = '',
        query = '',
        country = 'India',
        state = 'All',
        category = '',
        verifyOfficialPages = true,
        studentProfile = null,
      } = req.body || {};

      let parsedNlq = null;
      let effectiveQuery = String(query).trim().slice(0, 160);
      let effectiveCountry = String(country).trim().slice(0, 60) || 'India';
      let effectiveState = String(state).trim().slice(0, 60) || 'All';

      if (naturalQuery && String(naturalQuery).trim()) {
        parsedNlq = await parseScholarshipNaturalLanguageQuery(
          String(naturalQuery).trim().slice(0, 300),
          studentProfile
        );
        effectiveQuery = parsedNlq.targetedQuery || String(naturalQuery).trim().slice(0, 160);
        effectiveCountry = parsedNlq.country || effectiveCountry;
        effectiveState = parsedNlq.state || effectiveState;
      }

      if (!effectiveQuery) {
        effectiveQuery = 'government merit postgraduate scholarships';
      }

      const sdState = `${isProviderConfigured('scrapingdog')}:${isProviderEnabled('scrapingdog')}`;
      const cacheKey = `sch:${sdState}:${effectiveCountry}:${effectiveState}:${category}:${effectiveQuery}:${verifyOfficialPages}`;
      const cached = getCachedResult<any>(cacheKey);
      if (cached) {
        res.json({ ...cached, parsedNlq, cached: true });
        return;
      }

      const discovery = await discoverScholarshipsViaGoogleSearch({
        query: effectiveQuery,
        country: effectiveCountry,
        state: effectiveState,
        category: category ? String(category) : undefined,
      });

      const providers = [
        {
          provider: 'Scrapingdog Google Search Scraper',
          configured: discovery.configured,
          enabled: discovery.enabled,
          error: discovery.error,
        },
      ];

      if (discovery.candidates.length === 0) {
        res.json({
          scholarships: [],
          parsedNlq,
          providers,
          cached: false,
        });
        return;
      }

      const geminiReady = isProviderConfigured('gemini') && isProviderEnabled('gemini');
      const now = new Date().toISOString();

      // Selectively verify top official candidates by reading the real source page
      const scholarships: ScholarshipRecord[] = await Promise.all(
        discovery.candidates.map(async (cand, idx) => {
          const fallback = buildFallbackScholarshipFromSignal(
            cand,
            {
              country: effectiveCountry,
              state: effectiveState !== 'All' ? effectiveState : undefined,
              category: (category as ScholarshipRecord['category']) || undefined,
            },
            idx
          );

          const shouldFetchOfficial =
            verifyOfficialPages &&
            idx < 4 &&
            cand.sourceType !== 'Secondary Source' &&
            cand.sourceType !== 'Unverified Source';

          if (!shouldFetchOfficial) {
            return fallback;
          }

          const page = await fetchOfficialScholarshipPageText(cand.link);
          if (!page.ok || !page.text || !geminiReady) {
            return fallback;
          }

          try {
            const extracted = await extractScholarshipFromPageText({
              url: cand.link,
              pageTitle: page.title || cand.title,
              pageText: page.text,
              sourceType: cand.sourceType,
              countryHint: effectiveCountry,
              stateHint: effectiveState,
            });
            return {
              ...fallback,
              ...extracted,
              id: fallback.id,
              officialApplicationUrl: cand.link,
              sourceUrl: cand.link,
              sourceType: cand.sourceType,
              sourceVerificationStatus:
                cand.sourceType === 'Official Government Portal' ||
                cand.sourceType === 'Official University Source' ||
                cand.sourceType === 'Official Scholarship Provider'
                  ? 'Verified'
                  : 'Pending Review',
              lastVerifiedAt: now,
              aiMatchReason: parsedNlq?.intentExplanation || undefined,
              isDemo: false,
            };
          } catch {
            return fallback;
          }
        })
      );

      const payload = {
        scholarships,
        parsedNlq,
        providers,
        cached: false,
      };
      if (scholarships.length > 0) {
        setCachedResult(cacheKey, payload);
      }
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Scholarship discovery failed.',
      });
    }
  });

  // On-demand single official source verification
  app.post('/api/scholarships/verify-source', requireAuth, discoveryLimiter, async (req, res) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      if (!rawUrl || !isSafePublicUrl(rawUrl)) {
        res.status(400).json({ error: 'A valid public https/http official scholarship URL is required.' });
        return;
      }
      const cls = classifyScholarshipSource(rawUrl);
      const page = await fetchOfficialScholarshipPageText(rawUrl);
      if (!page.ok || !page.text) {
        res.json({
          ok: false,
          sourceType: cls.sourceType,
          verificationStatus: 'Unverified',
          error: page.error || 'Could not read page content.',
        });
        return;
      }

      let extracted: Partial<ScholarshipRecord> = {};
      if (isProviderConfigured('gemini') && isProviderEnabled('gemini')) {
        extracted = await extractScholarshipFromPageText({
          url: rawUrl,
          pageTitle: page.title || 'Scholarship Portal',
          pageText: page.text,
          sourceType: cls.sourceType,
        });
      }

      res.json({
        ok: true,
        sourceType: cls.sourceType,
        verificationStatus:
          cls.sourceType === 'Official Government Portal' ||
          cls.sourceType === 'Official University Source' ||
          cls.sourceType === 'Official Scholarship Provider'
            ? 'Verified'
            : 'Pending Review',
        extracted,
        lastVerifiedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Source verification failed.',
      });
    }
  });

  // Educational Institution Directory lookup (uses Google Maps Search ONLY for institutions, never as scholarship listings)
  app.post('/api/discovery/institutions', requireAuth, discoveryLimiter, async (req, res) => {
    try {
      const { query = 'Universities and Colleges', city = 'Jaipur', state = 'Rajasthan', country = 'India' } =
        req.body || {};
      const mapsRes = await searchScrapingdogMaps({
        query: String(query).slice(0, 100),
        country: String(country),
        city: String(city),
        state: String(state),
        category: 'Schools and colleges',
        service: 'Education Institution Lookup',
      });
      const institutions: EducationInstitution[] = mapsRes.leads.map((l, idx) => ({
        id: sanitizeLeadId('edu_inst', l.providerId, idx),
        name: l.businessName,
        category: l.category,
        address: l.address,
        city: l.city || String(city),
        country: l.country || String(country),
        website: l.website,
        source: l.source,
        sourceUrl: l.sourceUrl,
        rating: l.rating,
      }));
      res.json({
        institutions,
        configured: mapsRes.configured,
        error: mapsRes.error,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Institution lookup failed.',
      });
    }
  });

  // Optional Hunter.io email verification enrichment
  app.post('/api/discovery/enrich-email', requireAuth, discoveryLimiter, async (req, res) => {
    try {
      const domain = extractDomain(String(req.body?.website || req.body?.domain || ''));
      if (!domain) {
        res.status(400).json({ error: 'A valid business website or domain is required.' });
        return;
      }
      const result = await verifyDomainWithHunter(domain);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Email enrichment failed.' });
    }
  });

  // =========================================================================
  // 5. AI OPPORTUNITY ENGINE ENDPOINTS
  // =========================================================================
  app.post('/api/ai/analyze-business', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { lead, service = 'Digital & Creative Services' } = req.body || {};
      if (!lead || !lead.businessName) {
        res.status(400).json({ error: 'Business lead payload is required.' });
        return;
      }
      const analysis = await analyzeBusinessWithGemini(lead, String(service).slice(0, 120));
      res.json({ analysis });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'AI business analysis failed.',
      });
    }
  });

  app.post('/api/ai/generate-pitch', requireAuth, aiLimiter, async (req, res) => {
    try {
      const {
        targetName,
        targetContext,
        service,
        skills = [],
        portfolioLink = '',
        channel = 'Email',
        tone = 'Professional',
      } = req.body || {};

      if (!targetName || !service) {
        res.status(400).json({ error: 'Target name and freelancer service are required.' });
        return;
      }

      const draft = await generatePitchWithGemini({
        targetName: String(targetName).slice(0, 200),
        targetContext: String(targetContext || '').slice(0, 2000),
        service: String(service).slice(0, 120),
        skills: Array.isArray(skills) ? skills.map(String).slice(0, 15) : [],
        portfolioLink: String(portfolioLink).slice(0, 400),
        channel,
        tone,
      });
      res.json(draft);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Pitch generation failed.',
      });
    }
  });

  app.post('/api/ai/scholarship-eligibility', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { studentProfile, scholarship } = req.body || {};
      if (!scholarship || !scholarship.title) {
        res.status(400).json({ error: 'Scholarship record is required for eligibility evaluation.' });
        return;
      }
      const result = await evaluateScholarshipEligibility(studentProfile || {}, scholarship);
      res.json({ result });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Eligibility check failed.',
      });
    }
  });

  app.post('/api/ai/match-job', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { profile, job } = req.body || {};
      if (!job || !job.title) {
        res.status(400).json({ error: 'Job listing is required.' });
        return;
      }
      const match = await matchJobToFreelancer(profile || {}, job);
      res.json({ match });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Job match analysis failed.',
      });
    }
  });

  app.post('/api/ai/job-application-draft', requireAuth, aiLimiter, async (req, res) => {
    try {
      const { profile, job, format = 'Cover Letter' } = req.body || {};
      if (!job || !job.title) {
        res.status(400).json({ error: 'Job listing is required.' });
        return;
      }
      const draft = await generateJobApplicationDraft(profile || {}, job, format);
      res.json(draft);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Job draft generation failed.',
      });
    }
  });

  // =========================================================================
  // 6. ADMIN PROVIDER MANAGEMENT, BUDGET CONTROLS & FAILED LOGS
  // =========================================================================
  app.get('/api/admin/providers', requireAuth, requireAdmin, (_req, res) => {
    res.json({
      providers: getAllProviderHealth(),
      budget: getApiBudgetConfig(),
      failedLogs: getFailedRequestLogs(),
    });
  });

  app.post('/api/admin/budget', requireAuth, requireAdmin, (req, res) => {
    const cap = Number(req.body?.dailyEstimatedCreditCap);
    if (!Number.isFinite(cap) || cap < 50 || cap > 100000) {
      res.status(400).json({ error: 'Budget cap must be between 50 and 100,000 credits.' });
      return;
    }
    const updated = setApiBudgetCap(cap);
    res.json({ dailyEstimatedCreditCap: updated, budget: getApiBudgetConfig() });
  });

  app.post('/api/admin/providers/:id', requireAuth, requireAdmin, (req, res) => {
    const id = req.params.id as ProviderId;
    const validIds: ProviderId[] = [
      'google_maps_search',
      'google_maps_places',
      'google_jobs',
      'linkedin_jobs',
      'scrapingdog',
      'gemini',
      'openstreetmap',
      'foursquare',
      'hunter',
      'brave',
    ];
    if (!validIds.includes(id)) {
      res.status(400).json({ error: 'Unknown provider ID.' });
      return;
    }
    const { enabled, apiKey, dailyQuotaLimit } = req.body || {};
    const updated = updateProviderConfig(id, { enabled, apiKey, dailyQuotaLimit });
    res.json({ provider: updated });
  });

  app.post('/api/admin/providers/:id/test', requireAuth, requireAdmin, async (req, res) => {
    const id = req.params.id as ProviderId;
    try {
      if (id === 'google_maps_search') {
        const result = await searchScrapingdogMaps({
          query: 'Cafe',
          country: 'India',
          city: 'Jaipur',
          state: 'Rajasthan',
          category: 'Cafes',
          service: 'Social Media Management',
        });
        res.json({
          ok: result.configured && !result.error,
          configured: result.configured,
          count: result.leads.length,
          error: result.error,
        });
        return;
      }
      if (id === 'google_maps_places') {
        const searchFirst = await searchScrapingdogMaps({
          query: 'Hawa Mahal Cafe',
          country: 'India',
          city: 'Jaipur',
          state: 'Rajasthan',
          category: 'Cafes',
          service: 'Web Development',
        });
        const sample = searchFirst.leads[0];
        if (!sample || (!sample.providerId && !sample.dataId)) {
          res.json({
            ok: isProviderConfigured('google_maps_places'),
            configured: isProviderConfigured('google_maps_places'),
            count: 0,
            error: searchFirst.error || 'Could not obtain a sample Place ID to test Places enrichment.',
          });
          return;
        }
        const enriched = await enrichPlaceWithGoogleMapsPlaces({
          providerId: sample.providerId,
          dataId: sample.dataId,
          businessName: sample.businessName,
          city: 'Jaipur',
          country: 'India',
        });
        res.json({
          ok: enriched.configured && !enriched.error,
          configured: enriched.configured,
          count: enriched.enriched ? 1 : 0,
          error: enriched.error,
        });
        return;
      }
      if (id === 'google_jobs') {
        const result = await searchGoogleJobsUnified({
          query: 'Web Developer',
          country: 'India',
          location: 'Jaipur, India',
        });
        res.json({
          ok: result.configured && !result.error,
          configured: result.configured,
          count: result.jobs.length,
          error: result.error,
        });
        return;
      }
      if (id === 'linkedin_jobs') {
        const result = await searchLinkedInJobs({
          query: 'Software Engineer',
          country: 'India',
          location: 'Jaipur',
        });
        res.json({
          ok: result.configured && !result.error,
          configured: result.configured,
          count: result.jobs.length,
          error: result.error,
        });
        return;
      }
      if (id === 'scrapingdog') {
        const result = await searchScrapingdogGoogle({
          query: 'Government scholarships India official portal',
          country: 'India',
        });
        res.json({
          ok: result.configured && !result.error,
          configured: result.configured,
          count: result.results.length,
          error: result.error,
        });
        return;
      }
      if (id === 'openstreetmap') {
        const result = await searchOpenStreetMapBusinesses({
          query: 'Cafe',
          city: 'Jaipur',
          state: 'Rajasthan',
          country: 'India',
          category: 'Cafes',
          service: 'SEO',
        });
        res.json({ ok: !result.error, configured: true, count: result.leads.length, error: result.error });
        return;
      }
      if (id === 'gemini') {
        const configured = isProviderConfigured('gemini');
        res.json({
          ok: configured,
          configured,
          error: configured ? null : 'GEMINI_API_KEY not set in server environment.',
        });
        return;
      }
      if (id === 'foursquare') {
        const result = await searchFoursquarePlaces({
          query: 'Restaurant',
          city: 'Jaipur',
          country: 'India',
          category: 'Restaurants',
          service: 'Photography',
        });
        res.json({
          ok: result.configured && !result.error,
          configured: result.configured,
          count: result.leads.length,
          error: result.error,
        });
        return;
      }
      if (id === 'hunter') {
        const result = await verifyDomainWithHunter('scrapingdog.com');
        res.json({
          ok: result.configured && !result.error,
          configured: result.configured,
          count: result.emails.length,
          error: result.error,
        });
        return;
      }
      if (id === 'brave') {
        const result = await searchBraveWeb('Jaipur restaurants');
        res.json({
          ok: result.configured && !result.error,
          configured: result.configured,
          count: result.results.length,
          error: result.error,
        });
        return;
      }
      res.status(400).json({ error: 'Unknown provider ID.' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Test failed.' });
    }
  });

  app.get('/api/admin/ai-telemetry', requireAuth, requireAdmin, (_req, res) => {
    res.json({ telemetry: getAiTelemetry() });
  });

  // Frontend Vite middleware (dev) or static dist (prod)
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClientHunt AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ClientHunt AI server:', err);
  process.exit(1);
});
