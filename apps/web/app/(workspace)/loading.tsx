import { SectionSkeleton } from '@/components/feedback/AppState';

/**
 * Navigation fallback for every workspace route.
 *
 * There was none anywhere under (workspace), and the root `app/loading.tsx` does not fire for
 * these segments, so moving between pages on clinic wifi left the previous page frozen and then
 * dropped straight to a blank panel. This renders inside the shell, so the sidebar and header
 * stay put and only the content area is standing in.
 */
export default function WorkspaceLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading page</span>
      <SectionSkeleton lines={2} />
      <SectionSkeleton lines={4} />
    </div>
  );
}
