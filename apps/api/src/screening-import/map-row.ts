import type { CheckInStatus, NationalIdType } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';
import type { CreatePatientDto } from '../patients/dto/create-patient.dto';
import * as L from './labels';
import { hasEntries, type SheetPatient, type TabRow } from './read-sheet';

/** Fixed namespace for the importer's deterministic ids. Never change it: re-runs depend on it. */
const NAMESPACE = '5b0f6f0e-0c1e-4a8a-9d6e-204204204204';

/** Every field the importer writes, for one patient, as plain service inputs. */
export interface PatientPlan {
  visitId: string;
  /** The audit request id: every event this patient's import writes shares it. */
  requestId: string;
  patient: Omit<CreatePatientDto, 'primaryClinicId' | 'createdByUserId'>;
  returningCode: string | null;
  consent: boolean;
  checkIn: { id: string; checkedInAt: Date; status: CheckInStatus; notes: string };
  /** Absent when the patient left before any station recorded anything. */
  encounter: null | {
    vitals: Record<string, unknown> | null;
    hypertension: Record<string, unknown> | null;
    diabetes: Record<string, unknown> | null;
    eye: Record<string, unknown> | null;
    counselling: Record<string, unknown> | null;
    history: Array<Record<string, unknown>>;
    medications: Array<Record<string, unknown>>;
  };
  /** Text the sheet holds that Nkwapa has no structured place for (counted in the report). */
  medicinesGiven: string | null;
  warnings: string[];
}

export class RowRejectedError extends Error {
  constructor(
    readonly visitId: string,
    readonly reasons: string[],
  ) {
    super(`${visitId}: ${reasons.join('; ')}`);
    this.name = 'RowRejectedError';
  }
}

export function importId(sessionDate: string, visitId: string, record: string): string {
  return uuidv5(`${sessionDate}|${visitId}|${record}`, NAMESPACE);
}

const NONE_WORDS = new Set(['none', 'nil', 'no', 'n/a', 'na', '-', 'nkda', 'nka', 'no known']);
const isNone = (text: string) => NONE_WORDS.has(text.trim().toLowerCase().replace(/\.$/, ''));

/** A free-text cell listing several things ("metformin 500mg, amlodipine"). */
export function splitList(text: string): string[] {
  if (!text.trim() || isNone(text)) return [];
  return text
    .split(/[;,\n]+/)
    .map((s) => s.trim())
    .filter((s) => s && !isNone(s));
}

/** One patient's sheet rows → service inputs. Collects every problem in the row before refusing it. */
export function mapPatient(sheet: SheetPatient, sessionDate: string): PatientPlan {
  const { visitId } = sheet;
  const { checkIn, intake, bp, glucose, body, eye, review } = sheet.tabs;
  const issues: string[] = [];
  const warnings: string[] = [];
  const id = (record: string) => importId(sessionDate, visitId, record);

  const pick = <T>(
    table: Readonly<Record<string, T>>,
    tab: string,
    row: TabRow,
    header: string,
  ) => {
    try {
      return L.label(table, `${tab} "${header}"`, row[header] ?? '');
    } catch (error) {
      issues.push((error as Error).message);
      return undefined;
    }
  };
  /** Notes per record, for words the sheet holds that a field cannot. */
  const kept = { glucose: [] as string[], eye: [] as string[], review: [] as string[] };
  const keep = (section: keyof typeof kept, header: string, note: string | null) => {
    if (note) kept[section].push(`${header} (as written on the sheet): ${note}`);
  };
  /** A value with no obvious Nkwapa equivalent is stored blank and its words kept, never rejected. */
  const soft = <T>(
    table: Readonly<Record<string, T>>,
    section: keyof typeof kept,
    row: TabRow,
    header: string,
  ): T | undefined => {
    try {
      return L.label(table, header, row[header] ?? '');
    } catch {
      keep(section, header, row[header]);
      return undefined;
    }
  };
  const num = (tab: string, row: TabRow, header: string, integer = false): number | null => {
    const raw = (row[header] ?? '').trim();
    if (!raw) return null;
    const value = Number(raw.replace(',', '.'));
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
      issues.push(`${tab} "${header}" is not ${integer ? 'a whole number' : 'a number'}: "${raw}"`);
      return null;
    }
    return value;
  };
  const time = (tab: string, row: TabRow, header = 'Time'): Date | null => {
    const raw = (row[header] ?? '').trim();
    if (!raw) return null;
    const at = atTime(sessionDate, raw);
    if (!at) issues.push(`${tab} "${header}" is not a time: "${raw}"`);
    return at;
  };
  const byline = (row: TabRow, header: string) =>
    row[header]
      ? `Recorded on the ${sessionDate} screening sheet by ${row[header]}.`
      : `Recorded on the ${sessionDate} screening sheet.`;
  const join = (...parts: Array<string | null | undefined | false>) =>
    parts.filter((p): p is string => Boolean(p && p.trim())).join('\n');

  // ---- Check-In → Patient
  const firstName = checkIn['First name'];
  const lastName = checkIn['Last name'];
  if (!lastName) issues.push('Check-In "Last name" is blank');

  let dob: Date | undefined;
  let partialDob: string | null = null;
  if (checkIn['Date of birth']) {
    dob = parseDate(checkIn['Date of birth']) ?? undefined;
    // "1980" or "March 1980" is part of a date: kept as written, never padded into a full one.
    if (!dob && /^([a-z]{3,}\.?,?\s+)?\d{4}$/i.test(checkIn['Date of birth'])) {
      partialDob = checkIn['Date of birth'];
    } else if (!dob) {
      issues.push(`Check-In "Date of birth" is not a date: "${checkIn['Date of birth']}"`);
    }
  }
  const age = num('Check-In', checkIn, 'Age (yrs)');

  const idNumber = checkIn['ID number'];
  let nationalIdType: NationalIdType | undefined = pick(L.ID_TYPE, 'Check-In', checkIn, 'ID type');
  // A Ghana Card number has one shape (GHA-#########-#), so the card is known from the number.
  if (!checkIn['ID type'] && /^GHA-?\d{9}-?\d$/i.test(idNumber)) {
    nationalIdType = 'NATIONAL_ID';
    warnings.push('No ID type; the number is a Ghana Card number');
  }
  if (nationalIdType === 'NONE' && idNumber) {
    issues.push('Check-In "ID type" is None but an ID number is filled in');
  } else if (!nationalIdType && idNumber) {
    issues.push('Check-In has an ID number but no ID type');
  } else if (nationalIdType && nationalIdType !== 'NONE' && !idNumber) {
    warnings.push(`ID type is ${checkIn['ID type']} but the number is blank; imported as no ID`);
    nationalIdType = 'NONE';
  } else if (!nationalIdType) {
    nationalIdType = 'NONE';
  }

  const returningCode = checkIn['Nkwapa code (returning)'].toUpperCase() || null;
  if (returningCode && !/^NKP-\d{4}-\d{6}$/.test(returningCode)) {
    issues.push(
      `Check-In "Nkwapa code (returning)" is not an NKP-YYYY-###### code: "${returningCode}"`,
    );
  }

  const region = pick(L.REGION, 'Check-In', checkIn, 'Region');
  // Volunteers typed the patient's sex into "Status" on most rows; the visit status itself was
  // never recorded. A sex there is used only where "Sex" is blank, and the visit counts as done.
  const statusAsSex = (() => {
    try {
      return L.label(L.SEX, 'Status', checkIn.Status);
    } catch {
      return undefined;
    }
  })();
  const patient: PatientPlan['patient'] = {
    firstName,
    lastName,
    dob,
    sex: pick(L.SEX, 'Check-In', checkIn, 'Sex') ?? statusAsSex,
    phoneE164: checkIn.Phone || undefined,
    nationalIdType: nationalIdType ?? 'NONE',
    nationalId: nationalIdType === 'NONE' ? '' : idNumber,
    ...(region || checkIn.District || checkIn['Community / town']
      ? {
          residentialRegion: region,
          residentialDistrict: checkIn.District || undefined,
          residentialCommunity: checkIn['Community / town'] || undefined,
        }
      : {}),
  };
  const consent = pick(L.CONSENT, 'Check-In', checkIn, 'Research consent') === true;

  // ---- Check-In → PatientCheckIn
  const status = statusAsSex
    ? 'COMPLETED'
    : (pick(L.CHECK_IN_STATUS, 'Check-In', checkIn, 'Status') ?? 'COMPLETED');
  const stationTimes = [intake, bp, glucose, body, eye, review]
    .map((row) => (row.Time ? atTime(sessionDate, row.Time) : null))
    .filter((t): t is Date => t !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  let checkedInAt = time('Check-In', checkIn, 'Arrived');
  let arrivalNote: string | null = null;
  if (!checkedInAt && !issues.some((i) => i.includes('"Arrived"'))) {
    checkedInAt = stationTimes[0] ?? atTime(sessionDate, '00:00');
    arrivalNote = stationTimes[0]
      ? 'Arrival time not recorded; the first station time is used.'
      : 'Arrival time not recorded; the visit is dated the start of the day.';
    warnings.push(
      stationTimes[0]
        ? 'No arrival time; used the first station time'
        : 'No arrival time or station times; used the start of the day',
    );
  }
  const mainConcern = intake['Main concern today'];
  const checkInNotes = join(
    checkIn.Notes,
    mainConcern && `Main concern: ${mainConcern}`,
    arrivalNote,
    partialDob && `Date of birth as written on the sheet: ${partialDob}.`,
    !dob && age !== null && `Age given at screening: ${age} years (no full date of birth).`,
    !statusAsSex &&
      checkIn.Status &&
      checkIn.Status !== 'Completed' &&
      `Status on the sheet: ${checkIn.Status}.`,
    `Imported from the ${sessionDate} screening sheet, visit ${visitId}.${checkIn['Checked in by'] ? ` Checked in by ${checkIn['Checked in by']}.` : ''}`,
  );

  // ---- 1 Intake + 2 Blood Pressure → HypertensionAssessment, TobaccoScreening
  const intakeAt = time('1 Intake', intake);
  const bpAt = time('2 Blood Pressure', bp);
  const sys1 = num('2 Blood Pressure', bp, 'Systolic 1', true);
  const dia1 = num('2 Blood Pressure', bp, 'Diastolic 1', true);
  const sys2 = num('2 Blood Pressure', bp, 'Systolic 2', true);
  const dia2 = num('2 Blood Pressure', bp, 'Diastolic 2', true);
  const pulse2 = num('2 Blood Pressure', bp, 'Pulse 2', true);
  let bpSite = pick(L.ARM, '2 Blood Pressure', bp, 'Arm');
  const position = pick(L.POSITION, '2 Blood Pressure', bp, 'Position');
  // A cuff written as its range in cm ("22-42") is recorded as exactly that.
  const cuffRange = /^(\d{2})\s*-+\s*(\d{2})(\s*cm)?$/i.exec(bp['Cuff size']);
  const cuff = cuffRange ? 'OTHER' : pick(L.CUFF, '2 Blood Pressure', bp, 'Cuff size');
  if (sys1 !== null && !bpSite) {
    warnings.push('BP recorded without the arm; stored as "Other: not recorded"');
    bpSite = 'OTHER';
  }
  const otherNote = (value: string | undefined, sheet: string) =>
    value === 'OTHER'
      ? sheet === 'Other'
        ? 'Other (screening sheet)'
        : 'Not recorded on the screening sheet'
      : null;

  const htnStatus = pick(L.HYPERTENSION_STATUS, '1 Intake', intake, 'Known high BP?');
  const pregnant = pick(L.PREGNANT, '1 Intake', intake, 'Pregnant?');
  const hasRepeat = sys2 !== null || dia2 !== null;
  const hypertension =
    hasEntries(intake) || hasEntries(bp)
      ? {
          hypertensionStatus: htnStatus ?? 'NOT_ASSESSED',
          yearDiagnosed: null,
          yearDiagnosedUnknown: false,
          mainConcern: 'NOT_ASSESSED',
          mainConcernOther: null,
          usualCareFacility: null,
          usualCareFacilityStatus: 'NOT_ASSESSED',
          repeatPerformed: hasRepeat ? 'YES' : 'NOT_ASSESSED',
          repeatSystolicBp: sys2,
          repeatDiastolicBp: dia2,
          repeatPosition: hasRepeat ? (position ?? null) : null,
          // The repeat reading has no "other" text, so a cuff range is only on Vitals.
          repeatCuffSize: hasRepeat && cuff !== 'OTHER' ? (cuff ?? null) : null,
          repeatMeasuredAt: hasRepeat && bpAt ? bpAt.toISOString() : null,
          repeatPromptShown: false,
          homeMonitorStatus: 'NOT_ASSESSED',
          homeCheckFrequency: 'NOT_ASSESSED',
          homeSystolicAvg: null,
          homeDiastolicAvg: null,
          homeReadingsUnknown: false,
          homeReadingSource: 'NOT_ASSESSED',
          currentSymptoms: [],
          medicationReminderStrategies: [],
          reminderStrategyOther: null,
          contributingSubstances: [],
          relevantConditions: [],
          pregnantNow: pregnant ?? 'NOT_ASSESSED',
          planningPregnancy: 'NOT_ASSESSED',
          kidneyFunctionTesting: 'NOT_ASSESSED',
          urineProteinTesting: 'NOT_ASSESSED',
          cholesterolTesting: 'NOT_ASSESSED',
          ecgCompleted: 'NOT_ASSESSED',
          statinUse: 'NOT_ASSESSED',
          aspirinUse: 'NOT_ASSESSED',
          clinicianReviewRequested: false,
          reviewReasons: [],
          reviewReasonOther: null,
          // What the encounter form sends; an omitted value is stored as JSON null and fails the table's check.
          volunteerActions: { selected: [] },
          classificationOverridden: false,
          suspected: false,
          confirmed: false,
          notes: join(
            mainConcern && `Main concern: ${mainConcern}`,
            hasRepeat && pulse2 !== null && `Second reading pulse: ${pulse2} bpm.`,
            hasEntries(intake) &&
              byline(intake, 'Recorded by').replace('Recorded', 'Intake recorded'),
            hasEntries(bp) &&
              byline(bp, 'Recorded by').replace('Recorded', 'Blood pressure recorded'),
          ),
          collectedAt: (bpAt ?? intakeAt ?? checkedInAt ?? new Date(0)).toISOString(),
        }
      : null;

  const tobaccoAnswers = {
    smokingStatus: pick(L.TOBACCO, '1 Intake', intake, 'Smoking'),
    smokelessTobaccoStatus: pick(L.TOBACCO, '1 Intake', intake, 'Smokeless tobacco'),
    passiveExposure: pick(L.SCREENING_YES_NO, '1 Intake', intake, 'Second-hand smoke'),
    readinessToQuit: pick(L.QUIT, '1 Intake', intake, 'Ready to quit?'),
  };
  const tobacco = Object.values(tobaccoAnswers).some(Boolean)
    ? {
        smokingStatus: tobaccoAnswers.smokingStatus ?? 'NOT_ASSESSED',
        smokelessTobaccoStatus: tobaccoAnswers.smokelessTobaccoStatus ?? 'NOT_ASSESSED',
        passiveExposure: tobaccoAnswers.passiveExposure ?? 'NOT_ASSESSED',
        readinessToQuit: tobaccoAnswers.readinessToQuit ?? 'NOT_ASSESSED',
        counselingGiven: 'NOT_ASSESSED',
      }
    : undefined;

  // ---- 2 Blood Pressure + 4 Body & Vitals → Vitals
  const temp = num('4 Body & Vitals', body, 'Temp (°C)');
  const waist = num('4 Body & Vitals', body, 'Waist (cm)');
  const vitalsInput = {
    systolicBp: sys1,
    diastolicBp: dia1,
    bpSite: sys1 !== null ? (bpSite ?? null) : null,
    bpSiteOther: sys1 !== null ? otherNote(bpSite, bp.Arm) : null,
    patientPosition: sys1 !== null ? (position ?? null) : null,
    patientPositionOther: null,
    cuffSize: sys1 !== null ? (cuff ?? null) : null,
    cuffSizeOther:
      sys1 === null
        ? null
        : cuffRange
          ? `${cuffRange[1]}-${cuffRange[2]} cm cuff`
          : otherNote(cuff, bp['Cuff size']),
    pulseBpm: num('2 Blood Pressure', bp, 'Pulse 1', true),
    temperatureValue: temp,
    temperatureUnit: temp !== null ? 'CELSIUS' : null,
    temperatureSource: temp !== null ? 'OTHER' : null,
    temperatureSourceOther: temp !== null ? 'Not recorded on the screening sheet' : null,
    respiratoryRate: num('4 Body & Vitals', body, 'Resp. rate', true),
    spo2Percent: num('4 Body & Vitals', body, 'SpO₂ (%)', true),
    weightKg: num('4 Body & Vitals', body, 'Weight (kg)'),
    heightCm: num('4 Body & Vitals', body, 'Height (cm)'),
    notes:
      join(
        bp.Notes && `Blood pressure: ${bp.Notes}`,
        waist !== null && `Waist circumference: ${waist} cm.`,
        body.Notes && `Body & vitals: ${body.Notes}`,
        hasEntries(bp) && byline(bp, 'Recorded by').replace('Recorded', 'Blood pressure recorded'),
        hasEntries(body) &&
          byline(body, 'Recorded by').replace('Recorded', 'Body & vitals recorded'),
      ) || null,
  };
  const vitals =
    hasEntries(bp) || hasEntries(body) || tobacco
      ? {
          schemaVersion: 1,
          encounterId: '', // filled in once the encounter exists
          vitalsId: id('vitals'),
          vitals: vitalsInput,
          ...(tobacco ? { tobaccoScreeningId: id('tobacco'), tobacco } : {}),
        }
      : null;

  // ---- 3 Glucose → DiabetesScreening
  const glucoseAt = time('3 Glucose', glucose);
  const symptomAnswers: Array<[string, string]> = [
    ['Frequent urination', 'POLYURIA'],
    ['Excess thirst', 'POLYDIPSIA'],
    ['Weight loss (unexplained)', 'WEIGHT_LOSS'],
    ['Blurred vision', 'BLURRED_VISION'],
  ];
  const said = (header: string) => {
    const a = L.answer(glucose[header]);
    keep('glucose', header, a.note);
    return a.value;
  };
  const symptoms = symptomAnswers.filter(([header]) => said(header) === true).map(([, v]) => v);
  const slowWounds = said('Slow-healing wounds');
  const numbFeet = said('Numb / tingling feet');
  const allSymptomsAnswered = [
    ...symptomAnswers.map(([h]) => h),
    'Slow-healing wounds',
    'Numb / tingling feet',
  ].every((h) => L.answer(glucose[h]).value !== undefined);
  const footWound = said('Foot wound now?');
  const dmStatus = pick(L.DIABETES_STATUS, '1 Intake', intake, 'Known diabetes?');
  const glucoseType = soft(L.GLUCOSE_TYPE, 'glucose', glucose, 'Test type');
  let glucoseValue = num('3 Glucose', glucose, 'Glucose (mg/dL)', true);
  // The meters read mmol/L, and volunteers typed the reading over the grey mmol/L formula instead
  // of converting it. Converted the way the sheet told them to: × 18.
  if (glucoseValue === null && glucose['mmol/L']) {
    const m = /^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?$/.exec(glucose['mmol/L']);
    if (!m) {
      issues.push(`3 Glucose "mmol/L" is not a reading: "${glucose['mmol/L']}"`);
    } else {
      glucoseValue = Math.round(Number(m[1].replace(',', '.')) * 18);
      kept.glucose.push(
        m[2]
          ? `Two readings written on the sheet: ${glucose['mmol/L']} mmol/L; the first is stored (${glucoseValue} mg/dL).`
          : `Reading written on the sheet: ${glucose['mmol/L']} mmol/L (stored as ${glucoseValue} mg/dL).`,
      );
    }
  }
  const diabetes =
    hasEntries(glucose) || dmStatus
      ? {
          glucoseMgDl: glucoseValue,
          glucoseType: glucoseType ?? 'UNKNOWN',
          hba1cPercent: null,
          volunteerActions: { selected: [] },
          symptoms:
            symptoms.length === 0 && allSymptomsAnswered && !slowWounds && !numbFeet
              ? ['NONE']
              : symptoms,
          notes:
            join(
              slowWounds && 'Reports slow-healing wounds.',
              numbFeet && 'Reports numb or tingling feet.',
              ...kept.glucose,
              glucose['Last ate (time)'] && `Last ate at ${glucose['Last ate (time)']}.`,
              glucose.Notes,
              hasEntries(glucose) && byline(glucose, 'Recorded by'),
            ) || null,
          collectedAt: (glucoseAt ?? intakeAt ?? checkedInAt ?? new Date(0)).toISOString(),
          ...(dmStatus ? { diabetesStatus: dmStatus } : {}),
          ...(footWound !== undefined ? { currentFootWound: footWound ? 'YES' : 'NO' } : {}),
        }
      : null;
  if (glucoseValue !== null && !glucoseType)
    warnings.push('Glucose recorded without a test type; stored as Unknown');

  // ---- 5 Eye → EyeScreening
  let eyeScreening: Record<string, unknown> | null = null;
  if (hasEntries(eye)) {
    const yn = (header: string, read: typeof L.answer = L.answer) => {
      const a = read(eye[header]);
      keep('eye', header, a.note);
      if (a.value === undefined) {
        if (!eye[header]) kept.eye.push(`${header}: not recorded on the sheet (stored as No).`);
        warnings.push(
          `5 Eye "${header}" ${eye[header] ? 'is not a yes or no' : 'is blank'}; stored as No`,
        );
      }
      return a.value ?? false;
    };
    // The complaint itself was often written in "Eye complaint?".
    const complaintFlag = L.flag(eye['Eye complaint?']);
    const complaint = complaintFlag.value ?? false;
    if (complaintFlag.value === undefined)
      kept.eye.push('Eye complaint?: not recorded on the sheet (stored as No).');
    if (complaintFlag.value === undefined)
      warnings.push('5 Eye "Eye complaint?" is blank; stored as No');
    const complaintText = join(complaintFlag.note, eye['Complaint details']);
    const referral = yn('Referral?');
    const va = (header: string) => {
      const a = L.acuity(eye[header]);
      keep('eye', header, a.note);
      return a.value;
    };
    eyeScreening = {
      hasEyeComplaint: complaint,
      complaintHistory: complaint ? complaintText || null : null,
      wearsCorrection: yn('Wears glasses?'),
      vaOdUnaided: va('VA right (OD) unaided'),
      vaOsUnaided: va('VA left (OS) unaided'),
      vaOuUnaided: va('VA both (OU) unaided'),
      vaOdAided: va('VA right with glasses'),
      vaOsAided: va('VA left with glasses'),
      vaOdPinhole: va('VA right pinhole'),
      vaOsPinhole: va('VA left pinhole'),
      cupDiscRatioOd: num('5 Eye', eye, 'Cup:disc right'),
      cupDiscRatioOs: num('5 Eye', eye, 'Cup:disc left'),
      findings: [],
      visionLossCause: soft(L.VISION_CAUSE, 'eye', eye, 'Likely cause of reduced vision') ?? null,
      diabeticSignsSeen: yn('Diabetic signs?', L.flag),
      hypertensiveSignsSeen: yn('Hypertensive signs?', L.flag),
      referralRecommended: referral,
      referralNote: referral ? eye['Referral note'] || null : null,
      notes:
        join(
          !complaint && complaintText && `Complaint details: ${complaintText}`,
          ...kept.eye,
          eye['Abnormal findings (eye + structure)'] &&
            `Abnormal findings (as written on the sheet): ${eye['Abnormal findings (eye + structure)']}`,
          !referral && eye['Referral note'] && `Referral note: ${eye['Referral note']}`,
          eye.Notes,
          byline(eye, 'Examined by').replace('Recorded', 'Examined'),
        ) || null,
    };
  }

  // ---- 6 Review → CounsellingRecord
  let counselling: Record<string, unknown> | null = null;
  const medicinesGiven = review['Medicines prescribed / given'] || null;
  if (hasEntries(review)) {
    const ticks: Array<[string, string]> = [
      ['BP', 'BLOOD_PRESSURE'],
      ['Diabetes', 'GLUCOSE_DIABETES'],
      ['Weight & diet', 'WEIGHT_NUTRITION'],
      ['Activity', 'PHYSICAL_ACTIVITY'],
      ['Tobacco', 'TOBACCO'],
      ['Alcohol', 'ALCOHOL'],
      ['Medicines', 'MEDICATION_ADHERENCE'],
    ];
    // The topic boxes were mostly used to write what was discussed ("108/67" under BP).
    const discussed: string[] = [];
    const topics = ticks
      .filter(([h]) => {
        const f = L.flag(review[h]);
        if (f.note) discussed.push(`${h}: ${f.note}`);
        return f.value === true;
      })
      .map(([, t]) => t);
    if (review['Other topic']) topics.push('OTHER');

    const followUpFlag = L.flag(review['Follow-up?']);
    keep('review', 'Follow-up?', followUpFlag.note);
    let followUp = followUpFlag.value ?? false;
    let followUpWindow: string = 'NOT_ASSESSED';
    let followUpOther: string | null = null;
    if (review['Follow-up when']) {
      try {
        followUpWindow =
          L.label(L.FOLLOW_UP, 'Follow-up when', review['Follow-up when']) ?? 'NOT_ASSESSED';
        if (followUpWindow === 'OTHER') followUpOther = 'Other (screening sheet)';
      } catch {
        // Any other timing ("2 weeks", "At clinic") is kept word for word.
        followUpWindow = 'OTHER';
        followUpOther = review['Follow-up when'];
      }
    }
    const extra: string[] = [];
    if (!followUp && followUpFlag.value === undefined && followUpWindow !== 'NOT_ASSESSED') {
      warnings.push(
        'Follow-up timing given with "Follow-up?" blank; recorded as follow-up recommended',
      );
      followUp = true;
    }
    if (followUp && followUpWindow === 'NOT_ASSESSED') {
      warnings.push('Follow-up recommended without a timing; stored as Other: not recorded');
      followUpWindow = 'OTHER';
      followUpOther = 'Timing not recorded on the screening sheet';
    } else if (followUpWindow === 'OTHER' && !followUpOther) {
      followUpOther = 'Other (screening sheet)';
    } else if (!followUp && followUpWindow !== 'NOT_ASSESSED') {
      warnings.push(
        'Follow-up timing given without "Follow-up? Yes"; kept in the advice text only',
      );
      extra.push(`Follow-up timing on the sheet: ${review['Follow-up when']}.`);
      followUpWindow = 'NOT_ASSESSED';
    }

    const referralFlag = L.flag(review['Referral?']);
    keep('review', 'Referral?', referralFlag.note);
    const referral = referralFlag.value ?? false;
    const urgency = soft(L.URGENCY, 'review', review, 'Urgency');
    let referralTo = review['Referred to'] || null;
    if (referral && !referralTo) {
      warnings.push('Referral recommended without a destination; stored as not recorded');
      referralTo = 'Not recorded on the screening sheet';
    }
    if (!referral && (review['Referred to'] || review['Referral reason'] || urgency)) {
      warnings.push('Referral details given without "Referral? Yes"; kept in the advice text only');
      extra.push(
        join(
          review['Referred to'] && `Referred to (sheet): ${review['Referred to']}`,
          review['Referral reason'] && `Referral reason (sheet): ${review['Referral reason']}`,
          urgency && `Urgency (sheet): ${review.Urgency}`,
        ),
      );
    }

    counselling = {
      topics,
      topicOther: review['Other topic'] || null,
      adviceGiven: join(
        review['Advice given'],
        medicinesGiven &&
          `Medicines prescribed or given on the day (not recorded as Nkwapa prescriptions): ${medicinesGiven}`,
        discussed.length > 0 && `Discussed:\n${discussed.join('\n')}`,
        ...extra,
        ...kept.review,
        review.Notes && `Notes: ${review.Notes}`,
        byline(review, 'Reviewed by').replace('Recorded', 'Reviewed'),
      ),
      followUpRecommended: followUp,
      followUpWindow,
      followUpOther,
      referralRecommended: referral,
      referralTo: referral ? referralTo : null,
      referralReason: referral ? review['Referral reason'] || referralFlag.note || null : null,
      referralUrgency: referral ? (urgency ?? null) : null,
    };
  }

  // ---- 1 Intake → MedicalHistoryRecord, PatientMedicationRecord
  const historyNote = byline(intake, 'Recorded by');
  const history: Array<Record<string, unknown>> = [];
  splitList(intake['Other conditions']).forEach((conditionName, i) =>
    history.push({
      category: 'CONDITION',
      status: 'ACTIVE',
      details: { conditionName },
      notes: historyNote,
      recordId: id(`condition:${i}`),
    }),
  );
  if (intake.Allergies) {
    const allergies = splitList(intake.Allergies);
    if (allergies.length === 0) {
      history.push({
        category: 'ALLERGY',
        status: 'ACTIVE',
        details: { kind: 'NO_KNOWN_ALLERGIES' },
        notes: historyNote,
        recordId: id('allergy:none'),
      });
    }
    allergies.forEach((substance, i) =>
      history.push({
        category: 'ALLERGY',
        status: 'ACTIVE',
        details: { kind: 'ALLERGY', substance, severity: 'UNKNOWN' },
        notes: historyNote,
        recordId: id(`allergy:${i}`),
      }),
    );
  }
  const family = intake['Family history (BP, diabetes, stroke, heart)'];
  if (family && !isNone(family)) {
    history.push({
      category: 'FAMILY_HISTORY',
      status: 'ACTIVE',
      details: { relationship: 'Not recorded', familyCondition: family },
      notes: historyNote,
      recordId: id('family'),
    });
  }
  const alcohol = pick(L.ALCOHOL, '1 Intake', intake, 'Alcohol');
  if (alcohol) {
    history.push({
      category: 'SOCIAL_HISTORY',
      status: 'ACTIVE',
      details: { socialType: 'ALCOHOL', description: alcohol },
      notes: historyNote,
      recordId: id('alcohol'),
    });
  }

  const adherence = pick(L.ADHERENCE, '1 Intake', intake, 'Takes medicines as prescribed?');
  const medicines = splitList(intake['Current medicines']);
  if (adherence === 'Not on medication' && medicines.length > 0) {
    warnings.push('"Not on medication" but current medicines are listed; both kept');
  }
  const medications = medicines.map((medicationName, i) => ({
    medicationName,
    status: 'CURRENT',
    sourceType: 'PATIENT_REPORTED',
    notes: join(
      adherence && `Adherence (asked once for all medicines): ${adherence}.`,
      historyNote,
    ),
    recordId: id(`medication:${i}`),
  }));

  if (issues.length > 0) throw new RowRejectedError(visitId, issues);

  const anyStation = Boolean(
    hypertension ||
    vitals ||
    diabetes ||
    eyeScreening ||
    counselling ||
    history.length ||
    medications.length,
  );
  return {
    visitId,
    requestId: `screening-import-${sessionDate}-${visitId}`,
    patient,
    returningCode,
    consent,
    checkIn: { id: id('check-in'), checkedInAt: checkedInAt as Date, status, notes: checkInNotes },
    encounter: anyStation
      ? { vitals, hypertension, diabetes, eye: eyeScreening, counselling, history, medications }
      : null,
    medicinesGiven,
    warnings,
  };
}

/** `hh:mm` (or `h:mm:ss`, or with AM/PM, as Sheets may export it) on the session date. */
export function atTime(sessionDate: string, raw: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(raw.trim());
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const ampm = m[4]?.toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  // Ghana is UTC+0 all year, so a clinic wall-clock time is a UTC time.
  const at = new Date(`${sessionDate}T${String(hours).padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/**
 * dd/mm/yyyy (the sheet's format), yyyy-mm-dd, or written out ("2 April 1984", "15th March 1977",
 * "1st Jan, 1972"); a real calendar date only.
 */
export function parseDate(raw: string): Date | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?\s*(\d{4})$/i.exec(text);
  const monthFirst = /^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})$/i.exec(text);
  const words = dayFirst ?? (monthFirst && [text, monthFirst[2], monthFirst[1], monthFirst[3]]);
  // A month name or its abbreviation ("Sept", "Jan"), never a guess at a misspelling.
  const month = words ? MONTHS.findIndex((m) => m.startsWith(words[2].toLowerCase())) + 1 : 0;
  const [y, mo, d] = dmy
    ? [dmy[3], dmy[2], dmy[1]]
    : ymd
      ? [ymd[1], ymd[2], ymd[3]]
      : month > 0 && words
        ? [words[3], String(month), words[1]]
        : [];
  if (!y) return null;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return date.getUTCDate() === Number(d) && date.getUTCMonth() === Number(mo) - 1 ? date : null;
}
