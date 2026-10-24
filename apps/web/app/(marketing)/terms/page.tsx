import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/landing/LegalPage';
import {
  AKOMAPA_TERMS_HREF,
  CONTACT_EMAIL,
  CONTACT_HREF,
  PRIVACY_HREF,
  TERMS_HREF,
} from '@/components/landing/links';

export const metadata: Metadata = {
  title: { absolute: 'Terms of use | Nkwapa' },
  description:
    'The terms for using Nkwapa, the electronic medical record developed by Akomapa Health Foundation, as clinic staff, a volunteer or a patient.',
};

const UPDATED = 'October 24, 2026';

const contact = <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a>;

const sections: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement to these terms',
    body: (
      <>
        <p>
          Nkwapa is an electronic medical record developed by Akomapa Health Foundation
          (&ldquo;Akomapa,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). These terms apply to everyone
          who uses it: clinic staff and volunteers, patients using the patient portal, and visitors
          to this website. By signing in to or using Nkwapa, you agree to them and to the{' '}
          <Link href={PRIVACY_HREF}>privacy notice</Link>.
        </p>
        <p>
          They supplement the{' '}
          <a href={AKOMAPA_TERMS_HREF} rel="noopener">
            Akomapa terms of service
          </a>
          . Your clinic or partner institution may also have its own policies, which continue to
          apply.
        </p>
      </>
    ),
  },
  {
    id: 'clinical-judgement',
    title: 'Clinical judgement and emergencies',
    body: (
      <>
        <p>
          Nkwapa organises records, flags and reminders for clinic teams. It does not diagnose,
          prescribe or decide on treatment. Clinicians remain responsible for their decisions and
          should confirm important values, such as readings and medicines, before acting on them.
        </p>
        <p>
          <strong>Nkwapa is not for emergencies.</strong> Readings entered in the patient portal and
          messages in Nkwapa may not be seen straight away. In an emergency, contact local emergency
          services or go to the nearest health facility.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts and access',
    body: (
      <>
        <p>
          Accounts are created by invitation. Staff accounts are invited by a clinic manager or
          director; patient portal accounts are invited by the patient&rsquo;s clinic. You agree to:
        </p>
        <ul>
          <li>Keep your sign-in details to yourself and not let anyone else use your account</li>
          <li>Give accurate information about yourself and your role</li>
          <li>Sign out of shared devices when you finish</li>
          <li>Tell your clinic manager or email {contact} if you think your account is misused</li>
        </ul>
        <p>
          Everything done with an account is recorded under that account. This includes changes made
          offline, which are sent later in the account&rsquo;s name.
        </p>
      </>
    ),
  },
  {
    id: 'staff',
    title: 'Responsibilities of clinic staff and volunteers',
    body: (
      <>
        <p>Patient information is confidential. When you use Nkwapa, you agree to:</p>
        <ul>
          <li>Look at a record only when your work for that patient needs it</li>
          <li>Record information accurately and correct mistakes as soon as you notice them</li>
          <li>
            Not copy, photograph, export or share patient information outside the ways Nkwapa and
            your clinic allow
          </li>
          <li>Record research consent only after explaining it and hearing the patient agree</li>
          <li>Follow Akomapa&rsquo;s and your clinic&rsquo;s clinical, ethical and safety rules</li>
        </ul>
      </>
    ),
  },
  {
    id: 'patients',
    title: 'Using the patient portal',
    body: (
      <>
        <p>
          The portal lets you see parts of your record, record your own measurements and manage
          appointment requests. Please enter readings as accurately as you can. Your care team may
          review them at your next visit rather than straight away. If a reading worries you, call
          your clinic or seek care.
        </p>
        <p>
          Using the portal is optional. Choosing not to use it does not affect the care you receive.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>Try to see or change records your role does not allow</li>
          <li>Probe, overload, scan or disrupt Nkwapa or the systems it relies on</li>
          <li>Use automated tools to copy information out of Nkwapa</li>
          <li>Use Nkwapa for anything unlawful or unrelated to care at your clinic</li>
        </ul>
        <p>
          If you find a security problem, please report it to {contact} and do not test it further.
        </p>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Availability and changes',
    body: (
      <p>
        Nkwapa is still being developed. Features may change, and the service may sometimes be
        unavailable for maintenance or because of problems outside our control. It is designed to
        keep core clinical work going when the internet drops, but some actions need a connection.
        Clinics should keep a way to continue care if Nkwapa is unavailable.
      </p>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspension and ending access',
    body: (
      <p>
        A clinic manager, director or Akomapa may suspend or remove access when someone leaves a
        clinic, when these terms are broken, or to protect patients or the service. Removing access
        does not delete the records an account created, because patients&rsquo; care depends on
        them.
      </p>
    ),
  },
  {
    id: 'ownership',
    title: 'Ownership and liability',
    body: (
      <p>
        The Nkwapa software, name and logo belong to Akomapa Health Foundation. Intellectual
        property, limitation of liability and other general matters are covered by the{' '}
        <a href={AKOMAPA_TERMS_HREF} rel="noopener">
          Akomapa terms of service
        </a>
        .
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these terms as Nkwapa develops. We will change the date at the top of this
        page and, for significant changes, tell people in Nkwapa or by email. Continuing to use
        Nkwapa after a change means you accept the updated terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: <p>Questions about these terms? Email {contact}.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      path={TERMS_HREF}
      title="Terms of use"
      lede={
        <p>
          The ground rules for using Nkwapa, written for the clinic staff, volunteers and patients
          who rely on it.
        </p>
      }
      updated={UPDATED}
      sections={sections}
    />
  );
}
