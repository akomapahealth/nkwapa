'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import styles from './patient-profile.module.css';
import { avatarToneProps } from '@/lib/avatar-tone';

/** Identity stays visible during chart review without duplicating chart actions or focus stops. */
export function PatientProfileHeader({
  name,
  patientCode,
  sex,
  clinicId,
  badges,
  actions,
}: {
  name: string;
  patientCode: string;
  sex: string;
  clinicId: string;
  badges: ReactNode;
  actions: ReactNode;
}) {
  const header = useRef<HTMLElement>(null);
  const compact = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState({ visible: false, top: 0, left: 0, width: 0 });

  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const shell = document.querySelector('header');
    let frame = 0;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const top = Math.max(0, shell?.getBoundingClientRect().bottom ?? 0);
      const focused = document.activeElement;
      const focusRect =
        focused instanceof HTMLElement &&
        focused.closest('main') &&
        focused !== document.querySelector('main')
          ? focused.getBoundingClientRect()
          : null;
      // Identity must never obscure a control the browser has scrolled into keyboard focus.
      const coversFocus =
        focusRect &&
        focusRect.bottom > top &&
        focusRect.top < top + (compact.current?.offsetHeight ?? 0);
      const next = {
        visible: rect.bottom <= top && !coversFocus,
        top,
        left: rect.left,
        width: rect.width,
      };
      setContext((previous) =>
        Object.keys(next).every(
          (key) => previous[key as keyof typeof next] === next[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    if (shell) observer.observe(shell);
    // Capture also observes scrolling inside the workspace, not only document scrolling.
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <>
      <header ref={header} className={styles.header}>
        <Link className={styles.back} href={`/clinics/${clinicId}/patients`}>
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          Back to patient search
        </Link>
        <div className={styles.identityRow}>
          <span className={styles.avatar} aria-hidden="true" {...avatarToneProps(name)}>
            {name
              .split(/\s+/)
              .filter(Boolean)
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div className={styles.identity}>
            <h1 className="type-page-title">{name}</h1>
            <div className={styles.metadata}>
              <span className="font-mono tabular-nums" translate="no">
                {patientCode}
              </span>
              <span>{sex}</span>
            </div>
            {badges ? <div className="mt-2 flex flex-wrap gap-2">{badges}</div> : null}
          </div>
          <div role="group" aria-label="Patient chart actions" className={styles.actions}>
            {actions}
          </div>
        </div>
      </header>
      {context.width > 0
        ? createPortal(
            <div
              ref={compact}
              aria-hidden="true"
              data-visible={context.visible}
              className={styles.context}
              style={{ top: context.top, left: context.left, width: context.width, margin: 0 }}
            >
              <span className="min-w-0 truncate font-semibold">{name}</span>
              <span
                className="min-w-0 truncate font-mono text-xs text-muted-foreground"
                translate="no"
              >
                {patientCode}
              </span>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
