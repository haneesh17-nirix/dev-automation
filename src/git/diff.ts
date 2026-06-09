import { execSync } from "child_process";

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  type: "feat" | "fix" | "breaking" | "chore" | "docs" | "test" | "refactor" | "other";
  scope?: string;
  breaking: boolean;
}

export interface DiffSummary {
  filesChanged: string[];
  additions: number;
  deletions: number;
  rawDiff: string;
  newFiles: string[];
  deletedFiles: string[];
  modifiedFiles: string[];
}

function run(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

export function parseConventionalCommit(message: string): Pick<CommitInfo, "type" | "scope" | "breaking"> {
  const match = message.match(/^(feat|fix|docs|chore|test|refactor|perf|ci|build|style)(\(([^)]+)\))?(!)?:\s/);
  if (!match) return { type: "other", breaking: message.includes("BREAKING CHANGE") };

  const rawType = match[1] as string;
  const scope = match[3];
  const breaking = match[4] === "!" || message.includes("BREAKING CHANGE:");

  const type = breaking ? "breaking" : (rawType as CommitInfo["type"]);
  return { type, scope, breaking };
}

export function getLastCommit(projectPath: string): CommitInfo {
  const hash = run("git rev-parse HEAD", projectPath);
  const shortHash = run("git rev-parse --short HEAD", projectPath);
  const message = run("git log -1 --pretty=%s", projectPath);
  const author = run("git log -1 --pretty=%an", projectPath);
  const date = run("git log -1 --pretty=%ci", projectPath);

  return {
    hash,
    shortHash,
    message,
    author,
    date,
    ...parseConventionalCommit(message),
  };
}

export function getCommitsSince(projectPath: string, since: string): CommitInfo[] {
  const raw = run(`git log ${since}..HEAD --pretty="%H|%h|%s|%an|%ci"`, projectPath);
  if (!raw) return [];

  return raw.split("\n").filter(Boolean).map((line) => {
    const [hash, shortHash, message, author, date] = line.split("|");
    return { hash, shortHash, message, author, date, ...parseConventionalCommit(message) };
  });
}

export function getDiffSummary(projectPath: string, base = "HEAD~1"): DiffSummary {
  const rawDiff = run(`git diff ${base} HEAD`, projectPath);
  const nameStatus = run(`git diff --name-status ${base} HEAD`, projectPath);

  const newFiles: string[] = [];
  const deletedFiles: string[] = [];
  const modifiedFiles: string[] = [];

  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const [status, ...rest] = line.split("\t");
    const file = rest.join("\t");
    if (status === "A") newFiles.push(file);
    else if (status === "D") deletedFiles.push(file);
    else modifiedFiles.push(file);
  }

  const stat = run(`git diff --shortstat ${base} HEAD`, projectPath);
  const addMatch = stat.match(/(\d+) insertion/);
  const delMatch = stat.match(/(\d+) deletion/);

  return {
    filesChanged: [...newFiles, ...deletedFiles, ...modifiedFiles],
    additions: addMatch ? parseInt(addMatch[1]) : 0,
    deletions: delMatch ? parseInt(delMatch[1]) : 0,
    rawDiff,
    newFiles,
    deletedFiles,
    modifiedFiles,
  };
}

export function getCurrentVersion(projectPath: string): string {
  const pkgPath = `${projectPath}/package.json`;
  try {
    const pkg = require(pkgPath);
    return pkg.version ?? "0.0.0";
  } catch {
    const tag = run("git describe --tags --abbrev=0", projectPath);
    return tag.replace(/^v/, "") || "0.0.0";
  }
}

export function getLatestTag(projectPath: string): string {
  return run("git describe --tags --abbrev=0", projectPath) || "";
}
