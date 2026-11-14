/** One thing a person can do, and where it lives. */
export interface AccessPoint {
  label: string;
  where: string;
}

/**
 * What a set of permissions lets someone do, in plain words (#329). Chosen by permission, like
 * the sidebar, so nobody is told about work they cannot open. Shared by the welcome tour, the
 * account page and the "your access changed" notice so the three cannot drift.
 */
export function accessPoints(
  permissions: readonly string[],
  { stationWorkflow }: { stationWorkflow: boolean },
): AccessPoint[] {
  const can = (permission: string) => permissions.includes('*') || permissions.includes(permission);
  const points: AccessPoint[] = [];
  if (can('ENCOUNTER.REVIEW') || can('CLINICAL_NOTE.COSIGN')) {
    points.push({
      label: 'Review visits and co-sign notes',
      where: 'Waiting for you at the top of the dashboard, and in Queues.',
    });
  }
  if (stationWorkflow && can('OPS.STATION.WORK')) {
    points.push({
      label: 'Record what your station measures',
      where: 'Stations, then the next patient in your line.',
    });
  }
  if (can('PATIENT.SEARCH')) {
    points.push({
      label: 'Find a patient',
      where: 'Patients. Search by name, patient code or phone.',
    });
  }
  if (can('PATIENT.CREATE')) {
    points.push({ label: 'Register someone new', where: 'New patient, in the sidebar.' });
  }
  if (can('OPS.ASSIGNMENT.MANAGE')) {
    points.push({
      label: 'Run the day',
      where: 'Today board and Queues: who is waiting, and who is with whom.',
    });
  }
  if (can('VOLUNTEER.ROSTER.MANAGE')) {
    points.push({ label: 'Keep the volunteer roster', where: 'Volunteers, under Oversight.' });
  }
  if (can('METRICS.READ')) {
    points.push({ label: 'See how the clinic is doing', where: 'Metrics, under Oversight.' });
  }
  if (can('AUDIT.READ')) {
    points.push({ label: 'See who changed what', where: 'Audit, under Oversight.' });
  }
  return points;
}
