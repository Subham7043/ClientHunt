import React, { useState } from 'react';
import {
  BarChart3,
  Bookmark,
  Briefcase,
  Compass,
  FileCheck,
  Kanban,
  LayoutDashboard,
  MessageSquare,
  Search,
  Settings,
  Sparkles,
  Target,
  User,
  Wand2,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicHeader, type PublicPageRoute } from './components/PublicHeader';
import { PublicPages } from './components/PublicPages';
import { AuthModal, OnboardingView } from './components/AuthModal';
import { DashboardShell, type NavItem } from './components/DashboardShell';
import { DiscoverLeadsView, HiringOpportunitiesView } from './components/FreelancerDiscovery';
import {
  AiLeadAnalyzerView,
  AiPitchGeneratorView,
  BusinessExplorerView,
} from './components/FreelancerAiTools';
import {
  AccountSettingsView,
  CrmPipelineView,
  FreelancerAnalyticsView,
  FreelancerOverview,
  FreelancerProfileView,
  FreelancerProjectsView,
  MyProposalsView,
  SavedLeadsView,
} from './components/FreelancerWorkspace';
import { MessagingPanel } from './components/MessagingPanel';
import { BusinessDashboard } from './components/BusinessDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import type { BusinessLead } from './types/domain';

function AppRouter() {
  const { firebaseUser, account, isAdmin, loading, needsOnboarding } = useAuth();
  const [surface, setSurface] = useState<'public' | 'dashboard'>('public');
  const [publicPage, setPublicPage] = useState<PublicPageRoute>('home');
  const [authModal, setAuthModal] = useState<{
    open: boolean;
    mode: 'login' | 'register';
    role: 'freelancer' | 'business';
  }>({ open: false, mode: 'register', role: 'freelancer' });

  const [freelancerTab, setFreelancerTab] = useState('overview');
  const [activeAnalysisLead, setActiveAnalysisLead] = useState<BusinessLead | null>(null);
  const [activePitchTarget, setActivePitchTarget] = useState<{
    name: string;
    context: string;
    service?: string;
  } | null>(null);

  const [adminViewMode, setAdminViewMode] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState('overview');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1221]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-slate-600 dark:text-slate-300">Loading ClientHunt AI...</p>
        </div>
      </div>
    );
  }

  // Suspended account safeguard
  if (firebaseUser && account?.status === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1221] p-6">
        <div className="max-w-md w-full rounded-2xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-[#111A2E] p-8 text-center">
          <h1 className="text-xl font-bold text-rose-600">Account Suspended</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            This account has been suspended by an administrator. Contact support@clienthunt.ai for assistance.
          </p>
        </div>
      </div>
    );
  }

  // Role-based onboarding when authenticated without completed profile
  if (firebaseUser && needsOnboarding && surface === 'dashboard') {
    return <OnboardingView />;
  }

  // Admin Console view
  if (firebaseUser && isAdmin && surface === 'dashboard' && adminViewMode) {
    return (
      <AdminDashboard
        initialTab={adminInitialTab}
        onBackToPublic={() => setSurface('public')}
        onExitAdmin={() => setAdminViewMode(false)}
      />
    );
  }

  // Business Dashboard
  if (firebaseUser && account?.role === 'business' && surface === 'dashboard') {
    return (
      <BusinessDashboard
        onBackToPublic={() => setSurface('public')}
        adminToggle={
          isAdmin
            ? { inAdminView: false, onToggleAdminView: () => setAdminViewMode(true) }
            : undefined
        }
      />
    );
  }

  // Freelancer Dashboard (14 Navigation Items)
  if (firebaseUser && surface === 'dashboard') {
    const freelancerNav: NavItem[] = [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'discover', label: 'Discover Leads', icon: Search },
      { id: 'opportunities', label: 'Hiring Opportunities', icon: Target },
      { id: 'explorer', label: 'Business Explorer', icon: Compass },
      { id: 'analyzer', label: 'AI Lead Analyzer', icon: Sparkles },
      { id: 'pitch', label: 'AI Pitch Generator', icon: Wand2 },
      { id: 'saved', label: 'Saved Leads', icon: Bookmark },
      { id: 'crm', label: 'My CRM', icon: Kanban },
      { id: 'projects', label: 'Browse Projects', icon: Briefcase },
      { id: 'proposals', label: 'My Proposals', icon: FileCheck },
      { id: 'messages', label: 'Messages', icon: MessageSquare },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'profile', label: 'My Profile', icon: User },
      { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
      <DashboardShell
        roleLabel="Freelancer"
        navItems={freelancerNav}
        activeTab={freelancerTab}
        onSelectTab={setFreelancerTab}
        onBackToPublic={() => setSurface('public')}
        adminToggle={
          isAdmin
            ? {
                inAdminView: false,
                onToggleAdminView: () => {
                  setAdminInitialTab('overview');
                  setAdminViewMode(true);
                },
              }
            : undefined
        }
      >
        {freelancerTab === 'overview' && (
          <FreelancerOverview
            onGoToDiscover={() => setFreelancerTab('discover')}
            onGoToCrm={() => setFreelancerTab('crm')}
            onGoToProjects={() => setFreelancerTab('projects')}
          />
        )}
        {freelancerTab === 'discover' && (
          <DiscoverLeadsView
            onAnalyzeLead={(lead) => {
              setActiveAnalysisLead(lead);
              setFreelancerTab('analyzer');
            }}
            onPitchLead={(target) => {
              setActivePitchTarget(target);
              setFreelancerTab('pitch');
            }}
            onSwitchToAdminProviders={
              isAdmin
                ? () => {
                    setAdminInitialTab('providers');
                    setAdminViewMode(true);
                  }
                : undefined
            }
          />
        )}
        {freelancerTab === 'opportunities' && (
          <HiringOpportunitiesView
            onPitchOpportunity={(target) => {
              setActivePitchTarget(target);
              setFreelancerTab('pitch');
            }}
            onSwitchToAdminProviders={
              isAdmin
                ? () => {
                    setAdminInitialTab('providers');
                    setAdminViewMode(true);
                  }
                : undefined
            }
          />
        )}
        {freelancerTab === 'explorer' && (
          <BusinessExplorerView
            onAnalyzeLead={(lead) => {
              setActiveAnalysisLead(lead);
              setFreelancerTab('analyzer');
            }}
          />
        )}
        {freelancerTab === 'analyzer' && (
          <AiLeadAnalyzerView
            initialLead={activeAnalysisLead}
            onPitchLead={(target) => {
              setActivePitchTarget(target);
              setFreelancerTab('pitch');
            }}
          />
        )}
        {freelancerTab === 'pitch' && <AiPitchGeneratorView initialTarget={activePitchTarget} />}
        {freelancerTab === 'saved' && (
          <SavedLeadsView
            onPitchTarget={(target) => {
              setActivePitchTarget(target);
              setFreelancerTab('pitch');
            }}
          />
        )}
        {freelancerTab === 'crm' && <CrmPipelineView />}
        {freelancerTab === 'projects' && <FreelancerProjectsView />}
        {freelancerTab === 'proposals' && <MyProposalsView />}
        {freelancerTab === 'messages' && <MessagingPanel mode="freelancer" />}
        {freelancerTab === 'analytics' && <FreelancerAnalyticsView />}
        {freelancerTab === 'profile' && <FreelancerProfileView />}
        {freelancerTab === 'settings' && <AccountSettingsView />}
      </DashboardShell>
    );
  }

  // Public Website Pages
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#0B1221]">
      <PublicHeader
        currentPage={publicPage}
        onNavigate={setPublicPage}
        onOpenAuth={(mode) => setAuthModal({ open: true, mode, role: 'freelancer' })}
        onEnterDashboard={() => setSurface('dashboard')}
      />
      <main className="flex-1">
        <PublicPages
          page={publicPage}
          onNavigate={setPublicPage}
          onOpenAuth={(mode, role = 'freelancer') => setAuthModal({ open: true, mode, role })}
          onEnterDashboard={() => setSurface('dashboard')}
          isSignedIn={Boolean(firebaseUser)}
        />
      </main>
      <AuthModal
        open={authModal.open}
        initialMode={authModal.mode}
        initialRole={authModal.role}
        onClose={() => setAuthModal((m) => ({ ...m, open: false }))}
        onSuccess={() => {
          setAuthModal((m) => ({ ...m, open: false }));
          setSurface('dashboard');
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
