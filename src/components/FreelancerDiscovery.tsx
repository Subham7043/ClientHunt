import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Briefcase,
  Download,
  ExternalLink,
  Flag,
  List,
  MapPin,
  Map as MapIcon,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { DEMO_BUSINESS_LEADS, DEMO_HIRING_OPPORTUNITIES } from '../data/demoData';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { BusinessLead, HiringOpportunity } from '../types/domain';
import { LeafletMap } from './LeafletMap';

const BUSINESS_CATEGORIES = [
  'Restaurants',
  'Cafes',
  'Hotels',
  'Real estate',
  'Coaching institutes',
  'Educational institutions',
  'Startups',
  'Clothing brands',
  'Gyms',
  'Healthcare',
  'E-commerce',
  'Marketing agencies',
  'Salons',
  'Other businesses',
];

const SERVICE_CATEGORIES = [
  'Social Media Management',
  'Video Editing',
  'Graphic Design',
  'Web Development',
  'App Development',
  'Digital Marketing',
  'SEO',
  'Content Writing',
  'UI/UX Design',
  'AI Automation',
  'Data Analytics',
  'Cloud and DevOps',
  'Cybersecurity',
  'Photography',
  'Other services',
];

export function DiscoverLeadsView({
  onAnalyzeLead,
  onPitchLead,
  onSwitchToAdminProviders,
}: {
  onAnalyzeLead: (lead: BusinessLead) => void;
  onPitchLead: (target: { name: string; context: string; service?: string }) => void;
  onSwitchToAdminProviders?: () => void;
}) {
  const { firebaseUser, isAdmin } = useAuth();
  const { toast } = useToast();

  const [country, setCountry] = useState('India');
  const [state, setState] = useState('Rajasthan');
  const [city, setCity] = useState('Jaipur');
  const [area, setArea] = useState('');
  const [category, setCategory] = useState('Restaurants');
  const [service, setService] = useState('Social Media Management');
  const [queryText, setQueryText] = useState('');

  // Additional filters
  const [onlyWebsite, setOnlyWebsite] = useState(false);
  const [onlyInstagram, setOnlyInstagram] = useState(false);
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [includeOsm, setIncludeOsm] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [providerAlerts, setProviderAlerts] = useState<Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }>>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedLead, setSelectedLead] = useState<BusinessLead | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('clienthunt_search_history');
      if (saved) setSearchHistory(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  const runSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (demoMode) {
      setLeads(DEMO_BUSINESS_LEADS);
      setProviderAlerts([]);
      toast('Loaded Sample Demo leads (Jaipur)', 'info');
      return;
    }

    setLoading(true);
    try {
      const label = `${category} · ${area ? `${area}, ` : ''}${city} (${service})`;
      const nextHist = [label, ...searchHistory.filter((x) => x !== label)].slice(0, 6);
      setSearchHistory(nextHist);
      window.localStorage.setItem('clienthunt_search_history', JSON.stringify(nextHist));

      const data = await apiFetch<{
        leads: BusinessLead[];
        duplicatesRemoved: number;
        flaggedCount: number;
        providers: Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }>;
      }>('/api/discovery/businesses', {
        method: 'POST',
        body: JSON.stringify({
          query: queryText,
          country,
          state,
          city,
          area,
          category,
          service,
          includeOsm,
          includeFoursquare: true,
        }),
      });

      setLeads(data.leads || []);
      setProviderAlerts(data.providers || []);
      if (data.leads?.length > 0) {
        toast(`Found ${data.leads.length} business leads`, 'success');
      } else {
        toast('Search completed with 0 live results', 'info', 'Check provider configuration or toggle Demo Mode to preview sample data.');
      }
    } catch (err) {
      toast('Discovery search failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  const safeId = (raw: string) =>
    raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 120) || `lead_${Date.now()}`;

  const handleSaveLead = async (lead: BusinessLead) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'savedLeads'), {
        ownerId: firebaseUser.uid,
        leadId: safeId(lead.id),
        businessName: lead.businessName.slice(0, 195),
        category: lead.category.slice(0, 95),
        location: lead.location.slice(0, 195),
        website: (lead.website || '').slice(0, 390),
        publicPhone: (lead.publicPhone || '').slice(0, 55),
        publicEmail: (lead.publicEmail || '').slice(0, 250),
        source: lead.source.slice(0, 75),
        sourceUrl: (lead.sourceUrl || '').slice(0, 590),
        opportunityScore: Math.min(100, Math.max(0, Number(lead.opportunityScore) || 0)),
        suggestedServices: (lead.suggestedServices || []).slice(0, 12),
        isDemo: Boolean(lead.isDemo),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Lead saved to Saved Leads', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'savedLeads');
    }
  };

  const handleAddToCrm = async (lead: BusinessLead) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'crmPipelines'), {
        ownerId: firebaseUser.uid,
        leadId: safeId(lead.id),
        businessName: lead.businessName.slice(0, 195),
        category: lead.category.slice(0, 95),
        location: lead.location.slice(0, 195),
        source: lead.source.slice(0, 75),
        status: 'New',
        estimatedValue: 15000,
        notes: (lead.aiExplanation || '').slice(0, 2900),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Added to CRM Pipeline', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'crmPipelines');
    }
  };

  const handleReportLead = async (lead: BusinessLead) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'abuseReports'), {
        reporterId: firebaseUser.uid,
        targetType: 'lead',
        targetId: safeId(lead.id),
        reason: 'Inaccurate or outdated business record',
        details: `Reported "${lead.businessName}" from ${lead.source}`.slice(0, 1400),
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Report submitted for admin review', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'abuseReports');
    }
  };

  const handleEnrichEmail = async (lead: BusinessLead) => {
    if (!lead.website) {
      toast('No website available for domain email lookup', 'info');
      return;
    }
    try {
      const res = await apiFetch<{
        configured: boolean;
        emails: Array<{ email: string; verificationStatus: 'verified' | 'unverified' }>;
        error?: string;
      }>('/api/discovery/enrich-email', {
        method: 'POST',
        body: JSON.stringify({ website: lead.website }),
      });
      if (!res.configured) {
        toast('Hunter.io not configured', 'info', 'Configure HUNTER_API_KEY in server secrets or Admin Data Sources.');
        return;
      }
      if (res.emails.length === 0) {
        toast('No verified public emails returned by Hunter.io', 'info');
        return;
      }
      const best = res.emails[0];
      setLeads((prev) =>
        prev.map((item) =>
          item.id === lead.id
            ? { ...item, publicEmail: best.email, emailVerificationStatus: best.verificationStatus }
            : item
        )
      );
      toast(`Found ${best.email} (${best.verificationStatus})`, 'success');
    } catch (err) {
      toast('Email enrichment failed', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const filtered = leads.filter((l) => {
    if (onlyWebsite && !l.hasWebsite) return false;
    if (onlyInstagram && !l.hasInstagram) return false;
    if (onlyEmail && !l.publicEmail) return false;
    if (onlyPhone && !l.publicPhone) return false;
    if (l.opportunityScore < minScore) return false;
    return true;
  });

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const headers = ['Business Name', 'Category', 'Location', 'Website', 'Phone', 'Email', 'Source', 'Score', 'Demo'];
    const rows = filtered.map((l) => [
      l.businessName,
      l.category,
      l.location,
      l.website || '',
      l.publicPhone || '',
      l.publicEmail || '',
      l.source,
      String(l.opportunityScore),
      String(l.isDemo),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clienthunt-leads-${city.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">
            Business Lead Discovery Engine
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Find local businesses and inspect AI-suggested service opportunities. Never fabricates contact info or hiring claims.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => {
                const next = e.target.checked;
                setDemoMode(next);
                if (next) {
                  setLeads(DEMO_BUSINESS_LEADS);
                  setProviderAlerts([]);
                } else {
                  setLeads([]);
                }
              }}
              className="rounded"
            />
            Sample Demo Mode
          </label>
          {filtered.length > 0 && (
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Multi-Filter Search Form */}
      <form
        onSubmit={runSearch}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Country</label>
            <input value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">State</label>
            <input value={state} onChange={(e) => setState(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Local Area (Optional)</label>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. C-Scheme, Malviya Nagar" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Business Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
              {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Your Freelance Service</label>
            <select value={service} onChange={(e) => setService(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
              {SERVICE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Specific Keyword (Optional)</label>
            <input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="e.g. specialty cafe, boutique" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={onlyWebsite} onChange={(e) => setOnlyWebsite(e.target.checked)} className="rounded" /> Has website
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={onlyInstagram} onChange={(e) => setOnlyInstagram(e.target.checked)} className="rounded" /> Has Instagram
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={onlyEmail} onChange={(e) => setOnlyEmail(e.target.checked)} className="rounded" /> Has email
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} className="rounded" /> Has phone
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={includeOsm} onChange={(e) => setIncludeOsm(e.target.checked)} className="rounded" /> Include OpenStreetMap
            </label>
            <label className="inline-flex items-center gap-1.5">
              Min score:
              <input
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value) || 0)}
                className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] font-mono tabular-nums"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${viewMode === 'list' ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white' : 'text-slate-500'}`}
              >
                <List className="w-3.5 h-3.5 inline mr-1" /> List
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${viewMode === 'map' ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white' : 'text-slate-500'}`}
              >
                <MapIcon className="w-3.5 h-3.5 inline mr-1" /> Map
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              <Search className="w-4 h-4" />
              {loading ? 'Searching...' : demoMode ? 'Load Sample Leads' : 'Discover Businesses'}
            </button>
          </div>
        </div>

        {searchHistory.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Recent:</span>
            {searchHistory.map((h) => (
              <span key={h} className="text-slate-600 dark:text-slate-300">
                {h} ·
              </span>
            ))}
          </div>
        )}
      </form>

      {/* Honest Provider Status Alerts */}
      {providerAlerts.some((p) => !p.configured || p.error) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 p-4 space-y-2">
          {providerAlerts
            .filter((p) => !p.configured || p.error)
            .map((p) => (
              <div key={p.provider} className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <strong>{p.provider}:</strong> {p.error || 'Provider not configured.'}
                </span>
                <div className="flex items-center gap-3">
                  {isAdmin && onSwitchToAdminProviders && (
                    <button onClick={onSwitchToAdminProviders} className="font-semibold underline cursor-pointer">
                      Configure in Admin Data Sources
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDemoMode(true);
                      setLeads(DEMO_BUSINESS_LEADS);
                      setProviderAlerts([]);
                    }}
                    className="font-semibold underline cursor-pointer"
                  >
                    Preview Sample Demo Data
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Loading / Empty / Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-52 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center">
          <Search className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
            No Business Leads Loaded Yet
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Click &ldquo;Discover Businesses&rdquo; to query Scrapingdog &amp; OpenStreetMap, or enable Sample Demo Mode to explore Jaipur sample leads.
          </p>
        </div>
      ) : viewMode === 'map' ? (
        <LeafletMap leads={filtered} onSelectLead={(l) => setSelectedLead(l)} heightClass="h-[520px]" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((lead) => (
            <article
              key={lead.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lead.category} · {lead.source} {lead.isDemo ? '· Sample Demo' : ''}
                      {lead.possibleDuplicate ? ' · Possible Duplicate Flagged' : ''}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-[#0B1221] dark:text-white">
                      {lead.businessName}
                    </h3>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <span className="text-[11px] text-slate-400 block">Opportunity</span>
                    <span className="text-base font-bold text-blue-600 dark:text-blue-400">
                      {lead.opportunityScore}/100
                    </span>
                  </div>
                </div>

                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span>{lead.address || lead.location}</span>
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {lead.website && (
                    <a href={lead.website} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px]">
                      {lead.website}
                    </a>
                  )}
                  {lead.publicPhone && <span className="font-mono">{lead.publicPhone}</span>}
                  {lead.publicEmail && (
                    <span>
                      {lead.publicEmail} {lead.emailVerificationStatus ? `(${lead.emailVerificationStatus})` : ''}
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {lead.aiExplanation}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  AI-Suggested Services: {lead.suggestedServices.join(' · ')}
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onAnalyzeLead(lead)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Analyze with AI
                </button>
                <button
                  onClick={() =>
                    onPitchLead({
                      name: lead.businessName,
                      context: `${lead.category} in ${lead.location}. ${lead.website ? `Website: ${lead.website}. ` : 'No website listed. '}${lead.aiExplanation}`,
                      service: lead.suggestedServices[0] || service,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Generate Pitch
                </button>
                <button
                  onClick={() => handleSaveLead(lead)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5" /> Save
                </button>
                <button
                  onClick={() => handleAddToCrm(lead)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add to CRM
                </button>
                <button
                  onClick={() => setSelectedLead(lead)}
                  className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                >
                  Details
                </button>
                {lead.website && !lead.publicEmail && (
                  <button
                    onClick={() => handleEnrichEmail(lead)}
                    className="px-2.5 py-1.5 text-xs text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
                  >
                    Find Email
                  </button>
                )}
                {lead.sourceUrl && (
                  <a
                    href={lead.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  onClick={() => handleReportLead(lead)}
                  className="ml-auto p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  title="Report inaccurate information"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Details Modal */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">{selectedLead.category} · {selectedLead.source}</p>
                <h3 className="text-xl font-bold text-[#0B1221] dark:text-white">{selectedLead.businessName}</h3>
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer">
                Close
              </button>
            </div>
            <div className="text-sm space-y-2 text-slate-600 dark:text-slate-300">
              <p><strong>Address:</strong> {selectedLead.address || selectedLead.location}</p>
              <p><strong>Website:</strong> {selectedLead.website || 'Not publicly listed'}</p>
              <p><strong>Phone:</strong> {selectedLead.publicPhone || 'Not publicly listed'}</p>
              <p><strong>Email:</strong> {selectedLead.publicEmail || 'Not publicly listed'}</p>
              {selectedLead.latitude && selectedLead.longitude && (
                <p className="font-mono text-xs">Coordinates: {selectedLead.latitude.toFixed(5)}, {selectedLead.longitude.toFixed(5)}</p>
              )}
              <p className="pt-2 border-t border-slate-100 dark:border-slate-800">{selectedLead.aiExplanation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HiringOpportunitiesView({
  onPitchOpportunity,
  onSwitchToAdminProviders,
}: {
  onPitchOpportunity: (target: { name: string; context: string; service?: string }) => void;
  onSwitchToAdminProviders?: () => void;
}) {
  const { firebaseUser, isAdmin } = useAuth();
  const { toast } = useToast();
  const [keywords, setKeywords] = useState('Looking for a freelance video editor');
  const [location, setLocation] = useState('Jaipur, India');
  const [country, setCountry] = useState('India');
  const [demoMode, setDemoMode] = useState(false);
  const [filterClass, setFilterClass] = useState('All');
  const [loading, setLoading] = useState(false);
  const [opportunities, setOpportunities] = useState<HiringOpportunity[]>([]);
  const [providerAlerts, setProviderAlerts] = useState<Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }>>([]);

  const presetKeywords = [
    'Looking for a freelance video editor',
    'Need a freelance web developer',
    'Hiring a graphic designer',
    'Looking for an SEO specialist',
    'Looking for a social media manager',
  ];

  const runSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (demoMode) {
      setOpportunities(DEMO_HIRING_OPPORTUNITIES);
      setProviderAlerts([]);
      toast('Loaded Sample Demo hiring opportunities', 'info');
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<{
        opportunities: HiringOpportunity[];
        providers: Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }>;
      }>('/api/discovery/opportunities', {
        method: 'POST',
        body: JSON.stringify({ keywords, location, country, classifyWithAi: true }),
      });
      setOpportunities(data.opportunities || []);
      setProviderAlerts(data.providers || []);
      if (data.opportunities?.length > 0) {
        toast(`Classified ${data.opportunities.length} hiring opportunities`, 'success');
      } else {
        toast('No live listings returned', 'info', 'Verify Scrapingdog configuration or switch to Sample Demo Mode.');
      }
    } catch (err) {
      toast('Opportunity search failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  const safeOpId = (raw: string) =>
    raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 120) || `opp_${Date.now()}`;

  const handleSaveOpportunityToCrm = async (op: HiringOpportunity) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'crmPipelines'), {
        ownerId: firebaseUser.uid,
        leadId: safeOpId(op.id),
        businessName: (op.companyName || op.title).slice(0, 195),
        category: op.aiClassification.slice(0, 95),
        location: (op.location || 'Not stated').slice(0, 195),
        source: op.sourceName.slice(0, 75),
        status: 'Interested',
        estimatedValue: 20000,
        notes: op.originalText.slice(0, 800),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Saved opportunity to CRM', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'crmPipelines');
    }
  };

  const handleReportOpportunity = async (op: HiringOpportunity) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'abuseReports'), {
        reporterId: firebaseUser.uid,
        targetType: 'opportunity',
        targetId: safeOpId(op.id),
        reason: 'Inaccurate or expired hiring listing',
        details: op.title.slice(0, 1400),
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Reported listing for review', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'abuseReports');
    }
  };

  const classifications = ['All', 'Freelance Project', 'Contract Work', 'Full-Time Job', 'Part-Time Job', 'Internship', 'Agency Requirement'];
  const visible = opportunities.filter((o) => filterClass === 'All' || o.aiClassification === filterClass);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">
            Explicit Hiring Opportunity Detection
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Find people and companies explicitly seeking freelancers, classified by Gemini with source verification links.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] text-xs font-medium cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={demoMode}
            onChange={(e) => {
              const next = e.target.checked;
              setDemoMode(next);
              setOpportunities(next ? DEMO_HIRING_OPPORTUNITIES : []);
              setProviderAlerts([]);
            }}
            className="rounded"
          />
          Sample Demo Mode
        </label>
      </div>

      <form onSubmit={runSearch} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Hiring Intent Keywords</label>
            <input
              required
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
            />
          </div>
          <div className="md:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Scanning & Classifying...' : demoMode ? 'Load Sample Posts' : 'Detect Hiring Posts'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Quick intents:</span>
          {presetKeywords.map((kw) => (
            <button
              key={kw}
              type="button"
              onClick={() => setKeywords(kw)}
              className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              {kw}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
          {classifications.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilterClass(c)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                filterClass === c ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </form>

      {providerAlerts.some((p) => !p.configured || p.error) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 p-4 space-y-2">
          {providerAlerts
            .filter((p) => !p.configured || p.error)
            .map((p) => (
              <div key={p.provider} className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
                <span><strong>{p.provider}:</strong> {p.error}</span>
                <div className="flex items-center gap-3">
                  {isAdmin && onSwitchToAdminProviders && (
                    <button onClick={onSwitchToAdminProviders} className="font-semibold underline cursor-pointer">
                      Admin Provider Setup
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDemoMode(true);
                      setOpportunities(DEMO_HIRING_OPPORTUNITIES);
                      setProviderAlerts([]);
                    }}
                    className="font-semibold underline cursor-pointer"
                  >
                    Use Sample Demo Data
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center">
          <Briefcase className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">No Hiring Posts Loaded</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Run a search above or toggle Sample Demo Mode to inspect AI hiring classification.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((op) => (
            <article key={op.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <div>
                  <span className="font-semibold text-violet-600 dark:text-violet-400">{op.aiClassification}</span>
                  <span className="mx-2">·</span>
                  <span className="font-mono tabular-nums">AI Confidence {op.confidenceScore}%</span>
                  {op.isDemo && <span className="ml-2">· Sample Demo</span>}
                </div>
                <span>Source: {op.sourceName} {op.publishedAt ? `· ${op.publishedAt}` : ''}</span>
              </div>

              <h3 className="mt-2 text-lg font-bold text-[#0B1221] dark:text-white">{op.title}</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {op.companyName || 'Company not stated'} · {op.location || 'Location not specified'}
                {op.workMode ? ` · ${op.workMode}` : ''}
                {op.budget ? ` · Budget: ${op.budget}` : ''}
                {op.deadline ? ` · Deadline: ${op.deadline}` : ''}
              </p>

              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-[#0B1221] p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                {op.originalText}
              </p>

              {op.skillsRequired.length > 0 && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Skills extracted: {op.skillsRequired.join(' · ')}
                </p>
              )}

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    onPitchOpportunity({
                      name: op.companyName || op.title,
                      context: `Hiring post (${op.aiClassification}): ${op.originalText}`,
                      service: op.requiredService || keywords,
                    })
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Generate Pitch
                </button>
                <button
                  onClick={() => handleSaveOpportunityToCrm(op)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Add to CRM
                </button>
                <a
                  href={op.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Original Listing <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => handleReportOpportunity(op)}
                  className="ml-auto p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  title="Report inaccurate opportunity"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
