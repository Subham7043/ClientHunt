import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Database,
  FileWarning,
  KeyRound,
  LayoutDashboard,
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
  MarketplaceProject,
  ProviderHealth,
  ProviderId,
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
  const [reports, setReports] = useState<AbuseReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [aiTelemetry, setAiTelemetry] = useState<AiTelemetryEntry[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});

  const loadServerProviders = useCallback(async () => {
    try {
      const [pRes, aiRes] = await Promise.all([
        apiFetch<{ providers: ProviderHealth[] }>('/api/admin/providers'),
        apiFetch<{ telemetry: AiTelemetryEntry[] }>('/api/admin/ai-telemetry'),
      ]);
      setProviders(pRes.providers || []);
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
    loadServerProviders();
    return () => {
      u1();
      u2();
      u3();
      u4();
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

  const updateProvider = async (id: ProviderId, payload: { enabled?: boolean; apiKey?: string; dailyQuotaLimit?: number }) => {
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
      await logAdminAction('provider_updated', 'provider', id, JSON.stringify({ enabled: payload.enabled, hasKey: Boolean(payload.apiKey) }));
      toast(`${res.provider.name} configuration updated`, 'success');
    } catch (err) {
      toast('Failed to update provider', 'error', err instanceof Error ? err.message : undefined);
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

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Platform Overview', icon: LayoutDashboard },
    { id: 'users', label: 'User Management', icon: Users, badge: users.length },
    { id: 'providers', label: 'API & Data Sources', icon: KeyRound },
    { id: 'reports', label: 'Reports & Content', icon: FileWarning, badge: reports.filter((r) => r.status === 'open').length },
    { id: 'monitoring', label: 'AI & Audit Logs', icon: Activity },
  ];

  const freelancerCount = users.filter((u) => u.role === 'freelancer').length;
  const businessCount = users.filter((u) => u.role === 'business').length;
  const activeProjCount = projects.filter((p) => p.status === 'Published').length;
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
              Verified backend-enforced administrator view.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Users', value: users.length },
              { label: 'Freelancers', value: freelancerCount },
              { label: 'Businesses', value: businessCount },
              { label: 'Active Projects', value: activeProjCount },
              { label: 'Open Reports', value: openReportsCount },
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

      {tab === 'providers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">API &amp; Data Sources</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Server-side credential management, quotas, credit consumption, and connection diagnostics.
              </p>
            </div>
            <button
              onClick={loadServerProviders}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
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
                    <span className="text-[10px] text-slate-400 block">Credits</span>
                    <strong>{p.creditsConsumed}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Daily Cap</span>
                    <strong>{p.dailyQuotaLimit}</strong>
                  </div>
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
          <h1 className="text-2xl font-bold">Reported Content &amp; Moderation</h1>
          {reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No abuse or inaccuracy reports submitted.
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
