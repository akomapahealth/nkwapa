import { apiFetch, readApiError, type GetToken } from './api';

/**
 * Ask whichever clinic sent this account's lapsed invitation for a new one (#307). The answer is
 * the same whether or not an invitation was found, so it says nothing about other accounts.
 */
export async function requestInvitationRenewal(getToken: GetToken): Promise<string> {
  const response = await apiFetch('/me/invitations/renewal-request', {
    method: 'POST',
    getToken,
    skipClinicHeader: true,
  });
  if (!response.ok) throw await readApiError(response);
  const body = (await response.json()) as { message?: string };
  return (
    body.message ??
    'If you have an invitation that has lapsed, the clinic that sent it will see your request.'
  );
}
