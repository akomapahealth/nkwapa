/**
 * Re-mounts on every navigation inside the workspace, so each page fades in rather than
 * appearing in one frame. Opacity only, at 150ms (MASTER.md section 7); reduced motion collapses
 * it to nothing through the global rule in globals.css.
 */
export default function WorkspaceTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
