/** "just now", "5 min ago", "3 h ago", "2 days ago", then a short date. */
export function formatRelativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
