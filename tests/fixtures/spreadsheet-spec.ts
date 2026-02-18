import type { SpreadsheetSpec } from "@/types";

export function makeSpreadsheetSpec(): SpreadsheetSpec {
  return {
    sheets: [
      {
        name: "Instructions",
        purpose: "Welcome and usage guide",
        is_instructions: true,
        columns: [
          { letter: "A", header: "", width: 60, type: "text" },
          { letter: "B", header: "", width: 30, type: "text" },
          { letter: "C", header: "", width: 20, type: "text" },
          { letter: "D", header: "", width: 20, type: "text" },
        ],
        rows: [
          {
            row: 1,
            is_header: false,
            is_total: false,
            is_sample: false,
            cells: {
              A: {
                value: "Monthly Budget Tracker Template",
                style: { bold: true, font_color: "#FFFFFF", bg_color: "#2B579A", h_align: "center" },
              },
            },
          },
          {
            row: 3,
            is_header: false,
            is_total: false,
            is_sample: false,
            cells: {
              A: { value: "How to Use This Template:", style: { bold: true } },
            },
          },
          {
            row: 4,
            is_header: false,
            is_total: false,
            is_sample: false,
            cells: {
              A: { value: "1. Go to the Budget sheet and enter your income sources" },
            },
          },
          {
            row: 5,
            is_header: false,
            is_total: false,
            is_sample: false,
            cells: {
              A: { value: "2. Add your expense categories and amounts" },
            },
          },
        ],
        frozen: { rows: 0, cols: 0 },
        merged_cells: ["A1:D1"],
        protected_ranges: [],
        conditional_formats: [],
      },
      {
        name: "Budget",
        purpose: "Monthly income and expense tracking",
        is_instructions: false,
        columns: [
          { letter: "A", header: "Category", width: 25, type: "text" },
          { letter: "B", header: "Budget", width: 15, type: "currency" },
          { letter: "C", header: "Actual", width: 15, type: "currency" },
          { letter: "D", header: "Difference", width: 15, type: "currency" },
          { letter: "E", header: "% Used", width: 12, type: "percentage" },
        ],
        rows: [
          {
            row: 1,
            is_header: true,
            is_total: false,
            is_sample: false,
            cells: {
              A: { value: "Category", style: { bold: true, bg_color: "#2B579A", font_color: "#FFFFFF" } },
              B: { value: "Budget", style: { bold: true, bg_color: "#2B579A", font_color: "#FFFFFF" } },
              C: { value: "Actual", style: { bold: true, bg_color: "#2B579A", font_color: "#FFFFFF" } },
              D: { value: "Difference", style: { bold: true, bg_color: "#2B579A", font_color: "#FFFFFF" } },
              E: { value: "% Used", style: { bold: true, bg_color: "#2B579A", font_color: "#FFFFFF" } },
            },
          },
          {
            row: 2,
            is_header: false,
            is_total: false,
            is_sample: true,
            cells: {
              A: { value: "Housing" },
              B: { value: 1500 },
              C: { value: 1450 },
              D: { formula: "=C{row}-B{row}" },
              E: { formula: "=C{row}/B{row}" },
            },
          },
          {
            row: 3,
            is_header: false,
            is_total: false,
            is_sample: true,
            cells: {
              A: { value: "Groceries", style: { bg_color: "#F0F4FA" } },
              B: { value: 500, style: { bg_color: "#F0F4FA" } },
              C: { value: 475, style: { bg_color: "#F0F4FA" } },
              D: { formula: "=C{row}-B{row}", style: { bg_color: "#F0F4FA" } },
              E: { formula: "=C{row}/B{row}", style: { bg_color: "#F0F4FA" } },
            },
          },
          {
            row: 4,
            is_header: false,
            is_total: false,
            is_sample: true,
            cells: {
              A: { value: "Transportation" },
              B: { value: 300 },
              C: { value: 280 },
              D: { formula: "=C{row}-B{row}" },
              E: { formula: "=C{row}/B{row}" },
            },
          },
          {
            row: 5,
            is_header: false,
            is_total: true,
            is_sample: false,
            cells: {
              A: { value: "TOTAL", style: { bold: true, border: "medium" } },
              B: { formula: "=SUM(B2:B4)", style: { bold: true, border: "medium" } },
              C: { formula: "=SUM(C2:C4)", style: { bold: true, border: "medium" } },
              D: { formula: "=SUM(D2:D4)", style: { bold: true, border: "medium" } },
              E: { formula: "=C5/B5", style: { bold: true, border: "medium" } },
            },
          },
        ],
        frozen: { rows: 1, cols: 1 },
        merged_cells: [],
        protected_ranges: ["D2:D4", "E2:E4"],
        conditional_formats: [
          {
            range: "E2:E4",
            rule: "E2>1",
            style: {
              font: { color: { argb: "FFFF0000" } },
              fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCCCC" } },
            },
          },
        ],
      },
    ],
    color_scheme: {
      primary: "#2B579A",
      secondary: "#5B9BD5",
      accent: "#ED7D31",
      header_bg: "#2B579A",
      header_text: "#FFFFFF",
      alt_row_bg: "#F0F4FA",
    },
  };
}

export function makeMinimalSpec(): SpreadsheetSpec {
  return {
    sheets: [
      {
        name: "Sheet1",
        purpose: "Test",
        is_instructions: false,
        columns: [
          { letter: "A", header: "Name", width: 20, type: "text" },
        ],
        rows: [
          {
            row: 1,
            is_header: true,
            is_total: false,
            is_sample: false,
            cells: { A: { value: "Name", style: { bold: true } } },
          },
          {
            row: 2,
            is_header: false,
            is_total: false,
            is_sample: true,
            cells: { A: { value: "Alice" } },
          },
        ],
        frozen: { rows: 0, cols: 0 },
        merged_cells: [],
        protected_ranges: [],
        conditional_formats: [],
      },
    ],
    color_scheme: {
      primary: "#2B579A",
      secondary: "#5B9BD5",
      accent: "#ED7D31",
      header_bg: "#2B579A",
      header_text: "#FFFFFF",
      alt_row_bg: "#F0F4FA",
    },
  };
}

export function makeEmptySpec(): SpreadsheetSpec {
  return {
    sheets: [],
    color_scheme: {
      primary: "#2B579A",
      secondary: "#5B9BD5",
      accent: "#ED7D31",
      header_bg: "#2B579A",
      header_text: "#FFFFFF",
      alt_row_bg: "#F0F4FA",
    },
  };
}
