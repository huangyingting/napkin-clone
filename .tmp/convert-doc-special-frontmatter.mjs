import { readFileSync, writeFileSync } from "node:fs";

const files = [
  {
    path: "docs/operations/release-gate.md",
    type: "runbook",
    status: "active gate",
    last_updated: "2026-07-01",
    description:
      "Release gate and readiness checklist for system stabilization, validation evidence, local release checks, known release caveats, rollback criteria, and foundation release readiness.",
  },
  {
    path: "docs/security/api-route-security-matrix.md",
    type: "reference",
    status: "current",
    last_updated: "2026-07-01",
    description:
      "API route security matrix covering route access policy, authentication requirements, response semantics, public surface governance, and security test enforcement.",
  },
  {
    path: "docs/security/page-route-access-surface.md",
    type: "reference",
    status: "current",
    last_updated: "2026-07-01",
    description:
      "Classifies non-API app routes and proxy exclusions, documents access-surface ownership, route classification, and page-route manifest governance.",
  },
  {
    path: "docs/system/realtime-collaboration-scaling.md",
    type: "adr",
    status: "accepted",
    last_updated: "2026-07-01",
    description:
      "Architecture decision record for realtime collaboration scaling, durability, WebSocket room lifecycle, persistence, eviction, flood controls, and operational constraints.",
  },
  {
    path: "docs/system/slide-canvas-keyboard-accessibility.md",
    type: "adr",
    status: "accepted with release-gate caveat",
    last_updated: "2026-07-01",
    description:
      "Architecture decision record for slide canvas keyboard accessibility, roving focus, selection shortcuts, keyboard manipulation, and release-gate evidence boundaries.",
  },
];

function frontmatter({ type, status, last_updated, description }) {
  const q = (value) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    "---",
    `type: "${q(type)}"`,
    `status: "${q(status)}"`,
    `last_updated: "${q(last_updated)}"`,
    `description: "${q(description)}"`,
    "---",
    "",
  ].join("\n");
}

for (const meta of files) {
  const original = readFileSync(meta.path, "utf8");
  if (original.startsWith("---\n")) continue;
  const lines = original.split(/\r?\n/);
  const title = lines[0];
  let index = 1;
  while (index < lines.length && lines[index].trim() === "") index++;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "---") {
      index++;
      break;
    }
    if (line.startsWith("**Type:**") || line.startsWith("**Status:**") || line.startsWith("**Last updated:**")) {
      index++;
      continue;
    }
    if (line.trim() === "") {
      index++;
      continue;
    }
    break;
  }
  const body = [title, "", ...lines.slice(index)].join("\n").trimStart();
  writeFileSync(meta.path, `${frontmatter(meta)}${body}`.replace(/\s+$/u, "") + "\n");
}
