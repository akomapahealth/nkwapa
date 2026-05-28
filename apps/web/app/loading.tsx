import { PageSkeleton } from '@/components/feedback/AppState';

export default function Loading() {
  return (
    <PageSkeleton
      title="Loading Nkwapa"
      description="Pulling together clinic context, patient-safe navigation, and the next actions for this page."
      steps={['Route requested', 'Clinic context', 'Page data']}
    />
  );
}
