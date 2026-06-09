import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const config = require("../../config/automation.json");

export interface TestResult {
  file: string;
  passed: number;
  failed: number;
  errors: string[];
  duration: number;
  exitCode: number;
}

export interface TestSuiteResult {
  totalPassed: number;
  totalFailed: number;
  results: TestResult[];
  duration: number;
  ranAt: string;
}

function findTestFiles(dir: string, pattern: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findTestFiles(full, pattern));
    else if (pattern.test(entry.name)) results.push(full);
  }
  return results;
}

function runTestFile(filePath: string): TestResult {
  const start = Date.now();
  const result = spawnSync("npx", ["ts-node", filePath], {
    encoding: "utf8",
    timeout: 30000,
    stdio: "pipe",
  });

  const output = (result.stdout ?? "") + (result.stderr ?? "");
  const duration = Date.now() - start;

  // Parse basic pass/fail from output
  const passMatch = output.match(/(\d+)\s+pass/i);
  const failMatch = output.match(/(\d+)\s+fail/i);
  const passed = passMatch ? parseInt(passMatch[1]) : (result.status === 0 ? 1 : 0);
  const failed = failMatch ? parseInt(failMatch[1]) : (result.status !== 0 ? 1 : 0);

  const errors: string[] = [];
  if (result.status !== 0) {
    const errLines = output.split("\n").filter((l) => /error|fail|assert/i.test(l)).slice(0, 5);
    errors.push(...errLines);
  }

  return {
    file: path.relative(process.cwd(), filePath),
    passed,
    failed,
    errors,
    duration,
    exitCode: result.status ?? 1,
  };
}

export async function runAllTests(projectPath: string): Promise<TestSuiteResult> {
  const testDir = path.join(projectPath, config.testing.testDir ?? "tests");
  const generatedDir = path.join(projectPath, config.testing.generatedDir ?? "tests/generated");

  const files = [
    ...findTestFiles(testDir, /\.(test|spec)\.(ts|js)$/),
    ...findTestFiles(generatedDir, /\.generated\.test\.ts$/),
  ];

  if (!files.length) {
    return { totalPassed: 0, totalFailed: 0, results: [], duration: 0, ranAt: new Date().toISOString() };
  }

  const start = Date.now();
  const results: TestResult[] = [];

  for (const file of files) {
    process.stdout.write(`  Running ${path.basename(file)}...`);
    const r = runTestFile(file);
    results.push(r);
    console.log(r.failed > 0 ? ` ✗ (${r.failed} failed)` : ` ✓ (${r.passed} passed)`);
  }

  return {
    totalPassed: results.reduce((s, r) => s + r.passed, 0),
    totalFailed: results.reduce((s, r) => s + r.failed, 0),
    results,
    duration: Date.now() - start,
    ranAt: new Date().toISOString(),
  };
}

export function formatTestSummary(suite: TestSuiteResult): string {
  const lines = [
    `Test run: ${suite.ranAt}`,
    `Files: ${suite.results.length}  Passed: ${suite.totalPassed}  Failed: ${suite.totalFailed}  Time: ${suite.duration}ms`,
    "",
  ];
  for (const r of suite.results) {
    const status = r.failed > 0 ? "FAIL" : "PASS";
    lines.push(`  [${status}] ${r.file} (${r.passed}p / ${r.failed}f, ${r.duration}ms)`);
    for (const e of r.errors) lines.push(`         ${e}`);
  }
  return lines.join("\n");
}
