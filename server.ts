import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createRateLimiter, requireAdmin, requireAuth } from './server/auth.ts';
import {
  analyzeBusinessWithGemini,
  classifyHiringPosts,
  generatePitchWithGemini,
  getAiTelemetry,
} from './server/ai.ts';
import {
  searchScrapingdogGoogle,
  searchScrapingdogJobs,
  searchScrapingdogMaps,
} from './server/providers/scrapingdog.ts';
import {
  searchBraveWeb,
  searchFoursquarePlaces,
  searchOpenStreetMapBusinesses,
  verifyDomainWithHunter,
} from './server/providers/secondary.ts';
import {
  deduplicateBusinessLeads,
  deduplicateOpportunities,
  extractDomain,
  getAllProviderHealth,
  getCachedResult,
  isProviderConfigured,
  isProviderEnabled,
  setCachedResult,
  updateProviderConfig,
} from './server/providers/types.ts';
import type { BusinessLead, HiringOpportunity, ProviderId } from './src/types/domain.ts';

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
      scrapingdogConfigured: isProviderConfigured('scrapingdog') && isProviderEnabled('scrapingdog'),
      openstreetmapEnabled: isProviderEnabled('openstreetmap'),
      foursquareConfigured: isProviderConfigured('foursquare') && isProviderEnabled('foursquare'),
      hunterConfigured: isProviderConfigured('hunter') && isProviderEnabled('hunter'),
      braveConfigured: isProviderConfigured('brave') && isProviderEnabled('brave'),
      geminiConfigured: isProviderConfigured('gemini') && isProviderEnabled('gemini'),
    });
  });

  // Business Lead Discovery Engine
  app.post('/api/discovery/businesses', requireAuth, discoveryLimiter, async (req, res) => {
    try {
      const {
        query = '',
        country = 'India',
        state = 'Rajasthan',
        city = 'Jaipur',
        area = '',
        category = 'Restaurants',
        service = 'Social Media Management',
        includeOsm = true,
        includeFoursquare = false,
      } = req.body || {};

      const cleanCity = String(city).trim().slice(0, 80) || 'Jaipur';
      const cleanCategory = String(category).trim().slice(0, 80) || 'Businesses';
      const cleanService = String(service).trim().slice(0, 100);
      const cleanArea = String(area).trim().slice(0, 80);
      const locationCity = cleanArea ? `${cleanArea}, ${cleanCity}` : cleanCity;
      const searchQuery = String(query).trim().slice(0, 120) || cleanCategory;

      const sdState = `${isProviderConfigured('scrapingdog')}:${isProviderEnabled('scrapingdog')}`;
      const cacheKey = `biz:${sdState}:${country}:${state}:${locationCity}:${searchQuery}:${cleanService}:${includeOsm}:${includeFoursquare}`;
      const cached = getCachedResult<any>(cacheKey);
      if (cached) {
        res.json({ ...cached, cached: true });
        return;
      }

      const providerMessages: Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }> = [];
      let allLeads: BusinessLead[] = [];

      const [sdResult, osmResult, fsqResult] = await Promise.all([
        searchScrapingdogMaps({
          query: searchQuery,
          country: String(country),
          state: String(state),
          city: locationCity,
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
        provider: 'Scrapingdog',
        configured: sdResult.configured,
        enabled: sdResult.enabled,
        error: sdResult.error,
      });
      allLeads = allLeads.concat(sdResult.leads);

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

  // Explicit Hiring Opportunity Detection Engine
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
      const sdState = `${isProviderConfigured('scrapingdog')}:${isProviderEnabled('scrapingdog')}`;
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
        provider: 'Scrapingdog Google Jobs',
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

  // AI Business Analyzer
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

  // AI Pitch Generator
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

  // Admin Provider Management & Telemetry
  app.get('/api/admin/providers', requireAuth, requireAdmin, (_req, res) => {
    res.json({ providers: getAllProviderHealth() });
  });

  app.post('/api/admin/providers/:id', requireAuth, requireAdmin, (req, res) => {
    const id = req.params.id as ProviderId;
    const validIds: ProviderId[] = ['scrapingdog', 'gemini', 'openstreetmap', 'foursquare', 'hunter', 'brave'];
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
      if (id === 'scrapingdog') {
        const result = await searchScrapingdogMaps({
          query: 'Cafe',
          country: 'India',
          city: 'Jaipur',
          state: 'Rajasthan',
          category: 'Cafes',
          service: 'Social Media Management',
        });
        res.json({ ok: result.configured && !result.error, configured: result.configured, count: result.leads.length, error: result.error });
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
        res.json({ ok: configured, configured, error: configured ? null : 'GEMINI_API_KEY not set in server environment.' });
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
        res.json({ ok: result.configured && !result.error, configured: result.configured, count: result.leads.length, error: result.error });
        return;
      }
      if (id === 'hunter') {
        const result = await verifyDomainWithHunter('scrapingdog.com');
        res.json({ ok: result.configured && !result.error, configured: result.configured, count: result.emails.length, error: result.error });
        return;
      }
      if (id === 'brave') {
        const result = await searchBraveWeb('Jaipur restaurants');
        res.json({ ok: result.configured && !result.error, configured: result.configured, count: result.results.length, error: result.error });
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
