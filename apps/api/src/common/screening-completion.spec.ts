import { ScreeningCompletionStatus } from '@prisma/client';
import { screeningCompletionDate, toDateOnly } from './screening-completion';

describe('screeningCompletionDate', () => {
  it('keeps the date while the status says the screening happened', () => {
    expect(screeningCompletionDate(ScreeningCompletionStatus.COMPLETED, '2026-03-14')).toEqual(
      new Date('2026-03-14'),
    );
  });

  it('allows a completed screening with no date, because the patient may not recall one', () => {
    // Optional on purpose: demanding a date here would invite an invented one.
    expect(screeningCompletionDate(ScreeningCompletionStatus.COMPLETED, null)).toBeNull();
    expect(screeningCompletionDate(ScreeningCompletionStatus.COMPLETED, undefined)).toBeNull();
  });

  it.each([
    ScreeningCompletionStatus.NOT_COMPLETED,
    ScreeningCompletionStatus.PATIENT_UNSURE,
    ScreeningCompletionStatus.NOT_ASSESSED,
  ])('drops a date the status no longer supports (%s)', (status) => {
    /*
      The case this exists for: someone records Completed with a date, then corrects the status.
      A date left sitting beside "not completed" reads as a fact about a screening that did not
      happen, and nothing else in the record would contradict it.
    */
    expect(screeningCompletionDate(status, '2026-03-14')).toBeNull();
  });

  it('drops the date when the status was never sent at all', () => {
    expect(screeningCompletionDate(undefined, '2026-03-14')).toBeNull();
  });
});

describe('toDateOnly', () => {
  it('renders a date column as YYYY-MM-DD rather than an invented midnight', () => {
    // These columns are @db.Date and carry no time. Sending a timestamp would invite a timezone
    // to shift it across a day boundary on the way back.
    expect(toDateOnly(new Date('2026-03-14'))).toBe('2026-03-14');
  });

  it('passes null through as null', () => {
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly(undefined)).toBeNull();
  });
});
