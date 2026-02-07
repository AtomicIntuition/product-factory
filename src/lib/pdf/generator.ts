import { jsPDF } from "jspdf";

interface ProductSection {
  title: string;
  prompts: string[];
}

interface ProductContent {
  format: string;
  sections: ProductSection[];
  total_prompts: number;
}

interface PdfProductInput {
  title: string;
  description: string;
  content: ProductContent;
  price_cents: number;
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 25;
const MARGIN_RIGHT = 25;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 30;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

function addFooter(doc: jsPDF, title: string): void {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(title, MARGIN_LEFT, PAGE_HEIGHT - 15);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 15, {
      align: "right",
    });
  }
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_HEIGHT - MARGIN_BOTTOM) {
    doc.addPage();
    return MARGIN_TOP;
  }
  return y;
}

export function generateProductPdf(product: PdfProductInput): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const sections = product.content.sections;
  const totalPrompts = product.content.total_prompts;

  // --- COVER PAGE ---
  doc.setFillColor(15, 15, 25);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  const titleLines = doc.splitTextToSize(product.title, CONTENT_WIDTH);
  const titleY = 90;
  doc.text(titleLines, PAGE_WIDTH / 2, titleY, { align: "center" });

  // Subtitle / stats
  const subtitleY = titleY + titleLines.length * 12 + 15;
  doc.setFontSize(14);
  doc.setTextColor(180, 180, 200);
  doc.text(`${totalPrompts} Expert Prompts`, PAGE_WIDTH / 2, subtitleY, { align: "center" });
  doc.text(`${sections.length} Sections`, PAGE_WIDTH / 2, subtitleY + 8, { align: "center" });

  // Price
  doc.setFontSize(12);
  doc.setTextColor(100, 200, 255);
  doc.text(
    `$${(product.price_cents / 100).toFixed(2)}`,
    PAGE_WIDTH / 2,
    subtitleY + 24,
    { align: "center" },
  );

  // Footer branding
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 120);
  doc.text("Created with Product Factory", PAGE_WIDTH / 2, PAGE_HEIGHT - 25, {
    align: "center",
  });

  // --- TABLE OF CONTENTS ---
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");

  let y = MARGIN_TOP;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(20);
  doc.text("Table of Contents", MARGIN_LEFT, y);
  y += 15;

  doc.setFontSize(11);
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    y = ensureSpace(doc, y, 10);
    doc.setTextColor(50, 50, 50);
    doc.text(`${i + 1}. ${section.title}`, MARGIN_LEFT + 5, y);
    doc.setTextColor(130, 130, 130);
    doc.text(`${section.prompts.length} prompts`, PAGE_WIDTH - MARGIN_RIGHT, y, {
      align: "right",
    });
    y += 8;
  }

  // --- CONTENT PAGES ---
  let promptNumber = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    doc.addPage();
    y = MARGIN_TOP;

    // Section header
    doc.setFillColor(240, 245, 255);
    doc.rect(MARGIN_LEFT - 5, y - 7, CONTENT_WIDTH + 10, 14, "F");
    doc.setTextColor(30, 60, 120);
    doc.setFontSize(16);
    doc.text(`Section ${i + 1}: ${section.title}`, MARGIN_LEFT, y + 2);
    y += 18;

    // Prompts
    doc.setFontSize(10);
    for (let j = 0; j < section.prompts.length; j++) {
      promptNumber++;
      const promptText = section.prompts[j];

      // Wrap text
      const lines: string[] = doc.splitTextToSize(promptText, CONTENT_WIDTH - 15);
      const blockHeight = lines.length * 5 + 10;

      y = ensureSpace(doc, y, blockHeight);

      // Prompt number badge
      doc.setTextColor(80, 130, 200);
      doc.setFontSize(9);
      doc.text(`#${promptNumber}`, MARGIN_LEFT, y);

      // Prompt text
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(10);
      doc.text(lines, MARGIN_LEFT + 12, y);
      y += lines.length * 5 + 6;

      // Separator line
      if (j < section.prompts.length - 1) {
        doc.setDrawColor(220, 220, 220);
        doc.line(MARGIN_LEFT + 12, y - 2, PAGE_WIDTH - MARGIN_RIGHT, y - 2);
      }
    }
  }

  // Add footers to all pages (skip cover)
  addFooter(doc, product.title);

  // Return as Buffer
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
