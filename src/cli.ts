#!/usr/bin/env node
import * as dotenv from "dotenv";
dotenv.config();

import * as path from "path";
import * as fs from "fs";
import { Command } from "commander";

import { getLastCommit, getDiffSummary, getCurrentVersion } from "./git/diff";
import { bumpVersion } from "./version/bumper";
import { runChangelog } from "./docs/changelog";
import { updateArchitectureDocs, updateDesignDocs, updateApiDocs } from "./docs/architect";
import { syncTestsForDiff } from "./testing/generator";
import { runAllTests } from "./testing/runner";
import { checkAllLinks, updatePagesConfig } from "./integration/link-checker";
import { runApiTests, updateApiConfig } from "./integration/api-tester";
import {
  logChange,
  logDeployment,
  logTestRun,
  logIntegration,
  appendToChangeDoc,
} from "./logging/appender";
import { installHooks } from "./hooks/installer";

const program = new Command();

program
  .name("auto")
  .description("Dev automation: versioning, docs, tests, integration checks, logging")
  .version("1.0.0");

function getProjectPath(): string {
  const p = process.env.TARGET_PROJECT_PATH ?? process.cwd();
  if (!fs.existsSync(p)) throw new Error(`TARGET_PROJECT_PATH not found: ${p}`);
  return path.resolve(p);
}

// ── run-all: full pipeline (used in post-commit hook) ────────────────────────
program
  .command("run-all")
  .description("Run the full automation pipeline (version → docs → tests → log)")
  .option("--skip-tests", "Skip test generation and execution")
  .option("--skip-integration", "Skip link and API checks")
  .option("--dry-run", "Preview version bump without writing files")
  .action(async (opts) => {
    const projectPath = getProjectPath();
    console.log(`\n🔧 Dev Automation — ${new Date().toISOString()}`);
    console.log(`   Project: ${projectPath}\n`);

    // 1. Gather context
    const commit = getLastCommit(projectPath);
    const diff = getDiffSummary(projectPath);
    console.log(`📌 Commit: ${commit.shortHash} — ${commit.message} (${commit.type})`);
    console.log(`   Files changed: ${diff.filesChanged.length} (+${diff.additions}/-${diff.deletions})\n`);

    // 2. Version bump
    console.log("📦 Versioning...");
    const { oldVersion, newVersion, bumpType } = bumpVersion(projectPath, opts.dryRun);
    console.log(`   ${oldVersion} → ${newVersion} (${bumpType})\n`);

    // 3. Changelog
    console.log("📝 Updating CHANGELOG.md...");
    runChangelog(projectPath, newVersion);

    // 4. Docs (architecture, design, API)
    console.log("\n📐 Updating docs...");
    await updateArchitectureDocs(projectPath, diff, commit);
    await updateDesignDocs(projectPath, diff, commit);
    await updateApiDocs(projectPath, diff, commit);
    await updateApiConfig(projectPath, diff, commit);

    // 5. Test generation
    if (!opts.skipTests) {
      console.log("\n🧪 Syncing test scripts...");
      await syncTestsForDiff(projectPath, diff, commit);

      console.log("\n▶  Running tests...");
      const suite = await runAllTests(projectPath);
      const status = suite.totalFailed === 0 ? "✓ All passed" : `✗ ${suite.totalFailed} failed`;
      console.log(`   ${status} (${suite.totalPassed} passed, ${suite.duration}ms)\n`);
      logTestRun(projectPath, suite, newVersion);
    }

    // 6. Integration checks
    if (!opts.skipIntegration) {
      console.log("🔗 Integration checks...");
      console.log("  API endpoints:");
      const apiReport = await runApiTests();
      console.log("  Page links:");
      const linkReport = await checkAllLinks();
      updatePagesConfig(linkReport);
      logIntegration(projectPath, apiReport, linkReport, newVersion);
    }

    // 7. Logging
    console.log("\n📋 Logging change...");
    logChange(projectPath, commit, diff, newVersion);
    appendToChangeDoc(projectPath, commit, newVersion, diff);
    console.log("   ✓ logs/changes.log updated");
    console.log("   ✓ docs/CHANGE-LOG.md updated\n");

    console.log(`✅ Done. Version: v${newVersion}\n`);
  });

// ── Individual commands ───────────────────────────────────────────────────────

program
  .command("version")
  .description("Bump project version based on conventional commits")
  .option("--dry-run", "Show what version would be without writing")
  .action((opts) => {
    const projectPath = getProjectPath();
    const { oldVersion, newVersion, bumpType } = bumpVersion(projectPath, opts.dryRun);
    console.log(`${oldVersion} → ${newVersion} (${bumpType})${opts.dryRun ? " [dry-run]" : ""}`);
  });

program
  .command("changelog")
  .description("Append latest commits to CHANGELOG.md")
  .action(() => {
    const projectPath = getProjectPath();
    const version = getCurrentVersion(projectPath);
    runChangelog(projectPath, version);
  });

program
  .command("docs")
  .description("Update architecture, design, and API docs based on last commit")
  .action(async () => {
    const projectPath = getProjectPath();
    const commit = getLastCommit(projectPath);
    const diff = getDiffSummary(projectPath);
    await updateArchitectureDocs(projectPath, diff, commit);
    await updateDesignDocs(projectPath, diff, commit);
    await updateApiDocs(projectPath, diff, commit);
  });

program
  .command("tests")
  .description("Generate/update test scripts for changed files, then run all tests")
  .option("--generate-only", "Only generate tests, do not run them")
  .option("--run-only", "Only run existing tests, do not generate new ones")
  .action(async (opts) => {
    const projectPath = getProjectPath();
    const commit = getLastCommit(projectPath);
    const diff = getDiffSummary(projectPath);

    if (!opts.runOnly) {
      await syncTestsForDiff(projectPath, diff, commit);
    }
    if (!opts.generateOnly) {
      const suite = await runAllTests(projectPath);
      console.log(`\nResults: ${suite.totalPassed} passed, ${suite.totalFailed} failed`);
      logTestRun(projectPath, suite, getCurrentVersion(projectPath));
    }
  });

program
  .command("integration")
  .description("Test all API endpoints and page links")
  .option("--crawl", "Deep crawl — discover and test all links on each page")
  .option("--apis-only", "Only test API endpoints")
  .option("--links-only", "Only check page links")
  .action(async (opts) => {
    const projectPath = getProjectPath();
    const version = getCurrentVersion(projectPath);

    let apiReport = { total: 0, passed: 0, failed: 0, results: [], baseUrl: "", ranAt: new Date().toISOString() };
    let linkReport = { total: 0, passed: 0, failed: 0, results: [], baseUrl: "", ranAt: new Date().toISOString() };

    if (!opts.linksOnly) {
      console.log("\n── API Tests ──");
      apiReport = await runApiTests() as any;
    }
    if (!opts.apisOnly) {
      console.log("\n── Link Checks ──");
      linkReport = await checkAllLinks(opts.crawl) as any;
      updatePagesConfig(linkReport as any);
    }

    logIntegration(projectPath, apiReport as any, linkReport as any, version);

    const failed = (apiReport.failed ?? 0) + (linkReport.failed ?? 0);
    if (failed > 0) {
      console.error(`\n✗ ${failed} check(s) failed`);
      process.exit(1);
    } else {
      console.log("\n✓ All checks passed");
    }
  });

program
  .command("log-deploy")
  .description("Append a deployment entry to logs/deployments.log")
  .option("--env <env>", "Environment (production, staging, dev)", "production")
  .action((opts) => {
    const projectPath = getProjectPath();
    const commit = getLastCommit(projectPath);
    const version = getCurrentVersion(projectPath);
    logDeployment(projectPath, version, commit, opts.env);
    console.log(`✓ Deployment logged: v${version} → ${opts.env}`);
  });

program
  .command("hooks")
  .description("Install or remove git hooks in the target project")
  .argument("<action>", "install | uninstall")
  .action((action) => {
    const projectPath = getProjectPath();
    if (action === "install") {
      installHooks(projectPath);
    } else if (action === "uninstall") {
      const hooksDir = path.join(projectPath, ".git", "hooks");
      for (const h of ["pre-commit", "post-commit"]) {
        const hp = path.join(hooksDir, h);
        if (fs.existsSync(hp)) fs.unlinkSync(hp);
      }
      console.log("✓ Hooks removed");
    }
  });

program.parse(process.argv);
