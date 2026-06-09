import * as fs from "fs";
import * as path from "path";
import { CommitInfo, DiffSummary } from "../git/diff";
import { TestSuiteResult } from "../testing/runner";
import { ApiTestReport } from "../integration/api-tester";
import { LinkCheckReport } from "../integration/link-checker";

const config = require("../../config/automation.json");

function ensureLogDir(projectPath: string): void {
  const logDir = path.join(projectPath, config.logging.logDir ?? "logs");
  fs.mkdirSync(logDir, { recursive: true });
}

function appendLine(filePath: string, line: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, line + "\n", "utf8");
}

function ts(): string {
  return new Date().toISOString();
}

// ── Per-change log ────────────────────────────────────────────────────────────

export function logChange(
  projectPath: string,
  commit: CommitInfo,
  diff: DiffSummary,
  newVersion: string
): void {
  ensureLogDir(projectPath);
  const logFile = path.join(projectPath, config.logging.changeLog ?? "logs/changes.log");

  const entry = [
    `[${ts()}] CHANGE`,
    `  version   : ${newVersion}`,
    `  commit    : ${commit.shortHash} — ${commit.message}`,
    `  author    : ${commit.author}`,
    `  type      : ${commit.type}${commit.breaking ? " (BREAKING)" : ""}`,
    `  files     : +${diff.newFiles.length} new, ~${diff.modifiedFiles.length} modified, -${diff.deletedFiles.length} deleted`,
    `  lines     : +${diff.additions} / -${diff.deletions}`,
    `  changed   : ${diff.filesChanged.slice(0, 8).join(", ")}${diff.filesChanged.length > 8 ? ` …+${diff.filesChanged.length - 8} more` : ""}`,
    "---",
  ].join("\n");

  appendLine(logFile, entry);
}

// ── Deployment log ────────────────────────────────────────────────────────────

export function logDeployment(
  projectPath: string,
  version: string,
  commit: CommitInfo,
  environment = "production"
): void {
  ensureLogDir(projectPath);
  const logFile = path.join(projectPath, config.logging.deployLog ?? "logs/deployments.log");

  const entry = [
    `[${ts()}] DEPLOY`,
    `  version     : ${version}`,
    `  environment : ${environment}`,
    `  commit      : ${commit.hash}`,
    `  message     : ${commit.message}`,
    `  author      : ${commit.author}`,
    "---",
  ].join("\n");

  appendLine(logFile, entry);
}

// ── Test run log ──────────────────────────────────────────────────────────────

export function logTestRun(
  projectPath: string,
  suite: TestSuiteResult,
  version: string
): void {
  ensureLogDir(projectPath);
  const logFile = path.join(projectPath, config.logging.testLog ?? "logs/test-runs.log");

  const status = suite.totalFailed === 0 ? "PASS" : "FAIL";
  const lines = [
    `[${ts()}] TEST_RUN [${status}]`,
    `  version  : ${version}`,
    `  passed   : ${suite.totalPassed}`,
    `  failed   : ${suite.totalFailed}`,
    `  files    : ${suite.results.length}`,
    `  duration : ${suite.duration}ms`,
  ];

  for (const r of suite.results.filter((r) => r.failed > 0)) {
    lines.push(`  FAILED   : ${r.file}`);
    for (const e of r.errors) lines.push(`             ${e}`);
  }
  lines.push("---");

  appendLine(logFile, lines.join("\n"));
}

// ── Integration log ───────────────────────────────────────────────────────────

export function logIntegration(
  projectPath: string,
  apiReport: ApiTestReport,
  linkReport: LinkCheckReport,
  version: string
): void {
  ensureLogDir(projectPath);
  const logFile = path.join(projectPath, config.logging.changeLog ?? "logs/changes.log");

  const apiStatus = apiReport.failed === 0 ? "PASS" : "FAIL";
  const linkStatus = linkReport.failed === 0 ? "PASS" : "FAIL";

  const lines = [
    `[${ts()}] INTEGRATION`,
    `  version      : ${version}`,
    `  api_tests    : [${apiStatus}] ${apiReport.passed}/${apiReport.total} passed`,
    `  link_checks  : [${linkStatus}] ${linkReport.passed}/${linkReport.total} passed`,
  ];

  for (const r of apiReport.results.filter((r) => !r.passed)) {
    lines.push(`  api_fail  : ${r.endpoint.method} ${r.endpoint.path} → got ${r.actualStatus ?? "ERR"}`);
  }
  for (const r of linkReport.results.filter((r) => !r.ok)) {
    lines.push(`  link_fail : ${r.url} → ${r.status ?? r.error}`);
  }
  lines.push("---");

  appendLine(logFile, lines.join("\n"));
}

// ── Append to docs/CHANGE-LOG.md (human-readable, persistent) ────────────────

export function appendToChangeDoc(
  projectPath: string,
  commit: CommitInfo,
  version: string,
  diff: DiffSummary
): void {
  const docFile = path.join(projectPath, config.docs.changeLog ?? "docs/CHANGE-LOG.md");
  const date = new Date().toISOString().replace("T", " ").substring(0, 19);

  if (!fs.existsSync(docFile)) {
    fs.mkdirSync(path.dirname(docFile), { recursive: true });
    fs.writeFileSync(docFile, "# Change Log\n\nDetailed record of every change deployed.\n\n", "utf8");
  }

  const entry = [
    `## v${version} — ${date}`,
    ``,
    `**Commit:** \`${commit.shortHash}\` — ${commit.message}  `,
    `**Author:** ${commit.author}  `,
    `**Type:** ${commit.type}${commit.breaking ? " ⚠ BREAKING" : ""}  `,
    ``,
    `**Files changed:** ${diff.filesChanged.length} total`,
    diff.newFiles.length ? `- New: ${diff.newFiles.join(", ")}` : "",
    diff.modifiedFiles.length ? `- Modified: ${diff.modifiedFiles.slice(0, 6).join(", ")}` : "",
    diff.deletedFiles.length ? `- Deleted: ${diff.deletedFiles.join(", ")}` : "",
    ``,
    `---`,
    ``,
  ].filter((l) => l !== "").join("\n");

  const existing = fs.readFileSync(docFile, "utf8");
  const insertAt = existing.indexOf("\n## ");
  if (insertAt === -1) {
    fs.appendFileSync(docFile, entry, "utf8");
  } else {
    fs.writeFileSync(docFile, existing.slice(0, insertAt) + "\n" + entry + existing.slice(insertAt), "utf8");
  }
}
