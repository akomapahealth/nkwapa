/** The patients behind a "Needs you now" count, oldest first, as the dashboard sends them (#307). */
export interface DashboardWorkItem {
  encounterId: string;
  patientCode: string;
  patientName: string;
  /** The station the patient is waiting at or being seen in now, if any. */
  station: string | null;
}

/**
 * "Kofi Asante (NK-0001) at Vitals, Ama Owusu (NK-0002) and 3 more." Undefined when the
 * dashboard sent no names, which it does not for someone who cannot read patient records.
 */
export function describeWorkItems(items: DashboardWorkItem[] | undefined, total: number) {
  if (!items?.length) return undefined;
  const names = items.map(
    (item) =>
      `${item.patientName} (${item.patientCode})${item.station ? ` at ${item.station}` : ''}`,
  );
  const more = total - items.length;
  if (more > 0) return `${names.join(', ')} and ${more} more.`;
  if (names.length === 1) return `${names[0]}.`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}
