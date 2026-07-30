import jsPDF from "jspdf";
import bbLogo from "@/assets/bb_logo.png";

const INR = (n: number) =>
  `Rs. ${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d?: string | null) => {
  if (!d) return "-";
  const [y, m, day] = String(d).split("T")[0].split("-");
  return day && m && y ? `${day}/${m}/${y}` : String(d);
};

export interface POLineInput {
  product_name: string;
  description?: string | null;
  qty: number;
  uom?: string | null;
  rate: number;
  discount?: number | null; // absolute amount
  gst_percent?: number | null;
}

export interface POCompanyInput {
  company_name?: string | null;
  address?: string | null;
  gst_number?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
}

export interface POVendorInput {
  name?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
}

export interface POOrderInput {
  po_number: string | null;
  order_date: string | null;
  expected_delivery_date?: string | null;
  payment_terms?: string | null;
  bill_to?: string | null;
  ship_to?: string | null;
  requisition_number?: string | null;
  requisition_name?: string | null;
  site_name?: string | null;
  terms_and_conditions?: string[] | null;
  version?: number | null;
}

async function loadImageDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildPurchaseOrderPdf(params: {
  order: POOrderInput;
  vendor: POVendorInput;
  company: POCompanyInput;
  items: POLineInput[];
}): Promise<jsPDF> {
  const { order, vendor, company, items } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const rightX = pageW - marginX;
  let y = 12;

  // Logo
  const logoSrc = company.logo_url || bbLogo;
  const logoData = await loadImageDataUrl(logoSrc);
  if (logoData) {
    try { doc.addImage(logoData, "PNG", marginX, y, 22, 22); } catch { /* noop */ }
  }

  // Company header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(company.company_name || "Bharat Builders", marginX + 26, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const compLines: string[] = [];
  if (company.address) compLines.push(company.address);
  const line2: string[] = [];
  if (company.phone) line2.push(`Ph: ${company.phone}`);
  if (company.email) line2.push(company.email);
  if (line2.length) compLines.push(line2.join("  |  "));
  if (company.gst_number) compLines.push(`GSTIN: ${company.gst_number}`);
  let cy = y + 11;
  compLines.forEach((l) => {
    doc.text(doc.splitTextToSize(l, 110), marginX + 26, cy);
    cy += 4.5;
  });

  // Title + PO meta (right side)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("PURCHASE ORDER", rightX, y + 6, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`PO #: ${order.po_number || "-"}`, rightX, y + 12, { align: "right" });
  doc.text(`Date: ${fmtDate(order.order_date)}`, rightX, y + 17, { align: "right" });
  if (order.version) doc.text(`Version: v${order.version}`, rightX, y + 22, { align: "right" });

  y = Math.max(cy, y + 26) + 3;
  doc.setDrawColor(180);
  doc.line(marginX, y, rightX, y);
  y += 5;

  // Vendor + Ship/Bill To in two columns
  const colW = (rightX - marginX - 6) / 2;
  const leftX = marginX;
  const midX = marginX + colW + 6;

  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("Vendor", leftX, y);
  doc.text("Ship To", midX, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);

  const vendorBlock: string[] = [];
  if (vendor.name) vendorBlock.push(vendor.name);
  if (vendor.contact_person) vendorBlock.push(`Attn: ${vendor.contact_person}`);
  const vc: string[] = [];
  if (vendor.phone) vc.push(`Ph: ${vendor.phone}`);
  if (vendor.email) vc.push(vendor.email);
  if (vc.length) vendorBlock.push(vc.join("  |  "));
  if (vendor.address) vendorBlock.push(vendor.address);
  if (vendor.gst_number) vendorBlock.push(`GSTIN: ${vendor.gst_number}`);

  const shipBlock = (order.ship_to || "-").split("\n");
  const billBlock = (order.bill_to || "-").split("\n");

  let ly = y + 5;
  const drawBlock = (lines: string[], x: number, startY: number, width: number) => {
    let yy = startY;
    lines.forEach((raw) => {
      const wrapped = doc.splitTextToSize(raw, width);
      doc.text(wrapped, x, yy);
      yy += wrapped.length * 4.2;
    });
    return yy;
  };
  const vendorEndY = drawBlock(vendorBlock, leftX, ly, colW);
  const shipEndY = drawBlock(shipBlock, midX, ly, colW);

  ly = Math.max(vendorEndY, shipEndY) + 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("Bill To", midX, ly);
  ly += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const billEndY = drawBlock(billBlock, midX, ly, colW);

  y = Math.max(vendorEndY, billEndY) + 5;
  doc.setDrawColor(180);
  doc.line(marginX, y, rightX, y);
  y += 5;

  // Meta row: Site / Requisition / Expected Delivery / Payment Terms
  const kv = (label: string, val: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(label, x, yy);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(val || "-", colW - 30);
    doc.text(wrapped, x + 32, yy);
    return yy + wrapped.length * 4.2;
  };
  const y1 = kv("Site:", order.site_name || "-", leftX, y);
  const y2 = kv("Requisition:", [order.requisition_number, order.requisition_name].filter(Boolean).join(" · ") || "-", midX, y);
  y = Math.max(y1, y2) + 1;
  const y3 = kv("Expected Delivery:", fmtDate(order.expected_delivery_date), leftX, y);
  const y4 = kv("Payment Terms:", order.payment_terms || "-", midX, y);
  y = Math.max(y3, y4) + 3;

  doc.setDrawColor(180);
  doc.line(marginX, y, rightX, y);
  y += 5;

  // Items table
  const cols = [
    { key: "sn", label: "#", x: marginX, w: 6, align: "left" as const },
    { key: "material", label: "Material", x: marginX + 6, w: 34, align: "left" as const },
    { key: "desc", label: "Description", x: marginX + 40, w: 26, align: "left" as const },
    { key: "qty", label: "Qty", x: marginX + 78, w: 12, align: "right" as const },
    { key: "uom", label: "UOM", x: marginX + 80, w: 10, align: "left" as const },
    { key: "rate", label: "Rate", x: marginX + 104, w: 18, align: "right" as const },
    { key: "disc", label: "Disc", x: marginX + 122, w: 14, align: "right" as const },
    { key: "gstp", label: "GST%", x: marginX + 136, w: 12, align: "right" as const },
    { key: "taxable", label: "Taxable", x: marginX + 158, w: 20, align: "right" as const },
    { key: "gstamt", label: "GST Amt", x: rightX - 26, w: 20, align: "right" as const },
    { key: "amt", label: "Total", x: rightX, w: 24, align: "right" as const },
  ];

  const drawTableHeader = (yy: number) => {
    doc.setFillColor(240, 240, 240);
    doc.rect(marginX, yy - 4, rightX - marginX, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    cols.forEach((c) => doc.text(c.label, c.x, yy, { align: c.align }));
    doc.setFont("helvetica", "normal");
    return yy + 4;
  };

  y = drawTableHeader(y);
  doc.setFontSize(8);

  let subtotal = 0;
  let totalDisc = 0;
  let totalGst = 0;
  items.forEach((it, idx) => {
    const gross = (Number(it.qty) || 0) * (Number(it.rate) || 0);
    const disc = Number(it.discount) || 0;
    const taxable = Math.max(0, gross - disc);
    const gstPct = Number(it.gst_percent) || 0;
    const gstAmt = taxable * (gstPct / 100);
    const amt = taxable + gstAmt;
    subtotal += taxable;
    totalDisc += disc;
    totalGst += gstAmt;

    const nameLines = doc.splitTextToSize(it.product_name || "-", cols[1].w - 1);
    const descLines = doc.splitTextToSize(it.description || "", cols[2].w - 1);
    const rowH = Math.max(nameLines.length, descLines.length, 1) * 4.2 + 2;

    if (y + rowH > pageH - 40) {
      doc.addPage();
      y = 18;
      y = drawTableHeader(y);
    }

    doc.text(String(idx + 1), cols[0].x, y);
    doc.text(nameLines, cols[1].x, y);
    if (descLines.length && descLines[0]) doc.text(descLines, cols[2].x, y);
    doc.text(String(it.qty ?? ""), cols[3].x, y, { align: "right" });
    doc.text(String(it.uom || "-"), cols[4].x, y);
    doc.text(INR(it.rate), cols[5].x, y, { align: "right" });
    doc.text(disc ? INR(disc) : "-", cols[6].x, y, { align: "right" });
    doc.text(`${gstPct}%`, cols[7].x, y, { align: "right" });
    doc.text(INR(taxable), cols[8].x, y, { align: "right" });
    doc.text(INR(gstAmt), cols[9].x, y, { align: "right" });
    doc.text(INR(amt), cols[10].x, y, { align: "right" });
    y += rowH;
  });

  doc.setDrawColor(200);
  doc.line(marginX, y, rightX, y);
  y += 5;

  // Totals
  const grand = subtotal + totalGst;
  const totalsX = rightX - 60;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (totalDisc > 0) {
    doc.text("Discount:", totalsX, y);
    doc.text(`- ${INR(totalDisc)}`, rightX, y, { align: "right" });
    y += 5;
  }
  doc.text("Subtotal (Taxable):", totalsX, y);
  doc.text(INR(subtotal), rightX, y, { align: "right" });
  y += 5;
  doc.text("Total GST:", totalsX, y);
  doc.text(INR(totalGst), rightX, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("Grand Total:", totalsX, y);
  doc.text(INR(grand), rightX, y, { align: "right" });
  y += 8;


  // Terms & Conditions
  const terms = (order.terms_and_conditions || []).filter((t) => t && t.trim().length);
  if (terms.length) {
    if (y > pageH - 60) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Terms & Conditions", marginX, y);
    y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    terms.forEach((t, i) => {
      const wrapped = doc.splitTextToSize(`${i + 1}. ${t}`, rightX - marginX);
      if (y + wrapped.length * 4.2 > pageH - 30) { doc.addPage(); y = 18; }
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 4.2 + 1;
    });
    y += 4;
  }

  // Authorised signatory
  if (y > pageH - 30) { doc.addPage(); y = pageH - 30; }
  const sigY = Math.max(y + 10, pageH - 25);
  doc.setDrawColor(120);
  doc.line(rightX - 60, sigY, rightX, sigY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Authorised Signatory", rightX, sigY + 4, { align: "right" });
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(company.company_name || "Bharat Builders", rightX, sigY + 8, { align: "right" });
  doc.setTextColor(0);

  // Footer with page numbers
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
    doc.text(`PO ${order.po_number || ""}${order.version ? ` · v${order.version}` : ""}`, marginX, pageH - 6);
    doc.text(`Page ${p} of ${total}`, rightX, pageH - 6, { align: "right" });
    doc.setTextColor(0);
  }

  return doc;
}
