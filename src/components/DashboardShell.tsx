import React, { useEffect, useState } from 'react';
import {
  Bell,
  LogOut,
  Menu,
  Moon,
  Shield,
  Sun,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { NotificationItem } from '../types/domain';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface DashboardShellProps {
  roleLabel: string;
  navItems: NavItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onBackToPublic: () => void;
  adminToggle?: {
    inAdminView: boolean;
    onToggleAdminView: () => void;
  };
  children: React.ReactNode;
}

export function DashboardShell({
  roleLabel,
  navItems,
  activeTab,
  onSelectTab,
  onBackToPublic,
  adminToggle,
  children,
}: DashboardShellProps) {
  const { firebaseUser, account, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', firebaseUser.uid),
      orderBy('createdAt', 'desc'),
      limit(15)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifications(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => {
        // Fallback without orderBy if composite index is still building
        if (err.message.includes('index')) {
          const fallbackQ = query(
            collection(db, 'notifications'),
            where('userId', '==', firebaseUser.uid),
            limit(15)
          );
          onSnapshot(fallbackQ, (s) => {
            setNotifications(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
          }, (e2) => handleFirestoreError(e2, OperationType.LIST, 'notifications'));
        } else {
          handleFirestoreError(err, OperationType.LIST, 'notifications');
        }
      }
    );
    return () => unsub();
  }, [firebaseUser]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const activeNav = navItems.find((n) => n.id === activeTab);

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B1221] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={onBackToPublic}
            className="text-base font-bold tracking-tight text-[#0B1221] dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            ClientHunt AI
          </button>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {roleLabel}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    className={`font-mono tabular-nums text-xs px-1.5 py-0.5 rounded ${
                      active ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {adminToggle && (
            <button
              onClick={adminToggle.onToggleAdminView}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-violet-300 dark:border-violet-800 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              {adminToggle.inAdminView ? 'Exit Admin Console' : 'Admin Console'}
            </button>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate text-slate-900 dark:text-white">
                {account?.displayName || firebaseUser?.displayName || 'Account'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {firebaseUser?.email}
              </p>
            </div>
            <button
              onClick={signOut}
              className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-white dark:bg-[#0F172A] h-full flex flex-col border-r border-slate-200 dark:border-slate-800">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold text-[#0B1221] dark:text-white">ClientHunt AI</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              {adminToggle && (
                <button
                  onClick={() => {
                    adminToggle.onToggleAdminView();
                    setMobileMenuOpen(false);
                  }}
                  className="text-xs font-semibold text-violet-600 dark:text-violet-400"
                >
                  {adminToggle.inAdminView ? 'Exit Admin' : 'Admin Console'}
                </button>
              )}
              <button onClick={signOut} className="text-xs font-medium text-rose-600">
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              <span>{roleLabel}</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {activeNav?.label || 'Overview'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Toggle color theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setNotifOpen((o) => !o)}
              className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Open notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-mono tabular-nums flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 max-w-[90vw] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] shadow-xl p-3 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">Notifications</span>
                  <button onClick={() => setNotifOpen(false)} className="text-xs text-slate-400 hover:text-slate-700">
                    Close
                  </button>
                </div>
                <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        className={`w-full text-left py-2.5 px-2 rounded-lg transition-colors cursor-pointer ${
                          n.read ? 'opacity-65' : 'bg-blue-50/60 dark:bg-blue-950/30'
                        }`}
                      >
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">{n.title}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
