import type { EmailTemplate } from './types';
import { renderLayout, renderText, type DetailRow, type LayoutInput } from './layout';
import { formatRoleLabel, optionalStr } from './partials';

export interface StaffLifecyclePayload {
  displayName: string | null;
  clinicName: string | null;
  role: string | null;
  /** CLINIC withdraws access to one clinic; GLOBAL disables the account outright. */
  scope: 'CLINIC' | 'GLOBAL';
}

function parseStaffPayload(raw: Record<string, unknown>): StaffLifecyclePayload {
  return {
    displayName: optionalStr(raw.displayName),
    clinicName: optionalStr(raw.clinicName),
    role: optionalStr(raw.role),
    scope: raw.scope === 'GLOBAL' ? 'GLOBAL' : 'CLINIC',
  };
}

function greeting(displayName: string | null): string {
  return displayName ? `Hello ${displayName},` : 'Hello,';
}

/**
 * The product name, used where a message is about the account rather than a clinic.
 *
 * The layout expects a clinic name for its header; a global account change has none,
 * so it is addressed from the product instead of inventing a clinic.
 */
const PRODUCT_NAME = 'Nkwapa';

export const STAFF_ROLE_GRANTED_V1: EmailTemplate<StaffLifecyclePayload> = {
  key: 'STAFF_ROLE_GRANTED_V1',
  parse: parseStaffPayload,
  render: (payload) => {
    const clinicName = payload.clinicName ?? PRODUCT_NAME;
    const role = payload.role ? formatRoleLabel(payload.role) : 'a new role';
    const details: DetailRow[] = [{ label: 'Role', value: role }];
    if (payload.clinicName) details.push({ label: 'Clinic', value: payload.clinicName });

    const layout: LayoutInput = {
      preheader: `You now have ${role} access at ${clinicName}.`,
      heading: 'Your access has changed',
      clinicName,
      paragraphs: [greeting(payload.displayName), `You have been given ${role} access.`],
      details,
      footnotes: [
        'Sign in as usual; the new access applies the next time you sign in.',
        'If you were not expecting this change, contact your clinic administrator.',
      ],
    };

    return {
      subject: `Your access at ${clinicName} has changed`,
      html: renderLayout(layout),
      text: renderText(layout),
    };
  },
};

export const STAFF_ROLE_REVOKED_V1: EmailTemplate<StaffLifecyclePayload> = {
  key: 'STAFF_ROLE_REVOKED_V1',
  parse: parseStaffPayload,
  render: (payload) => {
    const clinicName = payload.clinicName ?? PRODUCT_NAME;
    const role = payload.role ? formatRoleLabel(payload.role) : 'a role';
    const details: DetailRow[] = [{ label: 'Role removed', value: role }];
    if (payload.clinicName) details.push({ label: 'Clinic', value: payload.clinicName });

    const layout: LayoutInput = {
      preheader: `Your ${role} access at ${clinicName} was removed.`,
      heading: 'Your access has been removed',
      clinicName,
      paragraphs: [
        greeting(payload.displayName),
        `Your ${role} access has been removed. Any other access you hold is unaffected.`,
      ],
      details,
      footnotes: ['If you believe this is a mistake, contact your clinic administrator.'],
    };

    return {
      subject: `Your access at ${clinicName} has changed`,
      html: renderLayout(layout),
      text: renderText(layout),
    };
  },
};

export const STAFF_ACCOUNT_DEACTIVATED_V1: EmailTemplate<StaffLifecyclePayload> = {
  key: 'STAFF_ACCOUNT_DEACTIVATED_V1',
  parse: parseStaffPayload,
  render: (payload) => {
    const isGlobal = payload.scope === 'GLOBAL';
    const clinicName = payload.clinicName ?? PRODUCT_NAME;

    const layout: LayoutInput = {
      preheader: isGlobal
        ? 'Your Nkwapa account has been deactivated.'
        : `Your access at ${clinicName} has been deactivated.`,
      heading: isGlobal ? 'Your account has been deactivated' : 'Your clinic access has ended',
      clinicName,
      paragraphs: [
        greeting(payload.displayName),
        isGlobal
          ? 'Your Nkwapa account has been deactivated and you will no longer be able to sign in.'
          : `Your access to ${clinicName} has been deactivated. Any access you hold at other clinics is unaffected.`,
      ],
      ...(payload.clinicName && !isGlobal
        ? { details: [{ label: 'Clinic', value: payload.clinicName }] }
        : {}),
      footnotes: [
        'This does not delete any record you created; clinical records are retained by the clinic.',
        'If you believe this is a mistake, contact your clinic administrator.',
      ],
    };

    return {
      subject: isGlobal
        ? 'Your Nkwapa account has been deactivated'
        : `Your access at ${clinicName} has ended`,
      html: renderLayout(layout),
      text: renderText(layout),
    };
  },
};
