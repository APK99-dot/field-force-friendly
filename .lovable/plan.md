## Goal

Rewrite `src/utils/purchaseOrderPdf.ts` so the PO renders as a clean, single-page A4 ERP document with a properly aligned 10-column item table.

## Root cause of the overlap

The current `cols` array hardcodes each column's `x` with inconsistent offsets (`marginX + 136`, `marginX + 158`, `rightX - 26`, `rightX`) and the `w` values don't match the gaps. "Taxable", "GST Amt" and "Total" end up drawn nearly on top of each other — exactly what the screenshot shows (`Rs.Rs.040.0.00`).

## Changes (all in `src/utils/purchaseOrderPdf.ts`)

### 1. Column model
Replace ad-hoc x offsets with a width-driven layout computed once from the usable width (186mm), then derive each column's left/right edge:

| Column | Width (mm) | Align |
|---|---|---|
| # | 7 | left |
| Material | 34 | left |
| Description | 30 | left |
| Qty | 11 | right |
| UOM | 12 | left |
| Rate | 19 | right |
| Disc % | 13 | right |
| Rate After Disc | 20 | right |
| GST % | 11 | right |
| GST Amt | 19 | right |
| Line Total | 22 | right |

Right-aligned cells anchor to `x + w - 1.5`, left-aligned to `x + 1.5`, with `splitTextToSize(..., w - 3)` on every cell so nothing bleeds into the neighbour. Header row gets a filled band plus thin column separators and a bottom rule; zebra striping on alternate rows.

Note: `discount` is currently an absolute amount on `POLineInput`. For a "Discount %" column it will be shown as a percentage of gross (`disc / gross * 100`), and "Rate After Discount" as `rate - disc/qty`, so no caller/DB change is needed.

### 2. Header
Logo left, company name + address/phone/email/GSTIN under it; "PURCHASE ORDER" title right with a bordered metadata box (PO #, Date, Version, Requisition ref). Tighter leading, thinner rules, navy accent line.

### 3. Party + info blocks
Three bordered panels in one band — Vendor | Ship To | Bill To — each with a shaded caption bar and fixed height, so the block no longer grows unevenly. Below it a compact 4-cell meta strip: Site, Requisition, Expected Delivery, Payment Terms.

### 4. Financial summary
Right-aligned bordered box under the table: Gross, Discount (if any), Taxable Amount, Total GST, then a highlighted Grand Total row.

### 5. Terms & signature
Terms & Conditions as a compact numbered list at 7.5pt; two signature blocks side by side ("Prepared By" / "Authorised Signatory") pinned near the page bottom, with a page-number footer.

### 6. Currency
Format as `₹ 1,234.00`. jsPDF's built-in Helvetica has no ₹ glyph, so ₹ needs an embedded Unicode TTF (adds ~150–300 KB to the bundle). Plan: embed a subset-free Noto Sans (or DejaVu Sans) TTF via `doc.addFileToVFS`/`addFont` loaded lazily so it only downloads when a PO is generated. If you'd rather avoid the extra weight, we keep `Rs.` — tell me and I'll switch.

### 7. Single page
Reduced vertical rhythm (4.0mm line height, 3mm section gaps), 8pt body / 7.5pt table text. With ≤ ~15 line items the document fits one A4 page; beyond that the table paginates with a repeated header, and the summary/terms/signature always stay together.

## Technical notes
- Only `src/utils/purchaseOrderPdf.ts` changes; `buildPurchaseOrderPdf`'s signature and all call sites in `ProcurementDetail.tsx` stay identical.
- GST calculation logic (taxable = gross − discount, gstAmt = taxable × gst%) is unchanged.
- Verification: generate a PO PDF, rasterise it, and visually confirm no column overlap and single-page fit.
