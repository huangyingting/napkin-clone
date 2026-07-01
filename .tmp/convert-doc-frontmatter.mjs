import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const docsRoot = join(process.cwd(), "docs");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function quote(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ");
}

function stripMarkdown(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function descriptionFrom(body, title) {
  const lines = body.replace(/^# .+\n+/, "").split(/\r?\n/);
  const paragraphs = [];
  let current = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const skip =
      trimmed === "" ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("|") ||
      /^[-*+]\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed) ||
      /^>/.test(trimmed);
    if (skip) {
      if (current.length > 0) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      continue;
    }
    current.push(trimmed);
  }
  if (current.length > 0) paragraphs.push(current.join(" "));
  const first = stripMarkdown(paragraphs[0] ?? "");
  return first || `Documents ${title}.`;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return null;
  const raw = text.slice(4, end).trim();
  const rest = text.slice(text.indexOf("\n", end + 4) + 1);
  const meta = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z_]+):\s*"?(.*?)"?\s*$/);
    if (match) meta[match[1]] = match[2];
  }
  return { meta, rest };
}

function convert(path) {
  const original = readFileSync(path, "utf8");
  let title;
  let type;
  let status;
  let lastUpdated;
  let description;
  let body;

  const fm = parseFrontmatter(original);
  if (fm) {
    body = fm.rest.trimStart();
    title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Untitled";
    type = fm.meta.type;
    status = fm.meta.status;
    lastUpdated = fm.meta.last_updated;
    description = fm.meta.description || descriptionFrom(body, title);
  } else {
    const oldHeader = original.match(
      /^#\s+(.+)\r?\n\r?\n\*\*Type:\*\*\s*([^\r\n]+?)\s*\r?\n\*\*Status:\*\*\s*([^\r\n]+?)\s*\r?\n\*\*Last updated:\*\*\s*([^\r\n]+?)\s*\r?\n\r?\n?([\s\S]*)$/,
    );
    if (!oldHeader)
      return { path, changed: false, reason: "no recognized metadata" };
    title = oldHeader[1].trim();
    type = oldHeader[2].trim();
    status = oldHeader[3].trim();
    lastUpdated = oldHeader[4].trim();
    body = `# ${title}\n\n${oldHeader[5].trimStart()}`;
    description = descriptionFrom(body, title);
  }

  const frontmatter = [
    "---",
    `type: "${quote(
      String(type ?? "")
        .trim()
        .toLowerCase(),
    )}"`,
    `status: "${quote(
      String(status ?? "")
        .trim()
        .toLowerCase(),
    )}"`,
    `last_updated: "${quote(String(lastUpdated ?? "").trim())}"`,
    `description: "${quote(description)}"`,
    "---",
    "",
  ].join("\n");
  const next = `${frontmatter}${body.trimStart()}`.replace(/\s+$/u, "") + "\n";
  if (next !== original) {
    writeFileSync(path, next);
    return { path, changed: true };
  }
  return { path, changed: false, reason: "already current" };
}

const results = walk(docsRoot).map(convert);
const changed = results.filter((item) => item.changed);
const skipped = results.filter((item) => !item.changed);
console.log(
  JSON.stringify(
    {
      changed: changed.length,
      skipped: skipped.length,
      skippedReasons: skipped.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] ?? 0) + 1;
        return acc;
      }, {}),
    },
    null,
    2,
  ),
);
for (const item of results.filter(
  (entry) => entry.reason === "no recognized metadata",
)) {
  console.error(`unrecognized: ${item.path}`);
}
