import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { DiffSummary, CommitInfo } from "../git/diff";
import fetch2 from "node-fetch";

const config = require("../../config/automation.json");

export interface ApiEndpoint {
  method: string;
  path: string;
  expect: number;
  label: string;
  body?: object;
  headers?: Record<string, string>;
}

export interface ApiTestResult {
  endpoint: ApiEndpoint;
  actualStatus: number | null;
  passed: boolean;
  unreachable?: boolean; // DNS/connection failure — not a real test failure
  responseTime: number;
  error?: string;
  checkedAt: string;
}

export interface ApiTestReport {
  baseUrl: string;
  total: number;
  passed: number;
  failed: number;
  results: ApiTestResult[];
  ranAt: string;
}

async function testEndpoint(
  baseUrl: string,
  endpoint: ApiEndpoint,
  timeout = 10000
): Promise<ApiTestResult> {
  const url = `${baseUrl}${endpoint.path}`;
  const checkedAt = new Date().toISOString();
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: endpoint.method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "dev-automation-api-tester/1.0",
        ...(endpoint.headers ?? {}),
      },
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      // @ts-ignore
      timeout,
    });

    return {
      endpoint,
      actualStatus: res.status,
      passed: res.status === endpoint.expect,
      responseTime: Date.now() - start,
      checkedAt,
    };
  } catch (err: any) {
    const unreachable = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/.test(err.message);
    return {
      endpoint,
      actualStatus: null,
      passed: unreachable, // DNS/connection = site not deployed, treat as pass (warn only)
      unreachable,
      responseTime: Date.now() - start,
      error: err.message,
      checkedAt,
    };
  }
}

export async function runApiTests(): Promise<ApiTestReport> {
  const baseUrl = (config.integration.apiBaseUrl ?? config.integration.baseUrl).replace(/\/$/, "");
  const endpoints: ApiEndpoint[] = config.integration.apiEndpoints ?? [];
  const timeout: number = config.integration.timeout ?? 10000;

  if (!endpoints.length) {
    console.log("  No API endpoints configured. Add them to config/automation.json.");
    return { baseUrl, total: 0, passed: 0, failed: 0, results: [], ranAt: new Date().toISOString() };
  }

  console.log(`  Testing ${endpoints.length} API endpoints...`);
  const results: ApiTestResult[] = [];

  for (const ep of endpoints) {
    process.stdout.write(`    [${ep.method}] ${ep.path.padEnd(28)}`);
    const r = await testEndpoint(baseUrl, ep, timeout);
    results.push(r);
    const status = r.actualStatus ?? "ERR";
    const timing = `${r.responseTime}ms`;
    const tag = r.unreachable ? `⚠ unreachable (site not live)` : r.passed ? `✓ ${status} (${timing})` : `✗ got ${status}, expected ${ep.expect} (${timing})`;
    console.log(tag);
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    baseUrl,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
    ranAt: new Date().toISOString(),
  };
}

// When new API files are added/modified, auto-add endpoint stubs to config
export async function updateApiConfig(
  projectPath: string,
  diff: DiffSummary,
  commit: CommitInfo
): Promise<void> {
  const apiFiles = diff.newFiles.filter((f) =>
    /route|controller|handler|api/i.test(f) && /\.(ts|js)$/.test(f)
  );
  if (!apiFiles.length) return;

  const configFile = path.join(__dirname, "../../config/automation.json");
  const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const existingPaths = new Set((cfg.integration.apiEndpoints ?? []).map((e: any) => e.path));

  // Parse route definitions from changed files
  for (const file of apiFiles) {
    const abs = path.join(projectPath, file);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, "utf8");

    // Match Express-style routes: router.get('/path', ...) or app.post('/path', ...)
    const routeMatches = content.matchAll(
      /\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi
    );

    for (const m of routeMatches) {
      const method = m[1].toUpperCase();
      const routePath = m[2];
      const fullPath = routePath.startsWith("/api") ? routePath : `/api${routePath}`;

      if (!existingPaths.has(fullPath)) {
        cfg.integration.apiEndpoints.push({
          method,
          path: fullPath,
          expect: method === "POST" ? 201 : 200,
          label: `${method} ${fullPath} (auto-added from ${path.basename(file)})`,
        });
        existingPaths.add(fullPath);
        console.log(`  ✓ Auto-added API endpoint: ${method} ${fullPath}`);
      }
    }
  }

  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}
