import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type {
  BusinessProfile,
  FreelancerProfile,
  StudentProfile,
  UserAccount,
  UserRole,
} from '../types/domain';

type OnboardingRole = 'student' | 'freelancer' | 'business';

interface AuthContextValue {
  firebaseUser: User | null;
  account: UserAccount | null;
  freelancerProfile: FreelancerProfile | null;
  businessProfile: BusinessProfile | null;
  studentProfile: StudentProfile | null;
  isAdmin: boolean;
  loading: boolean;
  needsOnboarding: boolean;
  signInWithGoogle: (preferredRole?: OnboardingRole) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    password: string,
    fullName: string,
    role: OnboardingRole
  ) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  completeOnboarding: (role: OnboardingRole, details: any) => Promise<void>;
  refreshProfiles: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  deleteMyAccountData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  account: null,
  freelancerProfile: null,
  businessProfile: null,
  studentProfile: null,
  isAdmin: false,
  loading: true,
  needsOnboarding: false,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  registerWithEmail: async () => {},
  resetPassword: async () => {},
  resendVerificationEmail: async () => {},
  completeOnboarding: async () => {},
  refreshProfiles: async () => {},
  signOut: async () => {},
  getIdToken: async () => null,
  deleteMyAccountData: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [freelancerProfile, setFreelancerProfile] = useState<FreelancerProfile | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingRole, setPendingRole] = useState<OnboardingRole | null>(null);

  const loadUserContext = useCallback(async (user: User | null) => {
    if (!user) {
      setAccount(null);
      setFreelancerProfile(null);
      setBusinessProfile(null);
      setStudentProfile(null);
      setIsAdminDoc(false);
      setLoading(false);
      return;
    }

    try {
      const userPath = `users/${user.uid}`;
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      let acc: UserAccount | null = userSnap.exists()
        ? (userSnap.data() as UserAccount)
        : null;

      // Check trusted /admins/{uid} doc
      let adminFlag =
        user.emailVerified &&
        user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

      if (!adminFlag) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', user.uid));
          if (adminSnap.exists()) adminFlag = true;
        } catch {
          // Non-admins receive permission-denied or non-existent; safe to ignore
        }
      }
      setIsAdminDoc(adminFlag);

      if (!acc && pendingRole && user.emailVerified) {
        const nowRole: UserRole = pendingRole;
        const newAccount: UserAccount = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email?.split('@')[0] || 'ClientHunt User',
          photoURL: user.photoURL || '',
          role: nowRole,
          status: 'active',
          onboardingCompleted: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        try {
          await setDoc(doc(db, 'users', user.uid), newAccount);
          acc = newAccount;
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, userPath);
        }
      }

      setAccount(acc);

      if (acc) {
        const [fSnap, bSnap, sSnap] = await Promise.all([
          getDoc(doc(db, 'freelancerProfiles', user.uid)),
          getDoc(doc(db, 'businessProfiles', user.uid)),
          getDoc(doc(db, 'studentProfiles', user.uid)),
        ]);
        setFreelancerProfile(fSnap.exists() ? (fSnap.data() as FreelancerProfile) : null);
        setBusinessProfile(bSnap.exists() ? (bSnap.data() as BusinessProfile) : null);
        setStudentProfile(sSnap.exists() ? (sSnap.data() as StudentProfile) : null);
      }
    } catch (err) {
      console.error('Failed loading user context:', err);
    } finally {
      setLoading(false);
    }
  }, [pendingRole]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      loadUserContext(user);
    });
    return () => unsub();
  }, [loadUserContext]);

  const signInWithGoogle = async (preferredRole?: OnboardingRole) => {
    if (preferredRole) setPendingRole(preferredRole);
    const cred = await signInWithPopup(auth, googleProvider);
    if (preferredRole && cred.user) {
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (!snap.exists()) {
        const newAccount: UserAccount = {
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: cred.user.displayName || 'ClientHunt User',
          photoURL: cred.user.photoURL || '',
          role: preferredRole,
          status: 'active',
          onboardingCompleted: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'users', cred.user.uid), newAccount);
      }
    }
    await loadUserContext(cred.user);
  };

  const signInWithEmail = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await loadUserContext(cred.user);
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    fullName: string,
    role: OnboardingRole
  ) => {
    setPendingRole(role);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(cred.user);
    await loadUserContext(cred.user);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const resendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const completeOnboarding = async (role: OnboardingRole, details: any) => {
    if (!firebaseUser) throw new Error('Not authenticated');
    if (!firebaseUser.emailVerified) {
      throw new Error('Please verify your email address before saving your profile.');
    }

    const userRef = doc(db, 'users', firebaseUser.uid);
    const existingUser = await getDoc(userRef);

    if (!existingUser.exists()) {
      await setDoc(userRef, {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: String(details.fullName || details.companyName || firebaseUser.displayName || 'User').slice(0, 115),
        photoURL: firebaseUser.photoURL || '',
        role,
        status: 'active',
        onboardingCompleted: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName: String(details.fullName || details.companyName || existingUser.data().displayName).slice(0, 115),
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      });
    }

    if (role === 'freelancer') {
      const profilePayload: FreelancerProfile = {
        uid: firebaseUser.uid,
        fullName: String(details.fullName || firebaseUser.displayName || 'Freelancer').slice(0, 115),
        photoURL: firebaseUser.photoURL || '',
        headline: String(details.headline || 'Independent Freelance Specialist').slice(0, 195),
        description: String(details.description || '').slice(0, 2000),
        skills: Array.isArray(details.skills) ? details.skills.slice(0, 24) : ['Social Media', 'Strategy'],
        services: Array.isArray(details.services) ? details.services.slice(0, 16) : ['Social Media Management'],
        experienceLevel: details.experienceLevel || 'Intermediate',
        portfolioLinks: Array.isArray(details.portfolioLinks) ? details.portfolioLinks.slice(0, 10) : [],
        website: String(details.website || '').slice(0, 290),
        country: String(details.country || 'India').slice(0, 95),
        state: String(details.state || 'Rajasthan').slice(0, 95),
        city: String(details.city || 'Jaipur').slice(0, 95),
        workPreference: details.workPreference || 'Remote',
        minBudget: Number(details.minBudget) || 5000,
        preferredIndustries: Array.isArray(details.preferredIndustries) ? details.preferredIndustries.slice(0, 16) : ['Restaurants', 'Startups'],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'freelancerProfiles', firebaseUser.uid), profilePayload);
    } else if (role === 'student') {
      const studentPayload: StudentProfile = {
        uid: firebaseUser.uid,
        fullName: String(details.fullName || firebaseUser.displayName || 'Student').trim().slice(0, 115) || 'Student',
        photoURL: (firebaseUser.photoURL || '').slice(0, 490),
        educationLevel: details.educationLevel || 'Undergraduate',
        degree: String(details.degree || 'B.Tech').trim().slice(0, 115) || 'B.Tech',
        course: String(details.course || 'Computer Science').trim().slice(0, 115) || 'Computer Science',
        specialization: String(details.specialization || '').trim().slice(0, 115),
        country: String(details.country || 'India').trim().slice(0, 75) || 'India',
        state: String(details.state || 'Rajasthan').trim().slice(0, 75),
        city: String(details.city || 'Jaipur').trim().slice(0, 75),
        institution: String(details.institution || 'Not specified').trim().slice(0, 175) || 'Not specified',
        academicScore: String(details.academicScore || '').trim().slice(0, 55),
        graduationYear: String(details.graduationYear || '2027').trim().slice(0, 18) || '2027',
        incomeRange: String(details.incomeRange || 'Prefer not to say').trim().slice(0, 75),
        interests: Array.isArray(details.interests) ? details.interests.slice(0, 16) : ['Merit-based', 'Government'],
        preferredFunding: details.preferredFunding || 'Any',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'studentProfiles', firebaseUser.uid), studentPayload);
    } else {
      const bizPayload: BusinessProfile = {
        uid: firebaseUser.uid,
        companyName: String(details.companyName || 'My Business').slice(0, 155),
        industry: String(details.industry || 'Services').slice(0, 115),
        description: String(details.description || '').slice(0, 2000),
        website: String(details.website || '').slice(0, 290),
        country: String(details.country || 'India').slice(0, 95),
        state: String(details.state || 'Rajasthan').slice(0, 95),
        city: String(details.city || 'Jaipur').slice(0, 95),
        logoURL: firebaseUser.photoURL || '',
        size: details.size || '2-10',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'businessProfiles', firebaseUser.uid), bizPayload);
    }

    await setDoc(doc(db, 'notificationPreferences', firebaseUser.uid), {
      userId: firebaseUser.uid,
      newApplications: true,
      proposalUpdates: true,
      messages: true,
      followUpReminders: true,
      opportunityAlerts: true,
      updatedAt: serverTimestamp(),
    });

    await loadUserContext(firebaseUser);
  };

  const refreshProfiles = async () => {
    await loadUserContext(auth.currentUser);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setAccount(null);
    setFreelancerProfile(null);
    setBusinessProfile(null);
    setStudentProfile(null);
    setIsAdminDoc(false);
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  };

  const deleteMyAccountData = async () => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;
    const ownerCols = [
      'savedLeads',
      'crmPipelines',
      'crmActivities',
      'pitchDrafts',
      'leads',
      'opportunities',
      'leadAnalyses',
      'savedJobs',
      'jobApplications',
      'jobAlerts',
      'savedScholarships',
      'scholarshipApplications',
      'scholarshipReminders',
    ];
    for (const colName of ownerCols) {
      try {
        const snap = await getDocs(query(collection(db, colName), where('ownerId', '==', uid)));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
        }
      } catch {
        /* ignore */
      }
    }
    try { await deleteDoc(doc(db, 'freelancerProfiles', uid)); } catch { /* ignore */ }
    try { await deleteDoc(doc(db, 'businessProfiles', uid)); } catch { /* ignore */ }
    try { await deleteDoc(doc(db, 'studentProfiles', uid)); } catch { /* ignore */ }
    try { await deleteDoc(doc(db, 'notificationPreferences', uid)); } catch { /* ignore */ }
    try { await deleteDoc(doc(db, 'users', uid)); } catch { /* ignore */ }
    await firebaseSignOut(auth);
  };

  const isAdmin = isAdminDoc || account?.role === 'admin';
  const needsOnboarding = Boolean(firebaseUser && (!account || !account.onboardingCompleted));

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        account,
        freelancerProfile,
        businessProfile,
        studentProfile,
        isAdmin,
        loading,
        needsOnboarding,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        resetPassword,
        resendVerificationEmail,
        completeOnboarding,
        refreshProfiles,
        signOut,
        getIdToken,
        deleteMyAccountData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
