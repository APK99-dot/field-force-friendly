

## Plan: Fix Call Button in My Team

### Root Cause
The call button appears disabled because 6 out of 7 team members have **no phone number stored** in the database. Only "Suyog" has a phone number. The code correctly shows a disabled icon when `phone` is null — this is a data issue, not a code bug.

### Changes

#### 1. Query phone from both `users` and `profiles` tables (src/pages/MyTeam.tsx)
Currently only checks `users.phone`. Will also join `profiles.phone_number` as a fallback, so if a phone is stored in either table, it will be found.

#### 2. Use `<a href="tel:">` for maximum compatibility
Replace the `<button>` + `window.open` approach with a simple `<a href="tel:XXXX">` anchor element styled as a button. This is the most universally reliable method for opening the dialer across browsers, PWAs, and WebViews — no JavaScript needed.

#### 3. Always show the call button as enabled with a visual distinction
- **Phone exists**: Show green/primary phone icon as a clickable `<a href="tel:">` link
- **No phone**: Keep the current disabled appearance but with a clearer "No phone number" indicator

### Files to Modify
- **src/pages/MyTeam.tsx** — Update query to check both tables for phone; replace button with `<a href="tel:">`

### Note to User
Most team members simply don't have phone numbers entered in their profiles yet. After this fix, you or an admin should update each member's profile with their phone number (via Profile page or Admin User Management) — the call button will then become active for those members.

