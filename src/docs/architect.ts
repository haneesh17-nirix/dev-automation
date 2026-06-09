import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";
import { DiffSummary, CommitInfo } from "../git/diff";

const config = require("../../config/automation.json");

async function ollamaAsk(prompt: string): Promise<string> {
  const host = process.env.OLLAMA_HOST ?? config.ollama.host;
  const model = process.env.OLLAMA_MODEL ?? config.ollama.model;

  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.3 } }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  return ((await res.json()) as any).response.trim();
}

function ensureDoc(filePath: string, title: string, template: string): void {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, template, "utf8");
  }
}

// ── Architecture doc updater ─────────────────────────────────────────────────

export async function updateArchitectureDocs(
  projectPath: string,
  diff: DiffSummary,
  commit: CommitInfo
): Promise<void> {
  const docsPath = path.join(projectPath, config.docs.architecture);
  const date = new Date().toISOString().split("T")[0];

  ensureDoc(
    docsPath,
    "Architecture",
    `# Architecture\n\n> Auto-maintained. Updated on each significant change.\n\n## Overview\n\nTBD — will be populated automatically as changes are committed.\n\n## Change History\n`
  );

  if (diff.filesChanged.length === 0) return;

  // Only update arch docs if structural files changed
  const structural = diff.filesChanged.filter((f) =>
    /\.(ts|js|py|go|java|yaml|yml|json|bicep|tf)$/.test(f) &&
    !f.includes("test") && !f.includes("spec") && !f.includes(".lock")
  );
  if (!structural.length) return;

  const prompt = `You are a software architect documenting a codebase change.

Commit: "${commit.message}" by ${commit.author} on ${date}
Files changed: ${structural.slice(0, 20).join(", ")}
+${diff.additions} additions, -${diff.deletions} deletions

Write a SHORT architecture note (3-6 bullet points max) describing:
- What structural change was made
- Which components/modules were affected
- Any new interfaces, APIs, or dependencies introduced
- Any architectural patterns added/removed

Output ONLY the bullet points. No headings, no preamble.`;

  let note: string;
  try {
    note = await ollamaAsk(prompt);
  } catch {
    note = `- ${commit.message} (files: ${structural.slice(0, 5).join(", ")})`;
  }

  const block = `\n### ${date} — v${commit.shortHash} — ${commit.message}\n\n${note}\n`;
  fs.appendFileSync(docsPath, block, "utf8");
  console.log("  ✓ ARCHITECTURE.md updated");
}

// ── Design doc updater ───────────────────────────────────────────────────────

export async function updateDesignDocs(
  projectPath: string,
  diff: DiffSummary,
  commit: CommitInfo
): Promise<void> {
  if (commit.type !== "feat" && !commit.breaking) return; // only features/breaking changes affect design

  const docsPath = path.join(projectPath, config.docs.design);
  const date = new Date().toISOString().split("T")[0];

  ensureDoc(
    docsPath,
    "Design",
    `# Design Document\n\n> Auto-maintained. New features and breaking changes are appended automatically.\n\n## Features & Decisions\n`
  );

  const prompt = `You are a product engineer documenting a new feature.

Feature commit: "${commit.message}"
Files added/modified: ${[...diff.newFiles, ...diff.modifiedFiles].slice(0, 15).join(", ")}
Breaking change: ${commit.breaking ? "YES" : "no"}

Write a SHORT design note (4-8 lines) covering:
- What was added or changed from a user/product perspective
- Why this change was made (infer from the commit message and files)
- Any API contract or interface changes if applicable
- Migration note if breaking

Output ONLY the content. No headings, no preamble.`;

  let note: string;
  try {
    note = await ollamaAsk(prompt);
  } catch {
    note = `${commit.message}`;
  }

  const block = `\n### ${date} — ${commit.type === "breaking" ? "⚠ BREAKING: " : ""}${commit.message}\n\n${note}\n`;
  fs.appendFileSync(docsPath, block, "utf8");
  console.log("  ✓ DESIGN.md updated");
}

// ── API doc updater ──────────────────────────────────────────────────────────

export async function updateApiDocs(
  projectPath: string,
  diff: DiffSummary,
  commit: CommitInfo
): Promise<void> {
  // Only trigger if route/controller/api files changed
  const apiFiles = diff.filesChanged.filter((f) =>
    /route|controller|handler|api|endpoint/i.test(f)
  );
  if (!apiFiles.length) return;

  const docsPath = path.join(projectPath, config.docs.apiDocs);
  const date = new Date().toISOString().split("T")[0];

  ensureDoc(
    docsPath,
    "API",
    `# API Documentation\n\n> Auto-maintained. Updated whenever route or handler files change.\n\n## Endpoints\n`
  );

  const prompt = `You are documenting an API change.

Commit: "${commit.message}"
API/route files changed: ${apiFiles.join(", ")}

Write a SHORT API changelog entry (3-5 lines) describing:
- Which endpoints were added, modified, or removed
- Request/response shape changes if inferable
- Breaking changes to the API contract if any

Output ONLY the content. No headings, no preamble.`;

  let note: string;
  try {
    note = await ollamaAsk(prompt);
  } catch {
    note = `Changed files: ${apiFiles.join(", ")}`;
  }

  const block = `\n### ${date} — ${commit.message}\n\n${note}\n`;
  fs.appendFileSync(docsPath, block, "utf8");
  console.log("  ✓ API.md updated");
}
