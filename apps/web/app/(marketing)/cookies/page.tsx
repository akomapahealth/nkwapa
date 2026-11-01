import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/landing/LegalPage';
import { CookieSettingsButton } from '@/components/landing/CookieSettingsButton';
import {
  CONTACT_EMAIL,
  CONTACT_HREF,
  COOKIES_HREF,
  PRIVACY_HREF,
} from '@/components/landing/links';

export const metadata: Metadata = {
  title: { absolute: 'Cookie policy | Nkwapa' },
  description:
    'The cookies and browser storage Nkwapa uses, why each one is needed, how long it lasts, and how to change your choice.',
};

const UPDATED = 'November 1, 2026';

const contact = <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a>;

/*
  Every entry below is something the code actually sets. When a key is added or removed in
  lib/, components/ or the service worker, this list changes with it.
*/
const sections: LegalSection[] = [
  {
    id: 'what',
    title: 'What cookies and browser storage are',
    body: (
      <>
        <p>
          A cookie is a small file a website asks your browser to keep. Browsers also have other
          storage, such as local storage, IndexedDB and a cache, that websites use for the same kind
          of job. In this policy, &ldquo;cookies&rdquo; means all of them.
        </p>
        <p>
          Nkwapa does not use advertising cookies, does not track you across other websites, and
          does not sell or share what is stored for advertising.
        </p>
      </>
    ),
  },
  {
    id: 'essential',
    title: 'Essential: always on',
    body: (
      <>
        <p>
          Nkwapa cannot work without these, so they do not need your consent. They stay on your
          device or go only to Nkwapa and its sign-in service.
        </p>
        <ul>
          <li>
            <strong>Sign-in session cookies</strong>, set by our sign-in service (Keycloak) on its
            own address, keep you signed in and protect sign-in from forgery. They end when the
            session ends or you sign out.
          </li>
          <li>
            <strong>Selected clinic</strong> (<code>nkwapa:activeClinicId</code>, local storage)
            remembers which clinic&rsquo;s records you are working in. Kept until you sign out or
            switch.
          </li>
          <li>
            <strong>Offline records and unsent changes</strong> (the <code>NkwapaDb</code> IndexedDB
            database) let clinics keep working without internet. Changes that have not been sent yet
            stay until they are sent, because they cannot be recovered any other way. See{' '}
            <Link href={`${PRIVACY_HREF}#device`}>Information stored on your device</Link>.
          </li>
          <li>
            <strong>Offline plan key</strong> (<code>nkwapa-clinician-plan-seal-key</code>, local
            storage) locks a clinician&rsquo;s plan saved offline so it can be read only once it is
            sent to Nkwapa.
          </li>
          <li>
            <strong>App files</strong> (the <code>nkwapa-</code> caches, used by the service worker)
            hold the pages and images of the app itself, never patient records, so Nkwapa opens
            without a connection. Replaced with each new version.
          </li>
          <li>
            <strong>Your cookie choice</strong> (<code>nkwapa.cookie-consent</code>, local storage)
            remembers what you chose below.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'preferences',
    title: 'Preferences: set only when you choose them',
    body: (
      <>
        <p>These remember a choice you made on this device. None of them leave it.</p>
        <ul>
          <li>
            <strong>Light or dark mode</strong> (<code>nkwapa-theme</code>)
          </li>
          <li>
            <strong>Collapsed sidebar</strong> (<code>nkwapa.sidebar.collapsed</code>)
          </li>
          <li>
            <strong>Browser notifications on this device</strong> (
            <code>nkwapa.notifications.enabled</code>). Your browser also keeps its own permission,
            which you can change in its site settings.
          </li>
          <li>
            <strong>A dismissed announcement</strong> (<code>nkwapa.release-banner.dismissed</code>)
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'analytics',
    title: 'Analytics: only with your permission',
    body: (
      <>
        <p>
          Only if you accept it, we count visits to our home page, clicks on our contact links,
          whether people install the app, and how often the sync center is used, using PostHog,
          hosted in the European Union. These counts never include names, contact details, ID
          numbers, health information or anything typed into Nkwapa: every event passes a fixed list
          of what may be sent, and nothing records your clicks, your screen or the pages you open
          inside the app. Declining has no effect on what you can do.
        </p>
        <p>
          If you accept, PostHog keeps a random identifier for this browser in a cookie and in local
          storage, both named <code>ph_&hellip;_posthog</code>, for up to a year, so a returning
          visitor is counted once, and short-lived markers for the open tab in session storage. If
          you decline later, all of them are deleted and no more counts are sent; a marker (
          <code>__ph_opt_in_out_&hellip;</code>) remembers that PostHog is switched off.
        </p>
        <p>
          Inside the app, Nkwapa also counts whether its workflows succeed or fail. That count is
          kept on our own servers, contains no personal or health details, and does not use cookies.
          See <Link href={`${PRIVACY_HREF}#measurement`}>How we measure the service</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'errors',
    title: 'Error reports',
    body: (
      <p>
        When something breaks, the error is reported to our error monitoring service (Sentry) so we
        can fix it. Reports are scrubbed of personal details before they leave your device. If an
        error happens, a recording of the last minute on screen may be attached, with all text,
        inputs and images hidden. The recording is held in memory and sent only when an error
        happens. Sentry sets no cookies; it keeps a short-lived marker (
        <code>sentryReplaySession</code>) in session storage, which the browser deletes when the tab
        closes.
      </p>
    ),
  },
  {
    id: 'choices',
    title: 'Your choices',
    body: (
      <>
        <p>
          You can change your analytics choice at any time:{' '}
          <CookieSettingsButton
            label="open cookie settings"
            className="underline underline-offset-4"
          />
          . You can also clear or block storage in your browser&rsquo;s settings. Blocking essential
          storage signs you out, and clearing it on a device with unsent changes deletes those
          changes, so send them first from the sync center.
        </p>
        <p>
          On a shared clinic device, sign out when you finish. Signing out clears the selected
          clinic and the patient portal&rsquo;s saved pages.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and contact',
    body: (
      <p>
        If we add a cookie, we update this page and its date, and ask again before anything optional
        is set. Questions? Email {contact}. See also the{' '}
        <Link href={PRIVACY_HREF}>privacy notice</Link>.
      </p>
    ),
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      path={COOKIES_HREF}
      title="Cookie policy"
      lede={
        <p>
          Nkwapa keeps only what it needs on your device to sign you in, keep clinic work safe
          offline and remember your settings. Anything else waits for your permission.
        </p>
      }
      updated={UPDATED}
      sections={sections}
    />
  );
}
