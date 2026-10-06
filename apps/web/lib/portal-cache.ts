import type { NkwapaDb, PortalCacheRecord, PortalCacheView } from './db';
import type { AppointmentRequestRecord, PortalMeResponse } from './patient-portal';

/**
 * A patient's own recent portal history, kept on the device for the next dropped connection (#18).
 *
 * Read-only by design. A copy is written only after a live load succeeded, is only ever read back
 * for the same signed-in account and clinic, and is never the source of a write: portal writes
 * still need a live API success.
 */

/** "Recent" history. A week-old copy is still useful context; a month-old one is misleading. */
export const PORTAL_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type PortalCacheTable = Pick<NkwapaDb, 'portal_cache'>;

export interface PortalCacheOwner {
  userId: string;
  clinicId: string;
}

export interface PortalCacheQuery extends PortalCacheOwner {
  view: PortalCacheView;
  variant?: string;
}

export function portalCacheKey({ userId, clinicId, view, variant = '' }: PortalCacheQuery): string {
  return `${userId}|${clinicId}|${view}|${variant}`;
}

function isExpired(record: Pick<PortalCacheRecord, 'updatedAt'>, now: Date): boolean {
  const savedAt = new Date(record.updatedAt).getTime();
  return Number.isNaN(savedAt) || now.getTime() - savedAt > PORTAL_CACHE_MAX_AGE_MS;
}

/**
 * Keep the copy of a view that just loaded, replacing the previous one.
 *
 * Nothing is written without both the account and the patient record it belongs to: a copy that
 * cannot say whose it is cannot be safely shown to anyone. A failure to write is swallowed, as in
 * the ops cache; a full or blocked IndexedDB must not turn a successful load into an error.
 */
export async function writePortalCache<T>(
  dbInstance: PortalCacheTable,
  entry: PortalCacheQuery & { patientId: string | null | undefined; data: T },
  now: Date = new Date(),
): Promise<void> {
  const { userId, clinicId, patientId, view, variant = '', data } = entry;
  if (!userId || !clinicId || !patientId) return;
  const record: PortalCacheRecord<T> = {
    key: portalCacheKey({ userId, clinicId, view, variant }),
    userId,
    clinicId,
    patientId,
    view,
    variant,
    data,
    updatedAt: now.toISOString(),
  };
  try {
    await dbInstance.portal_cache.put(record);
  } catch (error) {
    console.warn('Could not keep an offline copy of this portal view', error);
  }
}

/** The account's last copy of a view, or nothing if it is someone else's, missing, or too old. */
export async function readPortalCache<T>(
  dbInstance: PortalCacheTable,
  query: PortalCacheQuery,
  now: Date = new Date(),
): Promise<PortalCacheRecord<T> | null> {
  if (!query.userId || !query.clinicId) return null;
  try {
    const key = portalCacheKey(query);
    const record = (await dbInstance.portal_cache.get(key)) as PortalCacheRecord<T> | undefined;
    if (!record) return null;
    // The key already names the owner. Checking the fields too means a row written under a
    // future key format can never be read back as this account's.
    if (record.userId !== query.userId || record.clinicId !== query.clinicId) return null;
    if (isExpired(record, now)) {
      await dbInstance.portal_cache.delete(key);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

/**
 * Drop every copy that is not this account's, and this account's expired ones.
 *
 * Runs whenever the signed-in account resolves. It is what makes a session that ended without
 * Sign out (an expired token, an account switched in another tab) safe for the next person.
 */
export async function purgePortalCacheExcept(
  dbInstance: PortalCacheTable,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const rows = await dbInstance.portal_cache.toArray();
    const stale = rows
      .filter((row) => row.userId !== userId || isExpired(row, now))
      .map((row) => row.key);
    if (stale.length > 0) await dbInstance.portal_cache.bulkDelete(stale);
  } catch (error) {
    console.warn('Could not clear saved portal copies', error);
  }
}

/** Sign-out: nothing of this account's portal history stays on the device. */
export async function clearPortalCache(dbInstance: PortalCacheTable): Promise<void> {
  try {
    await dbInstance.portal_cache.clear();
  } catch (error) {
    console.warn('Could not clear saved portal copies', error);
  }
}

/*
  Data minimisation. Only what the history screens render is kept on the device: date of birth
  and sex are never shown from a saved copy, and the staff-only patient summary on a request is
  never sent to the portal in the first place but is stripped defensively in case it ever is.
*/

export function minimisePortalMe(me: PortalMeResponse): PortalMeResponse {
  return { ...me, patient: { ...me.patient, dob: null, sex: '' } };
}

export function minimiseAppointmentRequests(
  requests: AppointmentRequestRecord[],
): AppointmentRequestRecord[] {
  return requests.map(({ patient: _patient, ...request }) => request);
}

export interface SavedPortalCopy<T> {
  key: string;
  data: T;
  updatedAt: string;
}

/**
 * What a portal view shows: the live result when there is one, else this account's saved copy.
 *
 * A saved copy read for a previous key (another account, clinic or time window) is never shown,
 * even for the render between the key changing and the new read resolving.
 */
export function resolvePortalView<T>({
  key,
  live,
  saved,
}: {
  key: string | null;
  live: T | null;
  saved: SavedPortalCopy<T> | null;
}): { data: T | null; savedCopyAt: string | null } {
  if (live !== null) return { data: live, savedCopyAt: null };
  if (key !== null && saved?.key === key) return { data: saved.data, savedCopyAt: saved.updatedAt };
  return { data: null, savedCopyAt: null };
}
