import { getAccessibleNavItems, getAccessibleNavSections, type AppNavSection } from './app-nav';
import type { WhoAmIResponse } from './bootstrap-context';

// R0-AUDIT §5 priority. This partitions already authorized items, never permissions.
const PHONE_PRIORITY = [
  '/dashboard',
  '/stations',
  '/today',
  '/my/assigned',
  '/queues',
  '/patients',
  '/appointments',
];

export function getMobileNavigation(bootstrap: WhoAmIResponse | null) {
  const accessible = getAccessibleNavItems(bootstrap, 'sidebar');
  const primary = PHONE_PRIORITY.flatMap((href) =>
    accessible.filter((item) => item.href === href),
  ).slice(0, 4);
  const primaryHrefs = new Set(primary.map((item) => item.href));
  const more: AppNavSection[] = getAccessibleNavSections(bootstrap, 'sidebar')
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !primaryHrefs.has(item.href)),
    }))
    .filter((section) => section.items.length > 0);
  const utilities = [
    ...getAccessibleNavItems(bootstrap, 'header'),
    ...getAccessibleNavItems(bootstrap, 'profile'),
  ];
  return { primary, more, utilities };
}
