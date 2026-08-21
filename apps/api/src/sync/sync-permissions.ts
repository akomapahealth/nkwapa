import { PERMISSIONS } from '../auth/constants/permissions';
import type { EntityType } from './entity-types';

/**
 * The permission each offline mutation requires, mirroring the REST route that performs the same
 * write when the client is online.
 *
 * `POST /sync/push` is gated by `SYNC.PUSH`, which director, manager, doctor, and volunteer all
 * hold. Without this table the offline path grants whatever the handler happens to implement, so a
 * director could queue a prescription and a volunteer could queue a care plan — writes the REST API
 * refuses from those roles. Authorization must not depend on connectivity.
 *
 * Typed as a total `Record<EntityType, …>`, so adding a replayable entity without deciding its
 * permission is a compile error rather than a silently open write path.
 */
export interface SyncEntityPermission {
  /** Required when the record does not yet exist. */
  create: string;
  /** Required when the record already exists. Usually the same as `create`. */
  update: string;
  /** Required to delete. `null` means this entity type is not deletable over sync. */
  delete: string | null;
}

const screening = (): SyncEntityPermission => ({
  create: PERMISSIONS.SCREENING_WRITE,
  update: PERMISSIONS.SCREENING_WRITE,
  delete: PERMISSIONS.SCREENING_WRITE,
});

const medicationReconciliation = (): SyncEntityPermission => ({
  create: PERMISSIONS.MEDICATION_RECONCILIATION_WRITE,
  update: PERMISSIONS.MEDICATION_RECONCILIATION_WRITE,
  delete: null,
});

export const SYNC_ENTITY_PERMISSIONS: Record<EntityType, SyncEntityPermission> = {
  // Registration and updating a chart are separately permissioned over REST, and a volunteer holds
  // only the first, so the offline path has to distinguish them too.
  patient: {
    create: PERMISSIONS.PATIENT_CREATE,
    update: PERMISSIONS.PATIENT_UPDATE,
    delete: null,
  },
  encounter: {
    create: PERMISSIONS.ENCOUNTER_CREATE,
    update: PERMISSIONS.ENCOUNTER_CREATE,
    delete: null,
  },
  vitals: screening(),
  encounter_vitals_bundle: screening(),
  diabetes_screening: screening(),
  hypertension_assessment: screening(),
  care_plan: {
    create: PERMISSIONS.CAREPLAN_WRITE,
    update: PERMISSIONS.CAREPLAN_WRITE,
    delete: PERMISSIONS.CAREPLAN_WRITE,
  },
  patient_consent: {
    create: PERMISSIONS.CONSENT_RECORD,
    update: PERMISSIONS.CONSENT_RECORD,
    delete: PERMISSIONS.CONSENT_RECORD,
  },
  prescription: {
    create: PERMISSIONS.PRESCRIPTION_WRITE,
    update: PERMISSIONS.PRESCRIPTION_WRITE,
    delete: PERMISSIONS.PRESCRIPTION_WRITE,
  },
  medical_history_revision: {
    create: PERMISSIONS.MEDICAL_HISTORY_WRITE,
    update: PERMISSIONS.MEDICAL_HISTORY_WRITE,
    delete: null,
  },
  patient_medication_revision: medicationReconciliation(),
  medication_reconciliation: medicationReconciliation(),
  patient_pharmacy_revision: medicationReconciliation(),
  patient_pharmacy_preference: medicationReconciliation(),
};

/** Runtime list of replayable entity types, so the DTO can reject anything unrecognised. */
export const SYNC_ENTITY_TYPES = Object.keys(SYNC_ENTITY_PERMISSIONS) as EntityType[];

export function isSyncEntityType(value: unknown): value is EntityType {
  // `in` would also answer true for inherited keys such as `__proto__` and `constructor`, which
  // would then index the policy table to `undefined` and skip the permission check entirely.
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SYNC_ENTITY_PERMISSIONS, value)
  );
}
