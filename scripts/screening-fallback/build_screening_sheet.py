"""Builds the Nkwapa screening-day fallback workbook (uploaded to Drive as a Google Sheet)."""
import sys
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROWS = 150  # pre-numbered patient visits
OUT = sys.argv[1]

# Nkwapa palette (apps/web/app/globals.css)
TEAL, TEAL_DARK, INK = "00778A", "005766", "1D2B30"
CREAM, SAND, MIST, LINE = "FCFBF1", "F7F1DC", "EEF4F5", "D9E3E5"
AUTO_HEAD, AUTO_BODY = "5B7A82", "F1F5F6"
RED, RED_BG, ORANGE_BG, AMBER_BG, YELLOW_BG = "B42318", "FDE7E5", "FDEBD8", "FFF4D6", "FEF9E1"
GREEN, GREEN_BG, BLUE_BG, GREY_BG = "0F7B4A", "E3F4EA", "E3EEFB", "ECEEEF"
FONT = "Roboto"

def font(**kw):
    kw.setdefault("name", FONT)
    kw.setdefault("color", INK)
    kw.setdefault("size", 10)
    return Font(**kw)

def fill(c):
    return PatternFill("solid", start_color=c, end_color=c)

thin = Side(style="thin", color=LINE)
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

def q(name):
    return f"'{name}'" if any(ch in name for ch in " -&") else name

# ---------------------------------------------------------------- dropdown lists
LISTS = {
    "YesNo": ["Yes", "No"],
    "YesNoUnsure": ["Yes", "No", "Unsure"],
    "Sex": ["Female", "Male", "Other", "Unknown"],
    "IdType": ["Ghana Card", "Voter ID", "Passport", "Other", "None"],
    "Region": ["Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra",
               "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta",
               "Western", "Western North"],
    "Station": ["Check-in", "1 Intake & history", "2 Blood pressure", "3 Glucose",
                "4 Body & vitals", "5 Eye", "6 Counselling & review", "Done"],
    "Status": ["Waiting", "In progress", "Completed", "Left before finishing"],
    "Role": ["Student volunteer", "Nurse", "Doctor", "Eye team", "Coordinator", "Other"],
    "Tobacco": ["Never", "Former", "Current - occasional", "Current - daily"],
    "Quit": ["Not ready", "Considering", "Ready", "Not applicable"],
    "Alcohol": ["None", "Occasional", "Weekly", "Daily"],
    "Adherence": ["Always", "Sometimes misses", "Often misses", "Not on medication"],
    "Pregnant": ["Yes", "No", "Unsure", "Not applicable"],
    "Arm": ["Left arm", "Right arm", "Other"],
    "Position": ["Sitting", "Standing", "Lying down"],
    "Cuff": ["Small adult", "Adult", "Large adult", "Thigh", "Other"],
    "GlucoseType": ["Fasting (8h+)", "Before meal", "2h after meal", "Random", "Unknown"],
    "Acuity": ["6/5", "6/6", "6/7.5", "6/9", "6/12", "6/18", "6/24", "6/36", "6/60", "CF", "HM",
               "PL", "NPL"],
    "VisionCause": ["Refractive (glasses)", "Pathological (doctor)", "Undetermined"],
    "FollowUp": ["Today", "Within 1 week", "Within 1 month", "Within 3 months", "Other"],
    "Urgency": ["Routine", "Soon", "Urgent"],
    "Tick": ["Yes"],
}

# ---------------------------------------------------------------- tab specs
# Column: (header, width, kind, db_field, note)
#   kind: "id" | "text" | "num" | "date" | "time" | "list:<Name>" | "vol" | "auto:<formula with {r}>"
CHECKIN = "Check-In"
name_lookup = f"auto:=IFERROR(INDEX({q(CHECKIN)}!$E:$E,MATCH($A{{r}},{q(CHECKIN)}!$A:$A,0)),\"\")"

TABS = {}
TABS[CHECKIN] = dict(color=TEAL, cols=[
    ("Visit ID", 10, "id", "PatientCheckIn (sheet key)", "Pre-numbered. One row = one patient for the whole day. Write this number on the patient's card."),
    ("Arrived", 9, "time", "PatientCheckIn.checkedInAt", "Time. Shortcut: Ctrl+Shift+; (Cmd+Shift+; on Mac)."),
    ("First name", 14, "text", "Patient.firstName", None),
    ("Last name", 14, "text", "Patient.lastName", None),
    ("Full name", 20, "auto:=TRIM(C{r}&\" \"&D{r})", "(derived)", "Automatic. Used by every other tab."),
    ("Sex", 9, "list:Sex", "Patient.sex", None),
    ("Date of birth", 12, "date", "Patient.dob", "DD/MM/YYYY if known."),
    ("Age (yrs)", 8, "num", "(derived from dob)", "Type the age if the date of birth is not known."),
    ("Phone", 15, "text", "Patient.phoneE164", "e.g. 024 123 4567"),
    ("ID type", 11, "list:IdType", "Patient.nationalIdType", None),
    ("ID number", 17, "text", "Patient.nationalIdCiphertext / Hash", "Needed to create the Nkwapa record later. Sensitive: never copy it anywhere else."),
    ("Region", 13, "list:Region", "Patient.residentialRegion", None),
    ("District", 16, "text", "Patient.residentialDistrict", None),
    ("Community / town", 16, "text", "Patient.residentialCommunity", None),
    ("Research consent", 10, "list:YesNo", "PatientConsent (RESEARCH_DEIDENTIFIED)", "Read the consent script on Start Here first."),
    ("Nkwapa code (returning)", 15, "text", "Patient.patientCode", "Only if the patient already has an NKP-… code."),
    ("Checked in by", 16, "vol", "PatientCheckIn.createdBy", "Pick your name. Sign in on the Volunteers tab first."),
    ("Current station", 18, "list:Station", "PatientStationVisit.station", "Update this every time the patient moves."),
    ("Status", 14, "list:Status", "PatientCheckIn.status", None),
    ("Now with", 16, "vol", "PatientStationVisit.claimedBy", "Who has the patient right now. Change it when you take over."),
    ("Alerts", 26, "auto:ALERTS", "(derived)", "Automatic. Pulls red flags from every station."),
    ("Notes", 24, "text", "PatientCheckIn.notes", None),
])
TABS["Intake"] = dict(color="2E7D8C", title="1 Intake & history", cols=[
    ("Visit ID", 10, "id", "Encounter (sheet key)", None),
    ("Patient", 20, name_lookup, "(lookup)", "Automatic from Check-In."),
    ("Known high BP?", 10, "list:YesNoUnsure", "HypertensionAssessment.hypertensionStatus", None),
    ("Known diabetes?", 10, "list:YesNoUnsure", "DiabetesScreening.diabetesStatus", None),
    ("Other conditions", 20, "text", "MedicalHistoryRecord (CONDITION)", None),
    ("Current medicines", 22, "text", "PatientMedicationRecord", "Name + dose if known."),
    ("Takes medicines as prescribed?", 14, "list:Adherence", "EncounterMedicationAdherence", None),
    ("Allergies", 16, "text", "MedicalHistoryRecord (ALLERGY)", None),
    ("Family history (BP, diabetes, stroke, heart)", 22, "text", "MedicalHistoryRecord (FAMILY_HISTORY)", None),
    ("Smoking", 14, "list:Tobacco", "TobaccoScreening.smokingStatus", None),
    ("Smokeless tobacco", 14, "list:Tobacco", "TobaccoScreening.smokelessTobaccoStatus", None),
    ("Second-hand smoke", 10, "list:YesNo", "TobaccoScreening.passiveExposure", None),
    ("Ready to quit?", 12, "list:Quit", "TobaccoScreening.readinessToQuit", None),
    ("Alcohol", 11, "list:Alcohol", "MedicalHistoryRecord (SOCIAL_HISTORY)", None),
    ("Pregnant?", 10, "list:Pregnant", "MedicalHistoryRecord", None),
    ("Main concern today", 24, "text", "Encounter note", None),
    ("Recorded by", 16, "vol", "Encounter.createdBy", None),
    ("Time", 8, "time", "", None),
])
TABS["BP"] = dict(color="B54708", title="2 Blood pressure", cols=[
    ("Visit ID", 10, "id", "Encounter (sheet key)", None),
    ("Patient", 20, name_lookup, "(lookup)", None),
    ("Systolic 1", 9, "num", "Vitals.systolicBp (reading 1)", "Top number. Patient seated and rested 5 minutes."),
    ("Diastolic 1", 9, "num", "Vitals.diastolicBp (reading 1)", "Bottom number."),
    ("Pulse 1", 8, "num", "Vitals.pulseBpm", None),
    ("Systolic 2", 9, "num", "PatientMeasurement (reading 2)", "Take a 2nd reading 1-2 minutes later, always if the 1st is 140/90 or more."),
    ("Diastolic 2", 9, "num", "PatientMeasurement (reading 2)", None),
    ("Pulse 2", 8, "num", "PatientMeasurement (reading 2)", None),
    ("Arm", 10, "list:Arm", "Vitals.bpSite", None),
    ("Position", 10, "list:Position", "Vitals.patientPosition", None),
    ("Cuff size", 11, "list:Cuff", "Vitals.cuffSize", None),
    ("Avg systolic", 9, "auto:=IF(COUNT(C{r},F{r})=0,\"\",ROUND(AVERAGE(C{r},F{r}),0))", "(derived)", "Automatic: average of the readings taken."),
    ("Avg diastolic", 9, "auto:=IF(COUNT(D{r},G{r})=0,\"\",ROUND(AVERAGE(D{r},G{r}),0))", "(derived)", None),
    ("Category", 12, "auto:=IF(AND(L{r}=\"\",M{r}=\"\"),\"\",IF(OR(N(L{r})>=180,N(M{r})>=120),\"CRISIS\",IF(OR(N(L{r})>=140,N(M{r})>=90),\"Stage 2\",IF(OR(N(L{r})>=130,N(M{r})>=80),\"Stage 1\",IF(OR(L{r}=\"\",M{r}=\"\"),\"Incomplete\",IF(OR(L{r}<90,M{r}<60),\"Low\",IF(L{r}>=120,\"Elevated\",\"Normal\")))))))",
     "HypertensionClassification (derived)", "Automatic, same thresholds as Nkwapa (see Start Here)."),
    ("Alert", 18, "auto:=IF(N{r}=\"CRISIS\",\"⚠ BP CRISIS - doctor now\",IF(N{r}=\"Stage 2\",IF(F{r}=\"\",\"BP high - take 2nd reading\",\"BP Stage 2\"),IF(N{r}=\"Low\",\"BP low\",\"\")))", "(derived)", None),
    ("Recorded by", 16, "vol", "Vitals author", None),
    ("Time", 8, "time", "", None),
    ("Notes", 22, "text", "Vitals.notes", None),
])
TABS["Glucose"] = dict(color="7A5AF8", title="3 Glucose", cols=[
    ("Visit ID", 10, "id", "Encounter (sheet key)", None),
    ("Patient", 20, name_lookup, "(lookup)", None),
    ("Glucose (mg/dL)", 10, "num", "DiabetesScreening.glucoseMgDl", "If the meter shows mmol/L, multiply by 18."),
    ("mmol/L", 8, "auto:=IF(C{r}=\"\",\"\",ROUND(C{r}/18,1))", "(derived)", None),
    ("Test type", 13, "list:GlucoseType", "DiabetesScreening.glucoseType", "Ask when they last ate. Fasting = nothing but water for 8+ hours."),
    ("Last ate (time)", 9, "time", "", None),
    ("Frequent urination", 10, "list:YesNo", "DiabetesScreening.symptoms (POLYURIA)", None),
    ("Excess thirst", 9, "list:YesNo", "DiabetesScreening.symptoms (POLYDIPSIA)", None),
    ("Weight loss (unexplained)", 10, "list:YesNo", "DiabetesScreening.symptoms (WEIGHT_LOSS)", None),
    ("Blurred vision", 9, "list:YesNo", "DiabetesScreening.symptoms (BLURRED_VISION)", None),
    ("Slow-healing wounds", 10, "list:YesNo", "DiabetesScreening.symptoms", None),
    ("Numb / tingling feet", 10, "list:YesNo", "DiabetesScreening.symptoms", None),
    ("Foot wound now?", 9, "list:YesNo", "DiabetesScreening.currentFootWound", None),
    ("Result", 16, "auto:=IF(C{r}=\"\",\"\",IF(N(C{r})<70,\"LOW - act now\",IF(OR(AND(OR(E{r}=\"Fasting (8h+)\",E{r}=\"Before meal\"),N(C{r})>=126),N(C{r})>=200),\"Suspected diabetes\",\"Not suspected\")))",
     "DiabetesScreening.derivedSuspicion", "Automatic, same thresholds as Nkwapa (see Start Here)."),
    ("Alert", 18, "auto:=IF(N{r}=\"LOW - act now\",\"⚠ GLUCOSE LOW\",IF(N{r}=\"Suspected diabetes\",\"Glucose high\",IF(M{r}=\"Yes\",\"Foot wound\",\"\")))", "(derived)", None),
    ("Recorded by", 16, "vol", "DiabetesScreening.authoredBy", None),
    ("Time", 8, "time", "DiabetesScreening.collectedAt", None),
    ("Notes", 22, "text", "DiabetesScreening.notes", None),
])
TABS["Vitals"] = dict(color="0F7B4A", title="4 Body & vitals", cols=[
    ("Visit ID", 10, "id", "Encounter (sheet key)", None),
    ("Patient", 20, name_lookup, "(lookup)", None),
    ("Weight (kg)", 9, "num", "Vitals.weightKg", None),
    ("Height (cm)", 9, "num", "Vitals.heightCm", None),
    ("BMI", 7, "auto:=IF(OR(C{r}=\"\",D{r}=\"\"),\"\",ROUND(C{r}/(D{r}/100)^2,1))", "Vitals.bmi", "Automatic."),
    ("BMI category", 13, "auto:=IF(E{r}=\"\",\"\",IF(E{r}<18.5,\"Underweight\",IF(E{r}<25,\"Healthy\",IF(E{r}<30,\"Overweight\",\"Obese\"))))", "(derived)", "WHO adult categories."),
    ("Waist (cm)", 9, "num", "PatientMeasurement", None),
    ("Temp (°C)", 8, "num", "Vitals.temperatureCelsius", None),
    ("SpO₂ (%)", 8, "num", "Vitals.spo2Percent", None),
    ("Resp. rate", 8, "num", "Vitals.respiratoryRate", None),
    ("Alert", 18, "auto:=TRIM(IF(AND(I{r}<>\"\",N(I{r})<92),\"⚠ SpO2 low \",\"\")&IF(N(H{r})>=38,\"Fever\",\"\"))", "(derived)", "General guidance, not an Nkwapa rule: SpO2 under 92% or temperature 38°C+."),
    ("Recorded by", 16, "vol", "Vitals author", None),
    ("Time", 8, "time", "", None),
    ("Notes", 22, "text", "Vitals.notes", None),
])
TABS["Eye"] = dict(color="1570EF", title="5 Eye", cols=[
    ("Visit ID", 10, "id", "Encounter (sheet key)", None),
    ("Patient", 20, name_lookup, "(lookup)", None),
    ("Eye complaint?", 9, "list:YesNo", "EyeScreening.hasEyeComplaint", None),
    ("Complaint details", 22, "text", "EyeScreening.complaintHistory", None),
    ("Wears glasses?", 9, "list:YesNo", "EyeScreening.wearsCorrection", None),
    ("VA right (OD) unaided", 9, "list:Acuity", "EyeScreening.vaOdUnaided", "CF counting fingers, HM hand motion, PL light perception, NPL no light perception."),
    ("VA left (OS) unaided", 9, "list:Acuity", "EyeScreening.vaOsUnaided", None),
    ("VA both (OU) unaided", 9, "list:Acuity", "EyeScreening.vaOuUnaided", None),
    ("VA right with glasses", 9, "list:Acuity", "EyeScreening.vaOdAided", None),
    ("VA left with glasses", 9, "list:Acuity", "EyeScreening.vaOsAided", None),
    ("VA right pinhole", 9, "list:Acuity", "EyeScreening.vaOdPinhole", None),
    ("VA left pinhole", 9, "list:Acuity", "EyeScreening.vaOsPinhole", None),
    ("Cup:disc right", 8, "num", "EyeScreening.cupDiscRatioOd", "0.00 to 1.00"),
    ("Cup:disc left", 8, "num", "EyeScreening.cupDiscRatioOs", None),
    ("Abnormal findings (eye + structure)", 26, "text", "EyeExamFinding (eye, structure, note)", "e.g. 'Right lens: cataract; left cornea: scar'. Leave blank if all normal."),
    ("Likely cause of reduced vision", 16, "list:VisionCause", "EyeScreening.visionLossCause", None),
    ("Diabetic signs?", 9, "list:YesNo", "EyeScreening.diabeticSignsSeen", None),
    ("Hypertensive signs?", 9, "list:YesNo", "EyeScreening.hypertensiveSignsSeen", None),
    ("Referral?", 9, "list:YesNo", "EyeScreening.referralRecommended", None),
    ("Referral note", 22, "text", "EyeScreening.referralNote", None),
    ("Alert", 14, "auto:=IF(S{r}=\"Yes\",\"Eye referral\",\"\")", "(derived)", None),
    ("Examined by", 16, "vol", "EyeScreening.authorUserId", None),
    ("Time", 8, "time", "", None),
    ("Notes", 22, "text", "EyeScreening.notes", None),
])
TABS["Review"] = dict(color="9E1F63", title="6 Counselling & review", cols=[
    ("Visit ID", 10, "id", "Encounter (sheet key)", None),
    ("Patient", 20, name_lookup, "(lookup)", None),
    ("Today's alerts", 26, f"auto:=IFERROR(INDEX({q(CHECKIN)}!$U:$U,MATCH($A{{r}},{q(CHECKIN)}!$A:$A,0)),\"\")", "(lookup)", "Automatic: every flag raised today. Read this first."),
    ("BP", 7, "list:Tick", "CounsellingRecord.topics (BLOOD_PRESSURE)", "Topics discussed: pick Yes for each."),
    ("Diabetes", 8, "list:Tick", "CounsellingRecord.topics (GLUCOSE_DIABETES)", None),
    ("Weight & diet", 8, "list:Tick", "CounsellingRecord.topics (WEIGHT_NUTRITION)", None),
    ("Activity", 8, "list:Tick", "CounsellingRecord.topics (PHYSICAL_ACTIVITY)", None),
    ("Tobacco", 8, "list:Tick", "CounsellingRecord.topics (TOBACCO)", None),
    ("Alcohol", 8, "list:Tick", "CounsellingRecord.topics (ALCOHOL)", None),
    ("Medicines", 8, "list:Tick", "CounsellingRecord.topics (MEDICATION_ADHERENCE)", None),
    ("Other topic", 14, "text", "CounsellingRecord.topicOther", None),
    ("Advice given", 30, "text", "CounsellingRecord.adviceGiven", None),
    ("Follow-up?", 9, "list:YesNo", "CounsellingRecord.followUpRecommended", None),
    ("Follow-up when", 14, "list:FollowUp", "CounsellingRecord.followUpWindow", None),
    ("Referral?", 9, "list:YesNo", "CounsellingRecord.referralRecommended", None),
    ("Referred to", 18, "text", "CounsellingRecord.referralTo", None),
    ("Referral reason", 22, "text", "CounsellingRecord.referralReason", None),
    ("Urgency", 10, "list:Urgency", "CounsellingRecord.referralUrgency", None),
    ("Medicines prescribed / given", 24, "text", "Prescription (drug, dosage, frequency)", None),
    ("Reviewed by", 16, "vol", "CounsellingRecord.authorUserId", "Clinician who reviewed. Then set Status to Completed on Check-In."),
    ("Time", 8, "time", "", None),
    ("Notes", 22, "text", "Encounter / ClinicalNote", None),
])

NAME = {"Intake": "1 Intake", "BP": "2 Blood Pressure", "Glucose": "3 Glucose", "Vitals": "4 Body & Vitals", "Eye": "5 Eye", "Review": "6 Review"}
nm = lambda t: q(NAME.get(t, t))
STATION_ALERT_COL = {}  # tab -> alert column letter
BANDED = []
ESSENTIAL_NOTES = {"Visit ID", "ID number", "Now with", "Systolic 2", "Test type", "Today's alerts", "Abnormal findings (eye + structure)", "Reviewed by", "Age (yrs)"}
AUTO_COLS = {}  # sheet title -> auto column letters
SHARED = []  # (sheet title, column) whose row-2 formula is shared down to ROWS+1

def col_index(tab, header):
    return [c[0] for c in TABS[tab]["cols"]].index(header) + 1

for tab in ("BP", "Glucose", "Vitals", "Eye"):
    STATION_ALERT_COL[tab] = get_column_letter(col_index(tab, "Alert"))

def alerts_formula(r):
    parts = [f"IFERROR(INDEX({nm(tab)}!${c}:${c},MATCH($A{r},{nm(tab)}!$A:$A,0)),\"\")"
             for tab, c in STATION_ALERT_COL.items()]
    joined = "&\"  \"&".join(parts)
    return f"=TRIM({joined})"

# ---------------------------------------------------------------- workbook
wb = Workbook()
wb.remove(wb.active)
wb._fonts[0] = Font(name=FONT, size=10, color=INK)

def style_header(cell, auto=False):
    cell.font = font(bold=True, color="FFFFFF", size=10)
    cell.fill = fill(AUTO_HEAD if auto else TEAL)
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = Border(left=Side(style="thin", color="FFFFFF"), right=Side(style="thin", color="FFFFFF"))

# Start Here and Volunteers are written after the data tabs exist, but tab order matters.
ws_start = wb.create_sheet("Start Here")
ws_vol = wb.create_sheet("Volunteers")

VOL_RANGE = "Volunteers!$A$2:$A$150"

lists_ws = None  # created later; validations reference it by name
LIST_REF = {}
for i, (name, values) in enumerate(LISTS.items()):
    col = get_column_letter(i + 1)
    LIST_REF[name] = f"Lists!${col}$2:${col}${len(values) + 1}"

def add_list_validation(ws, rng, ref, prompt=None):
    dv = DataValidation(type="list", formula1=f"={ref}", allow_blank=True, showDropDown=False)
    dv.error = "Pick a value from the list."
    dv.errorTitle = "Not in the list"
    dv.showErrorMessage = True
    if prompt:
        dv.prompt = prompt
        dv.showInputMessage = True
    ws.add_data_validation(dv)
    dv.add(rng)

def build_table(tab, spec):
    ws = wb.create_sheet(NAME.get(tab, tab))
    ws.sheet_properties.tabColor = spec["color"]
    ws.sheet_view.showGridLines = False
    cols = spec["cols"]
    ws.row_dimensions[1].height = 46
    last = ROWS + 1
    for ci, (header, width, kind, db, note) in enumerate(cols, start=1):
        L = get_column_letter(ci)
        ws.column_dimensions[L].width = width + 2
        h = ws.cell(row=1, column=ci, value=header)
        style_header(h, auto=kind.startswith("auto"))
        if note and (header in ESSENTIAL_NOTES):
            h.comment = Comment(note, "Nkwapa")
            h.comment.width, h.comment.height = 260, 80
        if kind == "id":
            for r in range(2, last + 1):
                c = ws.cell(row=r, column=ci, value=f"V-{r - 1:03d}")
                c.font = font(bold=True, color=TEAL_DARK)
                c.alignment = Alignment(horizontal="center", vertical="center")
        elif kind.startswith("auto:"):
            f = kind[5:]
            ws.cell(row=2, column=ci, value=alerts_formula(2) if f == "ALERTS" else f.format(r=2))
            SHARED.append((ws.title, L))
            for r in range(2, last + 1):  # styled, so each cell is written and can carry the shared formula
                c = ws.cell(row=r, column=ci)
                c.font = font(italic=True, color="3F5A61")
                c.fill = fill(AUTO_BODY)
        rng = f"{L}2:{L}{last}"
        if kind.startswith("list:"):
            add_list_validation(ws, rng, LIST_REF[kind[5:]])
        elif kind == "vol":
            add_list_validation(ws, rng, VOL_RANGE, "Pick your name (sign in on Volunteers first).")
        elif kind == "num":
            dv = DataValidation(type="decimal", operator="between", formula1="0", formula2="1000", allow_blank=True)
            dv.error, dv.showErrorMessage = "Numbers only.", True
            ws.add_data_validation(dv)
            dv.add(rng)
    BANDED.append((ws, f"A2:{get_column_letter(len(cols))}{last}"))
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = None
    return ws

sheets = {}
for tab, spec in TABS.items():
    sheets[tab] = build_table(tab, spec)

def cf_text(ws, rng, first_cell, text, bg, fg, bold=True, op="="):
    if op == "begins":
        formula = f'LEFT({first_cell},{len(text)})="{text}"'
    else:
        formula = f'{first_cell}="{text}"'
    ws.conditional_formatting.add(rng, FormulaRule(formula=[formula], fill=fill(bg), font=Font(name=FONT, color=fg, bold=bold)))

def cf_nonblank(ws, rng, first_cell, bg, fg):
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'LEN({first_cell})>0'], fill=fill(bg), font=Font(name=FONT, color=fg, bold=True)))

last = ROWS + 1
# Check-In: status, alerts
ci = sheets[CHECKIN]
S = get_column_letter(col_index(CHECKIN, "Status")); U = get_column_letter(col_index(CHECKIN, "Alerts"))
for text, bg, fg in [("Waiting", AMBER_BG, "8A5300"), ("In progress", BLUE_BG, "1849A9"),
                     ("Completed", GREEN_BG, GREEN), ("Left before finishing", GREY_BG, "5A6468")]:
    cf_text(ci, f"{S}2:{S}{last}", f"{S}2", text, bg, fg)
cf_nonblank(ci, f"{U}2:{U}{last}", f"{U}2", RED_BG, RED)
# whole row muted when completed
ci.conditional_formatting.add(f"C2:{S}{last}", FormulaRule(formula=[f'${S}2="Completed"'], font=Font(name=FONT, color="7A8A8E")))

bp = sheets["BP"]
N_ = get_column_letter(col_index("BP", "Category")); O_ = get_column_letter(col_index("BP", "Alert"))
for text, bg, fg in [("CRISIS", RED, "FFFFFF"), ("Stage 2", ORANGE_BG, "B54708"), ("Stage 1", AMBER_BG, "8A5300"),
                     ("Elevated", YELLOW_BG, "7A6200"), ("Normal", GREEN_BG, GREEN), ("Low", BLUE_BG, "1849A9"),
                     ("Incomplete", GREY_BG, "5A6468")]:
    cf_text(bp, f"{N_}2:{N_}{last}", f"{N_}2", text, bg, fg)
cf_nonblank(bp, f"{O_}2:{O_}{last}", f"{O_}2", RED_BG, RED)

gl = sheets["Glucose"]
R_ = get_column_letter(col_index("Glucose", "Result")); A_ = get_column_letter(col_index("Glucose", "Alert"))
cf_text(gl, f"{R_}2:{R_}{last}", f"{R_}2", "LOW - act now", RED, "FFFFFF")
cf_text(gl, f"{R_}2:{R_}{last}", f"{R_}2", "Suspected diabetes", ORANGE_BG, "B54708")
cf_text(gl, f"{R_}2:{R_}{last}", f"{R_}2", "Not suspected", GREEN_BG, GREEN)
cf_nonblank(gl, f"{A_}2:{A_}{last}", f"{A_}2", RED_BG, RED)

vt = sheets["Vitals"]
B_ = get_column_letter(col_index("Vitals", "BMI category")); VA = get_column_letter(col_index("Vitals", "Alert"))
for text, bg, fg in [("Underweight", BLUE_BG, "1849A9"), ("Healthy", GREEN_BG, GREEN),
                     ("Overweight", AMBER_BG, "8A5300"), ("Obese", ORANGE_BG, "B54708")]:
    cf_text(vt, f"{B_}2:{B_}{last}", f"{B_}2", text, bg, fg)
cf_nonblank(vt, f"{VA}2:{VA}{last}", f"{VA}2", RED_BG, RED)

ey = sheets["Eye"]
EA = get_column_letter(col_index("Eye", "Alert"))
cf_nonblank(ey, f"{EA}2:{EA}{last}", f"{EA}2", RED_BG, RED)

rv = sheets["Review"]
cf_nonblank(rv, f"C2:C{last}", "C2", RED_BG, RED)
UR = get_column_letter(col_index("Review", "Urgency"))
cf_text(rv, f"{UR}2:{UR}{last}", f"{UR}2", "Urgent", RED, "FFFFFF")
for L in "DEFGHIJ":
    cf_text(rv, f"{L}2:{L}{last}", f"{L}2", "Yes", GREEN_BG, GREEN)

# ---------------------------------------------------------------- Volunteers
ws = ws_vol
ws.sheet_properties.tabColor = TEAL_DARK
ws.sheet_view.showGridLines = False
vol_cols = [("Volunteer name", 22, "text"), ("Phone", 15, "text"), ("Role", 16, "list:Role"),
            ("Station", 20, "list:Station"), ("Time in", 9, "time"), ("Time out", 9, "time"), ("Notes", 22, "text")]
hand_cols = [("Time", 9, "time"), ("Station", 20, "list:Station"), ("Visit ID (if one patient)", 12, "text"),
             ("Handed over by", 18, "vol"), ("Taken over by", 18, "vol"), ("Note", 26, "text")]
ws.row_dimensions[1].height = 46
def vol_table(cols, start_col, rows):
    for i, (h, w, kind) in enumerate(cols):
        ci_ = start_col + i
        L = get_column_letter(ci_)
        ws.column_dimensions[L].width = w + 2
        style_header(ws.cell(row=1, column=ci_, value=h))
        rng = f"{L}2:{L}{rows + 1}"
        if kind.startswith("list:"):
            add_list_validation(ws, rng, LIST_REF[kind[5:]])
        elif kind == "vol":
            add_list_validation(ws, rng, VOL_RANGE)
vol_table(vol_cols, 1, 149)
ws.column_dimensions["H"].width = 3
vol_table(hand_cols, 9, 149)
ws["A1"].comment = Comment("Sign in here before you start. Your name then appears in every 'by' dropdown.", "Nkwapa")
ws["I1"].comment = Comment("Handover log: when you leave a station or pass a patient on, write who took over.", "Nkwapa")
BANDED.append((ws, "A2:G150"))
BANDED.append((ws, "I2:N150"))
ws.freeze_panes = "A2"

for _ws, _rng in BANDED:
    _ws.conditional_formatting.add(_rng, FormulaRule(formula=["MOD(ROW(),2)=0"], fill=fill(CREAM)))

# ---------------------------------------------------------------- Dashboard
db = wb.create_sheet("Dashboard")
db.sheet_properties.tabColor = INK
db.sheet_view.showGridLines = False
for L, w in zip("ABCDEFGHIJ", [3, 22, 12, 3, 22, 12, 3, 26, 12, 3]):
    db.column_dimensions[L].width = w
for r in range(1, 40):
    for c in range(1, 11):
        db.cell(row=r, column=c).fill = fill(CREAM)
db.merge_cells("B2:I2")
db["B2"] = "Screening day - live dashboard"
db["B2"].font = font(bold=True, size=18, color=TEAL_DARK)
db.merge_cells("B3:I3")
db["B3"] = "Updates by itself as volunteers fill in the station tabs."
db["B3"].font = font(italic=True, color="5B7A82")
CI = q(CHECKIN)
SC, RC, NC = (get_column_letter(col_index(CHECKIN, h)) for h in ("Status", "Current station", "First name"))
def panel(col_label, col_val, top, title, rows):
    lc, vc = col_label, col_val
    db.merge_cells(f"{lc}{top}:{vc}{top}")
    t = db[f"{lc}{top}"]
    t.value = title
    t.font = font(bold=True, color="FFFFFF", size=11)
    t.fill = fill(TEAL)
    t.alignment = Alignment(vertical="center", indent=1)
    db[f"{vc}{top}"].fill = fill(TEAL)
    db.row_dimensions[top].height = 26
    for i, (label, formula, alert) in enumerate(rows, start=1):
        r = top + i
        a, b = db[f"{lc}{r}"], db[f"{vc}{r}"]
        a.value, b.value = label, formula
        a.font = font(color=INK)
        b.font = font(bold=True, size=14, color=RED if alert else TEAL_DARK)
        b.alignment = Alignment(horizontal="center", vertical="center")
        a.alignment = Alignment(vertical="center", indent=1)
        a.fill = b.fill = fill("FFFFFF")
        a.border = b.border = Border(bottom=thin)
        db.row_dimensions[r].height = 24
        if alert:
            db.conditional_formatting.add(f"{vc}{r}", FormulaRule(formula=[f"{vc}{r}>0"], fill=fill(RED_BG)))
panel("B", "C", 5, "Patients", [
    ("Checked in", f"=COUNTA({CI}!{NC}2:{NC}{last})", False),
    ("Waiting", f'=COUNTIF({CI}!{SC}2:{SC}{last},"Waiting")', False),
    ("In progress", f'=COUNTIF({CI}!{SC}2:{SC}{last},"In progress")', False),
    ("Completed", f'=COUNTIF({CI}!{SC}2:{SC}{last},"Completed")', False),
    ("Left before finishing", f'=COUNTIF({CI}!{SC}2:{SC}{last},"Left before finishing")', False),
])
panel("E", "F", 5, "At each station now", [
    (st, f'=COUNTIFS({CI}!{RC}2:{RC}{last},"{st}",{CI}!{SC}2:{SC}{last},"<>Completed",{CI}!{SC}2:{SC}{last},"<>Left before finishing")', False)
    for st in LISTS["Station"][:-1]
])
BPC = get_column_letter(col_index("BP", "Category"))
GR = get_column_letter(col_index("Glucose", "Result"))
VAL = get_column_letter(col_index("Vitals", "Alert"))
ER = get_column_letter(col_index("Eye", "Referral?"))
RR = get_column_letter(col_index("Review", "Referral?"))
RU = get_column_letter(col_index("Review", "Urgency"))
panel("H", "I", 5, "Alerts and referrals", [
    ("BP crisis (180/120+)", f'=COUNTIF({nm("BP")}!{BPC}2:{BPC}{last},"CRISIS")', True),
    ("BP stage 2 (140/90+)", f'=COUNTIF({nm("BP")}!{BPC}2:{BPC}{last},"Stage 2")', False),
    ("Glucose low (<70)", f'=COUNTIF({nm("Glucose")}!{GR}2:{GR}{last},"LOW - act now")', True),
    ("Suspected diabetes", f'=COUNTIF({nm("Glucose")}!{GR}2:{GR}{last},"Suspected diabetes")', False),
    ("Vitals alerts", f'=COUNTIF({nm("Vitals")}!{VAL}2:{VAL}{last},"?*")', True),
    ("Eye referrals", f'=COUNTIF({nm("Eye")}!{ER}2:{ER}{last},"Yes")', False),
    ("Clinical referrals", f'=COUNTIF({nm("Review")}!{RR}2:{RR}{last},"Yes")', False),
    ("Urgent referrals", f'=COUNTIF({nm("Review")}!{RU}2:{RU}{last},"Urgent")', True),
])
panel("B", "C", 13, "Volunteers", [
    ("Signed in today", "=COUNTA(Volunteers!A2:A150)", False),
    ("Signed out", "=COUNTA(Volunteers!F2:F150)", False),
    ("On duty now", "=COUNTA(Volunteers!A2:A150)-COUNTA(Volunteers!F2:F150)", False),
])

# ---------------------------------------------------------------- Lists
lw = wb.create_sheet("Lists")
lw.sheet_properties.tabColor = "98A2A5"
for i, (name, values) in enumerate(LISTS.items(), start=1):
    L = get_column_letter(i)
    lw.column_dimensions[L].width = 20
    style_header(lw.cell(row=1, column=i, value=name), auto=True)
    for j, v in enumerate(values, start=2):
        lw.cell(row=j, column=i, value=v).font = font()
lw.freeze_panes = "A2"

# ---------------------------------------------------------------- Export Map (separate CSV)
import csv
with open(OUT.rsplit(".", 1)[0] + "-export-map.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["Tab", "Column", "Header", "Nkwapa field", "Type / allowed values"])
    for tab, spec in TABS.items():
        for ci_, (header, _w, kind, dbf, _n) in enumerate(spec["cols"], start=1):
            if kind.startswith("list:"):
                typ = "one of: " + " | ".join(LISTS[kind[5:]])
            elif kind == "vol":
                typ = "volunteer name (Volunteers!A)"
            elif kind.startswith("auto"):
                typ = "formula - recompute on import"
            else:
                typ = {"id": "key V-001..V-%03d (joins every tab)" % ROWS, "num": "number", "date": "date dd/mm/yyyy",
                       "time": "time hh:mm (session date on Start Here)", "text": "free text"}[kind]
            w.writerow([NAME.get(tab, tab), get_column_letter(ci_), header, dbf, typ])

# ---------------------------------------------------------------- Start Here
ws = ws_start
ws.sheet_properties.tabColor = TEAL
ws.sheet_view.showGridLines = False
for L, w in zip("ABCDEFG", [3, 30, 22, 22, 22, 22, 3]):
    ws.column_dimensions[L].width = w
for rr in range(1, 75):
    for cc in range(1, 8):
        ws.cell(row=rr, column=cc).fill = fill(CREAM)
def band(row, text, size=11, color="FFFFFF", bg=TEAL, height=26):
    ws.merge_cells(f"B{row}:F{row}")
    c = ws[f"B{row}"]
    c.value = text
    c.font = font(bold=True, size=size, color=color)
    c.alignment = Alignment(vertical="center", indent=1)
    for L in "BCDEF":
        ws[f"{L}{row}"].fill = fill(bg)
    ws.row_dimensions[row].height = height
def para(row, text, bold=False, color=INK, height=None, size=10):
    ws.merge_cells(f"B{row}:F{row}")
    c = ws[f"B{row}"]
    c.value = text
    c.font = font(bold=bold, color=color, size=size)
    c.alignment = Alignment(wrap_text=True, vertical="top", indent=1)
    if height:
        ws.row_dimensions[row].height = height

ws.row_dimensions[1].height = 14
band(2, "Nkwapa  ·  Screening Day Sheet", size=20, bg=TEAL_DARK, height=46)
para(3, "Fallback for today's screening while the Nkwapa app is being finished. Everything here is shaped "
        "so it can be imported into Nkwapa afterwards, so please keep to the dropdowns.",
     color="3F5A61", height=34)
row = 5
for label in ("Clinic / site", "Date", "Site lead", "Lead's phone"):
    a, b = ws[f"B{row}"], ws[f"C{row}"]
    a.value = label
    a.font = font(bold=True, color=TEAL_DARK)
    ws.merge_cells(f"C{row}:D{row}")
    b.fill = fill("FFFFFF")
    b.border = BORDER
    ws[f"D{row}"].border = BORDER
    b.font = font(size=11)
    if label == "Date":
        b.number_format = "dd/mm/yyyy"
    ws.row_dimensions[row].height = 22
    row += 1

row += 1
band(row, "How it works"); row += 1
steps = [
    "1.  Sign in on the Volunteers tab: your name, role and station. Your name then appears in every 'by' dropdown.",
    "2.  Check-In: take the next empty row. Its Visit ID (V-001, V-002 …) is the patient's number for the whole day. Write it on their card.",
    "3.  At each station, open that station's tab, press Ctrl+F (Cmd+F) and search the Visit ID. The patient's name fills in by itself.",
    "4.  On Check-In, keep 'Current station', 'Status' and 'Now with' up to date. That is how everyone sees where each patient is.",
    "5.  Taking over from someone? Change 'Now with' to your name, and add a line to the handover log on the Volunteers tab.",
    "6.  Red cells are alerts. A BP CRISIS or LOW glucose means: get the doctor now, before anything else.",
    "7.  Counselling & review is the last stop. The reviewer reads 'Today's alerts', records advice and referrals, then sets Status to Completed.",
]
for s in steps:
    para(row, s, height=30); row += 1

row += 1
band(row, "Ground rules"); row += 1
rules = [
    "Never sort a tab. To narrow your view use Data > Create a filter view (it only changes your screen, not everyone's).",
    "Grey columns fill in by themselves. Don't type in them.",
    "Use the dropdowns. Free text where a dropdown exists can't be imported later.",
    "This sheet holds patient data. Don't share the link outside the team, download it, screenshot it or copy IDs anywhere else.",
    "Unsure about a value? Leave it blank and add a note. Blank means 'not asked'; don't guess.",
    "Times: Ctrl+Shift+; (Cmd+Shift+; on Mac) inserts the current time.",
]
for s in rules:
    para(row, "•  " + s, height=30); row += 1

row += 1
band(row, "Station flow"); row += 1
flow = ["Check-in", "1 Intake & history", "2 Blood pressure", "3 Glucose", "4 Body & vitals", "5 Eye", "6 Counselling & review"]
para(row, "  →  ".join(flow), bold=True, color=TEAL_DARK, height=34, size=11); row += 1

row += 1
band(row, "Thresholds the sheet uses (same as Nkwapa)"); row += 1
thr = [
    ("Blood pressure", "CRISIS: 180+ systolic or 120+ diastolic → doctor now", RED_BG, RED),
    ("", "Stage 2: 140+ / 90+  ·  Stage 1: 130+ / 80+  ·  Elevated: 120-129 systolic", ORANGE_BG, "B54708"),
    ("", "Low: under 90 / 60", BLUE_BG, "1849A9"),
    ("Glucose (mg/dL)", "LOW: under 70 → act now (give sugar, call doctor)", RED_BG, RED),
    ("", "Suspected diabetes: fasting / before meal 126+  ·  random / 2h after meal / unknown 200+", ORANGE_BG, "B54708"),
    ("Vitals (general guidance)", "SpO₂ under 92%  ·  temperature 38°C+", AMBER_BG, "8A5300"),
    ("BMI (WHO adult)", "Under 18.5 underweight · 18.5-24.9 healthy · 25-29.9 overweight · 30+ obese", GREEN_BG, GREEN),
]
for label, text, bg, fg in thr:
    ws[f"B{row}"].value = label
    ws[f"B{row}"].font = font(bold=True, color=TEAL_DARK)
    ws.merge_cells(f"C{row}:F{row}")
    c = ws[f"C{row}"]
    c.value = text
    c.font = font(color=fg, bold=True)
    c.alignment = Alignment(vertical="center", indent=1, wrap_text=True)
    for L in "CDEF":
        ws[f"{L}{row}"].fill = fill(bg)
    ws.row_dimensions[row].height = 24
    row += 1

row += 1
band(row, "Colour key"); row += 1
legend = [("Teal header", "you type here", TEAL, "FFFFFF"), ("Grey header", "fills in by itself", AUTO_HEAD, "FFFFFF"),
          ("Sand cell", "Visit ID: the patient's number for the day", SAND, TEAL_DARK), ("Red cell", "alert: act on it", RED_BG, RED)]
for a, b, bg, fg in legend:
    ws[f"B{row}"].value = a
    ws[f"B{row}"].fill = fill(bg)
    ws[f"B{row}"].font = font(bold=True, color=fg)
    ws[f"B{row}"].alignment = Alignment(horizontal="center", vertical="center")
    ws[f"C{row}"].value = b
    ws[f"C{row}"].font = font()
    ws[f"C{row}"].alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[row].height = 22
    row += 1

row += 1
band(row, "Research consent script (read before ticking 'Research consent')"); row += 1
para(row, "\"Nkwapa may use your screening results for health research, with your name, phone number and ID "
          "removed. Saying no does not change your care today. You can change your mind later by telling the clinic. "
          "May we include your results?\"  ← confirm the approved wording with the site lead before use.",
     height=58, color="3F5A61")

# tab order: Start Here, Volunteers, Check-In, stations, Dashboard, Lists, Export Map
order = ["Start Here", "Volunteers", CHECKIN] + [NAME[t] for t in ("Intake", "BP", "Glucose", "Vitals", "Eye", "Review")] + ["Dashboard", "Lists"]
wb._sheets = [wb[n] for n in order]
wb.active = 0
wb.save(OUT)

# Post-process: turn each row-2 formula into an Excel shared formula covering the column.
import re, zipfile, shutil, os
z = zipfile.ZipFile(OUT)
files = {n: z.read(n) for n in z.namelist()}
z.close()
wbxml = files["xl/workbook.xml"].decode()
rels = files["xl/_rels/workbook.xml.rels"].decode()
rid_target = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels)) | {a: b for b, a in re.findall(r'Target="([^"]+)"[^>]*Id="(rId\d+)"', rels)}
title_path = {}
for name, rid in re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"', wbxml):
    t = rid_target[rid].lstrip("/")
    title_path[name.replace("&amp;", "&")] = t if t.startswith("xl/") else "xl/" + t
last_row = ROWS + 1
by_sheet = {}
for title, col in SHARED:
    by_sheet.setdefault(title_path[title], []).append(col)
for path, cols in by_sheet.items():
    x = files[path].decode()
    for si, col in enumerate(cols):
        x, n = re.subn(rf'(<c r="{col}2"[^>]*>)<f>', rf'\1<f t="shared" ref="{col}2:{col}{last_row}" si="{si}">', x, count=1)
        assert n == 1, (path, col)
        for r in range(3, last_row + 1):
            x, n = re.subn(rf'<c r="{col}{r}"( s="\d+")?(?: t="\w+")?\s*(?:/>|></c>)', rf'<c r="{col}{r}"\1><f t="shared" si="{si}"/></c>', x, count=1)
            assert n == 1, (path, col, r)
    files[path] = x.encode()
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as out:
    for n, data in files.items():
        out.writestr(n, data)
print("saved", OUT, "shared formulas:", len(SHARED))
