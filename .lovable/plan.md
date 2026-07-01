# Configuration & Approval Workflow Module

A single Admin-only place to control every module's settings and approval flows. This phase delivers the **full configuration panel + database storage + Admin gating + auto-save**. Live enforcement across each feature module is wired in a follow-up phase (as agreed).

## Location & Access
- New card in **Admin Controls**: "Configuration & Approval Workflow" → route `/admin/configuration`.
- Visible only to Admin role (gated like other admin modules, plus a hard Admin check inside the page).

## Layout
```text
+-----------------------------------------------------------+
| Configuration & Approval Workflow                         |
+----------------+------------------------------------------+
| Activities     |  [ Configuration ] [ Approval Workflow ] |
| Projects/Sites |                                          |
| Procurement    |   ...panel for selected module...        |
| Goods Receipt  |                                          |
| Expenses       |                                          |
| Leave          |                                          |
| Attendance     |   (Regularisation shown as a section     |
| Reports        |    inside the Attendance panel)          |
+----------------+------------------------------------------+
```
- Left sidebar lists the 8 modules; clicking loads its panel.
- Each panel has two tabs: **Configuration** and **Approval Workflow**.
- Regularisation config + its approval flow are nested inside the Attendance panel.

## Global behaviour
- Every toggle/field auto-saves on change with a `toast("Configuration saved")`.
- Values are read via a shared hook so future enforcement can consume them app-wide.
- All settings persist in one config table keyed by module + config_key.

## Database
New table `app_configuration`:
- `module` (text), `config_key` (text), `config_value` (jsonb), `updated_by` (uuid), plus id/created_at/updated_at, unique on (module, config_key).
- RLS: any authenticated user may **read** (so feature modules can honour settings later); only Admins may **insert/update/delete** (`has_role(auth.uid(),'admin')`).
- GRANTs for authenticated + service_role.
- Approval-workflow definitions stored as jsonb rows too (one config_key per transition), each holding `{ enabled, approverRoles[], rule: "any"|"all", notifyRoles[] }`.

## Config content per module (stored keys)
- **Activities – Config:** checkIn, gpsTrack, voiceNote, photoUpload, requireMilestone, requireActivityType, allowBackdated (toggles); assignPermission (Admin/Admin+Manager/All). **Approval:** requireManagerApproval toggle.
- **Projects/Sites – Config:** galleryTab, documentsTab (toggles); createSites, editSite, addMilestones (Admin/Admin+Manager); updateMilestoneProgress (Admin/Admin+Manager/All). **Approval:** message "No approval flow for this module".
- **Procurement – Config:** internalTransfer, budgetField, billShipFields (toggles); requireNotes (toggle); createRequisition (All/Manager+Admin/Admin only); editRatesAfterApproval (Admin only/Admin+Manager). **Approval:** four transition editors — Requisition→Requisition Approved, Quote Received→PO Issued, Invoice Received→Paid, Any→Rejected.
- **Goods Receipt – Config:** takePhoto, uploadGallery (toggles); maxPhotos (number, default 20); vendorRating toggle; rating metrics (editable list, defaults Delivery Timeliness / Material Quality / Quantity Accuracy / Overall Experience); rating scale fixed 5 stars (read-only note); badge thresholds (4 numbers: Preferred/Reliable/Needs Improvement/Poor). **Approval:** "Require admin approval before GRN is confirmed" toggle.
- **Expenses – Config:** receiptUpload toggle; requireReceipt toggle; autoApproveMax (₹ number); categories (editable list); submitPermission (All/Manager+Admin). **Approval:** Submitted→Approved, Submitted→Rejected transitions.
- **Leave – Config:** leave types (editable list with max-days per type); allowHalfDay toggle; requireDocSickLeave toggle; viewTeamCalendar (All/Manager+Admin/Admin only). **Approval:** Applied→Approved, Applied→Rejected.
- **Attendance – Config:** gpsCapture, requireSelfie, allowManualNoGps (toggles); workStart/workEnd (time); lateThresholdMins (number); checkoutReminder toggle; checkoutReminderTime (time). **Approval:** message "Attendance is auto-recorded, no approval flow".
  - **Regularisation (nested) – Config:** allowRegularisation toggle; maxPastDays (number); requireReason toggle. **Approval:** Submitted→Approved, Submitted→Rejected.
- **Reports – Config/Approval:** placeholder panel (visibility toggles per report) with "No approval flow" message. (Report-specific keys kept minimal.)

## Reusable UI pieces (new components)
- `ConfigToggleRow` — label + description + Switch (auto-saves).
- `ConfigSelectRow` — label + Select (permission dropdowns).
- `ConfigNumberRow` / `ConfigTimeRow` — numeric / time inputs.
- `EditableListEditor` — add (text + Add button) / rename / remove (× per row) for metrics, categories, leave types.
- `ApprovalTransitionEditor` — one transition: Enable toggle, approver roles multi-select, rule radio (Any one / All), notify roles multi-select. Reused by Procurement, Expenses, Leave, Regularisation.
- Roles for the multi-selects come from the `roles` table (roles-only, per your choice).

## Files
- **Migration:** create `app_configuration` (+ GRANTs, RLS, updated_at trigger). Seed default rows for all keys above.
- **New:** `src/pages/ConfigurationWorkflow.tsx` (shell: sidebar + tabs), `src/hooks/useAppConfiguration.ts` (fetch/update via TanStack Query with optimistic auto-save + toast), `src/components/config/*` (the reusable pieces above and one panel component per module).
- **Edit:** `src/App.tsx` (lazy route `/admin/configuration`, Admin-gated), `src/pages/AdminControls.tsx` (add the card with permission gating).

## Out of scope this phase
- Live enforcement inside each feature module (hiding buttons/fields, routing approvals through configured approvers). The store, hook, and defaults are built so enforcement can be wired module-by-module next, starting with Procurement, Goods Receipt, and Activities.

## Technical notes
- Reads are cached; writes debounced per control and write a single jsonb value.
- Approval definitions validated (at least one approver role when a transition is enabled).
- No changes to existing procurement status logic in this phase.
