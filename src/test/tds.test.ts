import { describe, it, expect } from "vitest";
import { tdsAmountOnTaxable, invoiceNetPayable } from "@/lib/procurement";

describe("TDS on vendor invoices", () => {
  // Real case: taxable ₹20,600 + 18% GST = ₹24,308 invoiced; 1% TDS on the
  // taxable base = ₹206; vendor paid ₹24,102 — fully settled.
  it("deducts TDS on the taxable base, not the GST-inclusive total", () => {
    const taxable = 20600;
    const invoiceTotal = taxable * 1.18;
    expect(invoiceTotal).toBeCloseTo(24308, 2);
    expect(tdsAmountOnTaxable(taxable, 1)).toBeCloseTo(206, 2);
  });

  it("balances to zero when payment covers the net payable", () => {
    const net = invoiceNetPayable(24308, 206);
    expect(net).toBeCloseTo(24102, 2);
    expect(net - 24102).toBeCloseTo(0, 2);
  });

  it("defaults to no deduction for invoices without TDS", () => {
    expect(tdsAmountOnTaxable(20600, 0)).toBe(0);
    expect(invoiceNetPayable(24308, 0)).toBe(24308);
  });
});
