import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Bookmark,
  Briefcase,
  CheckCircle2,
  ExternalLink,
  FileText,
  Flag,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { DEMO_JOB_LISTINGS } from '../data/demoData';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  JobAlert,
  JobApplication,
  JobListing,
  JobMatchAnalysis,
  SavedJob,
} from '../types/domain';

const JOB_CATEGORIES = [
  'All Categories',
  'Software Engineer',
  'Web Developer',
  'Full Stack Developer',
  'Frontend Developer',
  'Backend Developer',
  'App Developer',
  'UI/UX Designer',
  'Graphic Designer',
  'Video Editor',
  'Digital Marketing',
  'SEO Specialist',
  'Content Writer',
  'Data Analyst',
  'AI / Machine Learning',
  'Cybersecurity',
  'Cloud / DevOps',
  'Product Manager',
  'Sales / Business Development',
  'Customer Support',
  'Finance / Accounting',
  'Operations',
  'Internship Roles',
];

type JobHubTab =
  | 'overview'
  | 'discover'
  | 'recommended'
  | 'remote'
  | 'internships'
  | 'freelance'
  | 'saved'
  | 'applied'
  | 'alerts';

export function JobDiscoveryHub({
  onSwitchToBusinessLeads,
  onSwitchToAdminProviders,
}: {
  onSwitchToBusinessLeads?: () => void;
  onSwitchToAdminProviders?: () => void;
}) {
  const { firebaseUser, freelancerProfile, isAdmin } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<JobHubTab>('discover');
  const [queryText, setQueryText] = useState('Web Developer');
  const [skillFilter, setSkillFilter] = useState('');
  const [category, setCategory] = useState('All Categories');
  const [country, setCountry] = useState('India');
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('Jaipur');
  const [workMode, setWorkMode] = useState('All');
  const [employmentType, setEmploymentType] = useState('All');
  const [experienceLevel, setExperienceLevel] = useState('All');
  const [companyFilter, setCompanyFilter] = useState('');
  const [datePostedFilter, setDatePostedFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [salaryPresentOnly, setSalaryPresentOnly] = useState(false);
  const [includeGoogleJobs, setIncludeGoogleJobs] = useState(true);
  const [includeLinkedInJobs, setIncludeLinkedInJobs] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [providerAlerts, setProviderAlerts] = useState<
    Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }>
  >([]);
  const [dedupStats, setDedupStats] = useState<{ duplicatesRemoved: number; flaggedCount: number } | null>(null);

  // Firestore synced personal records
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [appliedJobs, setAppliedJobs] = useState<JobApplication[]>([]);
  const [jobAlerts, setJobAlerts] = useState<JobAlert[]>([]);

  // Detail & AI matching / drafting
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [matchMap, setMatchMap] = useState<Record<string, JobMatchAnalysis>>({});
  const [matchingJobId, setMatchingJobId] = useState<string | null>(null);
  const [draftFormat, setDraftFormat] = useState<'Cover Letter' | 'Short Pitch' | 'Freelance Proposal'>('Cover Letter');
  const [generatedDraft, setGeneratedDraft] = useState<{ subject?: string; body: string } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  // Create alert form
  const [alertKeywords, setAlertKeywords] = useState('React, TypeScript, Frontend');
  const [alertCountry, setAlertCountry] = useState('India');
  const [alertWorkMode, setAlertWorkMode] = useState('Remote');

  useEffect(() => {
    if (!firebaseUser) return;
    const u1 = onSnapshot(
      query(collection(db, 'savedJobs'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setSavedJobs(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'savedJobs')
    );
    const u2 = onSnapshot(
      query(collection(db, 'jobApplications'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setAppliedJobs(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'jobApplications')
    );
    const u3 = onSnapshot(
      query(collection(db, 'jobAlerts'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setJobAlerts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'jobAlerts')
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [firebaseUser]);

  const runSearch = async (e?: React.FormEvent, overrides?: { query?: string; workMode?: string; employmentType?: string }) => {
    if (e) e.preventDefault();
    if (demoMode) {
      setJobs(DEMO_JOB_LISTINGS);
      setProviderAlerts([]);
      setDedupStats(null);
      toast('Loaded Sample Demo jobs (Google Jobs & LinkedIn Jobs samples)', 'info');
      return;
    }

    const activeQuery = overrides?.query || queryText || (category !== 'All Categories' ? category : 'Software Developer');
    const locationStr = [cityFilter, stateFilter, country].filter(Boolean).join(', ');
    setLoading(true);
    try {
      const data = await apiFetch<{
        jobs: JobListing[];
        duplicatesRemoved: number;
        flaggedCount: number;
        providers: Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }>;
      }>('/api/discovery/jobs', {
        method: 'POST',
        body: JSON.stringify({
          query: activeQuery,
          category: category === 'All Categories' ? '' : category,
          country,
          location: locationStr,
          includeGoogleJobs,
          includeLinkedInJobs,
        }),
      });
      setJobs(data.jobs || []);
      setProviderAlerts(data.providers || []);
      setDedupStats({
        duplicatesRemoved: data.duplicatesRemoved || 0,
        flaggedCount: data.flaggedCount || 0,
      });
      if ((data.jobs || []).length > 0) {
        toast(`Found ${data.jobs.length} active hiring listings`, 'success');
      } else {
        toast('Search returned 0 live listings', 'info', 'Check provider credentials or toggle Sample Demo Mode.');
      }
    } catch (err) {
      toast('Job discovery failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeMatch = async (job: JobListing) => {
    setMatchingJobId(job.id);
    try {
      const res = await apiFetch<{ match: JobMatchAnalysis }>('/api/ai/match-job', {
        method: 'POST',
        body: JSON.stringify({
          profile: freelancerProfile || {
            skills: ['React', 'TypeScript', 'Video Editing', 'SEO'],
            experienceLevel: 'Intermediate',
            country,
            city: cityFilter,
            workPreference: 'Remote',
          },
          job,
        }),
      });
      setMatchMap((prev) => ({ ...prev, [job.id]: res.match }));
      toast(`Match evaluated: ${res.match.overallScore}/100`, 'success');
    } catch (err) {
      toast('Job match failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setMatchingJobId(null);
    }
  };

  const handleGenerateDraft = async (job: JobListing) => {
    setDraftLoading(true);
    setGeneratedDraft(null);
    try {
      const res = await apiFetch<{ subject?: string; body: string }>('/api/ai/job-application-draft', {
        method: 'POST',
        body: JSON.stringify({
          profile: freelancerProfile || { fullName: 'Applicant', skills: job.skills.slice(0, 4) },
          job,
          format: draftFormat,
        }),
      });
      setGeneratedDraft(res);
    } catch (err) {
      toast('Failed to generate draft', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setDraftLoading(false);
    }
  };

  const safeJobId = (raw: string) =>
    raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 120) || `job_${Date.now()}`;

  const handleSaveJob = async (job: JobListing) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'savedJobs'), {
        ownerId: firebaseUser.uid,
        jobId: safeJobId(job.id),
        title: job.title.slice(0, 195),
        company: job.company.slice(0, 145),
        location: job.location.slice(0, 195),
        employmentType: job.employmentType,
        workMode: job.workMode,
        salary: (job.salary || 'Not specified').slice(0, 95),
        sourceProvider: job.sourceProvider,
        originalUrl: (job.originalUrl || '').slice(0, 590),
        applicationUrl: (job.applicationUrl || job.originalUrl || '').slice(0, 590),
        skills: (job.skills || []).slice(0, 15),
        isDemo: Boolean(job.isDemo),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Job saved to Saved Jobs', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'savedJobs');
    }
  };

  const handleTrackApplication = async (job: JobListing, draftText?: string) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'jobApplications'), {
        ownerId: firebaseUser.uid,
        jobId: safeJobId(job.id),
        title: job.title.slice(0, 195),
        company: job.company.slice(0, 145),
        sourceProvider: job.sourceProvider,
        applicationUrl: (job.applicationUrl || job.originalUrl || '').slice(0, 590),
        status: draftText ? 'Draft' : 'Applied',
        coverLetterDraft: (draftText || '').slice(0, 4500),
        appliedDate: new Date().toISOString().slice(0, 10),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast(draftText ? 'Saved application draft to Applied Jobs' : 'Tracked in Applied Jobs', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'jobApplications');
    }
  };

  const handleReportJob = async (job: JobListing) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'abuseReports'), {
        reporterId: firebaseUser.uid,
        targetType: 'job',
        targetId: safeJobId(job.id),
        reason: 'Inaccurate, expired, or duplicate job listing',
        details: `${job.title} (${job.company}) · ${job.sourceProvider}`.slice(0, 1400),
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Reported job listing for admin review', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'abuseReports');
    }
  };

  const createAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !alertKeywords.trim()) return;
    try {
      await addDoc(collection(db, 'jobAlerts'), {
        ownerId: firebaseUser.uid,
        keywords: alertKeywords.trim().slice(0, 180),
        country: alertCountry.trim() || 'India',
        workMode: alertWorkMode,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Job alert created', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'jobAlerts');
    }
  };

  const filteredJobs = useMemo(() => {
    const sourceList = jobs;
    return sourceList.filter((j) => {
      if (tab === 'remote' && j.workMode !== 'Remote') return false;
      if (tab === 'internships' && j.employmentType !== 'Internship') return false;
      if (tab === 'freelance' && j.employmentType !== 'Freelance' && j.employmentType !== 'Contract') return false;
      if (workMode !== 'All' && j.workMode !== workMode) return false;
      if (employmentType !== 'All' && j.employmentType !== employmentType) return false;
      if (experienceLevel !== 'All' && !(j.experienceLevel || '').toLowerCase().includes(experienceLevel.toLowerCase())) {
        return false;
      }
      if (companyFilter.trim() && !j.company.toLowerCase().includes(companyFilter.trim().toLowerCase())) return false;
      if (skillFilter.trim()) {
        const s = skillFilter.trim().toLowerCase();
        const hit =
          j.title.toLowerCase().includes(s) ||
          j.description.toLowerCase().includes(s) ||
          j.skills.some((sk) => sk.toLowerCase().includes(s));
        if (!hit) return false;
      }
      if (sourceFilter !== 'All' && j.sourceProvider !== sourceFilter) return false;
      if (salaryPresentOnly && (!j.salary || j.salary === 'Not specified')) return false;
      if (datePostedFilter === '24h' && !/hour|today|just/i.test(j.postedDate)) return false;
      return true;
    });
  }, [
    jobs,
    tab,
    workMode,
    employmentType,
    experienceLevel,
    companyFilter,
    skillFilter,
    sourceFilter,
    salaryPresentOnly,
    datePostedFilter,
  ]);

  const subTabs: Array<{ id: JobHubTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'discover', label: 'Discover Jobs' },
    { id: 'recommended', label: 'Recommended' },
    { id: 'remote', label: 'Remote Jobs' },
    { id: 'internships', label: 'Internships' },
    { id: 'freelance', label: 'Freelance & Contract' },
    { id: 'saved', label: `Saved (${savedJobs.length})` },
    { id: 'applied', label: `Applied (${appliedJobs.length})` },
    { id: 'alerts', label: `Alerts (${jobAlerts.length})` },
  ];

  const renderJobList = (items: JobListing[]) => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-52 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center">
          <Briefcase className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
            No Jobs Match Current Filters
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Run a live Google Jobs + LinkedIn Jobs query above or toggle Sample Demo Mode to inspect normalized job cards and AI match scoring.
          </p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {items.map((job) => {
          const match = matchMap[job.id];
          return (
            <article
              key={job.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Type A: Hiring Opportunity · {job.sourceProvider} · {job.employmentType} · {job.workMode}
                    {job.isDemo ? ' · Sample Demo' : ''}
                    {job.possibleDuplicate ? ' · Possible Duplicate' : ''}
                  </p>
                  {match && (
                    <span className="font-mono tabular-nums text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                      {match.overallScore}/100 Match
                    </span>
                  )}
                </div>

                <h3 className="mt-1.5 text-lg font-bold text-[#0B1221] dark:text-white leading-snug">
                  {job.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                  {job.company} · {job.location}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  Salary: {job.salary || 'Not specified'} · Posted: {job.postedDate || 'Not specified'}
                </p>

                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                  {job.description}
                </p>

                {job.skills.length > 0 && (
                  <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                    Skills: {job.skills.slice(0, 6).join(' · ')}
                  </p>
                )}

                {match && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                    <p className="font-semibold text-blue-600 dark:text-blue-400">
                      AI Match ({match.skillMatchScore}% skills): {match.reasonsForRecommendation[0] || match.locationCompatibility}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedJob(job);
                    setGeneratedDraft(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  View &amp; Apply
                </button>
                <button
                  onClick={() => handleAnalyzeMatch(job)}
                  disabled={matchingJobId === job.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {matchingJobId === job.id ? 'Scoring...' : 'AI Match'}
                </button>
                <button
                  onClick={() => handleSaveJob(job)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5" /> Save
                </button>
                <a
                  href={job.applicationUrl || job.originalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
                >
                  Apply Link <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => handleReportJob(job)}
                  className="ml-auto p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  title="Flag inaccurate listing"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400">
            Unified Job &amp; Project Discovery · Google Jobs + LinkedIn Jobs
          </p>
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white mt-0.5">
            Job &amp; Hiring Opportunity Hub
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Every card below is a verified Type A Hiring Opportunity — strictly separated from Type B Potential Business Leads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSwitchToBusinessLeads && (
            <button
              onClick={onSwitchToBusinessLeads}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Switch to Business Leads
            </button>
          )}
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] text-xs font-medium cursor-pointer whitespace-nowrap shrink-0">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => {
                const next = e.target.checked;
                setDemoMode(next);
                setJobs(next ? DEMO_JOB_LISTINGS : []);
                setProviderAlerts([]);
              }}
              className="rounded"
            />
            Sample Demo Mode
          </label>
        </div>
      </div>

      {/* Sub-navigation bar */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-x-auto">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              tab === t.id
                ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Active Search Results', value: jobs.length },
              { label: 'Saved Jobs', value: savedJobs.length },
              { label: 'Tracked Applications', value: appliedJobs.length },
              { label: 'Active Job Alerts', value: jobAlerts.filter((a) => a.active).length },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-3">
            <h2 className="text-base font-bold">Quick Job Discovery Presets</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Remote React Developer', q: 'React Developer', mode: 'Remote' },
                { label: 'Freelance Video Editor', q: 'Freelance Video Editor', mode: 'All' },
                { label: 'Cybersecurity Internships', q: 'Cybersecurity Intern', mode: 'All' },
                { label: 'UI/UX Contract Designer', q: 'UI UX Designer', mode: 'Remote' },
                { label: 'SEO Specialist', q: 'SEO Specialist', mode: 'All' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setQueryText(preset.q);
                    setWorkMode(preset.mode);
                    setTab('discover');
                    runSearch(undefined, { query: preset.q, workMode: preset.mode });
                  }}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Panel for discovery tabs */}
      {['discover', 'recommended', 'remote', 'internships', 'freelance'].includes(tab) && (
        <>
          <form onSubmit={(e) => runSearch(e)} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Job Title / Keyword *</label>
                <input
                  required
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="e.g. Frontend Engineer, Video Editor"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
                  {JOB_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Country</label>
                <input value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">City / State</label>
                <input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder="e.g. Jaipur, Bengaluru" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Work Mode</label>
                <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs">
                  <option value="All">All Modes</option>
                  <option value="Remote">Remote</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="On-site">On-site</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Employment Type</label>
                <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs">
                  <option value="All">All Types</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Internship">Internship</option>
                  <option value="Freelance">Freelance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Experience Level</label>
                <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs">
                  <option value="All">All Levels</option>
                  <option value="Entry">Entry / Junior</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Senior">Senior</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Source Provider</label>
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs">
                  <option value="All">All Sources</option>
                  <option value="Google Jobs">Google Jobs</option>
                  <option value="LinkedIn Jobs">LinkedIn Jobs</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Skill Filter</label>
                <input value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} placeholder="e.g. React, Figma" className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Company Filter</label>
                <input value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} placeholder="Filter company..." className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs" />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={includeGoogleJobs} onChange={(e) => setIncludeGoogleJobs(e.target.checked)} className="rounded" /> Google Jobs
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={includeLinkedInJobs} onChange={(e) => setIncludeLinkedInJobs(e.target.checked)} className="rounded" /> LinkedIn Jobs
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={salaryPresentOnly} onChange={(e) => setSalaryPresentOnly(e.target.checked)} className="rounded" /> Salary specified only
                </label>
                <select value={datePostedFilter} onChange={(e) => setDatePostedFilter(e.target.value)} className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs">
                  <option value="All">Any date posted</option>
                  <option value="24h">Last 24 hours</option>
                </select>
                {dedupStats && (
                  <span className="font-mono tabular-nums text-slate-500">
                    Deduplicated: {dedupStats.duplicatesRemoved} merged
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Search className="w-4 h-4" />
                {loading ? 'Searching Jobs...' : demoMode ? 'Load Sample Jobs' : 'Search Jobs'}
              </button>
            </div>
          </form>

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
                          setJobs(DEMO_JOB_LISTINGS);
                          setProviderAlerts([]);
                        }}
                        className="font-semibold underline cursor-pointer"
                      >
                        Preview Sample Jobs
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {tab === 'recommended' && freelancerProfile && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/20 p-4 text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-3">
              <span>
                Matching against your profile: <strong>{freelancerProfile.headline}</strong> ({freelancerProfile.skills.join(', ')})
              </span>
              <button
                onClick={() => filteredJobs.slice(0, 4).forEach((j) => handleAnalyzeMatch(j))}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
              >
                Score Top Visible Jobs with AI
              </button>
            </div>
          )}

          {renderJobList(
            tab === 'recommended'
              ? [...filteredJobs].sort((a, b) => (matchMap[b.id]?.overallScore || 0) - (matchMap[a.id]?.overallScore || 0))
              : filteredJobs
          )}
        </>
      )}

      {/* Saved Jobs Tab */}
      {tab === 'saved' && (
        <div className="space-y-4">
          {savedJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No saved jobs yet. Bookmark listings from Discover Jobs to track them here.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedJobs.map((sj) => (
                <div key={sj.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-2">
                  <p className="text-xs text-slate-500">{sj.sourceProvider} · {sj.employmentType} · {sj.workMode}</p>
                  <h3 className="text-base font-bold text-[#0B1221] dark:text-white">{sj.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{sj.company} · {sj.location}</p>
                  <p className="text-xs font-mono tabular-nums text-slate-500">Salary: {sj.salary}</p>
                  <div className="pt-3 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                    <a href={sj.applicationUrl || sj.originalUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1">
                      Open Listing <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={async () => {
                        try {
                          await deleteDoc(doc(db, 'savedJobs', sj.id));
                          toast('Removed saved job', 'info');
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, `savedJobs/${sj.id}`);
                        }
                      }}
                      className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Applied Jobs Tab */}
      {tab === 'applied' && (
        <div className="space-y-4">
          {appliedJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No tracked job applications yet. Open any job card and generate an application draft or click Track Application.
            </div>
          ) : (
            <div className="space-y-3">
              {appliedJobs.map((app) => (
                <div key={app.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500">{app.sourceProvider} · Applied {app.appliedDate || 'Draft'}</p>
                    <h3 className="text-base font-bold text-[#0B1221] dark:text-white">{app.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{app.company}</p>
                    {app.coverLetterDraft && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 max-w-2xl">{app.coverLetterDraft}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <select
                      value={app.status}
                      onChange={async (e) => {
                        try {
                          await updateDoc(doc(db, 'jobApplications', app.id), {
                            status: e.target.value,
                            updatedAt: serverTimestamp(),
                          });
                          toast('Application status updated', 'success');
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `jobApplications/${app.id}`);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
                    >
                      {['Draft', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn'].map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                    <button
                      onClick={async () => {
                        try {
                          await deleteDoc(doc(db, 'jobApplications', app.id));
                          toast('Removed application record', 'info');
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, `jobApplications/${app.id}`);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Job Alerts Tab */}
      {tab === 'alerts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={createAlert} className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4 h-fit">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" /> Create Job Alert
            </h2>
            <div>
              <label className="block text-xs font-medium mb-1">Keywords / Role *</label>
              <input required value={alertKeywords} onChange={(e) => setAlertKeywords(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Country</label>
                <input value={alertCountry} onChange={(e) => setAlertCountry(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Work Mode</label>
                <select value={alertWorkMode} onChange={(e) => setAlertWorkMode(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
                  <option value="Any">Any</option>
                  <option value="Remote">Remote</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="On-site">On-site</option>
                </select>
              </div>
            </div>
            <button type="submit" className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer">
              Save Job Alert
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {jobAlerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-8 text-center text-sm text-slate-500">
                No job alerts configured yet.
              </div>
            ) : (
              jobAlerts.map((al) => (
                <div key={al.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{al.keywords}</p>
                    <p className="text-xs text-slate-500">{al.country} · {al.workMode || 'Any'} · {al.active ? 'Active' : 'Paused'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setQueryText(al.keywords);
                        setCountry(al.country);
                        if (al.workMode && al.workMode !== 'Any') setWorkMode(al.workMode);
                        setTab('discover');
                        runSearch(undefined, { query: al.keywords });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      Run Now
                    </button>
                    <button
                      onClick={async () => {
                        await deleteDoc(doc(db, 'jobAlerts', al.id));
                        toast('Alert removed', 'info');
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Job Details Modal with AI Match & Cover Letter / Proposal Generator */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto">
          <div className="max-w-2xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <p className="text-xs text-slate-500">
                  Type A: Hiring Opportunity · {selectedJob.sourceProvider} · {selectedJob.employmentType} · {selectedJob.workMode}
                </p>
                <h2 className="mt-1 text-xl font-bold text-[#0B1221] dark:text-white">{selectedJob.title}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">{selectedJob.company} · {selectedJob.location}</p>
              </div>
              <button onClick={() => setSelectedJob(null)} className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer">
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-[#0B1221] p-3.5 rounded-xl">
              <div>
                <span className="text-slate-400 block">Salary</span>
                <strong className="font-mono tabular-nums">{selectedJob.salary || 'Not specified'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Posted</span>
                <strong>{selectedJob.postedDate || 'Not specified'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Deadline</span>
                <strong>{selectedJob.deadline || 'Not specified'}</strong>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">Role Description</p>
              <p className="leading-relaxed whitespace-pre-line">{selectedJob.description}</p>
              {selectedJob.requirements.length > 0 && (
                <ul className="list-disc pl-5 text-xs space-y-1 pt-1">
                  {selectedJob.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* AI Match Result */}
            {matchMap[selectedJob.id] && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/20 p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-blue-700 dark:text-blue-300">
                  <span>AI Job Match Analysis</span>
                  <span className="font-mono tabular-nums">{matchMap[selectedJob.id].overallScore}/100</span>
                </div>
                <p><strong>Matching Skills:</strong> {matchMap[selectedJob.id].matchingSkills.join(', ') || 'None specified'}</p>
                <p><strong>Missing / To Highlight:</strong> {matchMap[selectedJob.id].missingSkills.join(', ') || 'None noted'}</p>
                <p className="text-slate-500">{matchMap[selectedJob.id].disclaimer}</p>
              </div>
            )}

            {/* AI Cover Letter / Proposal Generator */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" /> AI Application Draft Generator
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={draftFormat}
                    onChange={(e) => setDraftFormat(e.target.value as any)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
                  >
                    <option value="Cover Letter">Cover Letter</option>
                    <option value="Short Pitch">Short Pitch</option>
                    <option value="Freelance Proposal">Freelance Proposal</option>
                  </select>
                  <button
                    onClick={() => handleGenerateDraft(selectedJob)}
                    disabled={draftLoading}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {draftLoading ? 'Drafting...' : 'Generate Draft'}
                  </button>
                </div>
              </div>
              {generatedDraft && (
                <div className="space-y-2">
                  {generatedDraft.subject && (
                    <p className="text-xs font-semibold">Subject: {generatedDraft.subject}</p>
                  )}
                  <textarea
                    rows={5}
                    value={generatedDraft.body}
                    onChange={(e) => setGeneratedDraft((g) => (g ? { ...g, body: e.target.value } : g))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTrackApplication(selectedJob, generatedDraft.body)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Save to Applied Jobs
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedDraft.body);
                        toast('Draft copied to clipboard', 'success');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                    >
                      Copy Text
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <a
                href={selectedJob.applicationUrl || selectedJob.originalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                Open Official Apply Link <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => handleTrackApplication(selectedJob)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Applied
              </button>
              <button
                onClick={() => handleAnalyzeMatch(selectedJob)}
                disabled={matchingJobId === selectedJob.id}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" /> Score Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
