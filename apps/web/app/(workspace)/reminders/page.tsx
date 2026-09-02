import { redirect } from 'next/navigation';

/**
 * The reminders route predates the ledger holding portal invites, appointment updates
 * and staff notices. Kept as a redirect rather than deleted: the path is in bookmarks
 * and in older documentation, and landing on a 404 is a worse answer than arriving at
 * the page that replaced it.
 */
export default function RemindersRedirectPage() {
  redirect('/notifications');
}
