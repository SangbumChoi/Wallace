import { marked } from "marked";
import { parse } from "csv-parse/browser/esm/sync";
import type { Attachment } from "./types";

export const maxFileBytes = 512 * 1024;
export const maxWorkspaceFileCharacters = 4_000_000;
const extensions: Record<string, string> = {
  html: "html",
  css: "css",
  js: "js",
  javascript: "js",
  ts: "ts",
  typescript: "ts",
  python: "py",
  py: "py",
  json: "json",
  csv: "csv",
  xlsx: "xlsx",
  sql: "sql",
  sh: "sh",
  bash: "sh",
  markdown: "md",
  md: "md",
  yaml: "yaml",
  java: "java",
  rust: "rs",
  go: "go",
  xml: "xml",
};
export const acceptedFiles =
  ".xlsx,.csv,.txt,.html,.htm,.md,.js,.ts,.py,.css,.json,.sql,.sh,.yaml,.yml,.java,.rs,.go,.xml";
const accepted = new Set(acceptedFiles.split(","));

export function safeFilename(name: string) {
  const safe = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return (safe || "attachment.txt").slice(0, 180);
}

export function generatedFiles(text: string, turn: number) {
  return marked
    .lexer(text)
    .flatMap((token, i) => {
      if (token.type !== "code") return [];
      const [language, suppliedName] = (token.lang ?? "")
        .trim()
        .split(/\s+/, 2);
      const ext = extensions[language.toLowerCase()];
      if (
        !ext ||
        !token.text.trim() ||
        new TextEncoder().encode(token.text).length > maxFileBytes
      )
        return [];
      const name = safeFilename(
        suppliedName?.toLowerCase().endsWith("." + ext)
          ? suppliedName
          : `reply-${turn + 1}-${i + 1}.${ext}`,
      );
      return [{ name, text: token.text }];
    })
    .slice(0, 10);
}

function encode(name: string, bytes: Uint8Array<ArrayBuffer>): Attachment {
  if (bytes.length > maxFileBytes)
    throw new Error("Each file must be 512 KB or smaller.");
  let contents = "";
  for (let i = 0; i < bytes.length; i += 8192)
    contents += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { name, data: btoa(contents) };
}

async function checkWorkbook(buffer: ArrayBuffer) {
  const zip = new DataView(buffer);
  let end = zip.byteLength - 22;
  for (; end >= Math.max(0, zip.byteLength - 65557); end--) {
    if (
      zip.getUint32(end, true) === 0x06054b50 &&
      end + 22 + zip.getUint16(end + 20, true) === zip.byteLength
    )
      break;
  }
  if (end < 0 || end < zip.byteLength - 65557)
    throw new Error("Invalid Excel workbook.");
  const entries = zip.getUint16(end + 10, true);
  let cursor = zip.getUint32(end + 16, true);
  let total = 0;
  if (entries > 250) throw new Error("This workbook has too many entries.");
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || zip.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("Invalid Excel workbook.");
    const expandedLength = zip.getUint32(cursor + 24, true);
    const compressedLength = zip.getUint32(cursor + 20, true);
    const method = zip.getUint16(cursor + 10, true);
    const local = zip.getUint32(cursor + 42, true);
    total += expandedLength;
    if (total > 8 * 1024 * 1024)
      throw new Error("This workbook expands beyond the supported size.");
    if (
      zip.getUint16(cursor + 8, true) & 1 ||
      local + 30 > end ||
      zip.getUint32(local, true) !== 0x04034b50 ||
      zip.getUint16(local + 8, true) !== method
    )
      throw new Error("Invalid or encrypted Excel workbook.");
    const offset =
      local +
      30 +
      zip.getUint16(local + 26, true) +
      zip.getUint16(local + 28, true);
    if (offset + compressedLength > end)
      throw new Error("Invalid Excel workbook.");
    if (method === 0 && compressedLength !== expandedLength)
      throw new Error("Invalid Excel workbook.");
    if (method === 8) {
      const compressed = new Blob([
        new Uint8Array(buffer, offset, compressedLength),
      ]);
      const reader = compressed
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"))
        .getReader();
      let actualLength = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          actualLength += value.length;
          if (actualLength > expandedLength)
            throw new Error("Invalid Excel workbook size.");
        }
        if (actualLength !== expandedLength)
          throw new Error("Invalid Excel workbook size.");
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } else if (method !== 0) {
      throw new Error("Unsupported Excel compression.");
    }
    cursor +=
      46 +
      zip.getUint16(cursor + 28, true) +
      zip.getUint16(cursor + 30, true) +
      zip.getUint16(cursor + 32, true);
  }
}

export async function uploadedFile(file: File) {
  const name = safeFilename(file.name);
  const extension = "." + file.name.toLowerCase().split(".").at(-1);
  if (!accepted.has(extension))
    throw new Error("Choose an Excel, CSV, HTML, or text/code file.");
  if (file.size > maxFileBytes)
    throw new Error("Each file must be 512 KB or smaller.");
  const buffer = await file.arrayBuffer();
  let text = "";
  if (extension === ".xlsx") {
    await checkWorkbook(buffer);
    const { Workbook } = await import("exceljs");
    const book = new Workbook();
    await book.xlsx.load(buffer);
    text = book.worksheets
      .slice(0, 3)
      .map((sheet) => {
        const rows: string[] = [];
        sheet.eachRow((row, index) => {
          if (index <= 30)
            rows.push(
              Array.from({ length: Math.min(row.cellCount, 12) }, (_, i) =>
                row.getCell(i + 1).text.slice(0, 250),
              ).join(" | "),
            );
        });
        return [sheet.name, ...rows].join("\n");
      })
      .join("\n\n");
  } else {
    text = new TextDecoder().decode(buffer);
    if (text.includes("\0"))
      throw new Error("This file does not contain readable text.");
  }
  return {
    file: encode(name, new Uint8Array(buffer)),
    text: text.slice(0, 6000),
  };
}

export async function generatedAttachment(name: string, text: string) {
  if (!name.endsWith(".xlsx"))
    return { file: encode(name, new TextEncoder().encode(text)), text };
  const rows: string[][] = parse(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    max_record_size: 16000,
  });
  if (rows.length > 1000 || rows.some((row) => row.length > 100))
    throw new Error("Excel drafts support up to 1,000 rows and 100 columns.");
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  book.addWorksheet("Data").addRows(rows);
  const bytes = new Uint8Array(await book.xlsx.writeBuffer());
  return { file: encode(name, bytes), text };
}

export function downloadAttachment(file: Attachment) {
  const bytes = Uint8Array.from(atob(file.data), (value) =>
    value.charCodeAt(0),
  );
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/octet-stream" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename(file.name);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
