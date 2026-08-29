'use client';

export function ChatPresenceIndicator({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full border-2 border-background ${
        online ? 'bg-success' : 'bg-muted-foreground/40'
      }`}
      title={online ? 'Online' : 'Offline'}
    />
  );
}
