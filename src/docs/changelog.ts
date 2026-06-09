import * as fs from "fs";
import * as path from "path";
import { getCommitsSince, getLastCommit, getLatestTag, CommitInfo } from "../git/diff";

const SECTION_LABELS: Record<string, string> = {
  feat: "### Features",
  fix: "### Bug Fixes",
  breaking: "### ⚠ Breaking Changes",
  docs: "### Documentation",
  refactor: "### Refactoring",
  perf: "### Performance",
  test: "### Tests",
  chore: "### Maintenance",
  other: "### Other",
};

function groupCommits(commits: CommitInfo[]): Map<string, CommitInfo[]> {
  const groups = new Map<string, CommitInfo[]>();
  for (const c of commits) {
    const key = c.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  return groups;
}

function formatEntry(c: CommitInfo): string {
  const scope = c.scope ? `**${c.scope}**: ` : "";
  return `- ${scope}${c.message} ([${c.shortHash}](../../commit/${c.hash})) — ${c.author}`;
}

export function generateChangelogBlock(
  version: string,
  commits: CommitInfo[],
  repoUrl?: string
): string {
  const date = new Date().toISOString().split("T")[0];
  const compareBase = `${repoUrl ? `[${version}](${repoUrl}/compare/v${version})` : version}`;
  const lines = [`## ${compareBase} — ${date}`, ""];

  const groups = groupCommits(commits);

  // Preferred order
  const order = ["breaking", "feat", "fix", "perf", "refactor", "docs", "test", "chore", "other"];
  for (const key of order) {
    const group = groups.get(key);
    if (!group?.length) continue;
    lines.push(SECTION_LABELS[key] ?? `### ${key}`);
    lines.push(...group.map(formatEntry));
    lines.push("");
  }

  return lines.join("\n");
}

export function appendChangelog(projectPath: string, version: string, commits: CommitInfo[]): void {
  const docsConfig = require("../../config/automation.json").docs;
  const changelogFile = path.join(projectPath, docsConfig.changelog ?? "CHANGELOG.md");

  const block = generateChangelogBlock(version, commits);

  if (!fs.existsSync(changelogFile)) {
    const header = "# Changelog\n\nAll notable changes to this project will be documented here.\n\n";
    fs.mkdirSync(path.dirname(changelogFile), { recursive: true });
    fs.writeFileSync(changelogFile, header + block, "utf8");
    return;
  }

  const existing = fs.readFileSync(changelogFile, "utf8");

  // Insert new block after the header (first blank line after a # heading)
  const insertAfter = existing.indexOf("\n## ");
  if (insertAfter === -1) {
    fs.writeFileSync(changelogFile, existing + "\n" + block, "utf8");
  } else {
    const updated = existing.slice(0, insertAfter) + "\n" + block + existing.slice(insertAfter);
    fs.writeFileSync(changelogFile, updated, "utf8");
  }
}

export function runChangelog(projectPath: string, version: string): void {
  const latestTag = getLatestTag(projectPath);
  const commits = latestTag
    ? getCommitsSince(projectPath, latestTag)
    : [getLastCommit(projectPath)];

  if (!commits.length) {
    console.log("  No new commits since last tag — changelog unchanged.");
    return;
  }

  appendChangelog(projectPath, version, commits);
  console.log(`  ✓ CHANGELOG.md updated (${commits.length} commits)`);
}
