import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  FolderPlus,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Star,
  Users,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  FreelancerProfile,
  MarketplaceProject,
  ProjectProposal,
  ProjectStatus,
} from '../types/domain';
import { DashboardShell, type NavItem } from './DashboardShell';
import { MessagingPanel } from './MessagingPanel';
import { AccountSettingsView } from './FreelancerWorkspace';

export function BusinessDashboard({
  onBackToPublic,
  adminToggle,
}: {
  onBackToPublic: () => void;
  adminToggle?: { inAdminView: boolean; onToggleAdminView: () => void };
}) {
  const { firebaseUser, businessProfile, account, refreshProfiles } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('overview');
  const [projects, setProjects] = useState<MarketplaceProject[]>([]);
  const [proposals, setProposals] = useState<ProjectProposal[]>([]);
  const [selectedFreelancer, setSelectedFreelancer] = useState<FreelancerProfile | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const u1 = onSnapshot(
      query(collection(db, 'projects'), where('businessId', '==', firebaseUser.uid)),
      (s) => setProjects(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'projects')
    );
    const u2 = onSnapshot(
      query(collection(db, 'proposals'), where('businessId', '==', firebaseUser.uid)),
      (s) => setProposals(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'proposals')
    );
    return () => {
      u1();
      u2();
    };
  }, [firebaseUser]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'post', label: 'Post a Project', icon: FolderPlus },
    { id: 'projects', label: 'My Projects', icon: Briefcase, badge: projects.length },
    { id: 'applications', label: 'Applications', icon: Users, badge: proposals.filter((p) => p.status === 'Submitted').length },
    { id: 'shortlisted', label: 'Shortlisted Freelancers', icon: Star },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'profile', label: 'Company Profile', icon: Building2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const updateProposalStatus = async (p: ProjectProposal, status: ProjectProposal['status']) => {
    try {
      await updateDoc(doc(db, 'proposals', p.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'notifications'), {
        userId: p.freelancerId,
        type: 'proposal',
        title: `Proposal ${status}`,
        message: `Your proposal for "${p.projectTitle}" is now ${status}.`,
        read: false,
        createdAt: serverTimestamp(),
      });
      toast(`Proposal marked ${status}`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `proposals/${p.id}`);
    }
  };

  const openFreelancerProfile = async (freelancerId: string) => {
    try {
      const snap = await getDoc(doc(db, 'freelancerProfiles', freelancerId));
      if (snap.exists()) {
        setSelectedFreelancer(snap.data() as FreelancerProfile);
      } else {
        toast('Freelancer profile details are not filled out yet', 'info');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `freelancerProfiles/${freelancerId}`);
    }
  };

  const startConversation = async (p: ProjectProposal) => {
    if (!firebaseUser) return;
    try {
      const existing = await getDocs(
        query(collection(db, 'conversations'), where('businessId', '==', firebaseUser.uid))
      );
      const found = existing.docs.find(
        (d) => d.data().freelancerId === p.freelancerId && d.data().projectId === p.projectId
      );
      if (!found) {
        await addDoc(collection(db, 'conversations'), {
          businessId: firebaseUser.uid,
          freelancerId: p.freelancerId,
          businessName: businessProfile?.companyName || account?.displayName || 'Business',
          freelancerName: p.freelancerName,
          projectId: p.projectId,
          projectTitle: p.projectTitle,
          lastMessage: `Started conversation regarding "${p.projectTitle}"`,
          lastSenderId: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setTab('messages');
      toast(`Opened chat with ${p.freelancerName}`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'conversations');
    }
  };

  const activeProjects = projects.filter((p) => p.status === 'Published').length;
  const completedProjects = projects.filter((p) => p.status === 'Completed').length;
  const shortlisted = proposals.filter((p) => p.status === 'Shortlisted' || p.status === 'Accepted');

  return (
    <DashboardShell
      roleLabel="Business"
      navItems={navItems}
      activeTab={tab}
      onSelectTab={setTab}
      onBackToPublic={onBackToPublic}
      adminToggle={adminToggle}
    >
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">
                {businessProfile?.companyName || 'Business Workspace'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                All project and applicant counters below reflect live database records.
              </p>
            </div>
            <button
              onClick={() => setTab('post')}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold self-start cursor-pointer"
            >
              Post a Freelance Project
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Active Projects', value: activeProjects },
              { label: 'Total Applications', value: proposals.length },
              { label: 'Shortlisted Freelancers', value: shortlisted.length },
              { label: 'Projects Completed', value: completedProjects },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#0B1221] dark:text-white">{s.value}</p>
              </div>
            ))}
          </div>

          {projects.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-8 text-center">
              <h3 className="text-base font-semibold">Publish Your First Freelance Project</h3>
              <p className="text-sm text-slate-500 mt-1">
                Create a structured brief with budget, skills, and deadline to receive proposals from verified freelancers.
              </p>
              <button onClick={() => setTab('post')} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
                Create Project Brief
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'post' && <PostProjectForm onPosted={() => setTab('projects')} />}

      {tab === 'projects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">My Projects</h1>
            <button onClick={() => setTab('post')} className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
              + New Project
            </button>
          </div>
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No projects created yet.
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((proj) => (
                <div key={proj.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">
                      {proj.category} · {proj.workMode} · Status: <strong className="text-blue-600 dark:text-blue-400">{proj.status}</strong>
                    </p>
                    <h3 className="text-lg font-bold text-[#0B1221] dark:text-white mt-0.5">{proj.title}</h3>
                    <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
                      {proj.currency === 'INR' ? '₹' : '$'}{proj.budgetMin.toLocaleString()} – {proj.budgetMax.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      disabled={proj.status === 'Completed'}
                      value={proj.status}
                      onChange={async (e) => {
                        try {
                          await updateDoc(doc(db, 'projects', proj.id), {
                            status: e.target.value as ProjectStatus,
                            updatedAt: serverTimestamp(),
                          });
                          toast('Project status updated', 'success');
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `projects/${proj.id}`);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Published">Published</option>
                      <option value="Paused">Paused</option>
                      <option value="Closed">Closed</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(tab === 'applications' || tab === 'shortlisted') && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">
            {tab === 'shortlisted' ? 'Shortlisted Freelancers' : 'Project Applications'}
          </h1>
          {(tab === 'shortlisted' ? shortlisted : proposals).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              {tab === 'shortlisted' ? 'No shortlisted freelancers yet.' : 'No freelancer proposals received yet.'}
            </div>
          ) : (
            <div className="space-y-4">
              {(tab === 'shortlisted' ? shortlisted : proposals).map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {p.projectTitle} · Status: {p.status}
                      </p>
                      <h3 className="text-lg font-bold text-[#0B1221] dark:text-white mt-0.5">{p.freelancerName}</h3>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <p className="text-sm font-bold">{p.currency === 'INR' ? '₹' : '$'}{p.proposedPrice.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">{p.deliveryDays} days delivery</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{p.coverLetter}</p>
                  {p.portfolioLink && (
                    <a href={p.portfolioLink} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline inline-block">
                      Portfolio: {p.portfolioLink}
                    </a>
                  )}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openFreelancerProfile(p.freelancerId)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                    >
                      View Profile
                    </button>
                    <button
                      onClick={() => startConversation(p)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      Message Applicant
                    </button>
                    {['Submitted', 'Viewed', 'Shortlisted'].includes(p.status) && (
                      <>
                        {p.status !== 'Shortlisted' && (
                          <button
                            onClick={() => updateProposalStatus(p, 'Shortlisted')}
                            className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            Shortlist
                          </button>
                        )}
                        <button
                          onClick={() => updateProposalStatus(p, 'Accepted')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                        </button>
                        <button
                          onClick={() => updateProposalStatus(p, 'Rejected')}
                          className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 text-xs font-semibold cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'messages' && <MessagingPanel mode="business" />}

      {tab === 'profile' && <BusinessProfileEditor onSaved={refreshProfiles} />}

      {tab === 'settings' && <AccountSettingsView />}

      {selectedFreelancer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold">{selectedFreelancer.fullName}</h3>
                <p className="text-xs text-slate-500">{selectedFreelancer.headline}</p>
              </div>
              <button onClick={() => setSelectedFreelancer(null)} className="text-xs text-slate-500 cursor-pointer">Close</button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{selectedFreelancer.description}</p>
            <p className="text-xs text-slate-500"><strong>Services:</strong> {selectedFreelancer.services.join(', ')}</p>
            <p className="text-xs text-slate-500"><strong>Skills:</strong> {selectedFreelancer.skills.join(', ')}</p>
            <p className="text-xs text-slate-500"><strong>Location:</strong> {selectedFreelancer.city}, {selectedFreelancer.state}, {selectedFreelancer.country}</p>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function PostProjectForm({ onPosted }: { onPosted: () => void }) {
  const { firebaseUser, businessProfile, account } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Web Development');
  const [skillsText, setSkillsText] = useState('React, TypeScript, Tailwind CSS');
  const [budgetMin, setBudgetMin] = useState('15000');
  const [budgetMax, setBudgetMax] = useState('35000');
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [deadline, setDeadline] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'Beginner' | 'Intermediate' | 'Senior' | 'Any'>('Intermediate');
  const [location, setLocation] = useState(businessProfile?.city ? `${businessProfile.city}, ${businessProfile.country}` : 'Jaipur, India');
  const [workMode, setWorkMode] = useState<'Remote' | 'On-site' | 'Hybrid'>('Remote');
  const [projectType, setProjectType] = useState<'Fixed Price' | 'Hourly' | 'Retainer'>('Fixed Price');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (status: 'Published' | 'Draft') => {
    if (!firebaseUser) return;
    if (title.trim().length < 3 || description.trim().length < 10) {
      toast('Please fill in project title and detailed description', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'projects'), {
        businessId: firebaseUser.uid,
        companyName: businessProfile?.companyName || account?.displayName || 'Business Account',
        title: title.trim(),
        description: description.trim(),
        category,
        requiredSkills: skillsText.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 15),
        budgetMin: Number(budgetMin) || 0,
        budgetMax: Math.max(Number(budgetMin) || 0, Number(budgetMax) || 0),
        currency,
        deadline,
        experienceLevel,
        location: location.trim(),
        workMode,
        projectType,
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast(status === 'Published' ? 'Project published to Marketplace' : 'Project saved as draft', 'success');
      onPosted();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'projects');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-4">
      <h1 className="text-xl font-bold text-[#0B1221] dark:text-white">Post a Freelance Project</h1>
      <div>
        <label className="block text-xs font-medium mb-1">Project Title *</label>
        <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build Restaurant Ordering Website & Menu UI" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Project Description &amp; Deliverables *</label>
        <textarea required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe deliverables, goals, and timeline..." className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Required Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Required Skills (comma-separated)</label>
          <input value={skillsText} onChange={(e) => setSkillsText(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Min Budget</label>
          <input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Max Budget</label>
          <input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Deadline</label>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value as any)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
          <option value="Beginner">Beginner</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Senior">Senior</option>
          <option value="Any">Any Level</option>
        </select>
        <select value={workMode} onChange={(e) => setWorkMode(e.target.value as any)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
          <option value="Remote">Remote</option>
          <option value="On-site">On-site</option>
          <option value="Hybrid">Hybrid</option>
        </select>
        <select value={projectType} onChange={(e) => setProjectType(e.target.value as any)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
          <option value="Fixed Price">Fixed Price</option>
          <option value="Hourly">Hourly</option>
          <option value="Retainer">Retainer</option>
        </select>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" disabled={submitting} onClick={() => submit('Draft')} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">
          Save Draft
        </button>
        <button type="button" disabled={submitting} onClick={() => submit('Published')} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer">
          {submitting ? 'Publishing...' : 'Publish Project'}
        </button>
      </div>
    </div>
  );
}

function BusinessProfileEditor({ onSaved }: { onSaved: () => Promise<void> }) {
  const { firebaseUser, businessProfile } = useAuth();
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState(businessProfile?.companyName || '');
  const [industry, setIndustry] = useState(businessProfile?.industry || '');
  const [description, setDescription] = useState(businessProfile?.description || '');
  const [website, setWebsite] = useState(businessProfile?.website || '');
  const [country, setCountry] = useState(businessProfile?.country || 'India');
  const [state, setState] = useState(businessProfile?.state || 'Rajasthan');
  const [city, setCity] = useState(businessProfile?.city || 'Jaipur');
  const [size, setSize] = useState(businessProfile?.size || '2-10');
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'businessProfiles', firebaseUser.uid), {
        uid: firebaseUser.uid,
        companyName: companyName.trim(),
        industry: industry.trim(),
        description: description.trim(),
        website: website.trim(),
        country: country.trim(),
        state: state.trim(),
        city: city.trim(),
        logoURL: businessProfile?.logoURL || firebaseUser.photoURL || '',
        size,
        createdAt: businessProfile?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await onSaved();
      toast('Company profile updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `businessProfiles/${firebaseUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-4">
      <h1 className="text-xl font-bold text-[#0B1221] dark:text-white">Company Profile</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Company Name *</label>
          <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Industry *</label>
          <input required value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Description</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        <select value={size} onChange={(e) => setSize(e.target.value as any)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
          <option value="Solo">Solo</option>
          <option value="2-10">2-10</option>
          <option value="11-50">11-50</option>
          <option value="51-200">51-200</option>
          <option value="200+">200+</option>
        </select>
      </div>
      <div className="flex items-center justify-between pt-2">
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website URL" className="w-64 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold cursor-pointer">
          {saving ? 'Saving...' : 'Save Company Profile'}
        </button>
      </div>
    </form>
  );
}
