'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { STICKY_ACTIONS } from '@/components/ui/form-actions';
import { cn } from '@/lib/utils';

/**
 * The read-aloud interview (docs/design-system/ui-refresh/BRIEF-INTERVIEW.md): one section per
 * screen, a rail that says how much of each section was asked, a review screen, and a footer that
 * always shows whether the answers are saved.
 *
 * Sections stay mounted and are hidden, never unmounted, so moving between them keeps every answer
 * and the form's own validation can still find a field in a section that is not on screen. The
 * questions register themselves (see `useInterviewQuestion`), so the rail and the review screen are
 * built from what is actually rendered rather than from a second list that could drift.
 */

export interface InterviewSectionMeta {
  id: string;
  title: string;
  /** The rail's name for it, when the title is too long for the rail. */
  short?: string;
}

interface QuestionEntry {
  id: string;
  label: string;
  sectionId: string;
  /** Answered with something other than "Not asked". */
  answered: boolean;
  /** What the review screen prints for the answer. */
  display: string;
  invalid: boolean;
}

interface FlowContextValue {
  register: (entry: QuestionEntry) => void;
  unregister: (id: string) => void;
}

const FlowContext = createContext<FlowContextValue | null>(null);
const SectionContext = createContext<string | null>(null);

/** Values that mean the volunteer has not asked the question yet. */
const UNASKED = new Set(['', 'NOT_ASSESSED', 'NOT_ASKED']);

export function isUnasked(value: string | null | undefined): boolean {
  return UNASKED.has(value ?? '');
}

/**
 * Called by every question component. Outside an InterviewFlow (any other form that reuses the
 * question shapes) it does nothing.
 */
export function useInterviewQuestion(entry: Omit<QuestionEntry, 'sectionId'>) {
  const flow = useContext(FlowContext);
  const sectionId = useContext(SectionContext);
  const { id, label, answered, display, invalid } = entry;
  useEffect(() => {
    if (!flow || !sectionId) return;
    flow.register({ id, label, answered, display, invalid, sectionId });
  }, [flow, sectionId, id, label, answered, display, invalid]);
  useEffect(() => {
    if (!flow || !sectionId) return;
    return () => flow.unregister(id);
  }, [flow, sectionId, id]);
}

/**
 * Enter on an answer moves to the next question in the section, or to the footer's Next after
 * the last one, without pressing it: Enter never saves by surprise.
 */
export function focusNextQuestion(from: HTMLElement) {
  const section = from.closest('[data-interview-section]');
  if (!section) return;
  const targets = [
    ...section.querySelectorAll<HTMLElement>(
      '[role="radiogroup"], input:not([type="radio"]):not([type="hidden"]), select, textarea, button[role="combobox"]',
    ),
  ].filter(
    (el) =>
      (el.getAttribute('role') === 'radiogroup' || el.tabIndex >= 0) &&
      !el.closest('[hidden], [aria-hidden="true"]') &&
      !el.closest('[role="radiogroup"] *'),
  );
  const current = targets.findIndex((el) => el === from || el.contains(from));
  const target = targets[current + 1];
  const field =
    target?.getAttribute('role') === 'radiogroup'
      ? (target.querySelector<HTMLElement>('input:checked') ?? target.querySelector('input'))
      : target;
  (
    field ??
    from
      .closest('[data-interview-flow]')
      ?.querySelector<HTMLElement>('[data-interview-actions] button:last-of-type')
  )?.focus();
}

export interface InterviewSaveState {
  saving: boolean;
  /** The form's last success message ("saved on this device and pending sync"). */
  message: string | null;
  error: string | null;
}

const REVIEW = '__review__';

export function InterviewFlow({
  label,
  sections,
  canEdit,
  onSave,
  saveLabel,
  save,
  alert,
  children,
}: {
  /** Names the rail for assistive technology: "Hypertension interview". */
  label: string;
  sections: InterviewSectionMeta[];
  canEdit: boolean;
  /** The form's existing save. Throws when an answer needs fixing. */
  onSave: () => Promise<void>;
  saveLabel: string;
  save: InterviewSaveState;
  /**
   * A notice that must stay in view on every section once raised, such as "This visit needs a
   * clinician now". Rendered once above the heading, so moving between sections never re-announces it.
   */
  alert?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? REVIEW);
  const [registry, setRegistry] = useState<Map<string, QuestionEntry>>(() => new Map());
  // Each question id's position in the document, so lists read in the order they were asked.
  const [positions, setPositions] = useState<Map<string, number>>(() => new Map());
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  // Answers as they were when the volunteer first touched the interview, then at each save.
  const [baseline, setBaseline] = useState<Map<string, string> | null>(null);

  const register = useCallback((entry: QuestionEntry) => {
    setRegistry((current) => {
      const previous = current.get(entry.id);
      if (
        previous &&
        previous.answered === entry.answered &&
        previous.display === entry.display &&
        previous.invalid === entry.invalid &&
        previous.label === entry.label &&
        previous.sectionId === entry.sectionId
      )
        return current;
      return new Map(current).set(entry.id, entry);
    });
  }, []);
  const unregister = useCallback((id: string) => {
    setRegistry((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);
  const flow = useMemo(() => ({ register, unregister }), [register, unregister]);

  useEffect(() => {
    const next = new Map<string, number>();
    rootRef.current?.querySelectorAll('[id]').forEach((el, i) => next.set(el.id, i));
    setPositions((current) =>
      current.size === next.size && [...next].every(([id, i]) => current.get(id) === i)
        ? current
        : next,
    );
  }, [registry]);

  const entries = useMemo(
    () =>
      [...registry.values()].sort(
        (a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0),
      ),
    [registry, positions],
  );
  const bySection = useMemo(() => {
    const map = new Map<string, QuestionEntry[]>();
    for (const section of sections) map.set(section.id, []);
    for (const entry of entries) map.get(entry.sectionId)?.push(entry);
    return map;
  }, [entries, sections]);
  const snapshot = () => new Map(entries.map((e) => [e.id, e.display]));
  // Taken before the first change lands, so answers loaded from a saved draft never count.
  const markTouched = () => {
    if (canEdit && baseline === null) setBaseline(snapshot());
  };
  // A question that appeared after the baseline (a follow-up) counts only once it is answered.
  const unsaved = baseline
    ? entries.filter((e) => (baseline.has(e.id) ? baseline.get(e.id) !== e.display : e.answered))
        .length
    : 0;

  /*
    Unsaved answers survive moving between sections and tabs, but not leaving the page. Ask first:
    the browser's own prompt for a reload or closing the tab, ours for a link inside the app. The
    browser Back button is not caught; Next saves every section, which keeps that loss small.
  */
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      // Another site is the browser prompt's job; the same page (tabs, anchors) keeps the answers.
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname)
        return;
      event.preventDefault();
      event.stopPropagation();
      void confirmAction({
        title: 'These answers are not saved yet',
        description: `${unsaved} ${unsaved === 1 ? 'answer in this interview is' : 'answers in this interview are'} not saved. If you leave this page now, ${unsaved === 1 ? 'it is' : 'they are'} lost.`,
        confirmLabel: 'Leave without saving',
        cancelLabel: 'Stay',
      }).then((leave) => {
        if (leave) router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [unsaved, router]);

  const index = sections.findIndex((s) => s.id === active);
  const onReview = active === REVIEW;
  const next = onReview ? null : (sections[index + 1] ?? null);
  const previous = onReview ? sections.at(-1) : index > 0 ? sections[index - 1] : null;

  const go = useCallback((id: string, focusId?: string) => {
    setActive(id);
    requestAnimationFrame(() => {
      const found = focusId ? document.getElementById(focusId) : null;
      // A choice row takes focus on its picked (or first) radio, where the arrow keys work.
      const field =
        found?.getAttribute('role') === 'radiogroup'
          ? (found.querySelector<HTMLElement>('input:checked') ?? found.querySelector('input'))
          : found;
      if (field) {
        field.focus({ preventScroll: true });
        field.scrollIntoView({ block: 'center' });
        return;
      }
      headingRef.current?.focus({ preventScroll: true });
      rootRef.current?.scrollIntoView({ block: 'start' });
    });
  }, []);

  /*
    After a failed save, the form marks fields invalid; the first one may sit in a section that is
    not on screen. Take the volunteer there. Keyed on the set of invalid ids so fixing one answer
    does not yank the screen back.
  */
  const invalidKey = entries
    .filter((e) => e.invalid)
    .map((e) => e.id)
    .sort()
    .join('|');
  const lastInvalidKey = useRef('');
  useEffect(() => {
    if (invalidKey === lastInvalidKey.current) return;
    const grew = invalidKey.length > 0 && invalidKey !== lastInvalidKey.current;
    lastInvalidKey.current = invalidKey;
    if (!grew) return;
    const first = rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const section = first?.closest<HTMLElement>('[data-interview-section]')?.dataset
      .interviewSection;
    if (first && section) go(section, first.id);
  }, [invalidKey, go]);

  const saveThen = async (then?: () => void) => {
    try {
      await onSave();
      setBaseline(snapshot());
      then?.();
    } catch {
      // The form shows the error and marks the fields; the effect above moves to them.
    }
  };

  /*
    Save when the screen goes away: a locked phone, a switched app, a closed lid. That is usually
    what happens just before a device is put down or runs out of battery, and a save goes to this
    device first, so it survives a power cut and syncs later. A sudden power loss with the screen
    still on can still lose the section being filled; every earlier section is already saved.
  */
  const hiddenSave = useRef<() => void>(() => undefined);
  useEffect(() => {
    hiddenSave.current = () => {
      if (canEdit && unsaved > 0 && !save.saving) void saveThen();
    };
  });
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') hiddenSave.current();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const status = save.saving
    ? 'Saving…'
    : save.error
      ? save.error
      : unsaved
        ? `${unsaved} ${unsaved === 1 ? 'answer' : 'answers'} not saved`
        : save.message;

  // Read-only: every section at once, for a doctor reading the finished interview.
  const showAll = !canEdit;

  return (
    <FlowContext.Provider value={flow}>
      <div className="min-w-0 [container-type:inline-size]">
        <div
          ref={rootRef}
          data-interview-flow=""
          onPointerDownCapture={markTouched}
          onKeyDownCapture={markTouched}
          className="grid gap-x-8 gap-y-4 scroll-mt-24 [@container(min-width:48rem)]:grid-cols-[13.5rem_minmax(0,1fr)]"
        >
          {showAll ? null : (
            <nav
              aria-label={label}
              className="min-w-0 [@container(min-width:48rem)]:sticky [@container(min-width:48rem)]:top-20 [@container(min-width:48rem)]:self-start"
            >
              <ol className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [@container(min-width:48rem)]:flex-col [@container(min-width:48rem)]:overflow-visible [@container(min-width:48rem)]:pb-0">
                {sections.map((section, i) => {
                  const list = bySection.get(section.id) ?? [];
                  const asked = list.filter((e) => e.answered).length;
                  const needsFix = list.some((e) => e.invalid);
                  const current = section.id === active;
                  return (
                    <li key={section.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => go(section.id)}
                        aria-current={current ? 'step' : undefined}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 py-2 text-left motion-safe:transition-colors motion-safe:duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          current && 'bg-primary/10 text-foreground hover:bg-primary/10',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums',
                            current
                              ? 'border-primary bg-primary text-primary-foreground'
                              : needsFix
                                ? 'border-destructive text-destructive'
                                : 'border-border text-muted-foreground',
                          )}
                        >
                          {needsFix ? <AlertCircle className="size-3.5" /> : i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block whitespace-nowrap text-sm font-medium leading-5 [@container(min-width:48rem)]:whitespace-normal">
                            {section.short ?? section.title}
                          </span>
                          <span className="hidden text-xs leading-4 text-muted-foreground [@container(min-width:48rem)]:block">
                            {needsFix
                              ? 'Needs a fix'
                              : list.length
                                ? `${asked} of ${list.length} asked`
                                : 'Nothing to ask'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(REVIEW)}
                    aria-current={onReview ? 'step' : undefined}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 py-2 text-left motion-safe:transition-colors motion-safe:duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@container(min-width:48rem)]:mt-2 [@container(min-width:48rem)]:border-t [@container(min-width:48rem)]:border-rule [@container(min-width:48rem)]:pt-3',
                      onReview && 'bg-primary/10 hover:bg-primary/10',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-full border',
                        onReview
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      <Check className="size-3.5" />
                    </span>
                    <span className="whitespace-nowrap text-sm font-medium">Review and save</span>
                  </button>
                </li>
              </ol>
            </nav>
          )}

          <div className="min-w-0 max-w-3xl">
            {alert ? <div className="mb-5">{alert}</div> : null}
            {showAll ? null : (
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="type-section-title scroll-mt-24 focus:outline-none"
              >
                <span className="sr-only">
                  {onReview ? '' : `Section ${index + 1} of ${sections.length}: `}
                </span>
                {onReview ? 'Review and save' : sections[index]?.title}
              </h2>
            )}

            <ActiveSectionContext.Provider value={showAll ? null : active}>
              {children}
            </ActiveSectionContext.Provider>

            {onReview && !showAll ? (
              <ReviewScreen sections={sections} bySection={bySection} onJump={go} />
            ) : null}

            {canEdit ? (
              <div
                data-interview-actions=""
                className={cn(
                  'mt-6 flex flex-wrap items-center gap-2 compact:gap-3',
                  STICKY_ACTIONS,
                )}
              >
                <p
                  role="status"
                  className={cn(
                    'mr-auto min-w-0 basis-full text-sm compact:basis-auto',
                    save.error ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {status}
                </p>
                {previous ? (
                  <Button type="button" variant="ghost" onClick={() => go(previous.id)}>
                    <ChevronLeft aria-hidden="true" />
                    {/* Icon only on a phone, so Back, Save and Next share one row. */}
                    <span className="sr-only compact:not-sr-only">Back</span>
                  </Button>
                ) : null}
                {onReview ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={save.saving}
                    onClick={() => void saveThen()}
                  >
                    {save.saving ? 'Saving…' : saveLabel}
                  </Button>
                )}
                {onReview ? (
                  <Button type="button" disabled={save.saving} onClick={() => void saveThen()}>
                    {save.saving ? 'Saving…' : saveLabel}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={save.saving}
                    onClick={() => void saveThen(() => go(next?.id ?? REVIEW))}
                  >
                    {next ? (
                      // One inline box: the button's flex gap would split "Next" from its title.
                      <span>
                        Next<span className="sr-only compact:not-sr-only">: {next.title}</span>
                      </span>
                    ) : (
                      'Review'
                    )}
                    <ChevronRight aria-hidden="true" />
                  </Button>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">This interview is read-only.</p>
            )}
          </div>
        </div>
      </div>
    </FlowContext.Provider>
  );
}

const ActiveSectionContext = createContext<string | null>(null);

/**
 * One section of the interview. Hidden, never unmounted, when it is not the one on screen. Its
 * title is the flow's heading while it is active; in the read-only view it carries its own.
 */
export function InterviewSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const active = useContext(ActiveSectionContext);
  const showAll = active === null;
  return (
    <SectionContext.Provider value={id}>
      <section
        data-interview-section={id}
        hidden={!showAll && active !== id}
        aria-label={showAll ? undefined : title}
        className={cn('min-w-0', showAll && 'border-t border-rule py-5')}
      >
        {showAll ? <h2 className="type-section-title">{title}</h2> : null}
        {description ? (
          <p className="type-label mt-2 max-w-prose font-normal text-muted-foreground">
            {description}
          </p>
        ) : null}
        <div className="mt-5 space-y-6">{children}</div>
      </section>
    </SectionContext.Provider>
  );
}

function ReviewScreen({
  sections,
  bySection,
  onJump,
}: {
  sections: InterviewSectionMeta[];
  bySection: Map<string, QuestionEntry[]>;
  onJump: (section: string, focusId?: string) => void;
}) {
  const unasked = sections.flatMap((s) =>
    (bySection.get(s.id) ?? []).filter((e) => !e.answered).map((e) => ({ ...e, section: s })),
  );
  return (
    <div className="mt-5 space-y-6">
      <p className="type-body max-w-prose text-muted-foreground">
        {unasked.length
          ? `${unasked.length} ${unasked.length === 1 ? 'question was' : 'questions were'} not asked. They save as "Not asked"; go back to any of them if the patient can still answer.`
          : 'Every question was asked. Check the answers, then save.'}
      </p>
      {sections.map((section, i) => {
        const list = bySection.get(section.id) ?? [];
        if (!list.length) return null;
        return (
          <section key={section.id} className="border-t border-rule pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold">
                {i + 1}. {section.title}
              </h3>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => onJump(section.id)}
              >
                Edit<span className="sr-only"> {section.title}</span>
              </Button>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 compact:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              {list.map((entry) => (
                <div key={entry.id} className="contents">
                  <dt className="text-sm text-muted-foreground">{entry.label}</dt>
                  <dd className="text-sm">
                    {entry.answered ? (
                      entry.display
                    ) : (
                      <button
                        type="button"
                        onClick={() => onJump(section.id, entry.id)}
                        className="rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Not asked
                        <span className="sr-only">: ask {entry.label}</span>
                      </button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
