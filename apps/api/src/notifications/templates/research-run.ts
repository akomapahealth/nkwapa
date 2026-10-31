import type { EmailTemplate } from './types';
import { renderLayout, renderText, type CallToAction, type LayoutInput } from './layout';
import { optionalStr, optionalUrl, str } from './partials';

export interface ResearchRunAttentionPayload {
  clinicName: string;
  runKey: string;
  outcome: 'SKIPPED' | 'FAILED';
  reason: string | null;
  exportsUrl: string | null;
}

/**
 * Plain words for every reason a scheduled run stops (#166). The email carries the run key and
 * this, never any data from the run.
 */
const REASONS: Record<string, string> = {
  RESEARCH_DISABLED: 'Research is turned off for the clinic.',
  SCHEDULE_INACTIVE: 'The schedule is paused, revoked or waiting for approval.',
  REVIEW_EXPIRED: 'The schedule is past its review date and needs a director to approve it again.',
  APPROVER_LOST_PERMISSION: 'The director who approved the schedule can no longer approve exports.',
  BELOW_MINIMUM_COHORT:
    'Too few patients have consented to research for a run to be published safely.',
  RESEARCH_EXPORT_FAILED: 'The run could not be built or published, after every retry.',
  RESEARCH_EXPORT_INTERRUPTED: 'The run stopped before it published anything.',
  RESEARCH_EXPORT_QUEUE_FAILED: 'The run could not be queued.',
};

export function researchReasonLabel(reason: string | null): string {
  return (reason && REASONS[reason]) || 'The run did not complete.';
}

export const RESEARCH_RUN_ATTENTION_V1: EmailTemplate<ResearchRunAttentionPayload> = {
  key: 'RESEARCH_RUN_ATTENTION_V1',
  parse: (raw) => ({
    clinicName: str(raw.clinicName, 'your clinic'),
    runKey: str(raw.runKey, 'unknown run'),
    outcome: raw.outcome === 'FAILED' ? 'FAILED' : 'SKIPPED',
    reason: optionalStr(raw.reason),
    exportsUrl: optionalUrl(raw.exportsUrl),
  }),
  render: (payload) => {
    const verb = payload.outcome === 'FAILED' ? 'failed' : 'was skipped';
    const callToAction: CallToAction | undefined = payload.exportsUrl
      ? { label: 'Open research exports', url: payload.exportsUrl }
      : undefined;
    const layout: LayoutInput = {
      preheader: `Scheduled research run ${payload.runKey} ${verb}.`,
      heading: `A scheduled research run ${verb}`,
      clinicName: payload.clinicName,
      paragraphs: [
        `The scheduled research export ${payload.runKey} ${verb}. Nothing was published for it.`,
        researchReasonLabel(payload.reason),
      ],
      details: [
        { label: 'Run', value: payload.runKey },
        { label: 'Outcome', value: payload.outcome === 'FAILED' ? 'Failed' : 'Skipped' },
      ],
      ...(callToAction ? { callToAction } : {}),
      footnotes: [
        'This email contains no research data. Review the run on the research exports page.',
      ],
    };
    return {
      subject: `Research run ${payload.runKey} ${verb}`,
      html: renderLayout(layout),
      text: renderText(layout),
    };
  },
};
