import { CalendarDays, HeartPulse, House } from 'lucide-react';

// Keep the established patient route labels in both shell presentations.
export const portalNavItems = [
  {
    href: '/portal',
    label: 'Overview',
    shortLabel: 'Home',
    description: 'Your care snapshot.',
    icon: House,
    matches: (path: string) => path === '/portal',
  },
  {
    href: '/portal/health',
    label: 'My Health',
    shortLabel: 'Health',
    description: 'Measurements and self-reports.',
    icon: HeartPulse,
    matches: (path: string) => /^\/portal\/(health|self-reports)(\/|$)/.test(path),
  },
  {
    href: '/portal/appointments',
    label: 'Appointments',
    shortLabel: 'Visits',
    description: 'Appointments and requests.',
    icon: CalendarDays,
    matches: (path: string) => /^\/portal\/appointments(\/|$)/.test(path),
  },
];
