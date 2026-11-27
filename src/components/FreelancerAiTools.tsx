import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Flag,
  MapPin,
  RefreshCw,
  Save,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { DEMO_BUSINESS_LEADS } from '../data/demoData';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  BusinessLead,
  LeadAnalysis,
  PitchChannel,
  PitchDraft,
  PitchTone,
} from '../types/domain';
import { LeafletMap } from './LeafletMap';

export function BusinessExplorerView({
  onAnalyzeLead,
}: {
  onAnalyzeLead: (lead: BusinessLead) => void;
}) {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('Jaipur');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [leads, setLeads] = useState<BusinessLead[]>(DEMO_BUSINESS_LEADS);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const searchOsmLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiFetch<{ leads: BusinessLead[] }>('/api/discovery/businesses', {
        method: 'POST',
        body: JSON.stringify({
          query: search || 'Business',
          country: 'India',
          state: 'Rajasthan',
          city: city || 'Jaipur',
          category: search || 'Businesses',
          service: 'Digital Presence',
          includeOsm: true,
        }),
      });
      if (data.leads && data.leads.length > 0) {
        setLeads(data.leads);
        toast(`Plotted ${data.leads.length} businesses in ${city}`, 'success');
      } else {
        toast('No live coordinates returned for this query', 'info');
      }
    } catch (err) {
      toast('Explorer search failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  const filtered = leads.filter((l) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      l.businessName.toLowerCase().includes(q) ||
      l.category.toLowerCase().includes(q) ||
      l.location.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Business Explorer</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Inspect businesses across map and list views using verified OpenStreetMap &amp; Scrapingdog coordinates.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            onClick={() => setViewMode('map')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              viewMode === 'map' ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white' : 'text-slate-500'
            }`}
          >
            Map View
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              viewMode === 'list' ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white' : 'text-slate-500'
            }`}
          >
            List View
          </button>
        </div>
      </div>

      <form onSubmit={searchOsmLive} className="grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4">
        <div className="sm:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Business name or category (e.g. Cafe, Salon)"
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
          />
        </div>
        <div className="sm:col-span-4">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (e.g. Jaipur, Udaipur)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
          />
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Searching...' : 'Search Live Map'}
          </button>
        </div>
      </form>

      {viewMode === 'map' ? (
        <LeafletMap leads={filtered} onSelectLead={onAnalyzeLead} heightClass="h-[520px]" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((lead) => (
            <div key={lead.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lead.category} · {lead.source} {lead.isDemo ? '· Sample Demo' : ''}
                </p>
                <h3 className="text-base font-bold text-[#0B1221] dark:text-white truncate">{lead.businessName}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1 truncate">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {lead.address || lead.location}
                </p>
              </div>
              <button
                onClick={() => onAnalyzeLead(lead)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 cursor-pointer"
              >
                Analyze
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiLeadAnalyzerView({
  initialLead,
  onPitchLead,
}: {
  initialLead: BusinessLead | null;
  onPitchLead: (target: { name: string; context: string; service?: string }) => void;
}) {
  const { firebaseUser, freelancerProfile } = useAuth();
  const { toast } = useToast();

  const [selectedLead, setSelectedLead] = useState<BusinessLead>(
    initialLead || DEMO_BUSINESS_LEADS[0]
  );
  const [customBusinessName, setCustomBusinessName] = useState('');
  const [customWebsite, setCustomWebsite] = useState('');
  const [customLocation, setCustomLocation] = useState('Jaipur, Rajasthan');
  const [customCategory, setCustomCategory] = useState('Restaurants');
  const [service, setService] = useState(
    freelancerProfile?.services?.[0] || 'Social Media Management'
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<LeadAnalysis | null>(null);

  useEffect(() => {
    if (initialLead) {
      setSelectedLead(initialLead);
    }
  }, [initialLead]);

  const runAnalysis = async (leadToAnalyze: BusinessLead) => {
    setAnalyzing(true);
    try {
      const res = await apiFetch<{ analysis: LeadAnalysis }>('/api/ai/analyze-business', {
        method: 'POST',
        body: JSON.stringify({ lead: leadToAnalyze, service }),
      });
      setAnalysis(res.analysis);
      if (firebaseUser) {
        try {
          await addDoc(collection(db, 'leadAnalyses'), {
            ownerId: firebaseUser.uid,
            leadId: leadToAnalyze.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120),
            businessName: res.analysis.businessName,
            onlinePresenceSummary: res.analysis.onlinePresenceSummary,
            contentObservations: res.analysis.contentObservations,
            improvementAreas: res.analysis.improvementAreas.slice(0, 10),
            potentialOpportunities: res.analysis.potentialOpportunities.slice(0, 10),
            aiRecommendation: res.analysis.aiRecommendation,
            opportunityScore: res.analysis.opportunityScore,
            confidenceScore: res.analysis.confidenceScore,
            evidence: res.analysis.evidence.slice(0, 10),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'leadAnalyses');
        }
      }
      toast('Gemini AI analysis completed', 'success');
    } catch (err) {
      toast('AI analysis failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customBusinessName.trim()) return;
    const custom: BusinessLead = {
      id: `custom_${Date.now()}`,
      businessName: customBusinessName.trim(),
      category: customCategory,
      location: customLocation,
      website: customWebsite.trim() || undefined,
      source: 'User-Provided Public Record',
      hasWebsite: Boolean(customWebsite.trim()),
      hasInstagram: false,
      opportunityScore: 50,
      confidenceScore: 60,
      suggestedServices: [service],
      aiExplanation: 'User-entered business details for AI evaluation.',
      isDemo: false,
      status: 'active',
      discoveredAt: new Date().toISOString(),
    };
    setSelectedLead(custom);
    runAnalysis(custom);
  };

  const reportInaccuracy = async () => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'abuseReports'), {
        reporterId: firebaseUser.uid,
        targetType: 'lead',
        targetId: selectedLead.id,
        reason: 'Inaccurate AI analysis or lead facts',
        details: `Lead: ${selectedLead.businessName}`,
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Feedback submitted', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'abuseReports');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">AI Lead Analyzer</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
          Analyzes only publicly retrieved facts supplied to Gemini. Opportunity Score is not a business quality rating and does not assume active hiring.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Target selector */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#0B1221] dark:text-white">Selected Business Lead</h2>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Choose Sample or Active Lead</label>
              <select
                value={selectedLead.id}
                onChange={(e) => {
                  const found = DEMO_BUSINESS_LEADS.find((d) => d.id === e.target.value);
                  if (found) setSelectedLead(found);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
              >
                {!DEMO_BUSINESS_LEADS.some((d) => d.id === selectedLead.id) && (
                  <option value={selectedLead.id}>{selectedLead.businessName} (Selected)</option>
                )}
                {DEMO_BUSINESS_LEADS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.businessName} ({d.location})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Target Service to Evaluate</label>
              <input
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
              />
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#0B1221] p-3.5 rounded-xl space-y-1">
              <p><strong>Category:</strong> {selectedLead.category}</p>
              <p><strong>Location:</strong> {selectedLead.address || selectedLead.location}</p>
              <p><strong>Website:</strong> {selectedLead.website || 'Not listed'}</p>
              <p><strong>Source:</strong> {selectedLead.source}</p>
            </div>
            <button
              onClick={() => runAnalysis(selectedLead)}
              disabled={analyzing}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              {analyzing ? 'Analyzing Public Data...' : 'Run Gemini Analysis'}
            </button>
          </div>

          <form onSubmit={handleAnalyzeCustom} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[#0B1221] dark:text-white">Or Analyze Any Business Manually</h2>
            <input
              required
              value={customBusinessName}
              onChange={(e) => setCustomBusinessName(e.target.value)}
              placeholder="Business name *"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Category"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
              />
              <input
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="City"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
              />
            </div>
            <input
              value={customWebsite}
              onChange={(e) => setCustomWebsite(e.target.value)}
              placeholder="Public website URL (optional)"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
            />
            <button
              type="submit"
              disabled={analyzing}
              className="w-full py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Analyze Custom Business
            </button>
          </form>
        </div>

        {/* Right: Analysis Output */}
        <div className="lg:col-span-7">
          {!analysis ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-12 text-center h-full flex flex-col items-center justify-center">
              <Sparkles className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
                Ready for Public Presence Analysis
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md">
                Click &ldquo;Run Gemini Analysis&rdquo; to evaluate online presence, explainable opportunity factors, and evidence-backed recommendations.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    AI Analysis Report · Advisory Insight (Not Active Hiring Proof)
                  </p>
                  <h2 className="text-xl font-bold text-[#0B1221] dark:text-white mt-0.5">
                    {analysis.businessName}
                  </h2>
                </div>
                <div className="flex items-center gap-5 font-mono tabular-nums">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Opportunity Score</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {analysis.opportunityScore}/100
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Data Confidence</span>
                    <span className="text-xl font-bold text-violet-600 dark:text-violet-400">
                      {analysis.confidenceScore}%
                    </span>
                  </div>
                </div>
              </div>

              {analysis.scoreBreakdown && analysis.scoreBreakdown.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Explainable Score Breakdown
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {analysis.scoreBreakdown.map((item) => (
                      <div key={item.factor} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1221] border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>{item.factor}</span>
                          <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                            {item.points}/{item.maxPoints}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.evidence}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4 text-sm">
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Online Presence Summary (Fact-Grounded)</h3>
                  <p className="mt-1 text-slate-700 dark:text-slate-200 leading-relaxed">{analysis.onlinePresenceSummary}</p>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">AI Recommendation</h3>
                  <p className="mt-1 text-slate-700 dark:text-slate-200 leading-relaxed">{analysis.aiRecommendation}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Visible Improvement Areas</h3>
                    <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                      {analysis.improvementAreas.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">AI-Suggested Services</h3>
                    <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                      {analysis.potentialOpportunities.map((o) => <li key={o}>{o}</li>)}
                    </ul>
                  </div>
                </div>
                {analysis.evidence.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Verified Public Evidence</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{analysis.evidence.join(' · ')}</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() =>
                    onPitchLead({
                      name: analysis.businessName,
                      context: `${analysis.onlinePresenceSummary} ${analysis.aiRecommendation}`,
                      service,
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Generate Personalized Pitch
                </button>
                <button
                  onClick={reportInaccuracy}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" /> Report Inaccurate Info
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AiPitchGeneratorView({
  initialTarget,
}: {
  initialTarget: { name: string; context: string; service?: string } | null;
}) {
  const { firebaseUser, freelancerProfile } = useAuth();
  const { toast } = useToast();

  const [targetName, setTargetName] = useState(initialTarget?.name || 'Amber Spice Courtyard');
  const [targetContext, setTargetContext] = useState(
    initialTarget?.context ||
      'C-Scheme Jaipur restaurant with a static menu website and no active Instagram Reels video channel.'
  );
  const [service, setService] = useState(
    initialTarget?.service || freelancerProfile?.services?.[0] || 'Social Media Management'
  );
  const [skills, setSkills] = useState(
    freelancerProfile?.skills?.join(', ') || 'Instagram Reels, Video Editing, Content Calendar'
  );
  const [portfolioLink, setPortfolioLink] = useState(
    freelancerProfile?.portfolioLinks?.[0] || freelancerProfile?.website || ''
  );
  const [channel, setChannel] = useState<PitchChannel>('Email');
  const [tone, setTone] = useState<PitchTone>('Professional');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<PitchDraft[]>([]);

  useEffect(() => {
    if (initialTarget) {
      setTargetName(initialTarget.name);
      setTargetContext(initialTarget.context);
      if (initialTarget.service) setService(initialTarget.service);
    }
  }, [initialTarget]);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(collection(db, 'pitchDrafts'), where('ownerId', '==', firebaseUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSavedDrafts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pitchDrafts')
    );
    return () => unsub();
  }, [firebaseUser]);

  const generate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setGenerating(true);
    try {
      const res = await apiFetch<{ subject: string; body: string }>('/api/ai/generate-pitch', {
        method: 'POST',
        body: JSON.stringify({
          targetName,
          targetContext,
          service,
          skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
          portfolioLink,
          channel,
          tone,
        }),
      });
      setSubject(res.subject || '');
      setBody(res.body || '');
      toast('Personalized pitch drafted', 'success');
    } catch (err) {
      toast('Pitch generation failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    const full = channel === 'Email' && subject ? `Subject: ${subject}\n\n${body}` : body;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    toast('Copied draft to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveDraft = async () => {
    if (!firebaseUser || !body.trim()) return;
    try {
      await addDoc(collection(db, 'pitchDrafts'), {
        ownerId: firebaseUser.uid,
        targetName: targetName.trim(),
        channel,
        tone,
        subject: subject.trim(),
        body: body.trim(),
        serviceOffered: service.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Draft saved to Firestore', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'pitchDrafts');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">AI Pitch Generator</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
          Drafts tailored messages for manual review and sending. ClientHunt AI never sends unsolicited mass outreach automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={generate} className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Business or Opportunity Name *</label>
            <input required value={targetName} onChange={(e) => setTargetName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Verified Observation / Context *</label>
            <textarea required rows={3} value={targetContext} onChange={(e) => setTargetContext(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Your Service *</label>
              <input required value={service} onChange={(e) => setService(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Channel</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value as PitchChannel)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
                <option value="Email">Email</option>
                <option value="Instagram DM">Instagram DM</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="WhatsApp">WhatsApp</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value as PitchTone)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
                <option value="Professional">Professional</option>
                <option value="Friendly">Friendly</option>
                <option value="Short and Direct">Short and Direct</option>
                <option value="Personalized">Personalized</option>
                <option value="Persuasive but Respectful">Persuasive but Respectful</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Portfolio URL</label>
              <input value={portfolioLink} onChange={(e) => setPortfolioLink(e.target.value)} placeholder="https://" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Relevant Skills</label>
            <input value={skills} onChange={(e) => setSkills(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
          </div>
          <button
            type="submit"
            disabled={generating}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? 'Drafting Pitch...' : 'Generate Pitch'}
          </button>
        </form>

        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#0B1221] dark:text-white">Editable Outreach Draft ({channel})</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => generate()}
                  disabled={generating}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!body}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!body}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" /> Save Draft
                </button>
              </div>
            </div>

            {channel === 'Email' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Subject Line</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject line will appear here..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-500 mb-1">Message Body</label>
              <textarea
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Click Generate Pitch to create an evidence-backed personalized message..."
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm leading-relaxed"
              />
            </div>
          </div>

          {savedDrafts.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
              <h3 className="text-sm font-semibold text-[#0B1221] dark:text-white mb-3">
                Saved Pitch Drafts ({savedDrafts.length})
              </h3>
              <div className="space-y-2.5 max-h-60 overflow-y-auto">
                {savedDrafts.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setTargetName(d.targetName);
                      setChannel(d.channel);
                      setTone(d.tone);
                      setSubject(d.subject || '');
                      setBody(d.body);
                    }}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {d.targetName} · {d.channel} · {d.tone}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{d.body}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
