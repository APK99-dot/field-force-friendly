# Procurement List Views (Salesforce-style)

Add saveable, shareable list views to the Procurement page, with multi-condition filters, selectable display columns, and inline editing of records straight from the list.

## 1. Saved views

A view bar sits above the search box on `/procurement`:

- A dropdown listing: **All Requisitions** (built-in default) plus every view the user owns or that has been shared with them.
- Actions: **New View**, **Edit View**, **Clone**, **Delete** (owner/admin only), **Pin as default**.
- The last used view is remembered per user.

## 2. Filters

Inside the view editor, users build any number of filter rows:

```text
[ Field ▾ ]  [ Operator ▾ ]  [ Value ]            [x]
+ Add filter          Match: (•) All   ( ) Any
```

Filterable fields: Requisition #, Requisition Name, PO #, Status, Source Type, Site, Transfer-to Site,
Vendor, Owner, Requisition Date, Expected Delivery Date, Total Amount, Estimated Budget, Payment Terms,
Bill To, Ship To, Notes.

Operators adapt to field type:
- text: contains, does not contain, equals, starts with, is empty
- picklist (status/source/site/vendor/owner): equals, not equals, is one of
- date: on, before, after, between, last N days, this month
- number: =, ≠, >, <, between

Filters are applied against the loaded order set (same data the page already fetches), so existing
search and status controls keep working alongside the active view.

## 3. Display fields

The editor has a Columns panel: a checkbox list of available fields with drag-to-reorder. When a view
defines columns, the list renders as a **table** with those columns (horizontally scrollable on mobile);
the existing card layout stays for the default view and on small screens.

Also saved per view: sort field + direction, and rows per page.

## 4. Sharing

Each view has visibility:
- **Private** — only the creator
- **Everyone** — all authenticated users
- **Selected team members** — pick users from a searchable list

Only the owner (or an admin) can edit or delete a view; others get read-only use, with Clone available.

## 5. Inline record editing

Every row gets a pencil button on the right.

- Clicking it turns the row's editable cells into inputs in place (status select, dates, payment terms,
  budget, requisition name, bill/ship to, notes), with Save / Cancel at the row end.
- Save writes only the changed fields to `procurement_orders`, refreshes the row, and toasts.
- Read-only/derived fields (REQ #, PO #, totals rolled up from line items, stage history) are not editable.
- Editing respects existing permissions: users without procurement edit rights see no pencil.
- Rate-related and stage-transition logic is untouched — those stay on the detail screen.

## Technical notes

New table `procurement_list_views`:

| column | type |
| --- | --- |
| id | uuid pk |
| name | text |
| owner_id | uuid (auth user) |
| filters | jsonb — `{ match: 'all' \| 'any', conditions: [{field, operator, value}] }` |
| columns | jsonb — ordered array of field keys |
| sort_field / sort_dir | text |
| visibility | text — `private` \| `everyone` \| `selected` |
| shared_user_ids | uuid[] |
| is_default | boolean |
| created_at / updated_at | timestamptz |

RLS: select where `owner_id = auth.uid()` OR `visibility = 'everyone'` OR `auth.uid() = any(shared_user_ids)`;
insert/update/delete restricted to the owner or an admin. GRANTs issued for `authenticated` and `service_role`
in the same migration.

New files:
- `src/hooks/useListViews.ts` — fetch/create/update/delete views, active-view state persisted in localStorage.
- `src/components/procurement/listviews/ViewBar.tsx` — view selector + actions.
- `src/components/procurement/listviews/ViewEditorDialog.tsx` — name, filters, columns, sharing.
- `src/components/procurement/listviews/FilterRow.tsx` — field/operator/value row.
- `src/components/procurement/listviews/ListViewTable.tsx` — column-driven table with inline row editing.
- `src/lib/procurementFields.ts` — the field registry (key, label, type, options source, editable flag).

`src/pages/Procurement.tsx` is updated to render the view bar and to swap between the existing card list
and the table when a view with columns is active. Existing creation flow, detail dialog, deep-linking
(`?po=`), Salesforce import and delete behaviour stay as they are.
