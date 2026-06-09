import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";
import { execSync } from "child_process";
import { getLastCommit, getCommitsSince, getLatestTag, CommitInfo } from "../git/diff";

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: "utf8" }).trim();
}

function bumpType(commits: CommitInfo[]): "major" | "minor" | "patch" {
  if (commits.some((c) => c.breaking)) return "major";
  if (commits.some((c) => c.type === "feat")) return "minor";
  return "patch";
}

export function bumpVersion(projectPath: string, dryRun = false): {
  oldVersion: string;
  newVersion: string;
  bumpType: string;
  commits: CommitInfo[];
} {
  const pkgFile = path.join(projectPath, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  const oldVersion = pkg.version as string;

  const latestTag = getLatestTag(projectPath);
  const commits = latestTag
    ? getCommitsSince(projectPath, latestTag)
    : [getLastCommit(projectPath)];

  if (commits.length === 0) {
    return { oldVersion, newVersion: oldVersion, bumpType: "none", commits };
  }

  const bump = bumpType(commits);
  const newVersion = semver.inc(oldVersion, bump) ?? oldVersion;

  if (!dryRun) {
    pkg.version = newVersion;
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");

    // Create git tag
    try {
      run(`git tag v${newVersion}`, projectPath);
    } catch {
      // Tag may already exist
    }
  }

  return { oldVersion, newVersion, bumpType: bump, commits };
}
