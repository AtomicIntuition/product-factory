import ExcelJS from "exceljs";
import type { SpreadsheetSpec, SheetSpec } from "@/types";

function hexToArgb(hex: string): string {
  const clean = hex.replace("#", "");
  return `FF${clean}`;
}

function applyBorder(style: ExcelJS.Border): ExcelJS.Border {
  return style;
}

function getCellStyle(
  cellStyle: { bold?: boolean; font_color?: string; bg_color?: string; h_align?: string; border?: string } | undefined,
): { font: Partial<ExcelJS.Font>; fill: ExcelJS.Fill | undefined; alignment: Partial<ExcelJS.Alignment>; border: Partial<ExcelJS.Borders> | undefined } {
  const font: Partial<ExcelJS.Font> = {};
  let fill: ExcelJS.Fill | undefined;
  const alignment: Partial<ExcelJS.Alignment> = {};
  let border: Partial<ExcelJS.Borders> | undefined;

  if (cellStyle?.bold) font.bold = true;
  if (cellStyle?.font_color) font.color = { argb: hexToArgb(cellStyle.font_color) };
  if (cellStyle?.bg_color) {
    fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: hexToArgb(cellStyle.bg_color) },
    };
  }
  if (cellStyle?.h_align) {
    alignment.horizontal = cellStyle.h_align as "left" | "center" | "right";
  }
  if (cellStyle?.border) {
    const borderStyle = cellStyle.border === "medium" ? "medium" : "thin";
    const b = applyBorder({ style: borderStyle, color: { argb: "FF000000" } });
    border = { top: b, bottom: b, left: b, right: b };
  }

  return { font, fill, alignment, border };
}

function getNumberFormat(type: string, format?: string): string | undefined {
  if (format) return format;
  switch (type) {
    case "currency": return "$#,##0.00";
    case "percentage": return "0.00%";
    case "date": return "mm/dd/yyyy";
    case "number": return "#,##0";
    default: return undefined;
  }
}

export async function buildSpreadsheet(spec: SpreadsheetSpec): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Product Factory";
  workbook.created = new Date();

  for (const sheetSpec of spec.sheets) {
    const worksheet = workbook.addWorksheet(sheetSpec.name);

    // Set column definitions
    if (sheetSpec.columns.length > 0) {
      worksheet.columns = sheetSpec.columns.map((col) => ({
        key: col.letter,
        width: col.width,
      }));
    }

    // Apply frozen panes
    if (sheetSpec.frozen.rows > 0 || sheetSpec.frozen.cols > 0) {
      worksheet.views = [
        {
          state: "frozen",
          xSplit: sheetSpec.frozen.cols,
          ySplit: sheetSpec.frozen.rows,
        },
      ];
    }

    // Add rows with data and styling
    addRows(worksheet, sheetSpec);

    // Apply merged cells
    for (const mergeRange of sheetSpec.merged_cells) {
      try {
        worksheet.mergeCells(mergeRange);
      } catch {
        // Merge may fail if cells already merged or invalid range
      }
    }

    // Apply conditional formatting (only if no data validation on sheet — per exceljs bug)
    for (const cf of sheetSpec.conditional_formats) {
      try {
        const cfStyle = cf.style as Record<string, unknown>;
        worksheet.addConditionalFormatting({
          ref: cf.range,
          rules: [
            {
              type: "expression",
              formulae: [cf.rule],
              style: {
                font: cfStyle.font as Partial<ExcelJS.Font>,
                fill: cfStyle.fill as ExcelJS.Fill,
              },
              priority: 1,
            },
          ],
        });
      } catch {
        // Conditional format may fail with invalid rules
      }
    }

    // Protect sheet (but allow editing of non-formula cells)
    if (sheetSpec.protected_ranges.length > 0) {
      // Step 1: Mark all cells as unlocked by default
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.protection = { locked: false };
        });
      });

      // Step 2: Lock protected ranges (formula cells)
      for (const range of sheetSpec.protected_ranges) {
        try {
          const cells = parseCellRange(range);
          for (const cellRef of cells) {
            const cell = worksheet.getCell(cellRef);
            cell.protection = { locked: true };
          }
        } catch {
          // Invalid range format
        }
      }

      // Step 3: Apply sheet protection after cell lock states are set
      await worksheet.protect("", {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: true,
        formatColumns: true,
        formatRows: true,
        insertColumns: false,
        insertRows: true,
        deleteColumns: false,
        deleteRows: true,
        sort: true,
        autoFilter: true,
      });
    }
  }

  // Write to buffer
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const buffer = Buffer.from(uint8);

  // Validation: try to re-read the workbook to ensure it's not corrupt
  try {
    const validationWorkbook = new ExcelJS.Workbook();
    await validationWorkbook.xlsx.load(uint8 as never);
    console.log(`[builder] Validation passed: ${validationWorkbook.worksheets.length} sheets, file size: ${buffer.length} bytes`);
  } catch (err) {
    throw new Error(`Generated .xlsx is corrupt: ${err instanceof Error ? err.message : String(err)}`);
  }

  return buffer;
}

function addRows(worksheet: ExcelJS.Worksheet, sheetSpec: SheetSpec): void {
  // Build a set of column number formats
  const colFormats = new Map<string, string>();
  for (const col of sheetSpec.columns) {
    const fmt = getNumberFormat(col.type, col.number_format);
    if (fmt) colFormats.set(col.letter, fmt);
  }

  for (const rowSpec of sheetSpec.rows) {
    const rowNumber = rowSpec.row;

    for (const [colLetter, cellSpec] of Object.entries(rowSpec.cells)) {
      const cellRef = `${colLetter}${rowNumber}`;
      const cell = worksheet.getCell(cellRef);

      // Set value or formula
      if (cellSpec.formula) {
        // Replace {row} placeholder with actual row number
        const formula = cellSpec.formula.replace(/\{row\}/g, String(rowNumber));
        cell.value = { formula };
      } else if (cellSpec.value !== undefined && cellSpec.value !== null) {
        cell.value = cellSpec.value;
      }

      // Apply cell-level style
      if (cellSpec.style) {
        const { font, fill, alignment, border } = getCellStyle(cellSpec.style);
        if (Object.keys(font).length > 0) cell.font = font;
        if (fill) cell.fill = fill;
        if (Object.keys(alignment).length > 0) cell.alignment = alignment;
        if (border) cell.border = border;
      }

      // Apply column number format
      const fmt = colFormats.get(colLetter);
      if (fmt && !cellSpec.style?.bold) {
        // Don't override header formatting
        cell.numFmt = fmt;
      }
    }
  }
}

function parseCellRange(range: string): string[] {
  // Parse "A2:A50" into individual cell references
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return [range]; // Single cell reference

  const [, startCol, startRowStr, endCol, endRowStr] = match;
  const startRow = parseInt(startRowStr);
  const endRow = parseInt(endRowStr);
  const cells: string[] = [];

  // Simple case: same column range
  if (startCol === endCol) {
    for (let r = startRow; r <= endRow; r++) {
      cells.push(`${startCol}${r}`);
    }
  } else {
    // Multi-column range
    const startColNum = colLetterToNum(startCol);
    const endColNum = colLetterToNum(endCol);
    for (let c = startColNum; c <= endColNum; c++) {
      const colLetter = numToColLetter(c);
      for (let r = startRow; r <= endRow; r++) {
        cells.push(`${colLetter}${r}`);
      }
    }
  }

  return cells;
}

export function colLetterToNum(col: string): number {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num;
}

export function numToColLetter(num: number): string {
  let result = "";
  while (num > 0) {
    const remainder = (num - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}
