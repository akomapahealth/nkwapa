'use client';

import { formatPersonName } from './person-name';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getErrorMessage } from './api';
import { useBootstrap } from './bootstrap-context';
import { dayNumberLabel, getOpsDestination } from './ops';
import { opsWriteFeedback, type OpsFeedback } from './ops-writes';
import { generateClientId } from './outbox';
import { useOpsWrite } from './use-ops-write';
import { isWebFeatureEnabled } from './feature-flags';

export interface CheckInPatient {
  id: string;
  patientCode?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Checking a patient in to today's clinic flow, from anywhere a patient is listed.
 *
 * Works offline: the arrival is queued and appears on the board as pending. A patient who is
 * already in today's queue is not checked in twice; the person is pointed at the board instead.
 */
export function usePatientCheckIn(clinicId: string | null) {
  const router = useRouter();
  const submit = useOpsWrite(clinicId);
  const permissions = useBootstrap()?.bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const opsDestination = getOpsDestination(permissions, isWebFeatureEnabled('stationWorkflow'));
  const [busyPatientId, setBusyPatientId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<OpsFeedback | null>(null);

  async function checkIn(patient: CheckInPatient) {
    if (!submit) return;
    const name = formatPersonName(patient, 'short') || 'The patient';
    const boardLink = opsDestination
      ? {
          href: opsDestination,
          label:
            opsDestination === '/today'
              ? 'Open Today board'
              : opsDestination === '/stations'
                ? 'Open stations'
                : 'Open my assignments',
        }
      : undefined;

    setBusyPatientId(patient.id);
    setFeedback(null);
    try {
      const result = await submit({
        kind: 'patientCheckIn',
        checkInId: generateClientId(),
        patientId: patient.id,
        patient: { patientCode: patient.patientCode, displayName: name },
      });
      // The board is the likely next stop once the patient is in the queue.
      if (opsDestination && result.outcome !== 'refused') router.prefetch(opsDestination);
      const dayNumber =
        result.outcome === 'applied'
          ? (result.body as { dayNumber?: number | null } | undefined)?.dayNumber
          : null;
      // Called out instead of the name on the line (#413), so it goes on the patient's card.
      const number = dayNumber
        ? ` ${name} is ${dayNumberLabel(dayNumber)} today. Write it on their card.`
        : '';
      setFeedback(
        opsWriteFeedback(result, {
          applied: {
            tone: 'success',
            message: opsDestination
              ? `${name} is now on the clinic board.${number}`
              : `${name} has been checked in.${number}`,
            link: boardLink,
          },
          queued: `${name} is checked in on this device and will reach the clinic board when the connection returns. Their number comes when it syncs.`,
          refused: (error) =>
            error.code === 'PATIENT_ALREADY_CHECKED_IN'
              ? {
                  tone: 'warning',
                  // The server says where they are: "Already on the line: No. 14 at Glucose..." (#414).
                  message: error.message.startsWith('Already')
                    ? `${name} was not added again. ${error.message}`
                    : `${name} is already checked in today, so they were not added again.`,
                  link: boardLink,
                }
              : null,
        }),
      );
    } catch (error) {
      setFeedback({ tone: 'error', message: getErrorMessage(error) });
    } finally {
      setBusyPatientId(null);
    }
  }

  return {
    checkIn,
    busyPatientId,
    isBusy: busyPatientId !== null,
    canSubmit: submit !== null,
    feedback,
  };
}
