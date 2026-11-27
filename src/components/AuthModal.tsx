import React, { useEffect, useState } from 'react';
import { Briefcase, Mail, ShieldCheck, UserCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface AuthModalProps {
  open: boolean;
  initialMode: 'login' | 'register';
  initialRole?: 'freelancer' | 'business';
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({
  open,
  initialMode,
  initialRole = 'freelancer',
  onClose,
  onSuccess,
}: AuthModalProps) {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, resetPassword } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [role, setRole] = useState<'freelancer' | 'business'>(initialRole);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setRole(initialRole);
      setErrorMsg('');
    }
  }, [open, initialMode, initialRole]);

  if (!open) return null;

  const handleGoogle = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      await signInWithGoogle(mode === 'register' ? role : undefined);
      toast('Signed in with Google', 'success');
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setErrorMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    try {
      if (mode === 'forgot') {
        await resetPassword(email.trim());
        toast('Password reset email sent', 'success', 'Check your inbox for reset instructions.');
        setMode('login');
      } else if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
        toast('Welcome back', 'success');
        onSuccess();
      } else {
        if (!fullName.trim()) {
          setErrorMsg('Please enter your name or company name.');
          setBusy(false);
          return;
        }
        await registerWithEmail(email.trim(), password, fullName.trim(), role);
        toast('Account created', 'success', 'Please verify your email address via the verification link sent to you.');
        onSuccess();
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          'Email/Password sign-in is not yet enabled in the Firebase Console for this project. Use "Continue with Google" below, or enable Email/Password under Authentication → Sign-in method in Firebase Console.'
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 sm:p-7 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">ClientHunt AI Account</p>
          <h2 className="mt-1 text-2xl font-bold text-[#0B1221] dark:text-white">
            {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Your Account' : 'Reset Password'}
          </h2>
        </div>

        {mode === 'register' && (
          <div className="mb-5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              I am joining as
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('freelancer')}
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  role === 'freelancer'
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <div>
                  <p className="text-xs font-bold">Freelancer</p>
                  <p className="text-[11px] opacity-80">Find clients & jobs</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRole('business')}
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  role === 'business'
                    ? 'border-violet-600 bg-violet-50/70 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Briefcase className="w-4 h-4 shrink-0" />
                <div>
                  <p className="text-xs font-bold">Business</p>
                  <p className="text-[11px] opacity-80">Post projects & hire</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {mode !== 'forgot' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogle}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Continue with Google
            </button>
            <div className="my-4 flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              <span className="text-xs text-slate-400">or email</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
            </div>
          </>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {role === 'business' ? 'Company / Contact Name *' : 'Full Name *'}
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={role === 'business' ? 'e.g. Jaipur Craft Studio' : 'e.g. Aarav Sharma'}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-sm text-slate-900 dark:text-white"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-sm text-slate-900 dark:text-white"
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-sm text-slate-900 dark:text-white"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" />
            {busy
              ? 'Processing...'
              : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                  ? 'Create Account'
                  : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          {mode === 'login' && (
            <>
              <button onClick={() => setMode('forgot')} className="hover:text-blue-600 cursor-pointer">
                Forgot password?
              </button>
              <button onClick={() => setMode('register')} className="font-semibold text-blue-600 dark:text-blue-400 cursor-pointer">
                Need an account? Register
              </button>
            </>
          )}
          {mode === 'register' && (
            <button onClick={() => setMode('login')} className="font-semibold text-blue-600 dark:text-blue-400 cursor-pointer">
              Already have an account? Sign In
            </button>
          )}
          {mode === 'forgot' && (
            <button onClick={() => setMode('login')} className="font-semibold text-blue-600 dark:text-blue-400 cursor-pointer">
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OnboardingView() {
  const { firebaseUser, account, completeOnboarding, resendVerificationEmail, signOut } = useAuth();
  const { toast } = useToast();
  const [role, setRole] = useState<'freelancer' | 'business'>(
    account?.role === 'business' ? 'business' : 'freelancer'
  );
  const [fullName, setFullName] = useState(firebaseUser?.displayName || '');
  const [headline, setHeadline] = useState('');
  const [skillsText, setSkillsText] = useState('Social Media, Video Editing, Content Strategy');
  const [servicesText, setServicesText] = useState('Social Media Management, Video Editing');
  const [experienceLevel, setExperienceLevel] = useState<'Beginner' | 'Intermediate' | 'Senior' | 'Agency'>('Intermediate');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('Hospitality & Restaurants');
  const [size, setSize] = useState<'Solo' | '2-10' | '11-50' | '51-200' | '200+'>('2-10');
  const [country, setCountry] = useState('India');
  const [state, setState] = useState('Rajasthan');
  const [city, setCity] = useState('Jaipur');
  const [workPreference, setWorkPreference] = useState<'Remote' | 'On-site' | 'Hybrid' | 'Any'>('Remote');
  const [minBudget, setMinBudget] = useState('10000');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await completeOnboarding(role, {
        fullName,
        headline,
        skills: skillsText.split(',').map((s) => s.trim()).filter(Boolean),
        services: servicesText.split(',').map((s) => s.trim()).filter(Boolean),
        experienceLevel,
        companyName,
        industry,
        size,
        country,
        state,
        city,
        workPreference,
        minBudget: Number(minBudget) || 5000,
        description,
        website,
      });
      toast('Profile setup complete!', 'success');
    } catch (err) {
      toast('Could not save profile', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1221] flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-2xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Role-Based Onboarding</p>
            <h1 className="text-2xl font-bold text-[#0B1221] dark:text-white mt-0.5">
              Complete Your ClientHunt AI Profile
            </h1>
          </div>
          <button onClick={signOut} className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer">
            Sign Out
          </button>
        </div>

        {firebaseUser && !firebaseUser.emailVerified && (
          <div className="mt-4 p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Your email ({firebaseUser.email}) is not verified yet. Please verify your email before saving records.
            </p>
            <button
              type="button"
              onClick={async () => {
                await resendVerificationEmail();
                toast('Verification email sent', 'info');
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium cursor-pointer"
            >
              Resend Link
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          {!account && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('freelancer')}
                className={`p-3.5 rounded-xl border text-left cursor-pointer ${
                  role === 'freelancer'
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <p className="text-sm font-bold">Freelancer Account</p>
                <p className="text-xs opacity-80 mt-0.5">Discover leads, generate pitches, apply to projects</p>
              </button>
              <button
                type="button"
                onClick={() => setRole('business')}
                className={`p-3.5 rounded-xl border text-left cursor-pointer ${
                  role === 'business'
                    ? 'border-violet-600 bg-violet-50/70 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <p className="text-sm font-bold">Business Account</p>
                <p className="text-xs opacity-80 mt-0.5">Post projects, shortlist & hire freelancers</p>
              </button>
            </div>
          )}

          {role === 'freelancer' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Full Name *</label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Experience Level *</label>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Senior">Senior</option>
                    <option value="Agency">Agency</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Professional Headline *</label>
                <input
                  required
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g. Short-Form Video Editor & Social Media Strategist for Hospitality Brands"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Services Offered (comma-separated) *</label>
                  <input
                    required
                    value={servicesText}
                    onChange={(e) => setServicesText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Skills (comma-separated) *</label>
                  <input
                    required
                    value={skillsText}
                    onChange={(e) => setSkillsText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Country *</label>
                  <input required value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">State</label>
                  <input value={state} onChange={(e) => setState(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">City</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Min Budget (₹)</label>
                  <input type="number" value={minBudget} onChange={(e) => setMinBudget(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm font-mono tabular-nums" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Work Preference</label>
                <select
                  value={workPreference}
                  onChange={(e) => setWorkPreference(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                >
                  <option value="Remote">Remote</option>
                  <option value="On-site">On-site</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Any">Any</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Company Name *</label>
                  <input
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. PinkCity Hospitality Pvt Ltd"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Industry *</label>
                  <input
                    required
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Company Size</label>
                  <select value={size} onChange={(e) => setSize(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm">
                    <option value="Solo">Solo</option>
                    <option value="2-10">2-10</option>
                    <option value="11-50">11-50</option>
                    <option value="51-200">51-200</option>
                    <option value="200+">200+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Country *</label>
                  <input required value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">State</label>
                  <input value={state} onChange={(e) => setState(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">City</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Website</label>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Company Description</label>
                <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm" />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
          >
            {saving ? 'Saving Profile...' : 'Save & Enter Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
