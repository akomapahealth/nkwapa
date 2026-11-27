/**
 * Smart Search: one bar to reach any page, action, patient or colleague the viewer may see.
 *
 * Pages come from the same role- and permission-filtered registry as the sidebar
 * (`getAccessibleNavSections`), so search can never offer a page the navigation would hide. Records
 * come from server routes that enforce their own permission; this module only ranks and remembers.
 */
import type { LucideIcon } from 'lucide-react';
import { getAccessibleNavSections, getNavItemHref, type AppNavPlacement } from './app-nav';
import type { WhoAmIResponse } from './bootstrap-context';
import { getBootstrapActiveClinicId } from './bootstrap-clinics';

export type SearchResultKind = 'page' | 'action' | 'patient' | 'staff';

export interface SearchResult {
  /** Unique across kinds, e.g. `page:/today`. */
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle?: string;
  /** Where choosing it goes. Actions without one run `actionId` instead. */
  href?: string;
  actionId?: string;
  /** Extra words people use for it ("staff" for Team, "bp" for vitals). */
  keywords?: string;
  /** Not stored with recent choices; they take it back from the live result. */
  icon?: LucideIcon;
}

export const SMART_SEARCH_OPEN_EVENT = 'nkwapa:smart-search:open';

/** Words people search with that the page labels don't contain. Keyed by registry href. */
const PAGE_KEYWORDS: Record<string, string> = {
  '/dashboard': 'home overview start',
  '/today': 'board check in arrivals shifts roster who is on duty',
  '/stations': 'station line queue screening day bp glucose eye counselling',
  '/my/assigned': 'my patients assigned to me',
  '/queues': 'review finalize sign off cosign drafts',
  '/patients': 'registry charts records find patient',
  '/patients/new': 'register add new patient create',
  '/follow-up': 'calls missed due overdue risk tier',
  '/appointments': 'bookings schedule visits calendar',
  '/audit': 'log history who changed',
  '/volunteers': 'volunteer directory roster screening days events schedule',
  '/staff-activity': 'staff activity productivity',
  '/metrics': 'reports charts trends numbers',
  '/notifications': 'messages inbox bell alerts',
  '/notifications/delivery': 'sms email reminders delivery ledger',
  '/research': 'exports data science',
  '/settings/clinic': 'clinic configuration research settings',
  '/admin/clinics': 'clinics setup sites',
  '/admin/users': 'staff team users roles access invite people',
  '/reports/organization': 'organization rollup all clinics',
  '/admin/duplicates': 'duplicate charts merge',
  '/admin/data-requests': 'data rights access correction deletion requests',
  '/admin/feedback': 'problem reports feedback bugs issues',
};

const PLACEMENTS: AppNavPlacement[] = ['sidebar', 'header', 'profile'];

/** Every page the viewer's navigation would show, plus their own account pages. */
export function pageResults(bootstrap: WhoAmIResponse | null): SearchResult[] {
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const pages: SearchResult[] = PLACEMENTS.flatMap((placement) =>
    getAccessibleNavSections(bootstrap, placement).flatMap((section) =>
      section.items.flatMap((item) => {
        const href = getNavItemHref(item, clinicId);
        if (href === '#') return [];
        return [
          {
            id: `page:${href}`,
            kind: 'page' as const,
            title: item.label,
            subtitle: item.description,
            href,
            icon: item.icon,
            keywords: [section.label, PAGE_KEYWORDS[item.href]].filter(Boolean).join(' '),
          },
        ];
      }),
    ),
  );
  if (!bootstrap) return pages;
  return [
    ...pages,
    {
      id: 'page:/account',
      kind: 'page',
      title: 'Manage profile',
      subtitle: 'Your name, email and password.',
      href: '/account',
      keywords: 'account me name password',
    },
    {
      id: 'page:/settings',
      kind: 'page',
      title: 'Your settings',
      subtitle: 'Theme, offline access and devices.',
      href: '/settings',
      keywords: 'preferences theme offline device',
    },
  ];
}

/** 0 when `query` does not match; higher is better. Label hits outrank keyword hits. */
export function scoreMatch(
  query: string,
  result: Pick<SearchResult, 'title' | 'subtitle' | 'keywords'>,
) {
  const q = normalize(query);
  if (!q) return 0;
  const title = normalize(result.title);
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  const words = q.split(' ');
  const titleWords = title.split(' ');
  if (words.every((word) => titleWords.some((part) => part.startsWith(word)))) return 60;
  if (title.includes(q)) return 40;
  const rest = normalize(`${result.subtitle ?? ''} ${result.keywords ?? ''}`);
  const restWords = rest.split(' ');
  if (words.every((word) => restWords.some((part) => part.startsWith(word)))) return 20;
  if (isSubsequence(q.replace(/ /g, ''), title.replace(/ /g, ''))) return 10;
  return 0;
}

/** The local results that match, best first; ties keep their registry order. */
export function rankResults(query: string, results: readonly SearchResult[], limit = 6) {
  return results
    .map((result, index) => ({ result, index, score: scoreMatch(query, result) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.result);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isSubsequence(needle: string, haystack: string) {
  if (needle.length < 3) return false;
  let at = 0;
  for (const char of haystack) {
    if (char === needle[at]) at += 1;
    if (at === needle.length) return true;
  }
  return false;
}

/*
  Recent choices, per person and clinic, in this browser. Patients are never remembered: clinic
  laptops are shared, and a list of recently opened charts would show the next person who was seen.
*/
const RECENT_LIMIT = 6;
const recentKey = (userId: string, clinicId: string | null) =>
  `nkwapa:smart-search:recent:${userId}:${clinicId ?? 'none'}`;

export function loadRecent(userId: string | undefined, clinicId: string | null): SearchResult[] {
  if (!userId) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(recentKey(userId, clinicId)) ?? '[]');
    return Array.isArray(parsed)
      ? (parsed as SearchResult[]).filter((entry) => entry && entry.kind !== 'patient')
      : [];
  } catch {
    return [];
  }
}

export function rememberRecent(
  userId: string | undefined,
  clinicId: string | null,
  result: SearchResult,
): void {
  if (!userId || result.kind === 'patient') return;
  const next = [result, ...loadRecent(userId, clinicId).filter((entry) => entry.id !== result.id)];
  try {
    const stored = next.slice(0, RECENT_LIMIT).map(({ icon: _icon, ...entry }) => entry);
    localStorage.setItem(recentKey(userId, clinicId), JSON.stringify(stored));
  } catch {
    // Storage full or blocked: search still works, it just forgets.
  }
}

export function clearRecent(userId: string | undefined, clinicId: string | null): void {
  if (!userId) return;
  try {
    localStorage.removeItem(recentKey(userId, clinicId));
  } catch {
    // Nothing to clear.
  }
}
