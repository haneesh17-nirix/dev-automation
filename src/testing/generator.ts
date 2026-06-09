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
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.2, num_predict: 2048 } }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  return ((await res.json()) as any).response.trim();
}

// Read a changed file's content (up to 150 lines for context)
function readChangedFile(projectPath: string, filePath: string): string {
  try {
    const abs = path.join(projectPath, filePath);
    if (!fs.existsSync(abs)) return "";
    const lines = fs.readFileSync(abs, "utf8").split("\n").slice(0, 150);
    return lines.join("\n");
  } catch {
    return "";
  }
}

// Generate a new test file for a changed source file
export async function generateTestForFile(
  projectPath: string,
  sourceFile: string,
  commit: CommitInfo
): Promise<string | null> {
  const content = readChangedFile(projectPath, sourceFile);
  if (!content) return null;

  const ext = path.extname(sourceFile);
  const isTs = ext === ".ts" || ext === ".tsx";

  const prompt = `You are a senior TypeScript test engineer. Write a complete unit test file for the following source file.

Source file: ${sourceFile}
Commit context: "${commit.message}"

\`\`\`${isTs ? "typescript" : "javascript"}
${content}
\`\`\`

Requirements:
- Use Node's built-in \`assert\` module (no Jest, no extra dependencies)
- Test all exported functions and classes
- Cover happy path AND at least 2 edge cases per function
- Use descriptive test names
- Group tests with a simple describe-style comment block
- TypeScript, strict mode compatible

Output ONLY the test file content. No explanation. No markdown fences.`;

  return ollamaAsk(prompt);
}

// Update an existing test file based on the diff
export async function updateTestForFile(
  projectPath: string,
  sourceFile: string,
  existingTestFile: string,
  diff: DiffSummary,
  commit: CommitInfo
): Promise<string | null> {
  const sourceContent = readChangedFile(projectPath, sourceFile);
  const existingTest = fs.existsSync(existingTestFile)
    ? fs.readFileSync(existingTestFile, "utf8")
    : "";

  if (!sourceContent) return null;

  const prompt = `You are updating an existing test file to match new source code changes.

Changed source file: ${sourceFile}
Commit: "${commit.message}"
+${diff.additions} lines added, -${diff.deletions} lines removed

Updated source (first 150 lines):
\`\`\`typescript
${sourceContent}
\`\`\`

Existing test file:
\`\`\`typescript
${existingTest.slice(0, 3000)}
\`\`\`

Instructions:
1. Keep all existing passing tests
2. Update tests for functions whose signatures changed
3. Add new tests for any new functions/exports
4. Remove tests for deleted functions
5. Output the complete updated test file

Output ONLY the updated test file. No explanation. No markdown fences.`;

  return ollamaAsk(prompt);
}

// Main entry: scan diff, generate or update tests for changed files
export async function syncTestsForDiff(
  projectPath: string,
  diff: DiffSummary,
  commit: CommitInfo
): Promise<void> {
  const testDir = path.join(projectPath, config.testing.generatedDir ?? "tests/generated");
  fs.mkdirSync(testDir, { recursive: true });

  // Only generate tests for source files (not tests themselves, not configs)
  const sourceFiles = diff.filesChanged.filter(
    (f) =>
      /\.(ts|js)$/.test(f) &&
      !f.includes(".test.") &&
      !f.includes(".spec.") &&
      !f.includes("node_modules") &&
      !f.includes("dist/")
  );

  if (!sourceFiles.length) {
    console.log("  No source files changed — skipping test generation.");
    return;
  }

  console.log(`  Generating/updating tests for ${sourceFiles.length} changed file(s)...`);

  for (const sourceFile of sourceFiles) {
    const baseName = path.basename(sourceFile, path.extname(sourceFile));
    const testFileName = `${baseName}.generated.test.ts`;
    const testFilePath = path.join(testDir, testFileName);

    try {
      let content: string | null;

      if (fs.existsSync(testFilePath)) {
        process.stdout.write(`    Updating ${testFileName}...`);
        content = await updateTestForFile(projectPath, sourceFile, testFilePath, diff, commit);
      } else {
        process.stdout.write(`    Generating ${testFileName}...`);
        content = await generateTestForFile(projectPath, sourceFile, commit);
      }

      if (content) {
        fs.writeFileSync(testFilePath, content, "utf8");
        console.log(" ✓");
      } else {
        console.log(" skipped (empty file)");
      }
    } catch (err: any) {
      console.log(` ✗ ${err.message}`);
    }
  }
}
