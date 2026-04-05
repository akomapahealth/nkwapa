# 20. Shifts And Staff Check-In V1

## Status

Implemented in the current codebase.

This document still captures the original design intent, but use `IMPLEMENTATION_STATUS.md` and `docs/FEATURE_WORKFLOWS_GUIDE.md` for the current product contract.

---

## Goal

Enable staff “Check-in mode” (per day, optional checkout) so Managers can see who is on-duty and assign patients accordingly.

Roles & Permissions
• Staff can check themselves in/out if they are a member of the clinic.
• Manager/Director/SysAdmin can view active shifts.
• Permission gates (v1):
• Check-in/out: CLINIC_READ (and clinic membership)
• View active shifts: CLINIC_READ (Manager+ UI, but API can allow staff too)

Note: You don’t currently have SHIFT.\* permissions; enforce using CLINIC_READ + role membership, and/or CLINIC_MANAGE for administrative views.

Prisma: New Enums & Models

Enums
• ShiftStatus = ACTIVE | CLOSED
• ShiftRole = VOLUNTEER | DOCTOR | PRECEPTOR | MANAGER

Model: StaffShift

Fields:
• id: UUID
• clinicId: UUID
• userId: UUID
• roleAtShift: ShiftRole (snapshot at check-in)
• checkedInAt: DateTime
• checkedOutAt: DateTime?
• status: ShiftStatus default ACTIVE
• notes: string?
• createdAt, updatedAt

Constraints:
• One ACTIVE shift per (clinicId, userId)
Implement by query enforcement in service (and add a partial unique index later if desired).

Indexes:
• (clinicId, status, checkedInAt)
• (userId, checkedInAt)

API Endpoints

POST /clinics/:clinicId/shifts/check-in

Body:

{ "roleAtShift": "VOLUNTEER|DOCTOR|PRECEPTOR|MANAGER", "notes": "optional" }

Rules:
• User must be a clinic member (any role in that clinic).
• If an ACTIVE shift exists for same user+clinic today, return 409 with existing shift.
• Creates shift as ACTIVE with checkedInAt = now().

Audit:
• SHIFT.CHECKIN (entityType StaffShift)

POST /clinics/:clinicId/shifts/:shiftId/check-out

Rules:
• User can check out their own shift.
• Manager/Director/SysAdmin can check out any shift in their clinic.
• Sets checkedOutAt = now(), status = CLOSED.

Audit:
• SHIFT.CHECKOUT

GET /clinics/:clinicId/shifts/active?date=YYYY-MM-DD

Rules:
• Date is interpreted in clinic timezone (default Africa/Accra for GH).
• Return shifts with status=ACTIVE checkedIn within day range OR checkedIn earlier but still ACTIVE.

Response includes:
• shiftId, userId, displayName, roleAtShift, checkedInAt

Audit:
• optional (read only, no audit required)

Service Logic
• Centralize in ShiftService:
• checkIn(clinicId, actorUserId, roleAtShift, notes)
• checkOut(clinicId, shiftId, actorUserId)
• getActive(clinicId, date)

Tests (integration)
• staff can check-in once; second check-in same day returns 409
• manager can view active shifts
• checkout closes shift
