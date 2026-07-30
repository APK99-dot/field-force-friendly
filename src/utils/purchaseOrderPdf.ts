import jsPDF from "jspdf";
import bbLogo from "@/assets/bb_logo.png";

/* -------------------------------------------------------------------------- */
/*  Rupee-capable font (lazy)                                                  */
/* -------------------------------------------------------------------------- */
// jsPDF's built-in Helvetica has no INR glyph, so we lazily pull a Unicode TTF
// the first time a PO is generated. If the fetch fails we silently fall back to
// Helvetica + "Rs." so PO generation never breaks.
const FONT_URLS = {
  normal: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf",
  bold: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf",
};
let unicodeFontCache: { normal: string; bold: string } | null | undefined;

async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("font fetch failed");
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadUnicodeFont(): Promise<{ normal: string; bold: string } | null> {
  if (unicodeFontCache !== undefined) return unicodeFontCache;
  try {
    const [normal, bold] = await Promise.all([
      fetchBase64(FONT_URLS.normal),
      fetchBase64(FONT_URLS.bold),
    ]);
    unicodeFontCache = { normal, bold };
  } catch {
    unicodeFontCache = null;
  }
  return unicodeFontCache;
}

const fmtDate = (d?: string | null) => {
  if (!d) return "-";
  const [y, m, day] = String(d).split("T")[0].split("-");
  return day && m && y ? `${day}/${m}/${y}` : String(d);
};

const num2 = (n: number) =>
  (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface POLineInput {
  product_name: string;
  description?: string | null;
  qty: number;
  uom?: string | null;
  rate: number;
  discount?: number | null; // absolute amount for the line
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

/* -------------------------------------------------------------------------- */

const NAVY: [number, number, number] = [20, 30, 60];
const GREY_LINE: [number, number, number] = [190, 195, 205];
const BAND: [number, number, number] = [238, 241, 246];
const ZEBRA: [number, number, number] = [248, 249, 252];

interface Col {
  label: string;
  w: number;
  align: "left" | "right";
  x: number; // computed left edge
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
  const usableW = rightX - marginX; // 186mm

  // ---- font setup -----------------------------------------------------------
  const uni = await loadUnicodeFont();
  let FAMILY = "helvetica";
  if (uni) {
    try {
      doc.addFileToVFS("POUni-Regular.ttf", uni.normal);
      doc.addFont("POUni-Regular.ttf", "POUni", "normal");
      doc.addFileToVFS("POUni-Bold.ttf", uni.bold);
      doc.addFont("POUni-Bold.ttf", "POUni", "bold");
      FAMILY = "POUni";
    } catch {
      FAMILY = "helvetica";
    }
  }
  const RUPEE = FAMILY === "POUni" ? "\u20B9" : "Rs.";
  // Table cells show bare numbers (the symbol lives in the column header) so
  // amounts never wrap; the summary block uses the prefixed form.
  const INR = (n: number) => `${RUPEE} ${num2(n)}`;
  const f = (style: "normal" | "bold", size: number) => {
    doc.setFont(FAMILY, style);
    doc.setFontSize(size);
  };
  const setText = (c: [number, number, number] | number) =>
    Array.isArray(c) ? doc.setTextColor(c[0], c[1], c[2]) : doc.setTextColor(c);

  let y = 12;

  /* ------------------------------ Header ---------------------------------- */
  const logoSrc = company.logo_url || bbLogo;
  const logoData = await loadImageDataUrl(logoSrc);
  let headerTextX = marginX;
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", marginX, y, 18, 18);
      headerTextX = marginX + 22;
    } catch {
      /* noop */
    }
  }

  f("bold", 15);
  setText(NAVY);
  doc.text(company.company_name || "Bharat Builders", headerTextX, y + 5.5);
  f("normal", 8);
  setText(90);
  let cy = y + 10.5;
  const compLines: string[] = [];
  if (company.address) compLines.push(company.address);
  const line2: string[] = [];
  if (company.phone) line2.push(`Ph: ${company.phone}`);
  if (company.email) line2.push(company.email);
  if (line2.length) compLines.push(line2.join("  |  "));
  if (company.gst_number) compLines.push(`GSTIN: ${company.gst_number}`);
  compLines.forEach((l) => {
    const wrapped = doc.splitTextToSize(l, 88);
    doc.text(wrapped, headerTextX, cy);
    cy += wrapped.length * 3.8;
  });

  // Right: title + metadata box
  f("bold", 17);
  setText(NAVY);
  doc.text("PURCHASE ORDER", rightX, y + 6, { align: "right" });

  const metaBoxW = 68;
  const metaBoxX = rightX - metaBoxW;
  const metaRows: Array<[string, string]> = [
    ["PO No.", order.po_number || "-"],
    ["PO Date", fmtDate(order.order_date)],
  ];
  if (order.version) metaRows.push(["Version", `v${order.version}`]);
  if (order.requisition_number) metaRows.push(["Requisition", order.requisition_number]);
  const metaBoxY = y + 9;
  const metaRowH = 4.6;
  const metaBoxH = metaRows.length * metaRowH + 2;
  doc.setDrawColor(GREY_LINE[0], GREY_LINE[1], GREY_LINE[2]);
  doc.setLineWidth(0.2);
  doc.rect(metaBoxX, metaBoxY, metaBoxW, metaBoxH);
  let my = metaBoxY + 4;
  metaRows.forEach(([k, v]) => {
    f("normal", 8);
    setText(110);
    doc.text(k, metaBoxX + 2, my);
    f("bold", 8);
    setText(30);
    doc.text(String(v), metaBoxX + metaBoxW - 2, my, { align: "right" });
    my += metaRowH;
  });

  y = Math.max(cy, metaBoxY + metaBoxH, y + 20) + 2;
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(0.7);
  doc.line(marginX, y, rightX, y);
  y += 4;

  /* --------------------- Vendor / Ship To / Bill To ------------------------ */
  const gap = 3;
  const panelW = (usableW - gap * 2) / 3;
  const panelX = [marginX, marginX + panelW + gap, marginX + (panelW + gap) * 2];

  const vendorBlock: string[] = [];
  if (vendor.name) vendorBlock.push(vendor.name);
  if (vendor.contact_person) vendorBlock.push(`Attn: ${vendor.contact_person}`);
  if (vendor.phone) vendorBlock.push(`Ph: ${vendor.phone}`);
  if (vendor.email) vendorBlock.push(vendor.email);
  if (vendor.address) vendorBlock.push(vendor.address);
  if (vendor.gst_number) vendorBlock.push(`GSTIN: ${vendor.gst_number}`);
  if (!vendorBlock.length) vendorBlock.push("-");

  const blocks: Array<{ title: string; lines: string[] }> = [
    { title: "VENDOR", lines: vendorBlock },
    { title: "SHIP TO", lines: (order.ship_to || "-").split("\n") },
    { title: "BILL TO", lines: (order.bill_to || "-").split("\n") },
  ];

  // Pre-measure so all three panels share one height.
  f("normal", 8);
  const wrappedBlocks = blocks.map((b) =>
    b.lines.flatMap((l) => doc.splitTextToSize(String(l || ""), panelW - 4) as string[]),
  );
  const maxLines = Math.max(...wrappedBlocks.map((w) => w.length), 1);
  const capH = 5;
  const panelH = capH + maxLines * 3.9 + 3;

  blocks.forEach((b, i) => {
    const x = panelX[i];
    doc.setFillColor(BAND[0], BAND[1], BAND[2]);
    doc.rect(x, y, panelW, capH, "F");
    doc.setDrawColor(GREY_LINE[0], GREY_LINE[1], GREY_LINE[2]);
    doc.setLineWidth(0.2);
    doc.rect(x, y, panelW, panelH);
    f("bold", 7.5);
    setText(NAVY);
    doc.text(b.title, x + 2, y + 3.5);
    f("normal", 8);
    setText(45);
    let ty = y + capH + 3.2;
    wrappedBlocks[i].forEach((l) => {
      doc.text(l, x + 2, ty);
      ty += 3.9;
    });
  });
  y += panelH + 3.5;

  /* --------------------------- Meta strip ---------------------------------- */
  const metaCells: Array<[string, string]> = [
    ["Site / Project", order.site_name || "-"],
    ["Requisition", [order.requisition_number, order.requisition_name].filter(Boolean).join(" · ") || "-"],
    ["Expected Delivery", fmtDate(order.expected_delivery_date)],
    ["Payment Terms", order.payment_terms || "-"],
  ];
  const cellW = usableW / metaCells.length;
  f("normal", 7.5);
  const metaValLines = metaCells.map(([, v]) => doc.splitTextToSize(v, cellW - 4) as string[]);
  const stripH = 4.4 + Math.max(...metaValLines.map((l) => l.length)) * 3.6 + 2.2;
  doc.setDrawColor(GREY_LINE[0], GREY_LINE[1], GREY_LINE[2]);
  doc.setLineWidth(0.2);
  doc.rect(marginX, y, usableW, stripH);
  metaCells.forEach(([k], i) => {
    const x = marginX + cellW * i;
    if (i > 0) doc.line(x, y, x, y + stripH);
    f("normal", 7);
    setText(120);
    doc.text(k.toUpperCase(), x + 2, y + 3.4);
    f("bold", 8);
    setText(30);
    doc.text(metaValLines[i], x + 2, y + 7.4);
  });
  y += stripH + 4;

  /* ---------------------------- Items table -------------------------------- */
  const rawCols: Array<Omit<Col, "x">> = [
    { label: "#", w: 6, align: "left" },
    { label: "Material", w: 30, align: "left" },
    { label: "Description", w: 32, align: "left" },
    { label: "Qty", w: 11, align: "right" },
    { label: "UOM", w: 11, align: "left" },
    { label: `Rate (${RUPEE})`, w: 17, align: "right" },
    { label: "Disc %", w: 11, align: "right" },
    { label: `Rate a/Disc (${RUPEE})`, w: 18, align: "right" },
    { label: "GST %", w: 10, align: "right" },
    { label: `GST Amt (${RUPEE})`, w: 18, align: "right" },
    { label: `Line Total (${RUPEE})`, w: 20, align: "right" },
  ];
  const rawTotal = rawCols.reduce((s, c) => s + c.w, 0);
  const scale = usableW / rawTotal;
  const cols: Col[] = [];
  let accX = marginX;
  rawCols.forEach((c) => {
    const w = c.w * scale;
    cols.push({ ...c, w, x: accX });
    accX += w;
  });

  const cellTextX = (c: Col) => (c.align === "right" ? c.x + c.w - 1.6 : c.x + 1.6);

  f("bold", 6.8);
  const headerLines = cols.map((c) => doc.splitTextToSize(c.label, c.w - 3.2) as string[]);
  const headerRows = Math.max(...headerLines.map((l) => l.length), 1);
  const headerH = headerRows * 3.3 + 2.6;

  const drawTableHeader = (yy: number) => {
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(marginX, yy, usableW, headerH, "F");
    f("bold", 6.8);
    setText([255, 255, 255]);
    cols.forEach((c, i) => {
      doc.text(headerLines[i], cellTextX(c), yy + 3.4, { align: c.align });
    });
    return yy + headerH;
  };

  y = drawTableHeader(y);

  let gross = 0;
  let totalDisc = 0;
  let totalGst = 0;
  let rowIdx = 0;

  items.forEach((it, idx) => {
    const qty = Number(it.qty) || 0;
    const rate = Number(it.rate) || 0;
    const lineGross = qty * rate;
    const disc = Number(it.discount) || 0;
    const discPct = lineGross > 0 ? (disc / lineGross) * 100 : 0;
    const rateAfterDisc = qty > 0 ? rate - disc / qty : Math.max(0, rate - disc);
    const taxable = Math.max(0, lineGross - disc);
    const gstPct = Number(it.gst_percent) || 0;
    const gstAmt = taxable * (gstPct / 100);
    const lineTotal = taxable + gstAmt;
    gross += lineGross;
    totalDisc += disc;
    totalGst += gstAmt;

    const values = [
      String(idx + 1),
      it.product_name || "-",
      it.description || "",
      qty ? String(it.qty) : "-",
      it.uom || "-",
      INR(rate),
      discPct ? `${num2(discPct)}%` : "-",
      INR(rateAfterDisc),
      `${gstPct}%`,
      INR(gstAmt),
      INR(lineTotal),
    ];

    f("normal", 7.2);
    const wrapped = values.map((v, i) => doc.splitTextToSize(String(v), cols[i].w - 3.2) as string[]);
    const rowH = Math.max(...wrapped.map((w) => w.length), 1) * 3.6 + 2.4;

    if (y + rowH > pageH - 34) {
      doc.addPage();
      y = 14;
      y = drawTableHeader(y);
      rowIdx = 0;
    }

    if (rowIdx % 2 === 1) {
      doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]);
      doc.rect(marginX, y, usableW, rowH, "F");
    }
    f("normal", 7.2);
    setText(35);
    wrapped.forEach((lines, i) => {
      if (!lines.length || (lines.length === 1 && !lines[0])) return;
      doc.text(lines, cellTextX(cols[i]), y + 3.6, { align: cols[i].align });
    });
    doc.setDrawColor(228, 231, 237);
    doc.setLineWidth(0.15);
    doc.line(marginX, y + rowH, rightX, y + rowH);
    y += rowH;
    rowIdx += 1;
  });

  doc.setDrawColor(GREY_LINE[0], GREY_LINE[1], GREY_LINE[2]);
  doc.setLineWidth(0.3);
  doc.rect(marginX, y - 0.1, usableW, 0.1);
  y += 3.5;

  /* -------------------------- Financial summary ---------------------------- */
  const taxableTotal = Math.max(0, gross - totalDisc);
  const grand = taxableTotal + totalGst;

  const sumRows: Array<[string, string]> = [];
  if (totalDisc > 0) {
    sumRows.push(["Gross Amount", INR(gross)]);
    sumRows.push(["Discount", `- ${INR(totalDisc)}`]);
  }
  sumRows.push(["Taxable Amount", INR(taxableTotal)]);
  sumRows.push(["Total GST", INR(totalGst)]);

  const sumW = 78;
  const sumX = rightX - sumW;
  const sumRowH = 5;
  const sumH = sumRows.length * sumRowH + 8.5;

  if (y + sumH > pageH - 30) {
    doc.addPage();
    y = 14;
  }

  doc.setDrawColor(GREY_LINE[0], GREY_LINE[1], GREY_LINE[2]);
  doc.setLineWidth(0.2);
  doc.rect(sumX, y, sumW, sumH);
  let sy = y + 4;
  sumRows.forEach(([k, v]) => {
    f("normal", 8.5);
    setText(80);
    doc.text(k, sumX + 2.5, sy);
    f("normal", 8.5);
    setText(35);
    doc.text(v, rightX - 2.5, sy, { align: "right" });
    sy += sumRowH;
  });
  // Grand total band
  const gtY = y + sumH - 8.5 + 1.5;
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(sumX, gtY, sumW, 7, "F");
  f("bold", 10);
  setText([255, 255, 255]);
  doc.text("GRAND TOTAL", sumX + 2.5, gtY + 4.8);
  doc.text(INR(grand), rightX - 2.5, gtY + 4.8, { align: "right" });

  const afterSummaryY = y + sumH + 4;

  /* --------------------------- Terms & Conditions -------------------------- */
  y = afterSummaryY;
  const terms = (order.terms_and_conditions || []).filter((t) => t && t.trim().length);
  if (terms.length) {
    if (y > pageH - 45) {
      doc.addPage();
      y = 14;
    }
    f("bold", 8.5);
    setText(NAVY);
    doc.text("TERMS & CONDITIONS", marginX, y);
    y += 4;
    f("normal", 7.5);
    setText(60);
    terms.forEach((t, i) => {
      const wrapped = doc.splitTextToSize(`${i + 1}.  ${t}`, usableW - 2) as string[];
      if (y + wrapped.length * 3.5 > pageH - 28) {
        doc.addPage();
        y = 14;
        f("normal", 7.5);
        setText(60);
      }
      doc.text(wrapped, marginX + 1, y);
      y += wrapped.length * 3.5 + 0.8;
    });
    y += 3;
  }

  /* ------------------------------ Signatures ------------------------------- */
  if (y > pageH - 26) {
    doc.addPage();
    y = pageH - 30;
  }
  const sigY = Math.max(y + 12, pageH - 22);
  const sigW = 60;
  const sigBlocks: Array<[string, string]> = [
    ["Prepared By", ""],
    ["Authorised Signatory", company.company_name || "Bharat Builders"],
  ];
  sigBlocks.forEach(([label, sub], i) => {
    const x = i === 0 ? marginX : rightX - sigW;
    doc.setDrawColor(140);
    doc.setLineWidth(0.25);
    doc.line(x, sigY, x + sigW, sigY);
    f("normal", 8);
    setText(60);
    doc.text(label, i === 0 ? x : x + sigW, sigY + 4, { align: i === 0 ? "left" : "right" });
    if (sub) {
      f("normal", 7);
      setText(130);
      doc.text(sub, x + sigW, sigY + 7.6, { align: "right" });
    }
  });

  /* -------------------------------- Footer --------------------------------- */
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    f("normal", 7);
    setText(140);
    doc.text(
      `${company.company_name || "Bharat Builders"}  ·  PO ${order.po_number || ""}${order.version ? ` · v${order.version}` : ""}`,
      marginX,
      pageH - 6,
    );
    doc.text(`Page ${p} of ${total}`, rightX, pageH - 6, { align: "right" });
  }
  setText(0);

  return doc;
}
