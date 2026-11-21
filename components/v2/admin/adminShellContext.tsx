'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { DashboardSummary, JobSummaryRow } from '@/lib/v2/admin/dashboardSummary';

type AdminShellContextValue = {
  search: string;
  setSearch: (v: string) => void;
  jobsOpen: boolean;
  setJobsOpen: (v: boolean) => void;
  runningCount: number;
  recentJobs: JobSummaryRow[];
  imageCap: {
    limit: number | null;
    used: number;
    left: number | null;
  };
  drawer: { title: string; href: string; body: ReactNode } | null;
  openDrawer: (opts: { title: string; href: string; body: ReactNode }) => void;
  closeDrawer: () => void;
  applySummaryChrome: (summary: DashboardSummary) => void;
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export function AdminShellProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState('');
  const [jobsOpen, setJobsOpen] = useState(false);
  const [runningCount, setRunningCount] = useState(0);
  const [recentJobs, setRecentJobs] = useState<JobSummaryRow[]>([]);
  const [imageCap, setImageCap] = useState<{
    limit: number | null;
    used: number;
    left: number | null;
  }>({ limit: null, used: 0, left: null });
  const [drawer, setDrawer] = useState<{
    title: string;
    href: string;
    body: ReactNode;
  } | null>(null);

  const openDrawer = useCallback(
    (opts: { title: string; href: string; body: ReactNode }) => {
      setDrawer(opts);
    },
    [],
  );
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const applySummaryChrome = useCallback((summary: DashboardSummary) => {
    setRunningCount(summary.running_count);
    setRecentJobs(summary.recent_jobs);
    setImageCap({
      limit: summary.today.image_cap_limit,
      used: summary.today.image_cap_used,
      left: summary.today.image_cap_left,
    });
  }, []);

  const value = useMemo<AdminShellContextValue>(
    () => ({
      search,
      setSearch,
      jobsOpen,
      setJobsOpen,
      runningCount,
      recentJobs,
      imageCap,
      drawer,
      openDrawer,
      closeDrawer,
      applySummaryChrome,
    }),
    [
      search,
      jobsOpen,
      runningCount,
      recentJobs,
      imageCap,
      drawer,
      openDrawer,
      closeDrawer,
      applySummaryChrome,
    ],
  );

  return (
    <AdminShellContext.Provider value={value}>
      {children}
    </AdminShellContext.Provider>
  );
}

export function useAdminShell() {
  const ctx = useContext(AdminShellContext);
  if (!ctx) {
    throw new Error('useAdminShell must be used inside AdminShellProvider');
  }
  return ctx;
}

export function arDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!);
}
