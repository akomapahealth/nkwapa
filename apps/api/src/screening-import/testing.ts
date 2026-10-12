import { TABS, type SheetPatient, type TabKey, type TabRow } from './read-sheet';

/** A synthetic screening-sheet patient for tests. Never real sheet data. */
export function sheetPatient(
  visitId: string,
  values: Partial<Record<TabKey, Record<string, string>>> = {},
): SheetPatient {
  const tabs = Object.fromEntries(
    (Object.keys(TABS) as TabKey[]).map((key) => {
      const row: TabRow = Object.fromEntries(TABS[key].headers.map((h) => [h, '']));
      row['Visit ID'] = visitId;
      for (const [h, v] of Object.entries(values[key] ?? {})) {
        if (!(h in row)) throw new Error(`${key} has no column "${h}"`);
        row[h] = v;
      }
      return [key, row];
    }),
  ) as Record<TabKey, TabRow>;
  return { visitId, tabs };
}

/** A patient who went through every station, with every dropdown answered. */
export function fullVisit(visitId = 'V-001'): SheetPatient {
  return sheetPatient(visitId, {
    checkIn: {
      Arrived: '08:15',
      'First name': 'Ama',
      'Last name': 'Mensah',
      Sex: 'Female',
      'Date of birth': '14/03/1968',
      Phone: '024 123 4567',
      'ID type': 'Ghana Card',
      'ID number': 'GHA-000000001-1',
      Region: 'Greater Accra',
      District: 'Accra Metropolitan',
      'Community / town': 'Jamestown',
      'Research consent': 'Yes',
      'Checked in by': 'Kofi A.',
      'Current station': 'Done',
      Status: 'Completed',
    },
    intake: {
      'Known high BP?': 'Yes',
      'Known diabetes?': 'No',
      'Other conditions': 'Asthma; arthritis',
      'Current medicines': 'Amlodipine 5mg, Paracetamol',
      'Takes medicines as prescribed?': 'Sometimes misses',
      Allergies: 'None',
      'Family history (BP, diabetes, stroke, heart)': 'Mother had a stroke',
      Smoking: 'Never',
      'Smokeless tobacco': 'Never',
      'Second-hand smoke': 'No',
      'Ready to quit?': 'Not applicable',
      Alcohol: 'Occasional',
      'Pregnant?': 'Not applicable',
      'Main concern today': 'Headaches',
      'Recorded by': 'Esi B.',
      Time: '08:30',
    },
    bp: {
      'Systolic 1': '152',
      'Diastolic 1': '94',
      'Pulse 1': '78',
      'Systolic 2': '148',
      'Diastolic 2': '92',
      'Pulse 2': '76',
      Arm: 'Left arm',
      Position: 'Sitting',
      'Cuff size': 'Adult',
      'Avg systolic': '150',
      'Avg diastolic': '93',
      Category: 'Stage 2',
      'Recorded by': 'Yaw C.',
      Time: '08:45',
    },
    glucose: {
      'Glucose (mg/dL)': '132',
      'Test type': 'Fasting (8h+)',
      'Frequent urination': 'No',
      'Excess thirst': 'Yes',
      'Weight loss (unexplained)': 'No',
      'Blurred vision': 'No',
      'Slow-healing wounds': 'No',
      'Numb / tingling feet': 'Yes',
      'Foot wound now?': 'No',
      Result: 'Suspected diabetes',
      'Recorded by': 'Yaw C.',
      Time: '09:00',
    },
    body: {
      'Weight (kg)': '78',
      'Height (cm)': '162',
      BMI: '29.7',
      'Waist (cm)': '96',
      'Temp (°C)': '36.6',
      'SpO₂ (%)': '98',
      'Resp. rate': '16',
      'Recorded by': 'Abena D.',
      Time: '09:10',
    },
    eye: {
      'Eye complaint?': 'Yes',
      'Complaint details': 'Blurry when reading',
      'Wears glasses?': 'No',
      'VA right (OD) unaided': '6/12',
      'VA left (OS) unaided': '6/9',
      'Abnormal findings (eye + structure)': 'Right lens: early cataract',
      'Likely cause of reduced vision': 'Refractive (glasses)',
      'Diabetic signs?': 'No',
      'Hypertensive signs?': 'No',
      'Referral?': 'No',
      'Examined by': 'Dr. Owusu',
      Time: '09:30',
    },
    review: {
      BP: 'Yes',
      Diabetes: 'Yes',
      'Weight & diet': 'Yes',
      'Advice given': 'Reduce salt; walk daily.',
      'Follow-up?': 'Yes',
      'Follow-up when': 'Within 1 month',
      'Referral?': 'Yes',
      'Referred to': 'Korle Bu polyclinic',
      'Referral reason': 'Fasting glucose 132',
      Urgency: 'Soon',
      'Medicines prescribed / given': 'Amlodipine 5mg daily x 30',
      'Reviewed by': 'Dr. Owusu',
      Time: '09:50',
    },
  });
}
