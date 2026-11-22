const { stat } = require("node:fs/promises");
const { extname } = require("node:path");
const yauzl = require("yauzl");

const megabyte = 1_000_000;

class MigrationZipError extends Error {}

async function readExport(file, source) {
  if ((await stat(file)).size > 1000 * megabyte)
    throw new MigrationZipError("Choose a ZIP file that is 1 GB or smaller.");
  const files = new Map();
  let bytes = 0;
  let entries = 0;
  let attachments = 0;
  const expected =
    source === "notion"
      ? new Set([".md", ".markdown", ".html", ".csv"])
      : new Set([".json"]);

  async function read(zip, depth) {
    try {
      for await (const entry of zip.eachEntry()) {
        if (++entries > 50000)
          throw new MigrationZipError("The ZIP contains too many files.");
        const name = entry.fileName.normalize("NFC");
        if (
          name.endsWith("/") ||
          name
            .split("/")
            .some((part) => part.startsWith(".") || part === "__MACOSX")
        )
          continue;
        const extension = extname(name).toLowerCase();
        const nested = source === "notion" && extension === ".zip";
        const slackFile =
          /(?:^|\/)(?:\d{4}-\d{2}-\d{2}|users|org_users|channels|groups|dms|mpims)\.json$/i;
        if (
          !nested &&
          (!expected.has(extension) ||
            (source === "slack" && !slackFile.test(name)))
        ) {
          if (source === "notion") attachments++;
          continue;
        }
        if (nested && depth >= 2)
          throw new MigrationZipError(
            "Extract the outer ZIP and select the ZIP inside it.",
          );
        bytes += entry.uncompressedSize;
        if (
          bytes > 80 * megabyte ||
          entry.uncompressedSize > (nested ? 60 : 5) * megabyte
        )
          throw new MigrationZipError(
            "The import is too large. Export a smaller selection.",
          );
        const stream = await zip.openReadStreamPromise(entry);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const data = Buffer.concat(chunks);
        if (nested) {
          await read(await yauzl.fromBufferPromise(data), depth + 1);
        } else {
          if (files.has(name))
            throw new MigrationZipError(
              "The ZIP contains duplicate filenames. Import the inner ZIP files one at a time.",
            );
          files.set(name, {
            text: data.toString("utf8").replace(/^\uFEFF/, ""),
            modified: entry.getLastModDate().toISOString(),
          });
        }
      }
    } finally {
      zip.close();
    }
  }

  await read(await yauzl.openPromise(file), 0);
  return { files, attachments };
}

module.exports = { readExport, MigrationZipError };
