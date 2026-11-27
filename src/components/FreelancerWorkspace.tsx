import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  Briefcase,
  Kanban,
  Plus,
  Search,
  Table as TableIcon,
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
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  CRM_STATUSES,
  type CrmActivity,
  type CrmPipelineItem,
  type CrmStatus,
  type MarketplaceProject,
  type NotificationPreference,
  type PitchDraft,
  type ProjectProposal,
  type SavedLead,
} from '../types/domain';
import { ActivitySparkChart, FunnelChart, SimpleBarChart } from './Charts';

export function FreelancerOverview({
  onGoToDiscover,
  onGoToCrm,
  onGoToProjects,
}: {
  onGoToDiscover: () => void;
  onGoToCrm: () => void;
  onGoToProjects: () => void;
}) {
  const { firebaseUser, freelancerProfile } = useAuth();
  const [savedLeads, setSavedLeads] = useState<SavedLead[]>([]);
  const [crmItems, setCrmItems] = useState<CrmPipelineItem[]>([]);
  const [proposals, setProposals] = useState<ProjectProposal[]>([]);
  const [drafts, setDrafts] = useState<PitchDraft[]>([]);
  const [publishedProjectsCount, setPublishedProjectsCount] = useState(0);

  useEffect(() => {
    if (!firebaseUser) return;
    const u1 = onSnapshot(
      query(collection(db, 'savedLeads'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setSavedLeads(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'savedLeads')
    );
    const u2 = onSnapshot(
      query(collection(db, 'crmPipelines'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setCrmItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'crmPipelines')
    );
    const u3 = onSnapshot(
      query(collection(db, 'proposals'), where('freelancerId', '==', firebaseUser.uid)),
      (s) => setProposals(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'proposals')
    );
    const u4 = onSnapshot(
      query(collection(db, 'pitchDrafts'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setDrafts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'pitchDrafts')
    );
    const u5 = onSnapshot(
      query(collection(db, 'projects'), where('status', '==', 'Published')),
      (s) => setPublishedProjectsCount(s.size),
      (e) => handleFirestoreError(e, OperationType.LIST, 'projects')
    );
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, [firebaseUser]);

  const contactedCount = crmItems.filter((c) =>
    ['Contacted', 'Replied', 'Negotiating', 'Converted'].includes(c.status)
  ).length;
  const repliedCount = crmItems.filter((c) =>
    ['Replied', 'Negotiating', 'Converted'].includes(c.status)
  ).length;
  const convertedCount = crmItems.filter((c) => c.status === 'Converted').length;
  const acceptedProposals = proposals.filter((p) => p.status === 'Accepted').length;
  const projectsWon = convertedCount + acceptedProposals;
  const conversionRate =
    contactedCount > 0 ? Math.round((repliedCount / contactedCount) * 100) : 0;

  const stats = [
    { label: 'Saved Leads', value: savedLeads.length },
    { label: 'CRM Pipeline Leads', value: crmItems.length },
    { label: 'Contacted Businesses', value: contactedCount },
    { label: 'Replies Received', value: repliedCount },
    { label: 'Marketplace Projects Open', value: publishedProjectsCount },
    { label: 'Projects Won', value: projectsWon },
    { label: 'Reply Conversion Rate', value: `${conversionRate}%` },
    { label: 'Saved Pitch Drafts', value: drafts.length },
  ];

  const isEmpty = savedLeads.length === 0 && crmItems.length === 0 && proposals.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">
            Welcome, {freelancerProfile?.fullName || 'Freelancer'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Live metrics calculated directly from your Firestore records. Zero invented statistics.
          </p>
        </div>
        <button
          onClick={onGoToDiscover}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer self-start"
        >
          Discover Leads <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Real Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((st) => (
          <div
            key={st.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{st.label}</p>
            <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#0B1221] dark:text-white">
              {st.value}
            </p>
          </div>
        ))}
      </div>

      {isEmpty && (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/50 dark:bg-blue-950/20 p-6">
          <h2 className="text-base font-bold text-[#0B1221] dark:text-white">
            Start Your First Client Discovery Workflow
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
            Your workspace starts clean at zero. Search local businesses in Jaipur or your target city, save strong opportunities to your CRM, or browse live freelance projects posted by businesses.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={onGoToDiscover} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
              1. Discover Business Leads
            </button>
            <button onClick={onGoToProjects} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer">
              2. Browse Open Projects ({publishedProjectsCount})
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#0B1221] dark:text-white">CRM Pipeline Funnel</h2>
            <button onClick={onGoToCrm} className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
              Open CRM
            </button>
          </div>
          <FunnelChart
            stages={[
              { label: 'New / Interested', count: crmItems.filter((c) => ['New', 'Interested', 'Saved'].includes(c.status)).length },
              { label: 'Contacted', count: crmItems.filter((c) => c.status === 'Contacted').length },
              { label: 'Replied', count: crmItems.filter((c) => c.status === 'Replied').length },
              { label: 'Negotiating', count: crmItems.filter((c) => c.status === 'Negotiating').length },
              { label: 'Converted', count: convertedCount },
            ]}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
          <h2 className="text-sm font-semibold text-[#0B1221] dark:text-white mb-4">
            Recent Saved Leads
          </h2>
          {savedLeads.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              No saved leads yet. Save businesses from Discover Leads to track them here.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {savedLeads.slice(0, 5).map((l) => (
                <div key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{l.businessName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {l.category} · {l.location}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                    {l.opportunityScore ?? '--'}/100
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SavedLeadsView({
  onPitchTarget,
}: {
  onPitchTarget: (target: { name: string; context: string; service?: string }) => void;
}) {
  const { firebaseUser } = useAuth();
  const { toast, confirm } = useToast();
  const [saved, setSaved] = useState<SavedLead[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      query(collection(db, 'savedLeads'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setSaved(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'savedLeads')
    );
    return () => unsub();
  }, [firebaseUser]);

  const moveToCrm = async (item: SavedLead) => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'crmPipelines'), {
        ownerId: firebaseUser.uid,
        leadId: item.leadId,
        businessName: item.businessName,
        category: item.category,
        location: item.location,
        source: item.source,
        status: 'Saved',
        estimatedValue: 15000,
        notes: item.notes || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Added to CRM pipeline', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'crmPipelines');
    }
  };

  const removeLead = async (item: SavedLead) => {
    const ok = await confirm({
      title: 'Remove Saved Lead',
      message: `Remove "${item.businessName}" from your saved leads list?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'savedLeads', item.id));
      toast('Removed saved lead', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `savedLeads/${item.id}`);
    }
  };

  const filtered = saved.filter((s) =>
    s.businessName.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Saved Leads</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Leads you bookmarked for follow-up or outreach.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter saved leads..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center">
          <Bookmark className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-base font-semibold">No Saved Leads</h3>
          <p className="mt-1 text-sm text-slate-500">Bookmark businesses from Discover Leads to manage them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {item.category} · {item.source} {item.isDemo ? '· Sample Demo' : ''}
                </p>
                <h3 className="text-lg font-bold text-[#0B1221] dark:text-white mt-1">{item.businessName}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.location}</p>
                {item.website && <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 truncate">{item.website}</p>}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <button
                  onClick={() =>
                    onPitchTarget({
                      name: item.businessName,
                      context: `${item.category} in ${item.location}.`,
                      service: item.suggestedServices?.[0],
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Generate Pitch
                </button>
                <button
                  onClick={() => moveToCrm(item)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Add to CRM
                </button>
                <button
                  onClick={() => removeLead(item)}
                  className="ml-auto p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  aria-label="Delete saved lead"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CrmPipelineView() {
  const { firebaseUser } = useAuth();
  const { toast, confirm } = useToast();
  const [items, setItems] = useState<CrmPipelineItem[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<CrmPipelineItem | null>(null);
  const [activityText, setActivityText] = useState('');
  const [activityChannel, setActivityChannel] = useState<CrmActivity['channel']>('Email');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadCategory, setNewLeadCategory] = useState('Restaurants');
  const [newLeadLocation, setNewLeadLocation] = useState('Jaipur');
  const [newLeadValue, setNewLeadValue] = useState('15000');

  useEffect(() => {
    if (!firebaseUser) return;
    const u1 = onSnapshot(
      query(collection(db, 'crmPipelines'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'crmPipelines')
    );
    const u2 = onSnapshot(
      query(collection(db, 'crmActivities'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setActivities(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'crmActivities')
    );
    return () => {
      u1();
      u2();
    };
  }, [firebaseUser]);

  const updateCrmField = async (item: CrmPipelineItem, patch: Partial<CrmPipelineItem>) => {
    try {
      await updateDoc(doc(db, 'crmPipelines', item.id), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      toast('CRM updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `crmPipelines/${item.id}`);
    }
  };

  const addManualLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !newLeadName.trim()) return;
    try {
      await addDoc(collection(db, 'crmPipelines'), {
        ownerId: firebaseUser.uid,
        businessName: newLeadName.trim(),
        category: newLeadCategory,
        location: newLeadLocation,
        source: 'Manual Entry',
        status: 'New',
        estimatedValue: Number(newLeadValue) || 0,
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAddModalOpen(false);
      setNewLeadName('');
      toast('Lead added to CRM', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'crmPipelines');
    }
  };

  const logActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !selectedItem || !activityText.trim()) return;
    try {
      await addDoc(collection(db, 'crmActivities'), {
        ownerId: firebaseUser.uid,
        crmId: selectedItem.id,
        channel: activityChannel,
        summary: activityText.trim(),
        createdAt: serverTimestamp(),
      });
      setActivityText('');
      toast('Communication logged', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'crmActivities');
    }
  };

  const deleteCrm = async (item: CrmPipelineItem) => {
    const ok = await confirm({
      title: 'Delete CRM Record',
      message: `Permanently delete "${item.businessName}" from your CRM pipeline?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'crmPipelines', item.id));
      if (selectedItem?.id === item.id) setSelectedItem(null);
      toast('CRM lead deleted', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `crmPipelines/${item.id}`);
    }
  };

  const filtered = items.filter((it) => {
    const matchStatus = statusFilter === 'All' || it.status === statusFilter;
    const matchSearch = it.businessName.toLowerCase().includes(search.trim().toLowerCase());
    return matchStatus && matchSearch;
  });

  const pipelineValue = items
    .filter((i) => !['Not Interested', 'Closed'].includes(i.status))
    .reduce((acc, i) => acc + (Number(i.estimatedValue) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">My CRM Pipeline</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 font-mono tabular-nums">
            {items.length} leads · Active Pipeline Value: ₹{pipelineValue.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              onClick={() => setView('table')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                view === 'table' ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5 inline mr-1" /> Table
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                view === 'kanban' ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              <Kanban className="w-3.5 h-3.5 inline mr-1" /> Kanban
            </button>
          </div>
          <button
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Lead
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search CRM leads..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-sm"
        >
          <option value="All">All Pipeline Stages</option>
          {CRM_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
      </div>

      {view === 'table' ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-3 px-4 font-medium">Business</th>
                <th className="py-3 px-4 font-medium">Stage</th>
                <th className="py-3 px-4 font-medium text-right">Est. Value (₹)</th>
                <th className="py-3 px-4 font-medium">Follow-up Date</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-xs text-slate-500">
                    No CRM leads match your filter. Add a lead manually or from Discover Leads.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{item.businessName}</p>
                      <p className="text-xs text-slate-500">{item.category || 'Business'} · {item.location || 'N/A'}</p>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        disabled={item.status === 'Closed'}
                        value={item.status}
                        onChange={(e) => updateCrmField(item, { status: e.target.value as CrmStatus })}
                        className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
                      >
                        {CRM_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <input
                        type="number"
                        disabled={item.status === 'Closed'}
                        defaultValue={item.estimatedValue}
                        onBlur={(e) => {
                          const val = Number(e.target.value) || 0;
                          if (val !== item.estimatedValue) updateCrmField(item, { estimatedValue: val });
                        }}
                        className="w-24 text-right px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="date"
                        disabled={item.status === 'Closed'}
                        value={item.followUpDate || ''}
                        onChange={(e) => updateCrmField(item, { followUpDate: e.target.value })}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-mono"
                      />
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Notes &amp; Log
                      </button>
                      <button
                        onClick={() => deleteCrm(item)}
                        className="text-xs text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {CRM_STATUSES.map((stage) => {
            const stageItems = filtered.filter((i) => i.status === stage);
            return (
              <div key={stage} className="w-64 shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0F172A] p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{stage}</span>
                  <span className="font-mono tabular-nums text-slate-500">{stageItems.length}</span>
                </div>
                {stageItems.map((it) => (
                  <div key={it.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-3 space-y-2">
                    <p className="text-sm font-semibold truncate">{it.businessName}</p>
                    <p className="text-xs font-mono tabular-nums text-slate-500">₹{it.estimatedValue.toLocaleString()}</p>
                    <div className="flex items-center justify-between gap-2">
                      <select
                        disabled={it.status === 'Closed'}
                        value={it.status}
                        onChange={(e) => updateCrmField(it, { status: e.target.value as CrmStatus })}
                        className="text-[11px] px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent"
                      >
                        {CRM_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                      <button onClick={() => setSelectedItem(it)} className="text-[11px] text-blue-600 hover:underline cursor-pointer">
                        Log
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Selected CRM Notes & Communication Drawer */}
      {selectedItem && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0B1221] dark:text-white">
              Communication &amp; Notes: {selectedItem.businessName}
            </h3>
            <button onClick={() => setSelectedItem(null)} className="text-xs text-slate-500 cursor-pointer">
              Close
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Lead Notes (auto-saves on blur)</label>
            <textarea
              rows={3}
              defaultValue={selectedItem.notes || ''}
              onBlur={(e) => updateCrmField(selectedItem, { notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
            />
          </div>
          <form onSubmit={logActivity} className="flex flex-col sm:flex-row gap-2">
            <select
              value={activityChannel}
              onChange={(e) => setActivityChannel(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
            >
              <option value="Email">Email</option>
              <option value="Instagram DM">Instagram DM</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Call">Call</option>
              <option value="Note">Note</option>
            </select>
            <input
              required
              value={activityText}
              onChange={(e) => setActivityText(e.target.value)}
              placeholder="Log outreach or reply summary..."
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
              Log Activity
            </button>
          </form>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {activities
              .filter((a) => a.crmId === selectedItem.id)
              .map((a) => (
                <div key={a.id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0B1221] text-xs">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{a.channel}:</span> {a.summary}
                </div>
              ))}
          </div>
        </div>
      )}

      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={addManualLead} className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 space-y-4">
            <h3 className="text-lg font-bold">Add CRM Lead</h3>
            <input required value={newLeadName} onChange={(e) => setNewLeadName(e.target.value)} placeholder="Business name *" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
            <input value={newLeadCategory} onChange={(e) => setNewLeadCategory(e.target.value)} placeholder="Category" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
            <input value={newLeadLocation} onChange={(e) => setNewLeadLocation(e.target.value)} placeholder="Location" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
            <input type="number" value={newLeadValue} onChange={(e) => setNewLeadValue(e.target.value)} placeholder="Estimated deal value (₹)" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 text-xs border rounded-lg cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg font-semibold cursor-pointer">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function FreelancerProjectsView() {
  const { firebaseUser, freelancerProfile, account } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<MarketplaceProject[]>([]);
  const [search, setSearch] = useState('');
  const [applyingProject, setApplyingProject] = useState<MarketplaceProject | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [portfolioLink, setPortfolioLink] = useState(freelancerProfile?.portfolioLinks?.[0] || '');
  const [proposedPrice, setProposedPrice] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('14');
  const [experience, setExperience] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'projects'), where('status', '==', 'Published')),
      (s) => setProjects(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'projects')
    );
    return () => unsub();
  }, []);

  const submitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !applyingProject) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'proposals'), {
        projectId: applyingProject.id,
        projectTitle: applyingProject.title,
        businessId: applyingProject.businessId,
        freelancerId: firebaseUser.uid,
        freelancerName: freelancerProfile?.fullName || account?.displayName || 'Freelancer',
        coverLetter: coverLetter.trim(),
        portfolioLink: portfolioLink.trim(),
        proposedPrice: Number(proposedPrice) || applyingProject.budgetMin,
        currency: applyingProject.currency,
        deliveryDays: Math.max(1, Number(deliveryDays) || 7),
        relevantExperience: experience.trim(),
        status: 'Submitted',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'notifications'), {
        userId: applyingProject.businessId,
        type: 'application',
        title: `New proposal for "${applyingProject.title}"`,
        message: `${freelancerProfile?.fullName || 'A freelancer'} submitted a proposal.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      setApplyingProject(null);
      setCoverLetter('');
      toast('Proposal submitted!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'proposals');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = projects.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Browse ClientHunt Projects</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Live freelance briefs published directly by verified business accounts.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center">
          <Briefcase className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-base font-semibold">No Published Business Projects Yet</h3>
          <p className="mt-1 text-sm text-slate-500">
            When businesses publish new freelance briefs, they appear here in real time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((proj) => (
            <div key={proj.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{proj.category} · {proj.workMode}</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    {proj.currency === 'INR' ? '₹' : '$'}
                    {proj.budgetMin.toLocaleString()} – {proj.budgetMax.toLocaleString()}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-bold text-[#0B1221] dark:text-white">{proj.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{proj.companyName} {proj.location ? `· ${proj.location}` : ''}</p>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{proj.description}</p>
                <p className="mt-3 text-xs text-slate-500">Skills: {proj.requiredSkills.join(' · ')}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500">{proj.deadline ? `Deadline: ${proj.deadline}` : proj.projectType}</span>
                <button
                  onClick={() => {
                    setApplyingProject(proj);
                    setProposedPrice(String(proj.budgetMin));
                  }}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Apply Now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {applyingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={submitProposal} className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 space-y-4">
            <h3 className="text-lg font-bold">Submit Proposal: {applyingProject.title}</h3>
            <div>
              <label className="block text-xs font-medium mb-1">Proposal / Cover Letter *</label>
              <textarea required minLength={10} rows={4} value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} placeholder="Explain your approach and relevant work..." className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Proposed Price ({applyingProject.currency}) *</label>
                <input required type="number" min={1} value={proposedPrice} onChange={(e) => setProposedPrice(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Estimated Delivery (Days) *</label>
                <input required type="number" min={1} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Portfolio Link</label>
              <input value={portfolioLink} onChange={(e) => setPortfolioLink(e.target.value)} placeholder="https://" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Relevant Experience</label>
              <input value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="e.g. Built 4 Jaipur hospitality websites" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setApplyingProject(null)} className="px-4 py-2 text-xs border rounded-lg cursor-pointer">Cancel</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg font-semibold cursor-pointer">
                {submitting ? 'Submitting...' : 'Submit Proposal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function MyProposalsView() {
  const { firebaseUser } = useAuth();
  const { toast, confirm } = useToast();
  const [proposals, setProposals] = useState<ProjectProposal[]>([]);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      query(collection(db, 'proposals'), where('freelancerId', '==', firebaseUser.uid)),
      (s) => setProposals(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'proposals')
    );
    return () => unsub();
  }, [firebaseUser]);

  const withdraw = async (p: ProjectProposal) => {
    const ok = await confirm({
      title: 'Withdraw Proposal',
      message: `Withdraw your proposal for "${p.projectTitle}"?`,
      confirmLabel: 'Withdraw',
      destructive: true,
    });
    if (!ok) return;
    try {
      await updateDoc(doc(db, 'proposals', p.id), {
        status: 'Withdrawn',
        updatedAt: serverTimestamp(),
      });
      toast('Proposal withdrawn', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `proposals/${p.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">My Proposals</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
          Track submitted, shortlisted, and accepted applications.
        </p>
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center">
          <p className="text-sm text-slate-500">You have not submitted any project proposals yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Status: {p.status}
                </p>
                <h3 className="text-base font-bold text-[#0B1221] dark:text-white mt-0.5">{p.projectTitle}</h3>
                <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
                  Quote: {p.currency === 'INR' ? '₹' : '$'}{p.proposedPrice.toLocaleString()} · {p.deliveryDays} days
                </p>
              </div>
              {['Submitted', 'Viewed', 'Shortlisted'].includes(p.status) && (
                <button
                  onClick={() => withdraw(p)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer self-start sm:self-center"
                >
                  Withdraw
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FreelancerAnalyticsView() {
  const { firebaseUser } = useAuth();
  const [crmItems, setCrmItems] = useState<CrmPipelineItem[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    if (!firebaseUser) return;
    const u1 = onSnapshot(
      query(collection(db, 'crmPipelines'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setCrmItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'crmPipelines')
    );
    const u2 = onSnapshot(
      query(collection(db, 'savedLeads'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setSavedCount(s.size),
      (e) => handleFirestoreError(e, OperationType.LIST, 'savedLeads')
    );
    const u3 = onSnapshot(
      query(collection(db, 'pitchDrafts'), where('ownerId', '==', firebaseUser.uid)),
      (s) => setDraftCount(s.size),
      (e) => handleFirestoreError(e, OperationType.LIST, 'pitchDrafts')
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [firebaseUser]);

  const byCategoryMap = new Map<string, number>();
  crmItems.forEach((c) => {
    const cat = c.category || 'Uncategorized';
    byCategoryMap.set(cat, (byCategoryMap.get(cat) || 0) + 1);
  });
  const catData = Array.from(byCategoryMap.entries()).map(([label, value]) => ({ label, value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Performance Analytics</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
          Real analytics computed from your saved leads, pitch drafts, and CRM pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6">
          <h2 className="text-sm font-semibold mb-4">CRM Leads by Category</h2>
          <SimpleBarChart data={catData} emptyLabel="Add leads to your CRM to view category distribution" />
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6">
          <h2 className="text-sm font-semibold mb-4">Outreach &amp; Lead Summary</h2>
          <ActivitySparkChart
            points={[
              { label: 'Saved', leads: savedCount, pitches: 0 },
              { label: 'CRM', leads: crmItems.length, pitches: draftCount },
              { label: 'Contacted', leads: crmItems.filter((c) => c.status === 'Contacted').length, pitches: draftCount },
              { label: 'Converted', leads: crmItems.filter((c) => c.status === 'Converted').length, pitches: 0 },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export function FreelancerProfileView() {
  const { firebaseUser, freelancerProfile, refreshProfiles } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(freelancerProfile?.fullName || '');
  const [headline, setHeadline] = useState(freelancerProfile?.headline || '');
  const [description, setDescription] = useState(freelancerProfile?.description || '');
  const [skills, setSkills] = useState(freelancerProfile?.skills?.join(', ') || '');
  const [services, setServices] = useState(freelancerProfile?.services?.join(', ') || '');
  const [portfolio, setPortfolio] = useState(freelancerProfile?.portfolioLinks?.join(', ') || '');
  const [website, setWebsite] = useState(freelancerProfile?.website || '');
  const [country, setCountry] = useState(freelancerProfile?.country || 'India');
  const [state, setState] = useState(freelancerProfile?.state || 'Rajasthan');
  const [city, setCity] = useState(freelancerProfile?.city || 'Jaipur');
  const [experienceLevel, setExperienceLevel] = useState(freelancerProfile?.experienceLevel || 'Intermediate');
  const [workPreference, setWorkPreference] = useState(freelancerProfile?.workPreference || 'Remote');
  const [minBudget, setMinBudget] = useState(String(freelancerProfile?.minBudget || 5000));
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'freelancerProfiles', firebaseUser.uid),
        {
          uid: firebaseUser.uid,
          fullName: fullName.trim().slice(0, 120),
          photoURL: (freelancerProfile?.photoURL || firebaseUser.photoURL || '').slice(0, 500),
          headline: headline.trim().slice(0, 180),
          description: description.trim().slice(0, 2500),
          skills: skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30),
          services: services.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20),
          experienceLevel,
          portfolioLinks: portfolio.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10),
          website: website.trim().slice(0, 300),
          country: (country.trim() || 'India').slice(0, 80),
          state: state.trim().slice(0, 80),
          city: city.trim().slice(0, 80),
          workPreference,
          minBudget: Math.max(0, Number(minBudget) || 0),
          preferredIndustries: (freelancerProfile?.preferredIndustries || []).slice(0, 20),
          createdAt: freelancerProfile?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );
      await refreshProfiles();
      toast('Freelancer profile saved', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `freelancerProfiles/${firebaseUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-4">
      <h1 className="text-xl font-bold text-[#0B1221] dark:text-white">My Freelancer Profile</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Full Name *</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Experience Level</label>
          <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Senior">Senior</option>
            <option value="Agency">Agency</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Professional Headline *</label>
        <input required value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Bio / Description</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Services Offered (comma-separated)</label>
          <input value={services} onChange={(e) => setServices(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Skills (comma-separated)</label>
          <input value={skills} onChange={(e) => setSkills(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Portfolio Links (comma-separated)</label>
          <input value={portfolio} onChange={(e) => setPortfolio(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Personal Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        <input type="number" value={minBudget} onChange={(e) => setMinBudget(e.target.value)} placeholder="Min ₹" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono" />
      </div>
      <div className="flex items-center justify-between pt-2">
        <select value={workPreference} onChange={(e) => setWorkPreference(e.target.value as any)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
          <option value="Remote">Remote</option>
          <option value="On-site">On-site</option>
          <option value="Hybrid">Hybrid</option>
          <option value="Any">Any</option>
        </select>
        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer">
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </form>
  );
}

export function AccountSettingsView() {
  const { firebaseUser, deleteMyAccountData } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast, confirm } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreference>({
    userId: firebaseUser?.uid || '',
    newApplications: true,
    proposalUpdates: true,
    messages: true,
    followUpReminders: true,
    opportunityAlerts: true,
  });

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      doc(db, 'notificationPreferences', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) setPrefs(snap.data() as NotificationPreference);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `notificationPreferences/${firebaseUser.uid}`)
    );
    return () => unsub();
  }, [firebaseUser]);

  const updatePref = async (key: keyof Omit<NotificationPreference, 'userId' | 'updatedAt'>) => {
    if (!firebaseUser) return;
    const next = { ...prefs, [key]: !prefs[key], userId: firebaseUser.uid, updatedAt: serverTimestamp() };
    try {
      await setDoc(doc(db, 'notificationPreferences', firebaseUser.uid), next);
      toast('Notification preferences saved', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `notificationPreferences/${firebaseUser.uid}`);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Account Data',
      message: 'This permanently deletes your ClientHunt AI profile, saved leads, CRM items, and pitch drafts from Firestore. Continue?',
      confirmLabel: 'Delete My Data',
      destructive: true,
    });
    if (!ok) return;
    await deleteMyAccountData();
    toast('Account data deleted', 'info');
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-4">
        <h2 className="text-lg font-bold">Appearance &amp; Notifications</h2>
        <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
          <span className="text-sm">Color Theme ({theme === 'dark' ? 'Dark Mode' : 'Light Mode'})</span>
          <button onClick={toggleTheme} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer">
            Switch to {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
        {(
          [
            ['newApplications', 'New project applications'],
            ['proposalUpdates', 'Proposal status updates'],
            ['messages', 'Direct messages'],
            ['followUpReminders', 'CRM follow-up reminders'],
            ['opportunityAlerts', 'Relevant opportunity alerts'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center justify-between py-1.5 text-sm cursor-pointer">
            <span>{label}</span>
            <input type="checkbox" checked={prefs[k]} onChange={() => updatePref(k)} className="rounded" />
          </label>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6">
        <h2 className="text-base font-bold">Payments &amp; Billing Status</h2>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
          Online payment processing is currently unavailable in this preview environment. No automated charges or escrow transactions are simulated.
        </p>
      </div>

      <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-[#111A2E] p-6">
        <h2 className="text-base font-bold text-rose-700 dark:text-rose-400">Delete Account Data</h2>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
          Permanently remove your profile, saved leads, CRM pipeline, and notification settings.
        </p>
        <button
          onClick={handleDelete}
          className="mt-4 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
        >
          Delete My Account Data
        </button>
      </div>
    </div>
  );
}
