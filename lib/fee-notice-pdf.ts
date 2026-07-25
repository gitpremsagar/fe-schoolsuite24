import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { schoolApi } from "@/lib/api/school";
import type { StudentDueNotice } from "@/lib/fee-notice";

type NoticeMode = "single" | "bulk";

type GenerateFeeNoticePdfOptions = {
  notices: StudentDueNotice[];
  dueDate: string;
  mode: NoticeMode;
};

type SchoolInfo = {
  name: string;
  address: string;
  phone: string;
};

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const PAGE_PADDING_PX = 30;
const CUT_GAP_PX = 18;
const NOTICE_FONT_FAMILY = "FeeNotice";
const NOTICE_FONT_URL = "/fonts/NotoSansDevanagari.ttf";

/**
 * Font bytes are fetched once per session. Notices render inside a bare iframe
 * so html2canvas never clones the app's Next.js stylesheets (Inter/Geist),
 * which otherwise re-request fonts on every PDF page.
 */
let noticeFontBufferPromise: Promise<ArrayBuffer> | null = null;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

async function loadNoticeFontBuffer(): Promise<ArrayBuffer> {
  if (!noticeFontBufferPromise) {
    noticeFontBufferPromise = (async () => {
      const response = await fetch(NOTICE_FONT_URL);
      if (!response.ok) {
        throw new Error("Failed to load notice font");
      }
      return response.arrayBuffer();
    })().catch((error) => {
      noticeFontBufferPromise = null;
      throw error;
    });
  }
  return noticeFontBufferPromise;
}

async function ensureNoticeFontOnDocument(
  targetDocument: Document,
  fontBuffer: ArrayBuffer,
): Promise<void> {
  const face = new FontFace(NOTICE_FONT_FAMILY, fontBuffer.slice(0));
  targetDocument.fonts.add(face);
  await face.load();
}

function money(value: number): string {
  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatDueDate(value: string, locale: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function schoolInfo(row: Record<string, unknown>): SchoolInfo {
  const address = [
    text(row.addressLine1),
    text(row.addressLine2),
    [text(row.city), text(row.state)].filter(Boolean).join(", "),
    text(row.postalCode),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    name: text(row.name) || "School",
    address,
    phone: text(row.phone),
  };
}

function node<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (content != null) element.textContent = content;
  return element;
}

function addLabelValue(
  doc: Document,
  parent: HTMLElement,
  label: string,
  value: string,
): void {
  const item = node(doc, "div", "fee-notice-info-item");
  item.append(node(doc, "span", "fee-notice-label", label));
  item.append(node(doc, "strong", "", value));
  parent.append(item);
}

function createNoticeSlip(
  doc: Document,
  notice: StudentDueNotice,
  school: SchoolInfo,
  dueDate: string,
  mode: NoticeMode,
): HTMLElement {
  const slip = node(
    doc,
    "section",
    `fee-notice-slip ${mode === "single" ? "fee-notice-slip-single" : ""}`,
  );

  const schoolHeader = node(doc, "header", "fee-notice-school");
  schoolHeader.append(node(doc, "h1", "", school.name));
  if (school.address) schoolHeader.append(node(doc, "p", "", school.address));
  if (school.phone) {
    schoolHeader.append(
      node(doc, "p", "", `Phone / फ़ोन: ${school.phone}`),
    );
  }
  slip.append(schoolHeader);

  slip.append(
    node(doc, "h2", "fee-notice-title", "FEE DUE NOTICE / शुल्क देय सूचना"),
  );

  const info = node(doc, "div", "fee-notice-info");
  addLabelValue(
    doc,
    info,
    "Student Name / विद्यार्थी का नाम",
    notice.studentName,
  );
  addLabelValue(doc, info, "Class / कक्षा", notice.classLabel);
  slip.append(info);

  const table = node(doc, "table", "fee-notice-table");
  const thead = node(doc, "thead");
  const headerRow = node(doc, "tr");
  headerRow.append(node(doc, "th", "", "Month / माह"));
  headerRow.append(node(doc, "th", "fee-notice-amount", "Due / देय राशि"));
  thead.append(headerRow);
  table.append(thead);

  const tbody = node(doc, "tbody");
  notice.dueMonths.forEach((month) => {
    const row = node(doc, "tr");
    row.append(
      node(doc, "td", "", `${month.labelEn} / ${month.labelHi}`),
      node(doc, "td", "fee-notice-amount", money(month.amount)),
    );
    tbody.append(row);
  });
  table.append(tbody);
  slip.append(table);

  const total = node(doc, "div", "fee-notice-total");
  total.append(
    node(doc, "span", "", "Total Due / कुल देय राशि"),
    node(doc, "strong", "", money(notice.totalDue)),
  );
  slip.append(total);

  const due = node(doc, "div", "fee-notice-due-date");
  due.append(
    node(doc, "span", "", "Due Date / भुगतान की अंतिम तिथि"),
    node(
      doc,
      "strong",
      "",
      `${formatDueDate(dueDate, "en-IN")} / ${formatDueDate(dueDate, "hi-IN")}`,
    ),
  );
  slip.append(due);

  slip.append(
    node(
      doc,
      "p",
      "fee-notice-footer",
      "Please pay the outstanding fee by the due date. / कृपया निर्धारित तिथि तक बकाया शुल्क का भुगतान करें।",
    ),
  );
  return slip;
}

function createPage(doc: Document): HTMLElement {
  return node(doc, "div", "fee-notice-page");
}

function buildPages(
  doc: Document,
  notices: StudentDueNotice[],
  school: SchoolInfo,
  dueDate: string,
  mode: NoticeMode,
  root: HTMLElement,
): HTMLElement[] {
  if (mode === "single") {
    const page = createPage(doc);
    page.append(
      createNoticeSlip(doc, notices[0], school, dueDate, "single"),
    );
    root.append(page);
    return [page];
  }

  const pages: HTMLElement[] = [];
  let page = createPage(doc);
  root.append(page);
  pages.push(page);
  let usedHeight = 0;
  const availableHeight = A4_HEIGHT_PX - PAGE_PADDING_PX * 2;

  notices.forEach((notice) => {
    const slip = createNoticeSlip(doc, notice, school, dueDate, "bulk");
    page.append(slip);
    const slipHeight = slip.offsetHeight;
    const requiredHeight = slipHeight + (usedHeight > 0 ? CUT_GAP_PX : 0);

    if (usedHeight > 0 && usedHeight + requiredHeight > availableHeight) {
      slip.remove();
      page = createPage(doc);
      root.append(page);
      pages.push(page);
      page.append(slip);
      usedHeight = slip.offsetHeight;
    } else {
      if (usedHeight > 0) slip.classList.add("fee-notice-cut");
      usedHeight += requiredHeight;
    }
  });

  return pages;
}

function noticeStyleText(): string {
  return `
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family: "${NOTICE_FONT_FAMILY}", "Nirmala UI", sans-serif;
    }
    .fee-notice-render-root {
      width: ${A4_WIDTH_PX}px;
      background: white;
      color: #111827;
      font-family: "${NOTICE_FONT_FAMILY}", "Nirmala UI", sans-serif;
    }
    .fee-notice-page {
      box-sizing: border-box;
      width: ${A4_WIDTH_PX}px;
      height: ${A4_HEIGHT_PX}px;
      padding: ${PAGE_PADDING_PX}px;
      overflow: hidden;
      background: white;
    }
    .fee-notice-slip {
      box-sizing: border-box;
      width: 100%;
      padding: 12px 18px;
      border: 1px solid #6b7280;
      border-radius: 5px;
      font-size: 13px;
      line-height: 1.35;
      background: white;
    }
    .fee-notice-slip-single {
      margin-top: 22px;
      padding: 30px 38px;
      font-size: 16px;
    }
    .fee-notice-cut {
      position: relative;
      margin-top: ${CUT_GAP_PX}px;
    }
    .fee-notice-cut::before {
      content: "";
      position: absolute;
      top: -10px;
      left: -1px;
      right: -1px;
      border-top: 1px dashed #6b7280;
    }
    .fee-notice-school { text-align: center; margin-bottom: 6px; }
    .fee-notice-school h1 { margin: 0; font-size: 19px; line-height: 1.2; }
    .fee-notice-slip-single .fee-notice-school h1 { font-size: 25px; }
    .fee-notice-school p { margin: 1px 0; color: #4b5563; font-size: 10px; }
    .fee-notice-title {
      margin: 7px 0 8px;
      text-align: center;
      font-size: 15px;
      letter-spacing: .02em;
    }
    .fee-notice-slip-single .fee-notice-title { margin: 18px 0; font-size: 20px; }
    .fee-notice-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px 20px;
      margin-bottom: 7px;
    }
    .fee-notice-info-item { display: flex; gap: 6px; }
    .fee-notice-label { color: #4b5563; white-space: nowrap; }
    .fee-notice-table {
      width: 100%;
      border-collapse: collapse;
      margin: 5px 0;
    }
    .fee-notice-table th, .fee-notice-table td {
      border: 1px solid #9ca3af;
      padding: 3px 7px;
      text-align: left;
    }
    .fee-notice-slip-single .fee-notice-table th,
    .fee-notice-slip-single .fee-notice-table td { padding: 7px 10px; }
    .fee-notice-table th { background: #f3f4f6; }
    .fee-notice-table .fee-notice-amount { text-align: right; }
    .fee-notice-total, .fee-notice-due-date {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      margin-top: 5px;
    }
    .fee-notice-total {
      border-top: 1px solid #6b7280;
      padding-top: 5px;
      font-size: 14px;
    }
    .fee-notice-footer {
      margin: 7px 0 0;
      padding-top: 5px;
      border-top: 1px solid #d1d5db;
      text-align: center;
      color: #374151;
      font-size: 11px;
    }
  `;
}

async function openNoticeFrame(): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "fee-notice-pdf");
  iframe.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${A4_WIDTH_PX}px`,
    `height:${A4_HEIGHT_PX}px`,
    "border:0",
    "opacity:0",
    "pointer-events:none",
  ].join(";");
  document.body.append(iframe);

  const idoc = iframe.contentDocument;
  if (!idoc) {
    iframe.remove();
    throw new Error("Failed to create notice render frame");
  }
  idoc.open();
  idoc.write(
    "<!DOCTYPE html><html><head></head><body></body></html>",
  );
  idoc.close();
  return iframe;
}

export async function generateFeeNoticePdf({
  notices,
  dueDate,
  mode,
}: GenerateFeeNoticePdfOptions): Promise<void> {
  if (notices.length === 0) throw new Error("No students have dues to print.");
  if (!dueDate) throw new Error("Due date is required.");

  const [response, fontBuffer] = await Promise.all([
    schoolApi.me(),
    loadNoticeFontBuffer(),
  ]);
  const school = schoolInfo(response.school);
  const iframe = await openNoticeFrame();
  const idoc = iframe.contentDocument;
  if (!idoc) {
    iframe.remove();
    throw new Error("Failed to open notice render frame");
  }

  try {
    await ensureNoticeFontOnDocument(idoc, fontBuffer);

    const style = idoc.createElement("style");
    style.dataset.feeNotice = "true";
    style.textContent = noticeStyleText();
    idoc.head.append(style);

    const root = node(idoc, "div", "fee-notice-render-root");
    idoc.body.append(root);

    const pages = buildPages(idoc, notices, school, dueDate, mode, root);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    for (let index = 0; index < pages.length; index += 1) {
      if (index > 0) pdf.addPage();
      // Clone stays inside this bare iframe document — no app font URLs.
      const canvas = await html2canvas(pages[index], {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        onclone: async (clonedDocument) => {
          clonedDocument.documentElement.style.background = "#ffffff";
          clonedDocument.body.style.background = "#ffffff";
          clonedDocument.body.style.color = "#111827";
          await ensureNoticeFontOnDocument(clonedDocument, fontBuffer);
        },
      });
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.92),
        "JPEG",
        0,
        0,
        210,
        297,
        undefined,
        "FAST",
      );
    }

    const subject =
      mode === "single"
        ? notices[0].studentName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        : "bulk";
    pdf.save(`fee-due-notice-${subject || "student"}-${dueDate}.pdf`);
  } finally {
    iframe.remove();
  }
}
