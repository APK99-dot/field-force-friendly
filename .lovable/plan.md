# Salesforce → Vendor Master Import

## Goal
Add the Salesforce fields that are missing from Vendor Master, then pull the Salesforce Accounts into Master Data → Vendor Management with correct field mapping.

## Field mapping (Salesforce Account → Vendor Master)

```text
Salesforce field          →  Vendor Master field
------------------------------------------------
Name                      →  name              (exists)
Phone                     →  phone[]           (exists)
Email_Id__c               →  email[]           (exists)
Billing Street/City/      →  address           (exists, combined)
  State/PostalCode/Country
Account_Type__c           →  category          (exists; e.g. "Product Vendor")
GST__c                    →  gst_number        (NEW)
PAN__c                    →  pan_number        (NEW)
AnnualRevenue             →  annual_revenue    (NEW)
NumberOfEmployees         →  employee_count    (NEW)
Salesforce Id             →  salesforce_id     (NEW, hidden, for de-dup/re-sync)
```

Notes: Salesforce has no separate "contact person" field on Account, so that stays blank. GST/PAN are shown as their own fields instead of being buried in notes.

## What gets built

### 1. Database changes
- Add columns to `vendors`: `gst_number`, `pan_number`, `annual_revenue`, `employee_count`, `salesforce_id` (unique).
- Relax the existing vendor phone trigger: many Salesforce accounts have no phone number, so phone becomes optional. Uniqueness is still enforced only when a phone is present. (Currently the trigger rejects any vendor without a phone, which would block most of the import.)

### 2. Salesforce connector link
- Link the already-connected Salesforce connection to this project so the backend import can read from it securely.

### 3. Import backend (edge function)
- A secure function pulls Accounts from Salesforce via the connector, maps the fields above, and upserts into `vendors` keyed by `salesforce_id` (so re-running updates existing rows instead of creating duplicates).
- Admin-only.

### 4. UI in Vendor Management
- New **"Import from Salesforce"** button (visible to admins) that runs the import and shows a summary (added / updated / skipped).
- Add the new fields (GST, PAN, Annual Revenue, Employees) to the vendor Add/Edit form and to the Vendor detail page.

## Open decision — which accounts to import
Your screenshot shows **All Accounts (220)**. In Salesforce these break down by "Account Type": 93 Product Vendor, 24 Rental Client, 2 Billing Entity, 1 each Consultant/Shipping/Broker, and 99 with no type set. I'll default to importing **all 220 accounts** as vendors (each tagged with its Account Type as the category). If you'd rather import only "Product Vendor" records, tell me and I'll filter to those.

## Result
Vendor Master will hold the same GST, PAN, Revenue, and Employees data as Salesforce, populated from your Salesforce Accounts, and re-runnable to stay in sync.