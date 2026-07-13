## Vendor Quote Portal (Salesforce-style Indent Order)

Replace the one-way PDF quote request with a live, public web page each vendor opens via a unique link, fills in rates/discount/commitment date/per-line selection, and submits back into the app. You then review submissions and pick the winning quote.

### How the link flow works
1. Requisition is approved; in the detail view you select the vendor(s).
2. Click **Generate & Share Quote Links** — the app creates a unique secret token per vendor and a public URL like `.../vendor-quote/<token>`.
3. Each vendor's link opens the Indent Order page (no login needed). You share it via WhatsApp (pre-filled message, like today) or copy it.
4. Vendor fills Rate/Unit, Discount %, Vendor Delivery Commitment Date, ticks the items they can supply, adds payment term/notes, and submits.
5. Submissions appear back in the requisition detail under **Vendor Quotes**, side by side, so you compare and choose.

### The public page (mirrors the Salesforce template)
- Bharath Builders logo + company name/address at top (from Company Profile).
- Title "Indent Order", requisition name, date.
- **From** (company) / **To** (this vendor) blocks.
- Line-item table: Product, Description, Quantity, Quality Instructions, UOM, Expected Delivery Date, **Vendor Delivery Commitment Date** (input), **Rate/Unit** (input), **Discount %** (input), **Rate After Discount** (auto-calculated), and a per-row **Select** checkbox.
- Running total of selected lines.
- Fields for Expected Payment Terms (shown), Vendor Payment Term (input), Additional Notes (input).
- Save (partial) and Submit buttons; a read-only confirmation state after submit.

### Technical section

**Database (migration)**
- `procurement_vendor_quotes`: `po_id`, `vendor_id`, `token` (unique, random), `status` (`sent`/`submitted`), `vendor_payment_term`, `notes`, `submitted_at`, timestamps.
- `procurement_vendor_quote_items`: `quote_id`, `procurement_item_id`, `rate`, `discount_pct`, `rate_after_discount`, `delivery_commitment_date`, `is_selected`.
- GRANTs: `authenticated` full, `service_role` all. RLS: authenticated users with procurement access read/manage; **no anon access** — the public page goes only through edge functions using service role, keyed by the secret token (tokens are never listed, only looked up).

**Edge functions (public, `verify_jwt = false`, token-gated, Zod-validated)**
- `get-vendor-quote?token=…`: returns company branding, vendor info, requisition + line items (product name/description/quality/uom/qty/expected date), and any saved response. Returns 404 for bad/expired tokens.
- `submit-vendor-quote`: body `{ token, items[], vendor_payment_term, notes, submit }`; upserts response rows, sets `rate_after_discount = rate*(1-discount/100)`, marks `submitted` when `submit=true`.

**Frontend**
- New public page `src/pages/VendorQuote.tsx` at route `/vendor-quote/:token`, added in `App.tsx` **outside** `AppLayout` (like `/install`), so no auth is required.
- In `ProcurementDetail.tsx`: add a **Generate & Share Quote Links** action (replacing/augmenting the current PDF quote button) that creates a quote row per selected vendor and shows each vendor's link with WhatsApp + copy buttons. Add a **Vendor Quotes** section listing submissions per vendor (payment term, notes, per-line rate/discount/after-discount/commitment/selected) with an option to apply a chosen vendor's rates into the PO line items.
- Keep the existing "Download Quote Request" PDF as an optional fallback.

**Notes**
- The public page must be reachable on the published site; publish visibility should be Public for vendors to open links.
- Rate After Discount is computed live on the page and re-verified server-side on submit.
