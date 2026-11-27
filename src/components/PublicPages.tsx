import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  List,
  MapPin,
  Map as MapIcon,
  Search,
} from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  DEMO_BUSINESS_LEADS,
  DEMO_HIRING_OPPORTUNITIES,
  DEMO_SAMPLE_PROJECTS,
} from '../data/demoData';
import type { BusinessLead, HiringOpportunity, MarketplaceProject } from '../types/domain';
import { LeafletMap } from './LeafletMap';
import type { PublicPageRoute } from './PublicHeader';

interface PublicPagesProps {
  page: PublicPageRoute;
  onNavigate: (page: PublicPageRoute) => void;
  onOpenAuth: (mode: 'login' | 'register', role?: 'freelancer' | 'business') => void;
  onEnterDashboard: () => void;
  isSignedIn: boolean;
}

export function PublicPages({
  page,
  onNavigate,
  onOpenAuth,
  onEnterDashboard,
  isSignedIn,
}: PublicPagesProps) {
  if (page === 'opportunities') {
    return <PublicOpportunitiesView onOpenAuth={onOpenAuth} isSignedIn={isSignedIn} onEnterDashboard={onEnterDashboard} />;
  }
  if (page === 'businesses') {
    return <PublicBusinessesView onOpenAuth={onOpenAuth} isSignedIn={isSignedIn} onEnterDashboard={onEnterDashboard} />;
  }
  if (page === 'projects') {
    return <PublicProjectsView onOpenAuth={onOpenAuth} isSignedIn={isSignedIn} onEnterDashboard={onEnterDashboard} />;
  }
  if (page === 'terms' || page === 'privacy') {
    return <LegalPage type={page} onBack={() => onNavigate('home')} />;
  }
  return (
    <HomePage
      onNavigate={onNavigate}
      onOpenAuth={onOpenAuth}
      onEnterDashboard={onEnterDashboard}
      isSignedIn={isSignedIn}
    />
  );
}

function HomePage({
  onNavigate,
  onOpenAuth,
  onEnterDashboard,
  isSignedIn,
}: {
  onNavigate: (page: PublicPageRoute) => void;
  onOpenAuth: (mode: 'login' | 'register', role?: 'freelancer' | 'business') => void;
  onEnterDashboard: () => void;
  isSignedIn: boolean;
}) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [imgErrorHero, setImgErrorHero] = useState(false);
  const [imgErrorJaipur, setImgErrorJaipur] = useState(false);

  const faqs = [
    {
      q: 'How does ClientHunt AI separate potential business leads from real hiring posts?',
      a: 'ClientHunt AI uses two distinct engines. Business Lead Discovery surfaces local businesses from Google Maps and OpenStreetMap and labels service ideas clearly as AI-suggested opportunities without claiming they are hiring. Explicit Hiring Detection scans public job boards and search posts and uses Gemini to verify genuine freelance intent.',
    },
    {
      q: 'Does ClientHunt AI automatically send cold emails or spam DMs?',
      a: 'No. ClientHunt AI generates evidence-backed, editable outreach drafts for Email, Instagram DM, LinkedIn, and WhatsApp. You review, customize, copy, and send messages manually through your preferred channel.',
    },
    {
      q: 'Which regions does ClientHunt AI support?',
      a: 'Our discovery presets are tuned first for Jaipur and Rajasthan (C-Scheme, Malviya Nagar, Vaishali Nagar, Mansarovar, Bani Park, Udaipur, Jodhpur) and work seamlessly across India and international markets.',
    },
    {
      q: 'Can businesses also hire freelancers directly on ClientHunt AI?',
      a: 'Yes. Verified business accounts can publish freelance project briefs, review incoming proposals and portfolios, shortlist candidates, and message applicants directly inside the workspace.',
    },
  ];

  return (
    <div className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-slate-100">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-20 lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-medium tracking-wide text-blue-600 dark:text-blue-400 mb-3">
              Jaipur · Rajasthan · India & Global Client Discovery
            </p>
            <h1 className="text-[clamp(2.25rem,4vw,3.65rem)] font-extrabold tracking-tight leading-[1.08] text-[#0B1221] dark:text-white text-balance">
              Stop Searching for Clients. Start Finding Them.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Discover local businesses that need digital services, detect explicit freelance hiring posts in real time, analyze public online presence with Gemini, and manage every pitch from discovery to closed deal.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate('opportunities')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Explore Opportunities
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register', 'freelancer'))}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isSignedIn ? 'Open Workspace' : 'Start Finding Clients'}
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Scrapingdog & OpenStreetMap Discovery</span>
              <span aria-hidden="true">·</span>
              <span>Gemini Opportunity Scoring</span>
              <span aria-hidden="true">·</span>
              <span>Direct Business Marketplace</span>
            </div>
          </div>

          <div className="lg:col-span-6 flex">
            <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#111A2E] min-h-[340px]">
              {!imgErrorHero ? (
                <img
                  src="/src/assets/images/hero_clienthunt_studio_1795720231459.jpg"
                  alt="ClientHunt AI strategy and client discovery studio workspace"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrorHero(true)}
                  className="w-full h-full object-cover lg:min-h-[420px]"
                />
              ) : (
                <div className="w-full h-full min-h-[380px] flex flex-col justify-between p-8 bg-gradient-to-br from-[#0B1221] via-[#132242] to-[#1E3A8A] text-white">
                  <span className="text-xs font-mono text-blue-300">ClientHunt AI Workspace</span>
                  <div>
                    <p className="text-xl font-bold">Unified Lead Discovery & Marketplace</p>
                    <p className="text-sm text-slate-300 mt-1">Jaipur, Rajasthan & Worldwide</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B1221]/90 via-[#0B1221]/60 to-transparent p-6 text-white">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-blue-300 font-medium">Sample Jaipur Lead Preview</p>
                    <p className="text-sm font-semibold mt-0.5">
                      Vidyapeeth Apex Coaching · Malviya Nagar, Jaipur
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <span className="text-xs text-slate-300 block">Opportunity Score</span>
                    <span className="text-lg font-bold text-white">91 / 100</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0E172A] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1221] dark:text-white text-balance">
              Find Clients. Discover Opportunities. Grow Your Freelance Business.
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300 text-base">
              Replace hours of manual tab-switching across Google Maps, job boards, and spreadsheets with one structured pipeline.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="border-t border-slate-300 dark:border-slate-700 pt-6">
              <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">01. Discover</p>
              <h3 className="mt-2 text-lg font-semibold text-[#0B1221] dark:text-white">
                Search Local Businesses & Live Hiring Posts
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Query Scrapingdog Google Maps, Google Search, Google Jobs, and OpenStreetMap by city, neighborhood, category, and service need.
              </p>
            </div>
            <div className="border-t border-slate-300 dark:border-slate-700 pt-6">
              <p className="font-mono text-sm font-semibold text-violet-600 dark:text-violet-400">02. Analyze & Classify</p>
              <h3 className="mt-2 text-lg font-semibold text-[#0B1221] dark:text-white">
                Separate Real Hiring From Potential Fit
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Gemini audits verified public facts to produce an explainable 0–100 Opportunity Score and separates freelance contracts from full-time jobs.
              </p>
            </div>
            <div className="border-t border-slate-300 dark:border-slate-700 pt-6">
              <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">03. Pitch & Win</p>
              <h3 className="mt-2 text-lg font-semibold text-[#0B1221] dark:text-white">
                Draft Tailored Pitches & Track Every Deal
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Generate channel-ready drafts for Email, Instagram, LinkedIn, or WhatsApp, save leads into a 9-stage CRM, or apply directly to posted business projects.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities Asymmetric Bento */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] overflow-hidden flex flex-col justify-between">
            <div className="p-7 sm:p-8">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Business Lead Discovery</p>
              <h3 className="mt-2 text-2xl font-bold text-[#0B1221] dark:text-white">
                Spot Digital Gaps Across Jaipur & Global Local Markets
              </h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Filter restaurants, coaching institutes, real estate agencies, salons, and boutiques by website presence, public contact availability, and verified map coordinates—without fabricated contacts.
              </p>
            </div>
            <div className="h-56 sm:h-64 w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
              {!imgErrorJaipur ? (
                <img
                  src="/src/assets/images/jaipur_business_district_1795720231487.jpg"
                  alt="Modern Jaipur cafe and boutique storefront"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrorJaipur(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
                  Jaipur & Rajasthan Business Discovery
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-7">
              <p className="text-xs font-medium text-violet-600 dark:text-violet-400">AI Opportunity Detection</p>
              <h3 className="mt-2 text-xl font-bold text-[#0B1221] dark:text-white">
                Verified Hiring Intent Only
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Automatically classifies public posts into Freelance Project, Contract Work, Full-Time Job, Internship, or Irrelevant Content with confidence scoring and direct source links.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-7">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400">AI Pitch Generator</p>
              <h3 className="mt-2 text-xl font-bold text-[#0B1221] dark:text-white">
                Evidence-Backed Outreach Drafts
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Craft personalized Email, Instagram DM, LinkedIn, or WhatsApp messages grounded in real business observations, editable before you send.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#0B1221] text-white p-7">
              <p className="text-xs font-medium text-blue-300">ClientHunt Freelance Marketplace</p>
              <h3 className="mt-2 text-xl font-bold">
                Direct Business-to-Freelancer Hiring
              </h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Businesses post project briefs with real budgets and deadlines. Freelancers submit proposals, share portfolios, and collaborate in private threads.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Split: Freelancers & Businesses */}
      <section className="border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0E172A] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-8">
            <div className="flex items-center gap-4">
              <img
                src="/src/assets/images/avatar_freelancer_pro_1795720231545.jpg"
                alt="Freelance creative technologist"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
              <div>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">For Freelancers & Studios</p>
                <h3 className="text-xl font-bold text-[#0B1221] dark:text-white">Turn Discovery Into Signed Retainers</h3>
              </div>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" /> Multi-filter search across city, neighborhood, category, and service need</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" /> Transparent Opportunity Score breakdown based solely on public evidence</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" /> 9-stage Kanban & table CRM with deal values, notes, and follow-up dates</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" /> Direct applications on verified ClientHunt business projects</li>
            </ul>
            <button
              onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register', 'freelancer'))}
              className="mt-7 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Join as Freelancer
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-8">
            <div className="flex items-center gap-4">
              <img
                src="/src/assets/images/avatar_business_founder_1795720232227.jpg"
                alt="Business founder"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
              <div>
                <p className="text-xs font-medium text-violet-600 dark:text-violet-400">For Businesses & Founders</p>
                <h3 className="text-xl font-bold text-[#0B1221] dark:text-white">Hire Vetted Regional & Remote Talent</h3>
              </div>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" /> Publish structured project briefs with INR or USD budget ranges</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" /> Compare proposals, delivery timelines, and portfolio links side by side</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" /> Shortlist, accept, or reject applicants with automatic notifications</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" /> Private project messaging restricted strictly to conversation participants</li>
            </ul>
            <button
              onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register', 'business'))}
              className="mt-7 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0B1221] dark:bg-violet-600 hover:bg-slate-800 dark:hover:bg-violet-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Post a Freelance Project
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1221] dark:text-white">
            Transparent Plans Built for Real API Budgets
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Usage limits protect your team from runaway scraping credits while keeping discovery fast.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              name: 'Starter',
              audience: 'For solo freelancers exploring Jaipur & local leads',
              price: '₹0',
              cadence: '/ month',
              limits: [
                'Demo Mode + OpenStreetMap discovery',
                'Up to 25 saved CRM leads',
                'Unlimited ClientHunt project applications',
                'Standard AI pitch drafts',
              ],
              highlight: false,
              cta: 'Start Free',
            },
            {
              name: 'Pro Freelancer',
              audience: 'For active independent specialists',
              price: '₹799',
              cadence: '/ month',
              limits: [
                'Scrapingdog live Maps, Search & Jobs queries',
                'Up to 250 Gemini business analyses / month',
                'Unlimited CRM pipeline & activity history',
                'Multi-channel pitch regeneration & saved drafts',
              ],
              highlight: true,
              cta: 'Choose Pro Freelancer',
            },
            {
              name: 'Business & Agency',
              audience: 'For hiring companies and multi-seat studios',
              price: '₹2,499',
              cadence: '/ month',
              limits: [
                'Unlimited marketplace project listings',
                'Applicant shortlisting & portfolio review',
                'Optional Hunter.io & Foursquare enrichment',
                'Dedicated quota controls & priority support',
              ],
              highlight: false,
              cta: 'Register Business Account',
            },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-7 flex flex-col justify-between ${
                plan.highlight
                  ? 'border-blue-600 dark:border-blue-500 bg-white dark:bg-[#111A2E]'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E]'
              }`}
            >
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{plan.audience}</p>
                <h3 className="mt-1 text-xl font-bold text-[#0B1221] dark:text-white">{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1 font-mono tabular-nums">
                  <span className="text-3xl font-bold text-[#0B1221] dark:text-white">{plan.price}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{plan.cadence}</span>
                </div>
                <ul className="mt-6 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                  {plan.limits.map((lim) => (
                    <li key={lim} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <span>{lim}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register'))}
                className={`mt-8 w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  plan.highlight
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0E172A] py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1221] dark:text-white">
            Frequently Asked Questions
          </h2>
          <div className="mt-8 divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
            {faqs.map((item, idx) => (
              <div key={item.q} className="py-5">
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 text-left font-semibold text-sm sm:text-base text-[#0B1221] dark:text-white cursor-pointer"
                >
                  <span>{item.q}</span>
                  {openFaq === idx ? (
                    <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>
                {openFaq === idx && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1221] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="text-base font-bold text-[#0B1221] dark:text-white">ClientHunt AI</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Built for Jaipur, Rajasthan, India & Global Freelancers · support@clienthunt.ai
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-600 dark:text-slate-400">
            <button onClick={() => onNavigate('opportunities')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
              Opportunities
            </button>
            <button onClick={() => onNavigate('businesses')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
              Find Businesses
            </button>
            <button onClick={() => onNavigate('projects')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
              Browse Projects
            </button>
            <button onClick={() => onNavigate('terms')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
              Terms
            </button>
            <button onClick={() => onNavigate('privacy')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
              Privacy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PublicOpportunitiesView({
  onOpenAuth,
  isSignedIn,
  onEnterDashboard,
}: {
  onOpenAuth: (mode: 'login' | 'register') => void;
  isSignedIn: boolean;
  onEnterDashboard: () => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const types = ['All', 'Freelance Project', 'Contract Work', 'Full-Time Job'];

  const filtered = DEMO_HIRING_OPPORTUNITIES.filter((op) => {
    const matchType = typeFilter === 'All' || op.aiClassification === typeFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      op.title.toLowerCase().includes(q) ||
      (op.companyName || '').toLowerCase().includes(q) ||
      (op.requiredService || '').toLowerCase().includes(q) ||
      (op.location || '').toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400">
            Sample Demo Preview · Sign in for Live Scrapingdog + Gemini Detection
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1221] dark:text-white">
            Explore Explicit Hiring Opportunities
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
            Every opportunity shows its source text, AI classification, confidence score, and original source link. Budgets and locations are displayed only when explicitly stated.
          </p>
        </div>
        <button
          onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register'))}
          className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isSignedIn ? 'Run Live Search in Dashboard' : 'Sign In for Live Discovery'}
        </button>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by service, title, or location..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg overflow-x-auto">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                typeFilter === t
                  ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {filtered.map((op: HiringOpportunity) => (
          <article
            key={op.id}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 flex flex-col justify-between"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-violet-600 dark:text-violet-400">{op.aiClassification}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">AI Confidence {op.confidenceScore}%</span>
                <span aria-hidden="true">·</span>
                <span>Sample Demo Data</span>
              </div>
              <h2 className="mt-2 text-lg font-bold text-[#0B1221] dark:text-white leading-snug">
                {op.title}
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {op.companyName || 'Company not stated'} · {op.location || 'Location not specified'}
                {op.budget ? ` · Budget: ${op.budget}` : ''}
              </p>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {op.originalText}
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Source: {op.sourceName} {op.publishedAt ? `· ${op.publishedAt}` : ''}
              </span>
              <button
                onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register'))}
                className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Generate Pitch <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PublicBusinessesView({
  onOpenAuth,
  isSignedIn,
  onEnterDashboard,
}: {
  onOpenAuth: (mode: 'login' | 'register') => void;
  isSignedIn: boolean;
  onEnterDashboard: () => void;
}) {
  const [queryText, setQueryText] = useState('');
  const [category, setCategory] = useState('All');
  const [onlyWithWebsite, setOnlyWithWebsite] = useState(false);
  const [onlyWithContact, setOnlyWithContact] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const categories = ['All', 'Restaurants', 'Cafes', 'Coaching institutes', 'Real estate', 'Clothing brands', 'Gyms'];

  const filtered = DEMO_BUSINESS_LEADS.filter((lead) => {
    const q = queryText.trim().toLowerCase();
    const matchText =
      !q ||
      lead.businessName.toLowerCase().includes(q) ||
      lead.location.toLowerCase().includes(q) ||
      lead.suggestedServices.some((s) => s.toLowerCase().includes(q));
    const matchCat = category === 'All' || lead.category === category;
    const matchWeb = !onlyWithWebsite || lead.hasWebsite;
    const matchContact = !onlyWithContact || Boolean(lead.publicPhone || lead.publicEmail);
    return matchText && matchCat && matchWeb && matchContact;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
            Sample Demo Preview (Jaipur, Rajasthan) · Sign in for Live Scrapingdog & OpenStreetMap Search
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1221] dark:text-white">
            Find Businesses With Service Opportunities
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
            Potential service recommendations are AI-suggested opportunities — never claims that a business is actively hiring.
          </p>
        </div>
        <button
          onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register'))}
          className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isSignedIn ? 'Open Lead Discovery Engine' : 'Start Live Business Search'}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div className="lg:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search business name, area, or service..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="lg:col-span-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] text-sm text-slate-900 dark:text-white"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-4 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={onlyWithWebsite} onChange={(e) => setOnlyWithWebsite(e.target.checked)} className="rounded" />
            Has website
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={onlyWithContact} onChange={(e) => setOnlyWithContact(e.target.checked)} className="rounded" />
            Has contact
          </label>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'list' ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'map' ? 'bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" /> Map
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8">
        {viewMode === 'map' ? (
          <LeafletMap leads={filtered} heightClass="h-[480px]" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((lead: BusinessLead) => (
              <div
                key={lead.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{lead.category} · Sample Demo</span>
                    <span className="font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                      Score {lead.opportunityScore}/100
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-[#0B1221] dark:text-white">
                    {lead.businessName}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" /> {lead.location}
                  </p>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {lead.aiExplanation}
                  </p>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    AI-Suggested Fit: {lead.suggestedServices.join(' · ')}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    {lead.publicPhone || lead.website || 'Public listing'}
                  </span>
                  <button
                    onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register'))}
                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Analyze Lead
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PublicProjectsView({
  onOpenAuth,
  isSignedIn,
  onEnterDashboard,
}: {
  onOpenAuth: (mode: 'login' | 'register', role?: 'freelancer' | 'business') => void;
  isSignedIn: boolean;
  onEnterDashboard: () => void;
}) {
  const [projects, setProjects] = useState<MarketplaceProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'projects'), where('status', '==', 'Published'), limit(24))
        );
        if (active) {
          setProjects(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        }
      } catch {
        if (active) setProjects([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const displayList = projects.length > 0 ? projects : DEMO_SAMPLE_PROJECTS;
  const showingSample = projects.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
            ClientHunt AI Freelance Marketplace
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1221] dark:text-white">
            Browse Freelance Projects
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {showingSample
              ? 'No live business projects published yet — showing a clearly labeled Sample Project preview. Businesses can publish live briefs from their dashboard.'
              : `Showing ${projects.length} live published projects from verified businesses.`}
          </p>
        </div>
        <button
          onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register', 'business'))}
          className="px-4 py-2.5 rounded-lg bg-[#0B1221] dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isSignedIn ? 'Open Marketplace in Dashboard' : 'Post a Project'}
        </button>
      </div>

      {loading ? (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((n) => (
            <div key={n} className="h-44 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayList.map((proj) => (
            <div
              key={proj.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{proj.category} · {proj.workMode} · {proj.projectType}</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    {proj.currency === 'INR' ? '₹' : '$'}
                    {proj.budgetMin.toLocaleString()} – {proj.budgetMax.toLocaleString()}
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-bold text-[#0B1221] dark:text-white">{proj.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {proj.companyName} {proj.location ? `· ${proj.location}` : ''}
                </p>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {proj.description}
                </p>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Skills: {proj.requiredSkills.join(' · ')}
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  {proj.deadline ? `Deadline: ${proj.deadline}` : 'Flexible timeline'}
                </span>
                <button
                  onClick={() => (isSignedIn ? onEnterDashboard() : onOpenAuth('register', 'freelancer'))}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Submit Proposal
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegalPage({ type, onBack }: { type: 'terms' | 'privacy'; onBack: () => void }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
      <button onClick={onBack} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
        ← Back to Home
      </button>
      <h1 className="mt-4 text-3xl font-bold text-[#0B1221] dark:text-white">
        {type === 'terms' ? 'Terms of Service' : 'Privacy & Responsible Discovery Policy'}
      </h1>
      <div className="mt-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <p>
          ClientHunt AI aggregates publicly accessible business and hiring information exclusively through authorized APIs and permitted public sources. Automated bypassing of login walls, CAPTCHAs, or private profiles is strictly prohibited.
        </p>
        <p>
          AI-generated opportunity scores and service recommendations are advisory insights derived solely from available public metadata. Freelancers remain responsible for reviewing every outreach draft before sending it manually.
        </p>
        <p>
          Users may export or permanently delete their account and saved workspace records at any time from Dashboard Settings.
        </p>
      </div>
    </div>
  );
}
