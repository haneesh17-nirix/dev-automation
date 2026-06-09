import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";

const config = require("../../config/automation.json");

export interface LinkResult {
  url: string;
  label: string;
  status: number | null;
  ok: boolean;
  redirectTo?: string;
  error?: string;
  checkedAt: string;
}

export interface LinkCheckReport {
  baseUrl: string;
  total: number;
  passed: number;
  failed: number;
  results: LinkResult[];
  ranAt: string;
}

async function checkUrl(
  url: string,
  label: string,
  timeout = 10000
): Promise<LinkResult> {
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "dev-automation-link-checker/1.0" },
      // @ts-ignore
      timeout,
    });

    const redirectTo = res.url !== url ? res.url : undefined;
    return { url, label, status: res.status, ok: res.ok, redirectTo, checkedAt };
  } catch (err: any) {
    return { url, label, status: null, ok: false, error: err.message, checkedAt };
  }
}

// Extract all <a href> links from a page's HTML
async function extractLinksFromPage(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, { headers: { "User-Agent": "dev-automation/1.0" } });
    if (!res.ok) return [];
    const html = await res.text();
    const matches = html.matchAll(/href=["']([^"'#?]+)["']/g);
    const links: string[] = [];
    for (const m of matches) {
      const href = m[1];
      if (href.startsWith("http")) links.push(href);
      else if (href.startsWith("/")) links.push(pageUrl.replace(/\/+$/, "") + href);
    }
    return [...new Set(links)];
  } catch {
    return [];
  }
}

export async function checkAllLinks(crawl = false): Promise<LinkCheckReport> {
  const base = config.integration.baseUrl.replace(/\/$/, "");
  const pages: { path: string; label: string }[] = config.integration.pages;
  const timeout: number = config.integration.timeout ?? 10000;

  const toCheck: { url: string; label: string }[] = pages.map((p) => ({
    url: `${base}${p.path}`,
    label: p.label,
  }));

  // Deep crawl: also check links found on each page
  if (crawl) {
    for (const page of pages) {
      const discovered = await extractLinksFromPage(`${base}${page.path}`);
      for (const link of discovered) {
        if (!toCheck.find((c) => c.url === link)) {
          toCheck.push({ url: link, label: `discovered on ${page.label}` });
        }
      }
    }
  }

  console.log(`  Checking ${toCheck.length} links...`);
  const results: LinkResult[] = [];

  for (const item of toCheck) {
    process.stdout.write(`    ${item.label.padEnd(30)}`);
    const r = await checkUrl(item.url, item.label, timeout);
    results.push(r);
    console.log(r.ok ? `✓ ${r.status}` : `✗ ${r.status ?? r.error}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const passed = results.filter((r) => r.ok).length;
  return {
    baseUrl: base,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
    ranAt: new Date().toISOString(),
  };
}

// Append link check results to the integration test config
// so future runs always include newly discovered pages
export function updatePagesConfig(report: LinkCheckReport): void {
  const configFile = path.join(__dirname, "../../config/automation.json");
  const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const existing = new Set(cfg.integration.pages.map((p: any) => p.path));

  const base = cfg.integration.baseUrl.replace(/\/$/, "");
  let added = 0;

  for (const r of report.results) {
    if (!r.url.startsWith(base)) continue;
    const p = r.url.replace(base, "") || "/";
    if (!existing.has(p)) {
      cfg.integration.pages.push({ path: p, label: r.label });
      existing.add(p);
      added++;
    }
  }

  if (added > 0) {
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n", "utf8");
    console.log(`  ✓ Added ${added} new page(s) to automation.json`);
  }
}
