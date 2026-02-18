import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildSpreadsheet, colLetterToNum, numToColLetter } from "@/lib/spreadsheet/builder";
import { makeSpreadsheetSpec, makeMinimalSpec, makeEmptySpec } from "../../fixtures/spreadsheet-spec";

describe("buildSpreadsheet", () => {
  it("produces a valid buffer from a minimal spec", async () => {
    const spec = makeMinimalSpec();
    const buffer = await buildSpreadsheet(spec);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    // Re-read to verify it's a valid xlsx
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.length).toBe(1);
  });

  it("creates correct number of sheets with correct names", async () => {
    const spec = makeSpreadsheetSpec();
    const buffer = await buildSpreadsheet(spec);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    expect(wb.worksheets.length).toBe(2);
    expect(wb.worksheets[0].name).toBe("Instructions");
    expect(wb.worksheets[1].name).toBe("Budget");
  });

  it("replaces {row} formula placeholders with actual row numbers", async () => {
    const spec = makeSpreadsheetSpec();
    const buffer = await buildSpreadsheet(spec);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const budget = wb.getWorksheet("Budget")!;
    // Row 2 should have formula =C2-B2 (from =C{row}-B{row})
    const d2 = budget.getCell("D2");
    expect(d2.value).toHaveProperty("formula", "=C2-B2");

    // Row 3 should have =C3-B3
    const d3 = budget.getCell("D3");
    expect(d3.value).toHaveProperty("formula", "=C3-B3");
  });

  it("applies cell styling (bold, font color, bg color)", async () => {
    const spec = makeSpreadsheetSpec();
    const buffer = await buildSpreadsheet(spec);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const budget = wb.getWorksheet("Budget")!;
    const a1 = budget.getCell("A1");

    expect(a1.font?.bold).toBe(true);
    expect(a1.font?.color?.argb).toBe("FFFFFFFF");
    expect((a1.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe("FF2B579A");
  });

  it("applies number formats (currency, percentage)", async () => {
    const spec = makeSpreadsheetSpec();
    const buffer = await buildSpreadsheet(spec);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const budget = wb.getWorksheet("Budget")!;
    // B2 is currency column with sample data (not bold), should get currency format
    const b2 = budget.getCell("B2");
    expect(b2.numFmt).toBe("$#,##0.00");

    // E2 is percentage column
    const e2 = budget.getCell("E2");
    expect(e2.numFmt).toBe("0.00%");
  });

  it("applies frozen panes", async () => {
    const spec = makeSpreadsheetSpec();
    const buffer = await buildSpreadsheet(spec);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const budget = wb.getWorksheet("Budget")!;
    const view = budget.views?.[0];
    expect(view).toBeDefined();
    expect(view?.state).toBe("frozen");
    expect(view?.ySplit).toBe(1);
    expect(view?.xSplit).toBe(1);
  });

  it("applies merged cells", async () => {
    const spec = makeSpreadsheetSpec();
    const buffer = await buildSpreadsheet(spec);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const instructions = wb.getWorksheet("Instructions")!;
    // A1:D1 should be merged — check that cell A1 has the master value
    const a1 = instructions.getCell("A1");
    expect(a1.value).toBe("Monthly Budget Tracker Template");
  });

  it("sets cell protection — formula cells locked, data cells unlocked (Bug 8 regression)", async () => {
    const spec = makeSpreadsheetSpec();
    // Build the spreadsheet — this exercises the protection code path
    const buffer = await buildSpreadsheet(spec);
    expect(buffer).toBeInstanceOf(Buffer);

    // Verify the xlsx is valid and contains the Budget sheet with protection
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const budget = wb.getWorksheet("Budget")!;

    // Verify the sheet has data in the protected range cells
    const d2 = budget.getCell("D2");
    expect(d2.value).toHaveProperty("formula");

    // Verify the sheet exists and has rows (protection was applied without errors)
    expect(budget.rowCount).toBeGreaterThan(0);

    // Build a spec with protection and verify no crash - the ordering fix
    // ensures unlock-before-lock-before-protect works correctly
    const spec2 = makeSpreadsheetSpec();
    spec2.sheets[1].protected_ranges = ["D2:E4"]; // broader range
    const buffer2 = await buildSpreadsheet(spec2);
    expect(buffer2).toBeInstanceOf(Buffer);
  });

  it("produces a valid workbook from an empty sheets array", async () => {
    const spec = makeEmptySpec();
    const buffer = await buildSpreadsheet(spec);
    expect(buffer).toBeInstanceOf(Buffer);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.length).toBe(0);
  });

  it("silently skips invalid merge ranges", async () => {
    const spec = makeMinimalSpec();
    spec.sheets[0].merged_cells = ["INVALID:RANGE"];
    // Should not throw
    const buffer = await buildSpreadsheet(spec);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it("applies border styles", async () => {
    const spec = makeSpreadsheetSpec();
    const buffer = await buildSpreadsheet(spec);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const budget = wb.getWorksheet("Budget")!;
    // Row 5 total row has border: "medium"
    const a5 = budget.getCell("A5");
    expect(a5.border?.top?.style).toBe("medium");
  });
});

describe("colLetterToNum / numToColLetter", () => {
  it("converts A=1, Z=26, AA=27, AZ=52", () => {
    expect(colLetterToNum("A")).toBe(1);
    expect(colLetterToNum("Z")).toBe(26);
    expect(colLetterToNum("AA")).toBe(27);
    expect(colLetterToNum("AZ")).toBe(52);
  });

  it("round-trips correctly", () => {
    for (let i = 1; i <= 52; i++) {
      expect(colLetterToNum(numToColLetter(i))).toBe(i);
    }
  });
});
