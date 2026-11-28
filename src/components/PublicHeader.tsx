import React, { useState } from 'react';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export type PublicPageRoute = 'home' | 'opportunities' | 'businesses' | 'projects' | 'scholarships' | 'terms' | 'privacy';

interface PublicHeaderProps {
  currentPage: PublicPageRoute;
  onNavigate: (page: PublicPageRoute) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onEnterDashboard: () => void;
}

export function PublicHeader({
  currentPage,
  onNavigate,
  onOpenAuth,
  onEnterDashboard,
}: PublicHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { firebaseUser } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{ id: PublicPageRoute; label: string }> = [
    { id: 'opportunities', label: 'Jobs & Hiring' },
    { id: 'businesses', label: 'Find Businesses' },
    { id: 'projects', label: 'Browse Projects' },
    { id: 'scholarships', label: 'Scholarships' },
  ];

  const scrollToSection = (hash: string) => {
    if (currentPage !== 'home') {
      onNavigate('home');
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#0B1221]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          onClick={() => {
            onNavigate('home');
            setMobileOpen(false);
          }}
          className="text-lg font-bold tracking-tight text-[#0B1221] dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          ClientHunt AI
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer pb-0.5 border-b-2 ${
                currentPage === item.id
                  ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => scrollToSection('pricing')}
            className="whitespace-nowrap shrink-0 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer pb-0.5 border-b-2 border-transparent"
          >
            Pricing
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action (+ accessible theme toggle on mobile/desktop) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {firebaseUser ? (
            <button
              onClick={onEnterDashboard}
              className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Dashboard
            </button>
          ) : (
            <button
              onClick={() => onOpenAuth('register')}
              className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-[#0B1221] dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Finding Clients
            </button>
          )}

          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1221] px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                setMobileOpen(false);
              }}
              className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => scrollToSection('pricing')}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Pricing
          </button>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            {firebaseUser ? (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  onEnterDashboard();
                }}
                className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white"
              >
                Open Dashboard
              </button>
            ) : (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  onOpenAuth('register');
                }}
                className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-[#0B1221] dark:bg-blue-600 text-white"
              >
                Start Finding Clients
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
