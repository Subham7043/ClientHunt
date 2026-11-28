import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Bookmark,
  Building2,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Flag,
  GitCompare,
  GraduationCap,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { DEMO_SCHOLARSHIPS } from '../data/demoData';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/apiClient';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  SCHOLARSHIP_APPLICATION_STATUSES,
  type EducationInstitution,
  type NotificationItem,
  type SavedScholarship,
  type ScholarshipApplication,
  type ScholarshipApplicationStatus,
  type ScholarshipEligibilityResult,
  type ScholarshipRecord,
  type ScholarshipReminder,
  type StudentProfile,
} from '../types/domain';
import { AccountSettingsView } from './FreelancerWorkspace';

export type ScholarshipSection =
  | 'overview'
  | 'discover'
  | 'recommended'
  | 'government'
  | 'private'
  | 'international'
  | 'university'
  | 'fellowships'
  | 'saved'
  | 'applications'
  | 'eligibility'
  | 'compare'
  | 'calendar'
  | 'profile'
  | 'notifications'
  | 'settings';

interface ScholarshipHubProps {
  activeSection?: ScholarshipSection;
  onSelectSection?: (section: ScholarshipSection) => void;
  embedded?: boolean;
  onSwitchToAdminProviders?: () => void;
}

const CATEGORY_PRESETS: Record<string, string> = {
  government: 'Government',
  private: 'Private',
  international: 'International',
  university: 'University',
  fellowships: 'Fellowship & Grant',
};

const CATEGORIES = [
  'All Categories',
  'Government',
  'Private',
  'University',
  'International',
  'Fellowship & Grant',
  'Research',
  'Merit-based',
  'Need-based',
  'Minority & Category',
];

const EDUCATION_LEVELS: StudentProfile['educationLevel'][] = [
  'High School',
  'Diploma / Vocational',
  'Undergraduate',
  'Postgraduate',
  'PhD / Doctoral',
  'Postdoctoral',
];

function sanitizeId(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return clean || `sch_${Date.now()}`;
}

export function ScholarshipHub({
  activeSection,
  onSelectSection,
  embedded = false,
  onSwitchToAdminProviders,
}: ScholarshipHubProps) {
  const { firebaseUser, account, studentProfile, refreshProfiles, isAdmin } = useAuth();
  const { toast } = useToast();

  const [internalSection, setInternalSection] = useState<ScholarshipSection>('discover');
  const section = activeSection ?? internalSection;
  const setSection = useCallback(
    (next: ScholarshipSection) => {
      if (onSelectSection) onSelectSection(next);
      else setInternalSection(next);
    },
    [onSelectSection]
  );

  // Discovery search & filters
  const [naturalQuery, setNaturalQuery] = useState('');
  const [keywordQuery, setKeywordQuery] = useState('');
  const [country, setCountry] = useState(studentProfile?.country || 'India');
  const [stateFilter, setStateFilter] = useState(studentProfile?.state || '');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [educationFilter, setEducationFilter] = useState<string>(studentProfile?.educationLevel || 'All');
  const [degreeFilter, setDegreeFilter] = useState('');
  const [fundingFilter, setFundingFilter] = useState('All');
  const [deadlineFilter, setDeadlineFilter] = useState('All');
  const [verifyOfficialPages, setVerifyOfficialPages] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const [searching, setSearching] = useState(false);
  const [liveResults, setLiveResults] = useState<ScholarshipRecord[]>([]);
  const [verifiedCurated, setVerifiedCurated] = useState<ScholarshipRecord[]>([]);
  const [parsedNlq, setParsedNlq] = useState<Record<string, string> | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // University / Educational institutions lookup
  const [instQuery, setInstQuery] = useState('University');
  const [instCity, setInstCity] = useState(studentProfile?.city || 'Jaipur');
  const [instCountry, setInstCountry] = useState(studentProfile?.country || 'India');
  const [instLoading, setInstLoading] = useState(false);
  const [institutions, setInstitutions] = useState<EducationInstitution[]>([]);
  const [instError, setInstError] = useState<string | null>(null);

  // Firestore student collections
  const [savedList, setSavedList] = useState<SavedScholarship[]>([]);
  const [applications, setApplications] = useState<ScholarshipApplication[]>([]);
  const [reminders, setReminders] = useState<ScholarshipReminder[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Detail, AI Eligibility, Comparison, Notes, Report
  const [detailSch, setDetailSch] = useState<ScholarshipRecord | null>(null);
  const [eligibilityMap, setEligibilityMap] = useState<Record<string, ScholarshipEligibilityResult>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [selectedEligibilityId, setSelectedEligibilityId] = useState<string>('');
  const [compareIds, setCompareIds] = useState<string[]>([
    DEMO_SCHOLARSHIPS[0].id,
    DEMO_SCHOLARSHIPS[1].id,
  ]);
  const [savedNotesDraft, setSavedNotesDraft] = useState<Record<string, string>>({});
  const [editingApp, setEditingApp] = useState<ScholarshipApplication | null>(null);
  const [docInput, setDocInput] = useState('');

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderDate, setNewReminderDate] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [newReminderNote, setNewReminderNote] = useState('');

  // Report modal
  const [reportTarget, setReportTarget] = useState<ScholarshipRecord | null>(null);
  const [reportReason, setReportReason] = useState('Broken official link or outdated deadline');
  const [reportDetails, setReportDetails] = useState('');

  // Student profile form state
  const [profileForm, setProfileForm] = useState({
    fullName: studentProfile?.fullName || account?.displayName || '',
    educationLevel: (studentProfile?.educationLevel || 'Undergraduate') as StudentProfile['educationLevel'],
    degree: studentProfile?.degree || 'B.Tech',
    course: studentProfile?.course || 'Computer Science',
    specialization: studentProfile?.specialization || '',
    country: studentProfile?.country || 'India',
    state: studentProfile?.state || 'Rajasthan',
    city: studentProfile?.city || 'Jaipur',
    institution: studentProfile?.institution || '',
    academicScore: studentProfile?.academicScore || '',
    graduationYear: studentProfile?.graduationYear || '2027',
    incomeRange: studentProfile?.incomeRange || 'Prefer not to say',
    interestsText: (studentProfile?.interests || ['Merit-based', 'Government']).join(', '),
    preferredFunding: (studentProfile?.preferredFunding || 'Any') as NonNullable<StudentProfile['preferredFunding']>,
  });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!studentProfile) return;
    setProfileForm({
      fullName: studentProfile.fullName || account?.displayName || '',
      educationLevel: studentProfile.educationLevel || 'Undergraduate',
      degree: studentProfile.degree || '',
      course: studentProfile.course || '',
      specialization: studentProfile.specialization || '',
      country: studentProfile.country || 'India',
      state: studentProfile.state || '',
      city: studentProfile.city || '',
      institution: studentProfile.institution || '',
      academicScore: studentProfile.academicScore || '',
      graduationYear: studentProfile.graduationYear || '2027',
      incomeRange: studentProfile.incomeRange || 'Prefer not to say',
      interestsText: (studentProfile.interests || []).join(', '),
      preferredFunding: studentProfile.preferredFunding || 'Any',
    });
  }, [studentProfile, account]);

  // Firestore listeners
  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;

    const u1 = onSnapshot(
      query(collection(db, 'savedScholarships'), where('ownerId', '==', uid)),
      (snap) => setSavedList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'savedScholarships')
    );

    const u2 = onSnapshot(
      query(collection(db, 'scholarshipApplications'), where('ownerId', '==', uid)),
      (snap) => setApplications(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'scholarshipApplications')
    );

    const u3 = onSnapshot(
      query(collection(db, 'scholarshipReminders'), where('ownerId', '==', uid)),
      (snap) => setReminders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'scholarshipReminders')
    );

    const u4 = onSnapshot(
      query(collection(db, 'scholarships'), where('sourceVerificationStatus', '==', 'Verified'), limit(40)),
      (snap) => setVerifiedCurated(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      () => {
        // Silent if none or rules pending
      }
    );

    const u5 = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', uid), limit(25)),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, [firebaseUser]);

  // Sync preset category when entering a preset section
  const activePresetCategory = CATEGORY_PRESETS[section] || null;

  const effectiveProfile = useMemo<StudentProfile>(
    () => ({
      uid: firebaseUser?.uid || 'preview',
      fullName: profileForm.fullName || 'Student',
      educationLevel: profileForm.educationLevel,
      degree: profileForm.degree || 'Undergraduate Degree',
      course: profileForm.course || 'General Studies',
      specialization: profileForm.specialization,
      country: profileForm.country || 'India',
      state: profileForm.state || 'All',
      city: profileForm.city,
      institution: profileForm.institution || 'Not specified',
      academicScore: profileForm.academicScore,
      graduationYear: profileForm.graduationYear || '2027',
      incomeRange: profileForm.incomeRange,
      interests: profileForm.interestsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      preferredFunding: profileForm.preferredFunding,
    }),
    [firebaseUser, profileForm]
  );

  const runScholarshipDiscovery = async (override?: {
    naturalQuery?: string;
    query?: string;
    category?: string;
    country?: string;
    state?: string;
  }) => {
    setSearching(true);
    setProviderError(null);
    setDemoMode(false);
    const useCat =
      override?.category ??
      activePresetCategory ??
      (categoryFilter !== 'All Categories' ? categoryFilter : '');

    try {
      const data = await apiFetch<{
        scholarships: ScholarshipRecord[];
        parsedNlq?: Record<string, string> | null;
        providers?: Array<{ provider: string; configured: boolean; enabled: boolean; error?: string }>;
      }>('/api/discovery/scholarships', {
        method: 'POST',
        body: JSON.stringify({
          naturalQuery: (override?.naturalQuery ?? naturalQuery).trim(),
          query: (override?.query ?? keywordQuery).trim(),
          country: (override?.country ?? country).trim() || 'India',
          state: (override?.state ?? stateFilter).trim(),
          category: useCat,
          educationLevel: educationFilter !== 'All' ? educationFilter : '',
          degree: degreeFilter.trim(),
          fundingType: fundingFilter !== 'All' ? fundingFilter : '',
          verifyOfficialPages,
          studentProfile: effectiveProfile,
        }),
      });
      setLiveResults(data.scholarships || []);
      setParsedNlq(data.parsedNlq || null);
      const sdAlert = data.providers?.find((p) => p.error);
      if (sdAlert?.error) {
        setProviderError(sdAlert.error);
      }
      if ((data.scholarships || []).length === 0 && !sdAlert?.error) {
        toast('No matching live scholarship pages returned. Try broader keywords or Sample Demo Mode.', 'info');
      } else if ((data.scholarships || []).length > 0) {
        toast(`Found ${data.scholarships.length} scholarship listings`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scholarship discovery failed';
      setProviderError(msg);
      toast('Scholarship search failed', 'error', msg);
    } finally {
      setSearching(false);
    }
  };

  const handleVerifyOfficialSource = async (sch: ScholarshipRecord) => {
    const targetUrl = sch.officialApplicationUrl || sch.sourceUrl;
    if (!targetUrl) {
      toast('No URL available to verify', 'error');
      return;
    }
    setVerifyingId(sch.id);
    try {
      const res = await apiFetch<{
        ok: boolean;
        sourceType: ScholarshipRecord['sourceType'];
        verificationStatus: ScholarshipRecord['sourceVerificationStatus'];
        lastVerifiedAt?: string;
        extracted?: Partial<ScholarshipRecord>;
        error?: string;
      }>('/api/scholarships/verify-source', {
        method: 'POST',
        body: JSON.stringify({ url: targetUrl }),
      });

      const patchRecord = (item: ScholarshipRecord): ScholarshipRecord =>
        item.id !== sch.id
          ? item
          : {
              ...item,
              sourceType: res.sourceType || item.sourceType,
              sourceVerificationStatus: res.verificationStatus || item.sourceVerificationStatus,
              lastVerifiedAt: res.lastVerifiedAt || new Date().toISOString(),
              ...(res.extracted?.amount && res.extracted.amount !== 'Not specified'
                ? { amount: res.extracted.amount }
                : {}),
              ...(res.extracted?.deadline && res.extracted.deadline !== 'Not specified'
                ? { deadline: res.extracted.deadline }
                : {}),
              ...(res.extracted?.requiredDocuments && res.extracted.requiredDocuments.length > 0
                ? { requiredDocuments: res.extracted.requiredDocuments }
                : {}),
              ...(res.extracted?.verifiedFacts && res.extracted.verifiedFacts.length > 0
                ? { verifiedFacts: res.extracted.verifiedFacts }
                : {}),
            };

      setLiveResults((prev) => prev.map(patchRecord));
      if (detailSch?.id === sch.id) {
        setDetailSch(patchRecord(detailSch));
      }
      toast(
        res.ok
          ? `Source checked: ${res.sourceType} (${res.verificationStatus})`
          : `Could not verify source: ${res.error || 'Unreachable'}`,
        res.ok ? 'success' : 'error'
      );
    } catch (err) {
      toast('Verification request failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleCheckEligibility = async (sch: ScholarshipRecord, navigateToEligibility = false) => {
    setCheckingId(sch.id);
    setSelectedEligibilityId(sch.id);
    try {
      const res = await apiFetch<{ result: ScholarshipEligibilityResult }>('/api/ai/scholarship-eligibility', {
        method: 'POST',
        body: JSON.stringify({
          studentProfile: effectiveProfile,
          scholarship: sch,
        }),
      });
      setEligibilityMap((prev) => ({ ...prev, [sch.id]: res.result }));
      if (navigateToEligibility) {
        setSection('eligibility');
      }
      toast(`Eligibility verdict: ${res.result.verdict} (${res.result.matchScore}/100)`, 'success');
    } catch (err) {
      toast('Eligibility check failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setCheckingId(null);
    }
  };

  const handleSaveScholarship = async (sch: ScholarshipRecord) => {
    if (!firebaseUser) {
      toast('Sign in with a verified email to save scholarships', 'error');
      return;
    }
    const cleanSchId = sanitizeId(sch.id);
    if (savedList.some((s) => s.scholarshipId === cleanSchId)) {
      toast('Already in Saved Scholarships', 'info');
      return;
    }
    try {
      await addDoc(collection(db, 'savedScholarships'), {
        ownerId: firebaseUser.uid,
        scholarshipId: cleanSchId,
        title: sch.title.slice(0, 235),
        provider: (sch.provider || 'Unknown Provider').slice(0, 175),
        category: (sch.category || 'Scholarship').slice(0, 75),
        country: (sch.country || 'India').slice(0, 75),
        amount: (sch.amount || 'Not specified').slice(0, 115),
        fundingType: (sch.fundingType || 'Not specified').slice(0, 55),
        deadline: (sch.deadline || 'Not specified').slice(0, 75),
        officialApplicationUrl: (sch.officialApplicationUrl || sch.sourceUrl || '').slice(0, 590),
        sourceType: (sch.sourceType || 'Unverified Source').slice(0, 75),
        sourceVerificationStatus: (sch.sourceVerificationStatus || 'Pending Review').slice(0, 55),
        notes: '',
        isDemo: Boolean(sch.isDemo),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Scholarship saved', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'savedScholarships');
    }
  };

  const handleTrackApplication = async (
    sch: ScholarshipRecord,
    initialStatus: ScholarshipApplicationStatus = 'Interested'
  ) => {
    if (!firebaseUser) {
      toast('Sign in to track scholarship applications', 'error');
      return;
    }
    const cleanSchId = sanitizeId(sch.id);
    const existing = applications.find((a) => a.scholarshipId === cleanSchId);
    if (existing) {
      setEditingApp(existing);
      setSection('applications');
      toast('Opened existing application tracker entry', 'info');
      return;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      await addDoc(collection(db, 'scholarshipApplications'), {
        ownerId: firebaseUser.uid,
        scholarshipId: cleanSchId,
        title: sch.title.slice(0, 235),
        provider: (sch.provider || 'Unknown Provider').slice(0, 175),
        deadline: (sch.deadline || 'Not specified').slice(0, 75),
        officialApplicationUrl: (sch.officialApplicationUrl || sch.sourceUrl || '').slice(0, 590),
        status: initialStatus,
        applicationDate: '',
        referenceNumber: '',
        reminderDate: '',
        notes: '',
        documentNames: (sch.requiredDocuments || []).slice(0, 15).map((d) => d.slice(0, 120)),
        statusHistory: [`${today}: ${initialStatus}`],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Added to Scholarship Application Tracker', 'success');
      setSection('applications');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'scholarshipApplications');
    }
  };

  const handleToggleCompare = (sch: ScholarshipRecord) => {
    setCompareIds((prev) => {
      if (prev.includes(sch.id)) {
        return prev.filter((id) => id !== sch.id);
      }
      if (prev.length >= 3) {
        toast('Compare supports up to 3 scholarships at once — replacing oldest selection', 'info');
        return [...prev.slice(1), sch.id];
      }
      return [...prev, sch.id];
    });
  };

  const handleSearchInstitutions = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setInstLoading(true);
    setInstError(null);
    try {
      const res = await apiFetch<{
        institutions: EducationInstitution[];
        configured: boolean;
        error?: string;
      }>('/api/discovery/institutions', {
        method: 'POST',
        body: JSON.stringify({
          query: instQuery.trim() || 'University',
          city: instCity.trim(),
          state: stateFilter.trim(),
          country: instCountry.trim() || 'India',
        }),
      });
      setInstitutions(res.institutions || []);
      if (res.error) setInstError(res.error);
      if ((res.institutions || []).length > 0) {
        toast(`Found ${res.institutions.length} educational institutions`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Institution lookup failed';
      setInstError(msg);
      toast('Institution lookup failed', 'error', msg);
    } finally {
      setInstLoading(false);
    }
  };

  const handleSaveNotes = async (saved: SavedScholarship) => {
    const draft = (savedNotesDraft[saved.id] ?? saved.notes ?? '').slice(0, 1450);
    try {
      await updateDoc(doc(db, 'savedScholarships', saved.id), {
        notes: draft,
        updatedAt: serverTimestamp(),
      });
      toast('Notes updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `savedScholarships/${saved.id}`);
    }
  };

  const handleSaveApplicationEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingApp) return;
    const today = new Date().toISOString().slice(0, 10);
    const currentHistory = Array.isArray(editingApp.statusHistory) ? editingApp.statusHistory : [];
    const lastEntry = currentHistory[currentHistory.length - 1] || '';
    const nextHistory = lastEntry.endsWith(`: ${editingApp.status}`)
      ? currentHistory
      : [...currentHistory, `${today}: ${editingApp.status}`].slice(-30);

    try {
      await updateDoc(doc(db, 'scholarshipApplications', editingApp.id), {
        status: editingApp.status,
        applicationDate: (editingApp.applicationDate || '').slice(0, 38),
        referenceNumber: (editingApp.referenceNumber || '').slice(0, 115),
        reminderDate: (editingApp.reminderDate || '').slice(0, 38),
        notes: (editingApp.notes || '').slice(0, 2950),
        documentNames: (editingApp.documentNames || []).slice(0, 20),
        statusHistory: nextHistory,
        updatedAt: serverTimestamp(),
      });
      toast('Application tracker updated', 'success');
      setEditingApp(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `scholarshipApplications/${editingApp.id}`);
    }
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !newReminderTitle.trim() || !newReminderDate) return;
    try {
      await addDoc(collection(db, 'scholarshipReminders'), {
        ownerId: firebaseUser.uid,
        scholarshipId: `rem_${Date.now()}`,
        scholarshipTitle: newReminderTitle.trim().slice(0, 235),
        reminderDate: newReminderDate.slice(0, 38),
        deadline: newReminderDate.slice(0, 38),
        note: newReminderNote.trim().slice(0, 580),
        completed: false,
        createdAt: serverTimestamp(),
      });
      setNewReminderTitle('');
      setNewReminderNote('');
      toast('Deadline reminder added', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'scholarshipReminders');
    }
  };

  const handleSaveStudentProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setSavingProfile(true);
    try {
      const interests = profileForm.interestsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 16);

      const payload = {
        uid: firebaseUser.uid,
        fullName: profileForm.fullName.trim().slice(0, 115) || 'Student',
        photoURL: (firebaseUser.photoURL || '').slice(0, 490),
        educationLevel: profileForm.educationLevel,
        degree: profileForm.degree.trim().slice(0, 115) || 'Degree',
        course: profileForm.course.trim().slice(0, 115) || 'General',
        specialization: profileForm.specialization.trim().slice(0, 115),
        country: profileForm.country.trim().slice(0, 75) || 'India',
        state: profileForm.state.trim().slice(0, 75),
        city: profileForm.city.trim().slice(0, 75),
        institution: profileForm.institution.trim().slice(0, 175) || 'Not specified',
        academicScore: profileForm.academicScore.trim().slice(0, 55),
        graduationYear: profileForm.graduationYear.trim().slice(0, 18) || '2027',
        incomeRange: profileForm.incomeRange.trim().slice(0, 75),
        interests,
        preferredFunding: profileForm.preferredFunding,
        updatedAt: serverTimestamp(),
      };

      if (studentProfile) {
        await updateDoc(doc(db, 'studentProfiles', firebaseUser.uid), {
          ...payload,
          createdAt: studentProfile.createdAt || serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'studentProfiles', firebaseUser.uid), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      if (account && payload.fullName !== account.displayName) {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          displayName: payload.fullName,
          updatedAt: serverTimestamp(),
        });
      }
      await refreshProfiles();
      toast('Student profile updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `studentProfiles/${firebaseUser.uid}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !reportTarget) return;
    try {
      await addDoc(collection(db, 'abuseReports'), {
        reporterId: firebaseUser.uid,
        targetType: 'scholarship',
        targetId: sanitizeId(reportTarget.id),
        reason: reportReason.trim().slice(0, 195),
        details: `${reportTarget.title} — ${reportDetails.trim()}`.slice(0, 1450),
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast('Scholarship report submitted for admin review', 'success');
      setReportTarget(null);
      setReportDetails('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'abuseReports');
    }
  };

  // Master pool of scholarships available locally (Live + Verified Curated or Sample Demo)
  const poolScholarships = useMemo(() => {
    if (demoMode) return DEMO_SCHOLARSHIPS;
    if (liveResults.length > 0) {
      // Combine live results + verified curated without duplicate titles
      const seen = new Set(liveResults.map((s) => s.title.toLowerCase()));
      return [...liveResults, ...verifiedCurated.filter((v) => !seen.has(v.title.toLowerCase()))];
    }
    return verifiedCurated;
  }, [demoMode, liveResults, verifiedCurated]);

  const filteredScholarships = useMemo(() => {
    const targetCat = activePresetCategory || (categoryFilter !== 'All Categories' ? categoryFilter : '');
    const q = keywordQuery.trim().toLowerCase();
    return poolScholarships.filter((s) => {
      if (targetCat && s.category !== targetCat) return false;
      if (educationFilter !== 'All' && s.educationLevels.length > 0 && !s.educationLevels.includes(educationFilter)) {
        return false;
      }
      if (fundingFilter !== 'All' && s.fundingType !== fundingFilter) return false;
      if (deadlineFilter === 'Has Deadline' && (!s.deadline || s.deadline === 'Not specified')) return false;
      if (deadlineFilter === 'Open Only' && s.status !== 'Open' && s.status !== 'Upcoming') return false;
      if (q) {
        const hay = `${s.title} ${s.provider} ${s.description} ${s.courses.join(' ')} ${s.subjects.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [poolScholarships, activePresetCategory, categoryFilter, educationFilter, fundingFilter, deadlineFilter, keywordQuery]);

  // All inspectable scholarships (for Eligibility & Compare pickers)
  const allSelectableScholarships = useMemo(() => {
    const map = new Map<string, ScholarshipRecord>();
    [...liveResults, ...verifiedCurated, ...DEMO_SCHOLARSHIPS].forEach((s) => {
      if (!map.has(s.id)) map.set(s.id, s);
    });
    return Array.from(map.values());
  }, [liveResults, verifiedCurated]);

  const recommendedScholarships = useMemo(() => {
    const base = allSelectableScholarships;
    return base
      .map((s) => {
        let score = 0;
        if (s.educationLevels.includes(effectiveProfile.educationLevel)) score += 35;
        if (
          s.country.toLowerCase() === effectiveProfile.country.toLowerCase() ||
          s.eligibleLocations.some((l) => l.toLowerCase().includes(effectiveProfile.country.toLowerCase()))
        ) {
          score += 25;
        }
        const courseLow = effectiveProfile.course.toLowerCase();
        if (
          courseLow &&
          [...s.courses, ...s.subjects, s.description].some((t) => t.toLowerCase().includes(courseLow))
        ) {
          score += 25;
        }
        if (effectiveProfile.preferredFunding !== 'Any' && s.fundingType === effectiveProfile.preferredFunding) {
          score += 15;
        }
        return { scholarship: s, profileScore: Math.min(100, score) };
      })
      .sort((a, b) => b.profileScore - a.profileScore);
  }, [allSelectableScholarships, effectiveProfile]);

  const compareScholarships = useMemo(
    () => allSelectableScholarships.filter((s) => compareIds.includes(s.id)),
    [allSelectableScholarships, compareIds]
  );

  // Calendar grid helper
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; dateStr?: string }> = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null });
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      cells.push({ day: d, dateStr: `${year}-${mStr}-${dStr}` });
    }
    return cells;
  }, [calendarMonth]);

  const deadlineEventsByDate = useMemo(() => {
    const map: Record<string, Array<{ title: string; kind: 'scholarship' | 'reminder' }>> = {};
    allSelectableScholarships.forEach((s) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s.deadline)) {
        map[s.deadline] = map[s.deadline] || [];
        map[s.deadline].push({ title: s.title, kind: 'scholarship' });
      }
    });
    reminders.forEach((r) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(r.reminderDate)) {
        map[r.reminderDate] = map[r.reminderDate] || [];
        map[r.reminderDate].push({ title: r.scholarshipTitle, kind: 'reminder' });
      }
    });
    return map;
  }, [allSelectableScholarships, reminders]);

  const renderScholarshipCard = (sch: ScholarshipRecord, extraScore?: number) => {
    const isSaved = savedList.some((s) => s.scholarshipId === sanitizeId(sch.id));
    const isCompared = compareIds.includes(sch.id);
    const elig = eligibilityMap[sch.id];
    const hasOfficialUrl = Boolean(sch.officialApplicationUrl || sch.sourceUrl);

    return (
      <article
        key={sch.id}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 flex flex-col justify-between gap-4"
      >
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-blue-600 dark:text-blue-400">{sch.category}</span>
              <span aria-hidden="true">·</span>
              <span>{sch.sourceType}</span>
              <span aria-hidden="true">·</span>
              <span
                className={`font-semibold ${
                  sch.sourceVerificationStatus === 'Verified'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : sch.sourceVerificationStatus === 'Rejected'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {sch.sourceVerificationStatus}
              </span>
              {sch.isDemo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-violet-600 dark:text-violet-400 font-medium">Sample Demo</span>
                </>
              )}
            </div>
            {typeof extraScore === 'number' && (
              <span className="font-mono tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400">
                Profile Match {extraScore}%
              </span>
            )}
          </div>

          <div>
            <h3 className="text-base font-bold text-[#0B1221] dark:text-white leading-snug">
              {sch.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              {sch.provider} · {sch.country}{sch.state && sch.state !== 'All' ? `, ${sch.state}` : ''}
            </p>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
            {sch.description || 'Details available on the official source page.'}
          </p>

          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 dark:bg-[#0B1221] p-3 text-xs">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Amount / Benefit</span>
              <span className="font-semibold text-slate-900 dark:text-white truncate block">
                {sch.amount || 'Not specified'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Funding Type</span>
              <span className="font-semibold text-slate-900 dark:text-white truncate block">
                {sch.fundingType || 'Not specified'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Deadline</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white truncate block">
                {sch.deadline || 'Not specified'}
              </span>
            </div>
          </div>

          {elig && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between font-semibold">
                <span className="text-blue-800 dark:text-blue-300">AI Eligibility: {elig.verdict}</span>
                <span className="font-mono tabular-nums text-blue-700 dark:text-blue-300">{elig.matchScore}/100</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">{elig.reason}</p>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleCheckEligibility(sch, false)}
              disabled={checkingId === sch.id}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {checkingId === sch.id ? 'Checking...' : 'Check Eligibility'}
            </button>
            <button
              onClick={() => handleVerifyOfficialSource(sch)}
              disabled={verifyingId === sch.id}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {verifyingId === sch.id ? 'Verifying...' : 'Verify Page'}
            </button>
            <button
              onClick={() => handleSaveScholarship(sch)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Bookmark className="w-3.5 h-3.5" />
              {isSaved ? 'Saved' : 'Save'}
            </button>
            <button
              onClick={() => handleTrackApplication(sch)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Track
            </button>
            <button
              onClick={() => handleToggleCompare(sch)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                isCompared
                  ? 'border-violet-600 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {isCompared ? 'Compared' : 'Compare'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setDetailSch(sch)}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Details
            </button>
            {hasOfficialUrl && (
              <a
                href={sch.officialApplicationUrl || sch.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
              >
                Official Link <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={() => setReportTarget(sch)}
              title="Report inaccurate details"
              className="text-slate-400 hover:text-rose-600 cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </article>
    );
  };

  const renderDiscoverySection = (presetTitle?: string, presetSubtitle?: string) => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">
            {presetTitle || 'Discover Verified Scholarships'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            {presetSubtitle ||
              'Natural-language and structured scholarship search powered by the Google Search Scraper + official page verification.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setDemoMode((d) => !d)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
              demoMode
                ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {demoMode ? 'Showing Sample Demo Data' : 'Preview Sample Demo Data'}
          </button>
          {compareIds.length >= 2 && (
            <button
              onClick={() => setSection('compare')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <GitCompare className="w-3.5 h-3.5" /> Compare ({compareIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Natural Language + Structured Filter Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runScholarshipDiscovery();
        }}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
            Natural Language AI Scholarship Search
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Sparkles className="w-4 h-4 text-violet-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={naturalQuery}
                onChange={(e) => setNaturalQuery(e.target.value)}
                placeholder='e.g. "Find engineering scholarships in India for MCA students in cybersecurity" or "Fully funded UK master’s scholarships"'
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1221] text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Search className="w-4 h-4" />
              {searching ? 'Searching...' : 'Find Scholarships'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Keywords / Course</label>
            <input
              value={keywordQuery}
              onChange={(e) => setKeywordQuery(e.target.value)}
              placeholder="e.g. Cybersecurity, Merit"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Country</label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="India / UK / USA"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">State / Region</label>
            <input
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              placeholder="Rajasthan / All"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
          </div>
          {!activePresetCategory && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Education Level</label>
            <select
              value={educationFilter}
              onChange={(e) => setEducationFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
            >
              <option value="All">All Levels</option>
              {EDUCATION_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Funding Type</label>
            <select
              value={fundingFilter}
              onChange={(e) => setFundingFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
            >
              <option value="All">Any Funding</option>
              <option value="Full Funding">Full Funding</option>
              <option value="Partial Funding">Partial Funding</option>
              <option value="Tuition Waiver">Tuition Waiver</option>
              <option value="Stipend / Grant">Stipend / Grant</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={verifyOfficialPages}
                onChange={(e) => setVerifyOfficialPages(e.target.checked)}
                className="rounded"
              />
              Fetch &amp; verify official source pages (slower, higher accuracy)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Deadline filter:</span>
              <select
                value={deadlineFilter}
                onChange={(e) => setDeadlineFilter(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
              >
                <option value="All">All</option>
                <option value="Open Only">Open / Upcoming</option>
                <option value="Has Deadline">Has Explicit Deadline</option>
              </select>
            </div>
          </div>
          <span className="text-slate-500 dark:text-slate-400">
            Missing amounts or deadlines always show &ldquo;Not specified&rdquo;.
          </span>
        </div>
      </form>

      {parsedNlq && Object.keys(parsedNlq).length > 0 && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/70 dark:bg-violet-950/30 px-4 py-3 text-xs text-violet-900 dark:text-violet-200">
          <strong>AI Query Filters Applied:</strong>{' '}
          {Object.entries(parsedNlq)
            .filter(([, v]) => Boolean(v))
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ')}
        </div>
      )}

      {providerError && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{providerError}</span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && onSwitchToAdminProviders && (
              <button
                onClick={onSwitchToAdminProviders}
                className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold cursor-pointer"
              >
                Admin Data Sources
              </button>
            )}
            <button
              onClick={() => setDemoMode(true)}
              className="px-3 py-1.5 rounded-lg border border-amber-400 text-amber-900 dark:text-amber-200 font-semibold cursor-pointer"
            >
              Load Sample Demo Data
            </button>
          </div>
        </div>
      )}

      {filteredScholarships.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center space-y-3">
          <GraduationCap className="w-8 h-8 text-blue-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {liveResults.length === 0 && !demoMode
              ? 'Run a live scholarship query above or preview verified Sample Demo Data.'
              : 'No scholarships matched the active filter criteria.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => runScholarshipDiscovery()}
              disabled={searching}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              {searching ? 'Searching...' : 'Search Live Scholarships'}
            </button>
            <button
              onClick={() => setDemoMode(true)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Preview Sample Demo Data
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredScholarships.map((s) => renderScholarshipCard(s))}
        </div>
      )}

      {/* Educational Institutions Lookup inside University section */}
      {section === 'university' && (
        <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-[#0B1221] dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" /> Educational Institutions Lookup (Separate Directory)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Search universities and colleges separately via Maps discovery so you can check official university financial aid portals directly.
            </p>
          </div>
          <form onSubmit={handleSearchInstitutions} className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4">
            <input
              value={instQuery}
              onChange={(e) => setInstQuery(e.target.value)}
              placeholder="University or institute name"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <input
              value={instCity}
              onChange={(e) => setInstCity(e.target.value)}
              placeholder="City (e.g. Jaipur)"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <input
              value={instCountry}
              onChange={(e) => setInstCountry(e.target.value)}
              placeholder="Country (e.g. India)"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <button
              type="submit"
              disabled={instLoading}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              {instLoading ? 'Looking up...' : 'Search Institutions'}
            </button>
          </form>
          {instError && <p className="text-xs text-amber-600">{instError}</p>}
          {institutions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {institutions.map((inst) => (
                <div key={inst.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4 space-y-1.5 text-xs">
                  <p className="text-[11px] text-slate-500">{inst.category} · {inst.source}</p>
                  <p className="font-bold text-sm text-[#0B1221] dark:text-white">{inst.name}</p>
                  <p className="text-slate-600 dark:text-slate-300">{inst.address || `${inst.city}, ${inst.country}`}</p>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="font-mono tabular-nums text-slate-500">
                      {inst.rating ? `Rating ${inst.rating}/5` : 'No rating'}
                    </span>
                    {inst.website ? (
                      <a href={inst.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                        Visit Website
                      </a>
                    ) : (
                      <span className="text-slate-400">Website not available</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const selectedEligScholarship = useMemo(
    () =>
      allSelectableScholarships.find((s) => s.id === selectedEligibilityId) ||
      allSelectableScholarships[0] ||
      null,
    [allSelectableScholarships, selectedEligibilityId]
  );

  const embeddedNav: Array<{ id: ScholarshipSection; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'discover', label: 'Discover' },
    { id: 'recommended', label: 'Recommended' },
    { id: 'government', label: 'Government' },
    { id: 'private', label: 'Private' },
    { id: 'international', label: 'International' },
    { id: 'university', label: 'University' },
    { id: 'fellowships', label: 'Fellowships' },
    { id: 'saved', label: `Saved (${savedList.length})` },
    { id: 'applications', label: `Applications (${applications.length})` },
    { id: 'eligibility', label: 'Eligibility AI' },
    { id: 'compare', label: `Compare (${compareIds.length})` },
    { id: 'calendar', label: 'Deadlines' },
  ];

  return (
    <div className="space-y-6">
      {embedded && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
          {embeddedNav.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                section === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* 1. Overview */}
      {section === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">
                Welcome back, {effectiveProfile.fullName}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                {effectiveProfile.educationLevel} · {effectiveProfile.degree} ({effectiveProfile.course}) · {effectiveProfile.country}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSection('discover')}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Discover Scholarships
              </button>
              <button
                onClick={() => setSection('eligibility')}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                AI Eligibility Checker
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Saved Scholarships', value: savedList.length, action: () => setSection('saved') },
              { label: 'Tracked Applications', value: applications.length, action: () => setSection('applications') },
              {
                label: 'Active Reminders',
                value: reminders.filter((r) => !r.completed).length,
                action: () => setSection('calendar'),
              },
              {
                label: 'Verified Catalog',
                value: verifiedCurated.length || DEMO_SCHOLARSHIPS.length,
                action: () => setSection('recommended'),
              },
            ].map((card) => (
              <button
                key={card.label}
                onClick={card.action}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4 hover:border-blue-500 transition-colors cursor-pointer"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0B1221] dark:text-white">
                  {card.value}
                </p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Top Matches for Your Academic Profile</h2>
                <button onClick={() => setSection('recommended')} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                  View All
                </button>
              </div>
              <div className="space-y-2.5">
                {recommendedScholarships.slice(0, 3).map(({ scholarship, profileScore }) => (
                  <div key={scholarship.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1221] flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{scholarship.title}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {scholarship.provider} · Deadline: {scholarship.deadline || 'Not specified'}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-bold text-emerald-600 shrink-0">
                      {profileScore}% fit
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Upcoming Reminders &amp; Applications</h2>
                <button onClick={() => setSection('calendar')} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                  Open Calendar
                </button>
              </div>
              {reminders.length === 0 && applications.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No personal deadlines saved yet. Save a reminder or track a scholarship to see your timeline here.
                </p>
              ) : (
                <div className="space-y-2">
                  {reminders.slice(0, 3).map((r) => (
                    <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1221] flex items-center justify-between text-xs">
                      <span className={r.completed ? 'line-through text-slate-400' : 'font-semibold'}>
                        {r.scholarshipTitle}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500">{r.reminderDate}</span>
                    </div>
                  ))}
                  {applications.slice(0, 3).map((a) => (
                    <div key={a.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1221] flex items-center justify-between text-xs">
                      <span className="font-semibold truncate">{a.title}</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium shrink-0">{a.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Discover & 4-8 Category Views */}
      {section === 'discover' && renderDiscoverySection()}
      {section === 'government' &&
        renderDiscoverySection(
          'Government Scholarships',
          'Central, state, and public ministry scholarships with explicit official portal verification.'
        )}
      {section === 'private' &&
        renderDiscoverySection(
          'Private & Foundation Scholarships',
          'Corporate CSR, NGO, and charitable trust scholarships across India and globally.'
        )}
      {section === 'international' &&
        renderDiscoverySection(
          'International Scholarships',
          'Study-abroad awards, bilateral government grants, and global tuition fellowships.'
        )}
      {section === 'university' &&
        renderDiscoverySection(
          'University Scholarships & Institutions',
          'University-funded financial aid plus separate Educational Institutions lookup.'
        )}
      {section === 'fellowships' &&
        renderDiscoverySection(
          'Fellowships & Research Grants',
          'Postgraduate stipends, doctoral fellowships, and funded research grants.'
        )}

      {/* 3. Recommended for Me */}
      {section === 'recommended' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Recommended Scholarships for Me</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Ranked for {effectiveProfile.educationLevel} · {effectiveProfile.degree} · {effectiveProfile.course} · {effectiveProfile.country}
              </p>
            </div>
            <button
              onClick={() => {
                setSection('discover');
                runScholarshipDiscovery({
                  naturalQuery: `${effectiveProfile.educationLevel} ${effectiveProfile.degree} ${effectiveProfile.course} scholarships in ${effectiveProfile.country}`,
                  country: effectiveProfile.country,
                });
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Run Live Search From My Profile
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {recommendedScholarships.map(({ scholarship, profileScore }) =>
              renderScholarshipCard(scholarship, profileScore)
            )}
          </div>
        </div>
      )}

      {/* 9. Saved Scholarships */}
      {section === 'saved' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Saved Scholarships</h1>
          {savedList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No saved scholarships yet. Click &ldquo;Save&rdquo; on any scholarship card to store it here.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {savedList.map((s) => (
                <div key={s.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-500">
                        {s.category} · {s.sourceType} · {s.sourceVerificationStatus}
                      </p>
                      <h3 className="text-base font-bold mt-0.5">{s.title}</h3>
                      <p className="text-xs text-slate-500">
                        {s.provider} · {s.country} · Amount: {s.amount || 'Not specified'} · Deadline: {s.deadline || 'Not specified'}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteDoc(doc(db, 'savedScholarships', s.id))}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                      aria-label="Remove saved scholarship"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={savedNotesDraft[s.id] ?? s.notes ?? ''}
                      onChange={(e) => setSavedNotesDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      placeholder="Personal notes..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                    />
                    <button
                      onClick={() => handleSaveNotes(s)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Save Note
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    {s.officialApplicationUrl ? (
                      <a href={s.officialApplicationUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline">
                        Official Portal
                      </a>
                    ) : (
                      <span className="text-slate-400">No URL saved</span>
                    )}
                    <button
                      onClick={() =>
                        handleTrackApplication({
                          id: s.scholarshipId,
                          title: s.title,
                          provider: s.provider,
                          description: '',
                          category: (s.category as any) || 'Government',
                          country: s.country || 'India',
                          state: '',
                          eligibleLocations: [],
                          educationLevels: [],
                          degrees: [],
                          courses: [],
                          subjects: [],
                          academicRequirements: 'Not specified',
                          financialRequirements: 'Not specified',
                          otherEligibilityCriteria: 'Not specified',
                          amount: s.amount || 'Not specified',
                          currency: 'INR',
                          fundingType: (s.fundingType as any) || 'Not specified',
                          benefits: [],
                          startDate: 'Not specified',
                          deadline: s.deadline || 'Not specified',
                          requiredDocuments: [],
                          applicationInstructions: '',
                          officialApplicationUrl: s.officialApplicationUrl || '',
                          sourceUrl: s.officialApplicationUrl || '',
                          sourceType: s.sourceType || 'Unverified Source',
                          sourceVerificationStatus: s.sourceVerificationStatus || 'Pending Review',
                          publicationDate: '',
                          lastVerifiedAt: '',
                          status: 'Open',
                          isDemo: Boolean(s.isDemo),
                        })
                      }
                      className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Move to Application Tracker
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 10. Application Tracker */}
      {section === 'applications' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Scholarship Application Tracker</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Track progress across 10 stages. Document checklist stores document names only — never upload Aadhaar numbers, bank passwords, or private ID files.
            </p>
          </div>

          {applications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No scholarship applications tracked yet. Click &ldquo;Track&rdquo; on any scholarship card to begin.
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <div key={app.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{app.status}</p>
                      <h3 className="text-base font-bold mt-0.5">{app.title}</h3>
                      <p className="text-xs text-slate-500">
                        {app.provider} · Deadline: {app.deadline || 'Not specified'}
                        {app.applicationDate ? ` · Applied: ${app.applicationDate}` : ''}
                        {app.referenceNumber ? ` · Ref: ${app.referenceNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingApp({ ...app })}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                      >
                        Update Status &amp; Checklist
                      </button>
                      <button
                        onClick={() => deleteDoc(doc(db, 'scholarshipApplications', app.id))}
                        className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        aria-label="Delete application"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {app.documentNames && app.documentNames.length > 0 && (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      <strong>Document Checklist:</strong> {app.documentNames.join(' · ')}
                    </p>
                  )}
                  {app.notes && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{app.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {editingApp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
              <form
                onSubmit={handleSaveApplicationEdit}
                className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              >
                <h2 className="text-lg font-bold">Update Application: {editingApp.title}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Application Status</label>
                    <select
                      value={editingApp.status}
                      onChange={(e) => setEditingApp({ ...editingApp, status: e.target.value as ScholarshipApplicationStatus })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                    >
                      {SCHOLARSHIP_APPLICATION_STATUSES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Application Date</label>
                    <input
                      type="date"
                      value={editingApp.applicationDate || ''}
                      onChange={(e) => setEditingApp({ ...editingApp, applicationDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Reference Number (optional)</label>
                    <input
                      value={editingApp.referenceNumber || ''}
                      onChange={(e) => setEditingApp({ ...editingApp, referenceNumber: e.target.value })}
                      placeholder="Portal application ref"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Reminder Date</label>
                    <input
                      type="date"
                      value={editingApp.reminderDate || ''}
                      onChange={(e) => setEditingApp({ ...editingApp, reminderDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Document Checklist (document names only)</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={docInput}
                      onChange={(e) => setDocInput(e.target.value)}
                      placeholder="e.g. Bonafide Certificate"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!docInput.trim()) return;
                        setEditingApp({
                          ...editingApp,
                          documentNames: [...(editingApp.documentNames || []), docInput.trim().slice(0, 120)].slice(0, 20),
                        });
                        setDocInput('');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {(editingApp.documentNames || []).map((dn, idx) => (
                      <button
                        type="button"
                        key={`${dn}-${idx}`}
                        onClick={() =>
                          setEditingApp({
                            ...editingApp,
                            documentNames: (editingApp.documentNames || []).filter((_, i) => i !== idx),
                          })
                        }
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:border-rose-500 cursor-pointer"
                      >
                        {dn} ×
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Notes</label>
                  <textarea
                    rows={3}
                    value={editingApp.notes || ''}
                    onChange={(e) => setEditingApp({ ...editingApp, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingApp(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* 11. AI Eligibility Checker */}
      {section === 'eligibility' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">AI Scholarship Eligibility Checker</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Compares your academic profile against published scholarship rules with strict 4-state transparency.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-blue-600" /> Select Scholarship &amp; Profile
              </h2>
              <div>
                <label className="block text-xs font-medium mb-1">Scholarship to Evaluate</label>
                <select
                  value={selectedEligScholarship?.id || ''}
                  onChange={(e) => setSelectedEligibilityId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
                >
                  {allSelectableScholarships.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#0B1221] p-3 text-xs space-y-1">
                <p><strong>Level:</strong> {effectiveProfile.educationLevel}</p>
                <p><strong>Degree &amp; Course:</strong> {effectiveProfile.degree} · {effectiveProfile.course}</p>
                <p><strong>Location:</strong> {effectiveProfile.country}{effectiveProfile.state ? `, ${effectiveProfile.state}` : ''}</p>
                <p><strong>Score / GPA:</strong> {effectiveProfile.academicScore || 'Not specified'}</p>
                <p><strong>Income Bracket:</strong> {effectiveProfile.incomeRange || 'Not specified'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={!selectedEligScholarship || checkingId === selectedEligScholarship.id}
                  onClick={() => selectedEligScholarship && handleCheckEligibility(selectedEligScholarship, false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {checkingId ? 'Evaluating Criteria...' : 'Run AI Eligibility Check'}
                </button>
                <button
                  onClick={() => setSection('profile')}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Edit Profile
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6">
              {selectedEligScholarship && eligibilityMap[selectedEligScholarship.id] ? (
                (() => {
                  const res = eligibilityMap[selectedEligScholarship.id];
                  return (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div>
                          <p className="text-xs text-slate-500">AI Eligibility Assessment</p>
                          <h3 className="text-lg font-bold text-[#0B1221] dark:text-white">{res.scholarshipTitle}</h3>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-sm font-bold block ${
                              res.verdict === 'Eligible'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : res.verdict === 'Not Eligible'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {res.verdict}
                          </span>
                          <span className="font-mono tabular-nums text-xs text-slate-500">
                            Match Score: {res.matchScore} / 100
                          </span>
                        </div>
                      </div>

                      <p className="text-sm text-slate-700 dark:text-slate-200">{res.reason}</p>

                      {res.scoreBreakdown.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Score Breakdown</h4>
                          {res.scoreBreakdown.map((b) => (
                            <div key={b.factor} className="text-xs">
                              <div className="flex justify-between mb-0.5">
                                <span className="font-medium">{b.factor}</span>
                                <span className="font-mono tabular-nums">{b.points}/{b.maxPoints}</span>
                              </div>
                              <p className="text-[11px] text-slate-500">{b.evidence}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <h4 className="font-bold text-emerald-700 dark:text-emerald-400 mb-1">Matching Criteria</h4>
                          <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                            {(res.matchingCriteria.length ? res.matchingCriteria : ['No explicit criteria matched']).map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-bold text-amber-700 dark:text-amber-400 mb-1">Missing / Unmatched Info</h4>
                          <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                            {[...res.unmatchedCriteria, ...res.missingInformation].length === 0 ? (
                              <li>None flagged</li>
                            ) : (
                              [...res.unmatchedCriteria, ...res.missingInformation].map((m) => <li key={m}>{m}</li>)
                            )}
                          </ul>
                        </div>
                      </div>

                      {res.requiredDocuments.length > 0 && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          <strong>Required Documents:</strong> {res.requiredDocuments.join(' · ')}
                        </p>
                      )}

                      <div className="rounded-xl bg-slate-50 dark:bg-[#0B1221] p-3 text-xs text-slate-500 dark:text-slate-400">
                        <p><strong>Disclaimer:</strong> {res.disclaimer}</p>
                        {res.officialSourceReference && (
                          <a
                            href={res.officialSourceReference}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold mt-1 hover:underline"
                          >
                            Verify Official Requirements <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  Select a scholarship on the left and click &ldquo;Run AI Eligibility Check&rdquo; for a criterion-by-criterion evaluation.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 12. Scholarship Comparison */}
      {section === 'compare' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Scholarship Comparison</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Compare up to 3 scholarships side by side. Toggle &ldquo;Compare&rdquo; on any discovery card to customize this table.
            </p>
          </div>
          {compareScholarships.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No scholarships selected for comparison.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1221]">
                  <tr>
                    <th className="py-3 px-4 font-semibold w-44">Attribute</th>
                    {compareScholarships.map((s) => (
                      <th key={s.id} className="py-3 px-4 font-bold text-sm text-[#0B1221] dark:text-white min-w-[220px]">
                        {s.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[
                    ['Provider', (s: ScholarshipRecord) => s.provider],
                    ['Category', (s: ScholarshipRecord) => s.category],
                    ['Country / Region', (s: ScholarshipRecord) => `${s.country}${s.state ? `, ${s.state}` : ''}`],
                    ['Funding Type', (s: ScholarshipRecord) => s.fundingType || 'Not specified'],
                    ['Amount / Benefit', (s: ScholarshipRecord) => s.amount || 'Not specified'],
                    ['Deadline', (s: ScholarshipRecord) => s.deadline || 'Not specified'],
                    ['Education Levels', (s: ScholarshipRecord) => s.educationLevels.join(', ') || 'Not specified'],
                    ['Academic Criteria', (s: ScholarshipRecord) => s.academicRequirements || 'Not specified'],
                    ['Financial Criteria', (s: ScholarshipRecord) => s.financialRequirements || 'Not specified'],
                    ['Required Documents', (s: ScholarshipRecord) => s.requiredDocuments.join(', ') || 'Not specified'],
                    ['Source Verification', (s: ScholarshipRecord) => `${s.sourceType} (${s.sourceVerificationStatus})`],
                  ].map(([label, getter]) => (
                    <tr key={String(label)}>
                      <td className="py-3 px-4 font-semibold text-slate-500">{String(label)}</td>
                      {compareScholarships.map((s) => (
                        <td key={s.id} className="py-3 px-4 text-slate-700 dark:text-slate-200 align-top">
                          {(getter as (s: ScholarshipRecord) => string)(s)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-3 px-4 font-semibold text-slate-500">Official Source</td>
                    {compareScholarships.map((s) => (
                      <td key={s.id} className="py-3 px-4">
                        <a
                          href={s.officialApplicationUrl || s.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                        >
                          Open Official Page
                        </a>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 13. Deadline Calendar & Reminders */}
      {section === 'calendar' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white">Deadline Calendar &amp; Reminders</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                View published scholarship closing dates alongside your personal reminders.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold min-w-[140px] text-center">
                {calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4">
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500 pb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((cell, idx) => {
                  const events = cell.dateStr ? deadlineEventsByDate[cell.dateStr] || [] : [];
                  return (
                    <div
                      key={idx}
                      className={`min-h-[76px] rounded-lg border p-1.5 text-xs ${
                        cell.day
                          ? 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0B1221]'
                          : 'border-transparent'
                      }`}
                    >
                      {cell.day && (
                        <>
                          <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            {cell.day}
                          </span>
                          <div className="mt-1 space-y-1">
                            {events.slice(0, 2).map((ev, i) => (
                              <div
                                key={i}
                                className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                                  ev.kind === 'scholarship'
                                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200'
                                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200'
                                }`}
                                title={ev.title}
                              >
                                {ev.title}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-4 space-y-4">
              <form onSubmit={handleAddReminder} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-blue-600" /> Add Deadline Reminder
                </h2>
                <input
                  required
                  value={newReminderTitle}
                  onChange={(e) => setNewReminderTitle(e.target.value)}
                  placeholder="Scholarship or document task"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                <input
                  required
                  type="date"
                  value={newReminderDate}
                  onChange={(e) => setNewReminderDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                <input
                  value={newReminderNote}
                  onChange={(e) => setNewReminderNote(e.target.value)}
                  placeholder="Optional note (e.g. Upload bonafide letter)"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                <button type="submit" className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
                  Save Reminder
                </button>
              </form>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-2.5">
                <h3 className="text-sm font-bold">My Reminders ({reminders.length})</h3>
                {reminders.length === 0 ? (
                  <p className="text-xs text-slate-500">No reminders added yet.</p>
                ) : (
                  reminders.map((r) => (
                    <div key={r.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B1221] flex items-start justify-between gap-2 text-xs">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.completed}
                          onChange={() => updateDoc(doc(db, 'scholarshipReminders', r.id), { completed: !r.completed })}
                          className="mt-0.5 rounded"
                        />
                        <span>
                          <strong className={r.completed ? 'line-through text-slate-400' : ''}>{r.scholarshipTitle}</strong>
                          <span className="block font-mono tabular-nums text-[11px] text-slate-500">{r.reminderDate}</span>
                          {r.note && <span className="block text-[11px] text-slate-500">{r.note}</span>}
                        </span>
                      </label>
                      <button
                        onClick={() => deleteDoc(doc(db, 'scholarshipReminders', r.id))}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        aria-label="Delete reminder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 14. Student Profile */}
      {section === 'profile' && (
        <form onSubmit={handleSaveStudentProfile} className="max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold">Student Academic &amp; Eligibility Profile</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Privacy notice: Only academic eligibility preferences are stored here. Never enter Aadhaar numbers, bank passwords, or private student ID numbers.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Full Name *</label>
              <input
                required
                value={profileForm.fullName}
                onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Education Level *</label>
              <select
                value={profileForm.educationLevel}
                onChange={(e) => setProfileForm({ ...profileForm, educationLevel: e.target.value as any })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
              >
                {EDUCATION_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Degree *</label>
              <input
                required
                value={profileForm.degree}
                onChange={(e) => setProfileForm({ ...profileForm, degree: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Course / Major *</label>
              <input
                required
                value={profileForm.course}
                onChange={(e) => setProfileForm({ ...profileForm, course: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Specialization</label>
              <input
                value={profileForm.specialization}
                onChange={(e) => setProfileForm({ ...profileForm, specialization: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">School / College / University *</label>
              <input
                required
                value={profileForm.institution}
                onChange={(e) => setProfileForm({ ...profileForm, institution: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Country *</label>
              <input
                required
                value={profileForm.country}
                onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">State / Region</label>
              <input
                value={profileForm.state}
                onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">City</label>
              <input
                value={profileForm.city}
                onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Percentage / CGPA (optional)</label>
              <input
                value={profileForm.academicScore}
                onChange={(e) => setProfileForm({ ...profileForm, academicScore: e.target.value })}
                placeholder="e.g. 8.5 CGPA"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Graduation Year *</label>
              <input
                required
                value={profileForm.graduationYear}
                onChange={(e) => setProfileForm({ ...profileForm, graduationYear: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Preferred Funding</label>
              <select
                value={profileForm.preferredFunding}
                onChange={(e) => setProfileForm({ ...profileForm, preferredFunding: e.target.value as any })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
              >
                <option value="Any">Any</option>
                <option value="Full Funding">Full Funding</option>
                <option value="Partial Funding">Partial Funding</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Annual Family Income Bracket (optional)</label>
              <select
                value={profileForm.incomeRange}
                onChange={(e) => setProfileForm({ ...profileForm, incomeRange: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
              >
                <option value="Prefer not to say">Prefer not to say</option>
                <option value="Below ₹2.5 Lakh">Below ₹2.5 Lakh</option>
                <option value="₹2.5 Lakh – ₹5 Lakh">₹2.5 Lakh – ₹5 Lakh</option>
                <option value="₹5 Lakh – ₹8 Lakh">₹5 Lakh – ₹8 Lakh</option>
                <option value="Above ₹8 Lakh">Above ₹8 Lakh</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Scholarship Interests (comma-separated)</label>
              <input
                value={profileForm.interestsText}
                onChange={(e) => setProfileForm({ ...profileForm, interestsText: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            {savingProfile ? 'Saving...' : 'Save Student Profile'}
          </button>
        </form>
      )}

      {/* 15. Student Notifications */}
      {section === 'notifications' && (
        <div className="max-w-3xl space-y-4">
          <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" /> Student Notifications
          </h1>
          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-10 text-center text-sm text-slate-500">
              No notifications yet. Scholarship verification updates and deadline alerts appear here.
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-4 ${
                    n.read ? 'bg-white dark:bg-[#111A2E] opacity-75' : 'bg-blue-50/70 dark:bg-blue-950/30'
                  }`}
                >
                  <div>
                    <p className="text-xs text-slate-500 capitalize">{n.type}</p>
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{n.message}</p>
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => updateDoc(doc(db, 'notifications', n.id), { read: true })}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 16. Settings */}
      {section === 'settings' && <AccountSettingsView />}

      {/* Details Modal (strict separation: Verified Source Facts vs AI Explanation) */}
      {detailSch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-w-2xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">
                  {detailSch.category} · {detailSch.sourceType} · {detailSch.sourceVerificationStatus}
                </p>
                <h2 className="text-xl font-bold text-[#0B1221] dark:text-white mt-0.5">{detailSch.title}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{detailSch.provider}</p>
              </div>
              <button onClick={() => setDetailSch(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer">
                Close
              </button>
            </div>

            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-2 text-xs">
              <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Extracted Source Facts
              </p>
              <p><strong>Amount:</strong> {detailSch.amount || 'Not specified'} · <strong>Funding:</strong> {detailSch.fundingType}</p>
              <p><strong>Deadline:</strong> {detailSch.deadline || 'Not specified'} · <strong>Location:</strong> {detailSch.country}{detailSch.state ? `, ${detailSch.state}` : ''}</p>
              <p><strong>Academic Criteria:</strong> {detailSch.academicRequirements || 'Not specified'}</p>
              <p><strong>Financial Criteria:</strong> {detailSch.financialRequirements || 'Not specified'}</p>
              {detailSch.requiredDocuments.length > 0 && (
                <p><strong>Required Documents:</strong> {detailSch.requiredDocuments.join(' · ')}</p>
              )}
              {detailSch.applicationInstructions && (
                <p><strong>How to Apply:</strong> {detailSch.applicationInstructions}</p>
              )}
            </div>

            {detailSch.aiMatchReason && (
              <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-4 text-xs space-y-1">
                <p className="font-bold text-violet-800 dark:text-violet-300">AI Advisory Summary (Not an Official Ruling)</p>
                <p className="text-slate-700 dark:text-slate-200">{detailSch.aiMatchReason}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleCheckEligibility(detailSch, true)}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  Open in Eligibility Checker
                </button>
                <button
                  onClick={() => handleTrackApplication(detailSch)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                >
                  Track Application
                </button>
              </div>
              <a
                href={detailSch.officialApplicationUrl || detailSch.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Official Application Portal <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSubmitReport}
            className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 space-y-4"
          >
            <h2 className="text-base font-bold">Report Inaccurate Scholarship</h2>
            <p className="text-xs text-slate-500">{reportTarget.title}</p>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-xs"
            >
              <option>Broken official link or outdated deadline</option>
              <option>Suspicious or unverified scholarship portal</option>
              <option>Incorrect amount or eligibility requirement</option>
              <option>Duplicate scholarship listing</option>
            </select>
            <textarea
              rows={3}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Optional details for moderators..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
