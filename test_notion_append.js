#!/usr/bin/env node

/**
 * Test script to verify the Cambridge data extraction and Notion formatting
 * Usage: node test_notion_append.js <page-id> <cambridge-url>
 */

import { appendToPage } from "./helpers/notion.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execFileAsync = promisify(execFile);

async function extractCambridgeData(url) {
  try {
    const scriptPath = join(__dirname, "scripts", "extract_senses.js");
    const { stdout } = await execFileAsync("node", [scriptPath, url]);
    const jsonOutput = stdout.trim();
    const data = JSON.parse(jsonOutput);
    return data;
  } catch (error) {
    console.error("Error extracting Cambridge data:", error);
    return null;
  }
}

async function main() {
  const pageId = process.argv[2];
  const cambridgeUrl = process.argv[3];

  if (!pageId || !cambridgeUrl) {
    console.error(
      "Usage: node test_notion_append.js <page-id> <cambridge-url>"
    );
    console.error(
      "Example: node test_notion_append.js abc123 https://dictionary.cambridge.org/dictionary/english-spanish/come-up"
    );
    process.exit(1);
  }

  console.log("🔍 Extracting Cambridge data...");
  const cambridgeData = await extractCambridgeData(cambridgeUrl);

  if (!cambridgeData) {
    console.error("❌ Failed to extract Cambridge data");
    process.exit(1);
  }

  console.log("\n📊 Extracted data:");
  console.log(`- Pronunciations: ${cambridgeData.pronunciations?.length || 0}`);
  console.log(`- Senses: ${cambridgeData.senses?.length || 0}`);

  if (cambridgeData.senses && cambridgeData.senses.length > 0) {
    console.log("\n📚 Senses:");
    cambridgeData.senses.forEach((sense, i) => {
      console.log(
        `  ${i + 1}. ${sense.title} ${sense.level ? `(${sense.level})` : ""}`
      );
      console.log(`     ${sense.definition}`);
      console.log(`     Translation: ${sense.translation}`);
      console.log(`     Examples: ${sense.examples.length}`);
    });
  }

  console.log("\n📝 Appending to Notion page...");
  try {
    await appendToPage(pageId, cambridgeData);
    console.log("✅ Successfully appended to Notion page!");
  } catch (error) {
    console.error("❌ Failed to append to Notion:", error.message);
    process.exit(1);
  }
}

main();
