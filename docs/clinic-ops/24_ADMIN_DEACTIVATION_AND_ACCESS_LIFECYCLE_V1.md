
Goal

Enable Manager/Director/SysAdmin to deactivate users and remove clinic roles safely (no hard deletes).

Rules
	•	Deactivation sets User.isActive=false
	•	Deactivated users cannot access API (whoami returns disabled or 403)
	•	Removing roles removes clinic membership access

Endpoints
	•	PATCH /clinics/:clinicId/users/:userId/deactivate requires CLINIC_MANAGE
	•	PATCH /users/:userId/deactivate requires SYSTEM_ADMIN
	•	DELETE /clinics/:clinicId/users/:userId/roles/:role requires CLINIC_MANAGE
	•	GET /clinics/:clinicId/users requires CLINIC_READ (for tables)

UI requirement

Add “Deactivate” buttons anywhere user tables exist (staff list, clinic roster).

Audit events
	•	USER.DEACTIVATE
	•	ROLE.REVOKE
