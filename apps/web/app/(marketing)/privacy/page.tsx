import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/landing/LegalPage';
import {
  AKOMAPA_PRIVACY_HREF,
  CONTACT_EMAIL,
  COOKIES_HREF,
  CONTACT_HREF,
  PRIVACY_HREF,
  TERMS_HREF,
} from '@/components/landing/links';

export const metadata: Metadata = {
  title: { absolute: 'Privacy notice | Nkwapa' },
  description:
    'How Nkwapa, the electronic medical record developed by Akomapa Health Foundation, collects, uses, protects and shares patient and staff information.',
};

const UPDATED = 'November 1, 2026';

const contact = <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a>;

const sections: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are and what this notice covers',
    body: (
      <>
        <p>
          Nkwapa is an electronic medical record developed by Akomapa Health Foundation
          (&ldquo;Akomapa,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) for community clinics caring
          for people with hypertension and diabetes. This notice explains how information is handled
          inside Nkwapa: the patient records clinic teams keep, the accounts staff and volunteers
          use, and the patient portal.
        </p>
        <p>
          It supplements the{' '}
          <a href={AKOMAPA_PRIVACY_HREF} rel="noopener">
            Akomapa privacy policy
          </a>
          , which covers the Akomapa website, volunteer applications and donations. Where the two
          differ about information in Nkwapa, this notice applies.
        </p>
        <p>
          Nkwapa is still being developed and is used in Akomapa&rsquo;s clinics. As it changes, we
          will update this notice.
        </p>
      </>
    ),
  },
  {
    id: 'information',
    title: 'Information in Nkwapa',
    body: (
      <>
        <h3>About patients</h3>
        <p>Clinic staff record what they need to care for a patient over time, including:</p>
        <ul>
          <li>
            Identity and contact details: name, date of birth, sex, phone number, email address,
            region, district and community, and, where a patient has one, a national ID number.
          </li>
          <li>
            Health information: vital signs, blood pressure and glucose readings, diabetes and
            hypertension screenings and interviews, eye screening, medical history, allergies,
            medicines, prescriptions, preferred pharmacies, clinical notes and care plans.
          </li>
          <li>Visits and appointments, including check-ins, requests, reminders and outcomes.</li>
          <li>Whether a patient has agreed to the research use described below.</li>
        </ul>
        <p>
          Patients who use the patient portal can also see parts of their own record, record their
          own blood pressure, glucose and weight, and request, reschedule or cancel appointments.
        </p>

        <h3>About staff and volunteers</h3>
        <p>
          For each account we keep a name, email address, an optional work phone number the person
          adds themselves, the clinics and roles assigned to it, shifts and station assignments, and
          messages sent to colleagues through Nkwapa&rsquo;s staff chat. Nkwapa also records which
          account created or changed a record, and when.
        </p>

        <h3>Technical information</h3>
        <p>
          Our servers keep the technical logs needed to run the service safely, such as the time of
          a request, the device&rsquo;s IP address and error details. Nkwapa also counts how often
          its workflows succeed or fail, as described in{' '}
          <a href="#measurement">How we measure the service</a>.
        </p>
      </>
    ),
  },
  {
    id: 'minimum',
    title: 'Only what care needs',
    body: (
      <>
        <p>
          Nkwapa asks only for information a clinic needs to care for a patient, run the clinic or
          keep the record trustworthy. Many fields are optional, including a patient&rsquo;s
          national ID number, email address and middle initial, and a staff member&rsquo;s phone
          number. Leaving an optional field empty never affects care.
        </p>
        <p>Nkwapa does not collect:</p>
        <ul>
          <li>
            Your precise location. A patient&rsquo;s region, district and community are typed in,
            never taken from a device
          </li>
          <li>Your device&rsquo;s contacts, photos, camera, microphone or files</li>
          <li>Advertising identifiers, or anything about your activity on other websites</li>
          <li>Payment card or bank details</li>
          <li>Fingerprints, face scans or other biometric data</li>
        </ul>
        <p>
          Reminders, notifications and usage counts are built to carry as little as possible: a code
          instead of a name, the sender instead of the message, a count instead of a value.
        </p>
      </>
    ),
  },
  {
    id: 'use',
    title: 'How information is used',
    body: (
      <>
        <p>Information in Nkwapa is used to:</p>
        <ul>
          <li>Provide and coordinate a patient&rsquo;s care across visits and clinic stations</li>
          <li>Schedule appointments and send reminders</li>
          <li>Give patients access to their own record through the portal</li>
          <li>Run the clinic: shifts, queues, assignments and reports for clinic leaders</li>
          <li>Keep a record of who did what, so the record can be trusted and checked</li>
          <li>Keep the service secure and working, and fix problems</li>
          <li>
            Support research only with a patient&rsquo;s consent and only in de-identified form, as
            described below
          </li>
        </ul>
        <p>We do not sell information, and we do not use it for advertising.</p>
      </>
    ),
  },
  {
    id: 'access',
    title: 'Who can see a record',
    body: (
      <>
        <p>
          Access is set by role and by clinic. Volunteers, doctors, clinic managers and directors
          each see what their work needs, and only for the clinics they are assigned to. Some
          information is limited further: national ID numbers are stored encrypted, and a
          supervising clinician&rsquo;s plan is visible only to roles allowed to read it.
        </p>
        <p>
          Patients see their own record through the portal, not anyone else&rsquo;s. Accounts are
          created by invitation, and a clinic manager or director can remove an account&rsquo;s
          access when someone leaves.
        </p>
        <p>
          Nkwapa keeps an audit trail of changes to records. Clinic managers and directors can
          review it to answer questions about what happened to a record.
        </p>
        <p>
          Staff chat messages are shown only to the members of each conversation. They are stored
          encrypted, so a copy of the database does not reveal them. Akomapa may access a message
          only where the law requires it or to investigate a reported misuse.
        </p>
      </>
    ),
  },
  {
    id: 'device',
    title: 'Information stored on your device',
    body: (
      <>
        <p>
          So that clinics can keep working when the internet drops, Nkwapa stores a working copy of
          some records in the browser on the device being used, and keeps changes made offline there
          until they can be sent. Changes that have not been sent yet stay on the device after
          sign-out, because they cannot be recovered any other way. They are sent only by the
          account that made them.
        </p>
        <p>
          On the patient portal, the last copy of a patient&rsquo;s own pages is kept for up to a
          week and is cleared when they sign out.
        </p>
        <p>
          Nkwapa also uses cookies and browser storage to keep you signed in and to remember
          settings such as light or dark mode. Optional analytics cookies are used only if you
          accept them. The <Link href={COOKIES_HREF}>cookie policy</Link> lists every one. Staff
          should use devices their clinic manages, and sign out when they finish.
        </p>
        <p>
          If you turn on browser notifications, a new chat message shows a notification on that
          device. It names who wrote, never what they wrote, because it can appear on a locked
          screen. You can turn them off on your profile page or in your browser.
        </p>
      </>
    ),
  },
  {
    id: 'messages',
    title: 'Messages Nkwapa sends',
    body: (
      <>
        <p>
          Nkwapa sends email to invite staff and patients to create an account. Where a clinic sends
          appointment and follow-up reminders, they go by text message or email to the contact
          details on the patient&rsquo;s record. Reminders carry the patient&rsquo;s Nkwapa code and
          the date, not their name or health details. Messages are delivered by email and SMS
          providers on our behalf.
        </p>
      </>
    ),
  },
  {
    id: 'research',
    title: 'Research use',
    body: (
      <>
        <p>
          Akomapa&rsquo;s work is guided by research. Patient information is used for research only
          when all of the following are true:
        </p>
        <ul>
          <li>The patient has given research consent, recorded by clinic staff</li>
          <li>The clinic has turned research use on</li>
          <li>A clinic director has approved that specific export</li>
        </ul>
        <p>
          Research data is de-identified: names, dates of birth and contact details are not
          included. A patient can refuse without any effect on their care, and can withdraw consent
          at any time by telling clinic staff. Withdrawing excludes their information from future
          exports.
        </p>
      </>
    ),
  },
  {
    id: 'measurement',
    title: 'How we measure the service',
    body: (
      <>
        <p>
          Nkwapa counts events such as &ldquo;an appointment request was confirmed&rdquo; or
          &ldquo;an offline change was refused,&rdquo; so the team can see what is working. These
          counts never include names, contact details, ID numbers, clinical values or free text, and
          they are deleted after 180 days by default.
        </p>
        <p>
          If you accept analytics cookies, we also count a few actions in your browser, such as home
          page visits and app installs, using PostHog in the European Union. See the{' '}
          <Link href={COOKIES_HREF}>cookie policy</Link>. We do not use advertising trackers.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'How information is shared',
    body: (
      <>
        <p>Information in Nkwapa may be shared only:</p>
        <ul>
          <li>
            With service providers that host the service and its database, handle sign-in, deliver
            email and text messages, report errors so we can fix them, and, for people who accept
            analytics cookies, count visits. They may use it only to provide that service to us, and
            error reports are scrubbed of personal details first.
          </li>
          <li>With other members of a patient&rsquo;s care team, within the access rules above</li>
          <li>As de-identified research data, under the conditions above</li>
          <li>
            When the law requires it, or to protect the safety of patients, staff or the public
          </li>
          <li>With the patient&rsquo;s direction or consent</li>
        </ul>
        <p>
          Our providers may process information outside Ghana. We rely on contractual and
          organisational safeguards suited to the sensitivity of health information.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long information is kept',
    body: (
      <>
        <p>
          Patient records are medical records. They are kept for as long as they are needed for a
          patient&rsquo;s ongoing care and for as long as the law requires clinics to keep medical
          records. Records are not erased in normal use: corrections are recorded as changes, so the
          history stays accurate.
        </p>
        <p>
          When a staff account is removed, access ends but the record of what that account did is
          kept, because other records depend on it. Staff chat messages are kept while the clinic
          uses Nkwapa. Data rights requests and their answers are kept with the patient&rsquo;s
          record, as evidence of how each was handled. Usage counts are kept for 180 days by
          default.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How information is protected',
    body: (
      <>
        <p>
          We use technical and organisational safeguards, including encrypted connections,
          role-based access checked by the server on every request, database rules that keep each
          clinic&rsquo;s records apart, encryption of national ID numbers and staff chat messages,
          and an audit trail of changes. No system can be perfectly secure. If you think an account
          or a record has been misused, tell your clinic manager and email {contact} right away.
        </p>
        <p>
          If a breach puts people&rsquo;s information at risk, we tell the clinics affected, and the
          people affected and the authorities where the law requires it, as quickly as we can.
        </p>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your choices and rights',
    body: (
      <>
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li>See the information held about you, and get a copy</li>
          <li>Ask for inaccurate information to be corrected</li>
          <li>Ask for information to be deleted, where it does not need to be kept by law</li>
          <li>Limit or object to some uses of your information, such as research or reminders</li>
          <li>Withdraw research consent at any time</li>
          <li>Complain to a data protection authority</li>
        </ul>

        <h3>How to make a request</h3>
        <p>
          Patients with a portal account can send a request from their profile page, under{' '}
          <strong>Your data</strong>, and follow its answer there. Anyone can also ask at their
          clinic or email {contact}. Requests are free. We may need to confirm who you are before
          acting on one, so that nobody can get or change your information by pretending to be you.
        </p>
        <p>
          The clinic answers within 30 days. If it needs longer, it tells you why and when to expect
          an answer. Asking never affects your care.
        </p>

        <h3>What deletion can and cannot do</h3>
        <p>
          Medical records have to be kept for as long as the law requires, so that your care is safe
          and the record can be checked later. A deletion request therefore cannot erase your
          clinical history. What can be removed includes your contact details, your portal account,
          reminders, and your information in future research exports. When part of a request cannot
          be met, the clinic tells you which part and why.
        </p>
        <p>
          A staff member who leaves can ask for their account to be closed. Their access ends, but
          their name stays on the records they worked on, because those records depend on it.
        </p>
      </>
    ),
  },
  {
    id: 'decisions',
    title: 'Automated decisions',
    body: (
      <p>
        Nkwapa highlights readings, such as a blood pressure in a high range, to help clinicians
        notice them. A clinician always makes the decision about a patient&rsquo;s care. Nkwapa
        makes no decision about anyone by automated means alone.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        Clinics may keep records for patients under 18. Portal accounts are meant for adult
        patients. For a child, a parent or guardian deals with the clinic, and can make the requests
        above on the child&rsquo;s behalf.
      </p>
    ),
  },
  {
    id: 'where',
    title: 'Where you are',
    body: (
      <>
        <h3>Ghana</h3>
        <p>
          Nkwapa is used in Ghana under the Data Protection Act, 2012 (Act 843). You can raise a
          concern with the Data Protection Commission of Ghana if you are not satisfied with how a
          request or complaint was handled. Health information is special personal data under the
          Act, and is processed only for care and the other purposes in this notice.
        </p>
        <h3>United States</h3>
        <p>
          Where a clinic in the United States uses Nkwapa, the clinic is responsible for its
          patients&rsquo; health information under HIPAA, and its own Notice of Privacy Practices
          explains your rights. Akomapa handles that information only on the clinic&rsquo;s behalf,
          under an agreement that limits what Akomapa may do with it. State health privacy laws may
          give you further rights.
        </p>
        <h3>Other countries</h3>
        <p>
          Before Nkwapa is used in another country, we will update this notice for that
          country&rsquo;s law.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this notice',
    body: (
      <p>
        When we make a significant change, we will update the date at the top of this page and,
        where appropriate, tell people in Nkwapa or by email. See also the{' '}
        <Link href={TERMS_HREF}>terms of use</Link>.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: <p>Questions about privacy in Nkwapa? Email {contact}.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      path={PRIVACY_HREF}
      title="Privacy notice"
      lede={
        <p>
          Nkwapa holds health information about real patients. This notice explains, in plain
          language, what is collected, who can see it, and the choices patients and staff have.
        </p>
      }
      updated={UPDATED}
      sections={sections}
    />
  );
}
