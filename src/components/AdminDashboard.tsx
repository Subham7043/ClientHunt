import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  Database,
  ExternalLink,
  FileWarning,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Shield,
  Users,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  AbuseReport,
  AiTelemetryEntry,
  AuditLog,
  FailedRequestLog,
  JobListing,
  MarketplaceProject,
  ProviderHealth,
  ProviderId,
  ScholarshipRecord,
  UserAccount,
} from '../types/domain';
import { DashboardShell, type NavItem } from './DashboardShell';

export function AdminDashboard({
  onBackToPublic,
  onExitAdmin,
  initialTab = 'overview',
}: {
  onBackToPublic: () => void;
  onExitAdmin: () => void;
  initialTab?: string;
}) {
  const { firebaseUser } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState(initialTab);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [projects, setProjects] = useState<MarketplaceProject[]>([]);
  const [scholarships, setScholarships] = useState<ScholarshipRecord[]>([]);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [reports, setReports] = useState<AbuseReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [failedLogs, setFailedLogs] = useState<FailedRequestLog[]>([]);
  const [budgetInfo, setBudgetInfo] = useState<{
    dailyEstimatedCreditCap: number;
    totalEstimatedCreditsToday: number;
    capReached: boolean;
  }>({ dailyEstimatedCreditCap: 500, totalEstimatedCreditsToday: 0, capReached: false });
  const [budgetDraft, setBudgetDraft] = useState('500');

  const [aiTelemetry, setAiTelemetry] = useState<AiTelemetryEntry[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [schFilter, setSchFilter] = useState('All');
  const [schSearch, setSchSearch] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [addSchOpen, setAddSchOpen] = useState(false);
  const [newSch, setNewSch] = useState({
    title: '',
    provider: '',
    category: 'Government' as ScholarshipRecord['category'],
    country: 'India',
    state: 'All India',
    amount: 'Not specified',
    fundingType: 'Stipend / Grant' as ScholarshipRecord['fundingType'],
    deadline: 'Not specified',
    officialApplicationUrl: '',
    sourceType: 'Official Government Portal' as ScholarshipRecord['sourceType'],
    description: '',
  });

  const loadServerProviders = useCallback(async () => {
    try {
      const [pRes, aiRes] = await Promise.all([
        apiFetch<{
          providers: ProviderHealth[];
          budget?: {
            dailyEstimatedCreditCap: number;
            totalEstimatedCreditsToday: number;
            capReached: boolean;
          };
          failedLogs?: FailedRequestLog[];
        }>('/api/admin/providers'),
        apiFetch<{ telemetry: AiTelemetryEntry[] }>('/api/admin/ai-telemetry'),
      ]);
      setProviders(pRes.providers || []);
      if (pRes.budget) {
        setBudgetInfo(pRes.budget);
        setBudgetDraft(String(pRes.budget.dailyEstimatedCreditCap));
      }
      setFailedLogs(pRes.failedLogs || []);
      setAiTelemetry(aiRes.telemetry || []);
    } catch (err) {
      toast('Could not fetch server provider telemetry', 'error', err instanceof Error ? err.message : undefined);
    }
  }, [toast]);

  useEffect(() => {
    if (!firebaseUser) return;
    const u1 = onSnapshot(
      collection(db, 'users'),
      (s) => setUsers(s.docs.map((d) => d.data() as UserAccount)),
      (e) => handleFirestoreError(e, OperationType.LIST, 'users')
    );
    const u2 = onSnapshot(
      collection(db, 'projects'),
      (s) => setProjects(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'projects')
    );
    const u3 = onSnapshot(
      collection(db, 'abuseReports'),
      (s) => setReports(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'abuseReports')
    );
    const u4 = onSnapshot(
      query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(40)),
      (s) => setAuditLogs(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'auditLogs')
    );
    const u5 = onSnapshot(
      collection(db, 'scholarships'),
      (s) => setScholarships(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'scholarships')
    );
    const u6 = onSnapshot(
      collection(db, 'jobs'),
      (s) => setJobs(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'jobs')
    );
    loadServerProviders();
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
    };
  }, [firebaseUser, loadServerProviders]);

  const logAdminAction = async (action: string, targetType: string, targetId: string, details: string) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'auditLogs'), {
        actorId: firebaseUser.uid,
        actorEmail: firebaseUser.email || '',
        action,
        targetType,
        targetId,
        details: details.slice(0, 950),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Audit log write skipped:', err);
    }
  };

  const toggleUserStatus = async (u: UserAccount) => {
    const nextStatus = u.status === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      await logAdminAction(`user_${nextStatus}`, 'user', u.uid, `Set ${u.email} status to ${nextStatus}`);
      toast(`Account ${nextStatus}`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${u.uid}`);
    }
  };

  const resolveReport = async (r: AbuseReport, status: 'resolved' | 'dismissed') => {
    try {
      await updateDoc(doc(db, 'abuseReports', r.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      await logAdminAction(`report_${status}`, r.targetType, r.targetId, r.reason);
      toast(`Report ${status}`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `abuseReports/${r.id}`);
    }
  };

  const updateProvider = async (
    id: ProviderId,
    payload: { enabled?: boolean; apiKey?: string; dailyQuotaLimit?: number }
  ) => {
    if (typeof payload.apiKey === 'string' && !payload.apiKey.trim()) {
      toast('Please paste a valid API key before clicking Save Key', 'error');
      return;
    }
    try {
      const res = await apiFetch<{ provider: ProviderHealth }>(`/api/admin/providers/${id}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setProviders((prev) => prev.map((p) => (p.id === id ? res.provider : p)));
      setKeyDrafts((prev) => ({ ...prev, [id]: '' }));
      await logAdminAction(
        'provider_updated',
        'provider',
        id,
        JSON.stringify({ enabled: payload.enabled, hasKey: Boolean(payload.apiKey) })
      );
      toast(`${res.provider.name} configuration updated`, 'success');
    } catch (err) {
      toast('Failed to update provider', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const updateDailyBudgetCap = async () => {
    const cap = Number(budgetDraft);
    if (!Number.isFinite(cap) || cap < 10) {
      toast('Enter a valid credit cap (>= 10)', 'error');
      return;
    }
    try {
      const res = await apiFetch<{
        dailyEstimatedCreditCap: number;
        budget: {
          dailyEstimatedCreditCap: number;
          totalEstimatedCreditsToday: number;
          capReached: boolean;
        };
      }>('/api/admin/budget', {
        method: 'POST',
        body: JSON.stringify({ dailyEstimatedCreditCap: cap }),
      });
      if (res.budget) setBudgetInfo(res.budget);
      await logAdminAction('budget_updated', 'system', 'daily_credit_cap', `Set daily cap to ${cap}`);
      toast('Daily estimated credit budget updated', 'success');
    } catch (err) {
      toast('Could not update budget cap', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const testProvider = async (id: ProviderId) => {
    try {
      const res = await apiFetch<{ ok: boolean; configured: boolean; count?: number; error?: string }>(
        `/api/admin/providers/${id}/test`,
        { method: 'POST' }
      );
      await loadServerProviders();
      if (res.ok) {
        toast(`Connection test passed (${res.count ?? 0} sample items)`, 'success');
      } else {
        toast('Connection test returned warning', 'error', res.error || 'Provider not configured');
      }
    } catch (err) {
      toast('Test failed', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleUpdateScholarship = async (
    sch: ScholarshipRecord,
    patch: Partial<Pick<ScholarshipRecord, 'sourceVerificationStatus' | 'status' | 'sourceType' | 'lastVerifiedAt' | 'verifiedFacts'>>,
    actionName: string
  ) => {
    try {
      await updateDoc(doc(db, 'scholarships', sch.id), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      await logAdminAction(actionName, 'scholarship', sch.id, sch.title);
      toast(`Scholarship updated (${actionName})`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `scholarships/${sch.id}`);
    }
  };

  const handleRecheckScholarshipSource = async (sch: ScholarshipRecord) => {
    const url = sch.officialApplicationUrl || sch.sourceUrl;
    if (!url) {
      toast('No URL on record to verify', 'error');
      return;
    }
    try {
      const res = await apiFetch<{
        ok: boolean;
        sourceType: ScholarshipRecord['sourceType'];
        verificationStatus: ScholarshipRecord['sourceVerificationStatus'];
        lastVerifiedAt?: string;
        error?: string;
      }>('/api/scholarships/verify-source', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      await handleUpdateScholarship(
        sch,
        {
          sourceType: res.sourceType,
          sourceVerificationStatus: res.verificationStatus,
          lastVerifiedAt: res.lastVerifiedAt || new Date().toISOString(),
        },
        res.ok ? 'scholarship_recheck_verified' : 'scholarship_recheck_warning'
      );
    } catch (err) {
      toast('Source recheck failed', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleCreateVerifiedScholarship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !newSch.title.trim() || !newSch.officialApplicationUrl.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'scholarships'), {
        ownerId: firebaseUser.uid,
        title: newSch.title.trim().slice(0, 235),
        provider: (newSch.provider.trim() || 'Official Provider').slice(0, 175),
        description: newSch.description.trim().slice(0, 3900),
        category: newSch.category,
        country: newSch.country.trim().slice(0, 75) || 'India',
        state: newSch.state.trim().slice(0, 75) || 'All India',
        amount: newSch.amount.trim().slice(0, 115) || 'Not specified',
        currency: 'INR',
        fundingType: newSch.fundingType,
        deadline: newSch.deadline.trim().slice(0, 75) || 'Not specified',
        officialApplicationUrl: newSch.officialApplicationUrl.trim().slice(0, 590),
        sourceUrl: newSch.officialApplicationUrl.trim().slice(0, 590),
        sourceType: newSch.sourceType,
        sourceVerificationStatus: 'Verified',
        lastVerifiedAt: new Date().toISOString(),
        status: 'Open',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAdminAction('scholarship_created', 'scholarship', docRef.id, newSch.title);
      toast('Verified scholarship added to directory', 'success');
      setAddSchOpen(false);
      setNewSch({
        title: '',
        provider: '',
        category: 'Government',
        country: 'India',
        state: 'All India',
        amount: 'Not specified',
        fundingType: 'Stipend / Grant',
        deadline: 'Not specified',
        officialApplicationUrl: '',
        sourceType: 'Official Government Portal',
        description: '',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'scholarships');
    }
  };

  const handleUpdateJobStatus = async (job: JobListing, status: JobListing['status'], actionName: string) => {
    try {
      await updateDoc(doc(db, 'jobs', job.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      await logAdminAction(actionName, 'job', job.id, `${job.title} -> ${status}`);
      toast(`Job status set to ${status}`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `jobs/${job.id}`);
    }
  };

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Platform Overview', icon: LayoutDashboard },
    { id: 'users', label: 'User Management', icon: Users, badge: users.length },
    { id: 'scholarships', label: 'Scholarships', icon: GraduationCap, badge: scholarships.length },
    { id: 'jobs', label: 'Jobs Directory', icon: Briefcase, badge: jobs.length },
    { id: 'providers', label: 'API & Data Sources', icon: KeyRound },
    {
      id: 'reports',
      label: 'Reports & Duplicates',
      icon: FileWarning,
      badge: reports.filter((r) => r.status === 'open').length,
    },
    { id: 'monitoring', label: 'Telemetry & Failures', icon: Activity },
  ];

  const studentCount = users.filter((u) => u.role === 'student').length;
  const freelancerCount = users.filter((u) => u.role === 'freelancer').length;
  const businessCount = users.filter((u) => u.role === 'business').length;
  const activeProjCount = projects.filter((p) => p.status === 'Published').length;
  const verifiedSchCount = scholarships.filter((s) => s.sourceVerificationStatus === 'Verified').length;
  const openReportsCount = reports.filter((r) => r.status === 'open').length;

  return (
    <DashboardShell
      roleLabel="Admin Console"
      navItems={navItems}
      activeTab={tab}
      onSelectTab={setTab}
      onBackToPublic={onBackToPublic}
      adminToggle={{ inAdminView: true, onToggleAdminView: onExitAdmin }}
    >
      {tab === 'overview' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Platform Analytics &amp; Operations</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Verified backend-enforced administrator view across Freelancer, Job, Scholarship, and Marketplace modules.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Users', value: users.length },
              { label: 'Students', value: studentCount },
              { label: 'Freelancers', value: freelancerCount },
              { label: 'Businesses', value: businessCount },
              { label: 'Active Projects', value: activeProjCount },
              { label: 'Verified Scholarships', value: verifiedSchCount },
              { label: 'Tracked Jobs', value: jobs.length },
              { label: 'Open Reports', value: openReportsCount },
              {
                label: 'Est. Credits Today',
                value: `${budgetInfo.totalEstimatedCreditsToday}/${budgetInfo.dailyEstimatedCreditCap}`,
              },
              { label: 'Failed API Calls', value: failedLogs.length },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">User Management</h1>
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search email or name..."
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-sm sm:w-64"
            />
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">User</th>
                  <th className="py-3 px-4 font-medium">Role</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users
                  .filter(
                    (u) =>
                      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
                      u.displayName.toLowerCase().includes(userSearch.toLowerCase())
                  )
                  .map((u) => (
                    <tr key={u.uid}>
                      <td className="py-3 px-4">
                        <p className="font-semibold">{u.displayName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="py-3 px-4 text-xs capitalize">{u.role}</td>
                      <td className="py-3 px-4 text-xs font-medium">{u.status}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => toggleUserStatus(u)}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'scholarships' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Scholarship Management &amp; Source Verification</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify official portals, recheck live URLs, flag duplicates, or mark expired listings.
              </p>
            </div>
            <button
              onClick={() => setAddSchOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Verified Scholarship
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <input
              value={schSearch}
              onChange={(e) => setSchSearch(e.target.value)}
              placeholder="Filter scholarship title or provider..."
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-xs sm:w-72"
            />
            <select
              value={schFilter}
              onChange={(e) => setSchFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-xs"
            >
              <option value="All">All Verification States</option>
              <option value="Pending Review">Pending Review</option>
              <option value="Verified">Verified</option>
              <option value="Unverified">Unverified</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          {scholarships.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No curated scholarships stored in Firestore yet. Click &ldquo;Add Verified Scholarship&rdquo; above to curate one.
            </div>
          ) : (
            <div className="space-y-3">
              {scholarships
                .filter((s) => schFilter === 'All' || s.sourceVerificationStatus === schFilter)
                .filter(
                  (s) =>
                    !schSearch.trim() ||
                    s.title.toLowerCase().includes(schSearch.toLowerCase()) ||
                    s.provider.toLowerCase().includes(schSearch.toLowerCase())
                )
                .map((s) => (
                  <div key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">
                        {s.category} · {s.sourceType} · <strong>{s.sourceVerificationStatus}</strong> · Status: {s.status}
                      </p>
                      <h3 className="text-base font-bold">{s.title}</h3>
                      <p className="text-xs text-slate-500">
                        {s.provider} · {s.country} · Deadline: {s.deadline || 'Not specified'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                      <button
                        onClick={() => handleUpdateScholarship(s, { sourceVerificationStatus: 'Verified' }, 'scholarship_verified')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                      >
                        Verify
                      </button>
                      <button
                        onClick={() => handleRecheckScholarshipSource(s)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                      >
                        Recheck URL
                      </button>
                      <button
                        onClick={() => handleUpdateScholarship(s, { status: 'Expired' }, 'scholarship_expired')}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                      >
                        Mark Expired
                      </button>
                      <button
                        onClick={() =>
                          handleUpdateScholarship(
                            s,
                            { sourceVerificationStatus: 'Rejected', verifiedFacts: ['Flagged as duplicate or rejected by admin'] },
                            'scholarship_duplicate_rejected'
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 font-semibold cursor-pointer"
                      >
                        Reject / Duplicate
                      </button>
                      {s.officialApplicationUrl && (
                        <a href={s.officialApplicationUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {addSchOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
              <form
                onSubmit={handleCreateVerifiedScholarship}
                className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-3 max-h-[90vh] overflow-y-auto"
              >
                <h2 className="text-lg font-bold">Add Verified Scholarship</h2>
                <input
                  required
                  value={newSch.title}
                  onChange={(e) => setNewSch({ ...newSch, title: e.target.value })}
                  placeholder="Official Scholarship Title *"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
                <input
                  required
                  value={newSch.provider}
                  onChange={(e) => setNewSch({ ...newSch, provider: e.target.value })}
                  placeholder="Sponsor / Ministry / University *"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newSch.category}
                    onChange={(e) => setNewSch({ ...newSch, category: e.target.value as any })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
                  >
                    <option value="Government">Government</option>
                    <option value="Private">Private</option>
                    <option value="University">University</option>
                    <option value="International">International</option>
                    <option value="Fellowship & Grant">Fellowship &amp; Grant</option>
                  </select>
                  <select
                    value={newSch.sourceType}
                    onChange={(e) => setNewSch({ ...newSch, sourceType: e.target.value as any })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
                  >
                    <option value="Official Government Portal">Official Government Portal</option>
                    <option value="Official Scholarship Provider">Official Scholarship Provider</option>
                    <option value="Official University Source">Official University Source</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    required
                    value={newSch.country}
                    onChange={(e) => setNewSch({ ...newSch, country: e.target.value })}
                    placeholder="Country"
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                  />
                  <input
                    value={newSch.amount}
                    onChange={(e) => setNewSch({ ...newSch, amount: e.target.value })}
                    placeholder="Amount"
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                  />
                  <input
                    value={newSch.deadline}
                    onChange={(e) => setNewSch({ ...newSch, deadline: e.target.value })}
                    placeholder="YYYY-MM-DD"
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                  />
                </div>
                <input
                  required
                  type="url"
                  value={newSch.officialApplicationUrl}
                  onChange={(e) => setNewSch({ ...newSch, officialApplicationUrl: e.target.value })}
                  placeholder="Official Application URL (https://...) *"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
                <textarea
                  rows={3}
                  value={newSch.description}
                  onChange={(e) => setNewSch({ ...newSch, description: e.target.value })}
                  placeholder="Summary & eligibility overview..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAddSchOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
                    Save Verified Scholarship
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {tab === 'jobs' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Job Management &amp; Deduplication</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect stored Google Jobs and LinkedIn Jobs records, mark expired listings, or flag duplicates.
              </p>
            </div>
            <input
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              placeholder="Search job title or company..."
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-xs sm:w-64"
            />
          </div>
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No curated job listings stored in Firestore yet.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs
                .filter(
                  (j) =>
                    !jobSearch.trim() ||
                    j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
                    j.company.toLowerCase().includes(jobSearch.toLowerCase())
                )
                .map((j) => (
                  <div key={j.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        {j.sourceProvider} · {j.employmentType} · Status: <strong>{j.status}</strong>
                      </p>
                      <h3 className="text-base font-bold">{j.title}</h3>
                      <p className="text-xs text-slate-500">{j.company} · {j.location}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs shrink-0">
                      <button
                        onClick={() => handleUpdateJobStatus(j, 'active', 'job_activated')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                      >
                        Active
                      </button>
                      <button
                        onClick={() => handleUpdateJobStatus(j, 'expired', 'job_expired')}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                      >
                        Expired
                      </button>
                      <button
                        onClick={() => handleUpdateJobStatus(j, 'flagged', 'job_flagged_duplicate')}
                        className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-700 dark:text-amber-300 font-semibold cursor-pointer"
                      >
                        Flag Duplicate
                      </button>
                      <button
                        onClick={() => handleUpdateJobStatus(j, 'removed', 'job_removed')}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-300 text-rose-600 font-semibold cursor-pointer"
                      >
                        Remove Invalid
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {tab === 'providers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">API &amp; Data Sources</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Manage credentials, estimated credit budgets, confirmed provider balances, and connection diagnostics.
              </p>
            </div>
            <button
              onClick={loadServerProviders}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {/* Daily Estimated Credit Budget Cap */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">Global Daily Estimated Credit Budget</p>
              <p className="text-lg font-bold font-mono tabular-nums mt-0.5">
                {budgetInfo.totalEstimatedCreditsToday} / {budgetInfo.dailyEstimatedCreditCap} estimated credits used today
                {budgetInfo.capReached && (
                  <span className="ml-2 text-xs text-rose-600">Cap Reached</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-mono tabular-nums"
              />
              <button
                onClick={updateDailyBudgetCap}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Save Daily Cap
              </button>
            </div>
          </div>

          {providers.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-8 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Loading provider status from the server...
              </p>
              <button
                onClick={loadServerProviders}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Retry Loading Providers
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {providers.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">{p.role} · {p.configured ? 'Configured' : 'Not Configured'}</p>
                      <h3 className="text-lg font-bold text-[#0B1221] dark:text-white">{p.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => updateProvider(p.id, { enabled: e.target.checked })}
                        className="rounded"
                      />
                      Enabled
                    </label>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 dark:bg-[#0B1221] p-3 rounded-xl font-mono tabular-nums text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Requests</span>
                      <strong>{p.requestsMade}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Success</span>
                      <strong className="text-emerald-600">{p.successfulRequests}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Est. Credits</span>
                      <strong>{p.estimatedCreditsConsumed ?? p.creditsConsumed}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Daily Cap</span>
                      <strong>{p.dailyQuotaLimit}</strong>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 flex flex-wrap justify-between gap-2">
                    <span>
                      Confirmed Balance:{' '}
                      <strong>
                        {p.confirmedCreditsRemaining !== null && p.confirmedCreditsRemaining !== undefined
                          ? p.confirmedCreditsRemaining
                          : 'Not returned by API'}
                      </strong>
                    </span>
                    {p.costNote && <span>{p.costNote}</span>}
                  </div>

                  {p.lastError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 break-words">
                      Last Error: {p.lastError}
                    </p>
                  )}

                  {p.id !== 'gemini' && p.id !== 'openstreetmap' && (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={keyDrafts[p.id] || ''}
                        onChange={(e) => setKeyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder={`Set ${p.requiredEnvKey} (write-only server secret)`}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => updateProvider(p.id, { apiKey: keyDrafts[p.id] || '' })}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        Save Key
                      </button>
                    </div>
                  )}

                  {p.id === 'gemini' && (
                    <p className="text-xs text-slate-500">
                      Gemini key is managed automatically by the server environment (Settings &gt; Secrets).
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-400">
                      Last sync: {p.lastSuccessfulSync ? new Date(p.lastSuccessfulSync).toLocaleTimeString() : 'Never'}
                    </span>
                    <button
                      onClick={() => testProvider(p.id)}
                      className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Test Connection
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Reported Content, Broken Links &amp; Duplicates</h1>
          {reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No abuse, broken-link, or duplicate reports submitted.
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">
                      {r.targetType} · ID: {r.targetId} · Status: <strong>{r.status}</strong>
                    </p>
                    <p className="text-sm font-semibold mt-0.5">{r.reason}</p>
                    {r.details && <p className="text-xs text-slate-500 mt-0.5">{r.details}</p>}
                  </div>
                  {r.status === 'open' && (
                    <div className="flex gap-2">
                      <button onClick={() => resolveReport(r, 'resolved')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer">
                        Resolve
                      </button>
                      <button onClick={() => resolveReport(r, 'dismissed')} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer">
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'monitoring' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
            <h2 className="text-base font-bold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" /> Failed Request Logs
            </h2>
            {failedLogs.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No failed external API requests logged in this session.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {failedLogs.map((f) => (
                  <div key={f.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1221] text-xs">
                    <p className="font-semibold text-rose-600 dark:text-rose-400">
                      {f.providerName} · {f.endpoint}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300 mt-0.5 break-words">{f.error}</p>
                    <p className="text-[10px] font-mono text-slate-400 mt-1">
                      {new Date(f.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
            <h2 className="text-base font-bold mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" /> AI Request Telemetry
            </h2>
            {aiTelemetry.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No AI requests recorded in this server session yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {aiTelemetry.map((t) => (
                  <div key={t.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1221] text-xs flex justify-between gap-3">
                    <div>
                      <p className="font-semibold capitalize">{t.task}: {t.target}</p>
                      {t.error && <p className="text-rose-600 mt-0.5">{t.error}</p>}
                    </div>
                    <span className="font-mono tabular-nums shrink-0">
                      {t.success ? `${t.confidenceScore ?? '--'}% conf` : 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
            <h2 className="text-base font-bold mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-600" /> Admin Audit Logs
            </h2>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No administrative actions logged yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1221] text-xs">
                    <p className="font-semibold">{log.action} · {log.targetType}</p>
                    <p className="text-slate-500 mt-0.5">{log.details || log.targetId}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
