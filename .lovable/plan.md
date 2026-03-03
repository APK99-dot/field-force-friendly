

## Split Attendance Management into Overview and Configuration Sections

### Overview
Reorganize the 8 flat tabs into two clear sections using a top-level tab group: **Overview** (operational/data viewing) and **Configuration** (settings/setup).

### Layout

```text
[  Overview  ] [  Configuration  ]
       |                |
       |                +-- Leave Types
       |                +-- Holidays  
       |                +-- Working Days
       |                +-- Attendance Policy
       |
       +-- Live Attendance
       +-- Leave Management
       +-- Regularization
       +-- Leave Balances
```

### Changes

**File: `src/pages/AttendanceManagement.tsx`**

1. Replace the single flat tab row with a two-level navigation:
   - **Top level**: Two styled segment buttons -- "Overview" and "Configuration" 
   - **Sub level**: Show only the tabs belonging to the active section

2. Define two tab groups:
   - `overviewTabs`: Live Attendance, Leave Management, Regularization, Leave Balances
   - `configTabs`: Leave Types, Holidays, Working Days, Attendance Policy

3. Add a `section` state (`"overview"` | `"configuration"`) defaulting to `"overview"`
   - When switching sections, auto-select the first sub-tab of that section
   - Keep the existing `activeTab` state for the sub-tab selection

4. Style the top-level section buttons as prominent pill/segment controls (similar to the Activities page action buttons) so the two sections are visually distinct from the sub-tabs below them

### Technical Details

- Add `const [section, setSection] = useState<"overview" | "configuration">("overview")`
- Split the existing `tabs` array into two arrays
- When `section` changes, set `activeTab` to the first tab key of that section
- The sub-tab row renders only tabs from the active section
- All existing tab content rendering (`activeTab === "live"`, etc.) remains unchanged -- no logic changes needed for the content panels

