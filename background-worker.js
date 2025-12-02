#!/usr/bin/env node
"use strict";

// Background worker for TTS and Notion operations
// This runs as a separate detached process

import tts from "./tts.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  createPage,
  appendToPage,
  findAllPagesByWord,
  getLevelValue,
  deletePage,
} from "./helpers/notion.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function logError(message, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR: ${message}:`, error?.message || error);
  if (error?.stack) {
    console.error(error.stack);
  }
}

// Read task data from command line argument (JSON string)
const taskData = JSON.parse(process.argv[2]);

async function extractCambridgeData(url) {
  try {
    const scriptPath = join(__dirname, "scripts", "extract_senses.js");
    const { stdout } = await execFileAsync("node", [scriptPath, url]);
    const jsonOutput = stdout.trim();
    const data = JSON.parse(jsonOutput);
    return data;
  } catch (error) {
    logError("Error extracting Cambridge data", error);
    return null;
  }
}

async function generateTTS(res, config) {
  try {
    var fromArray = [];
    res.from.text.array.forEach((o) =>
      tts.split(o).forEach((t) => fromArray.push(t))
    );
    await tts.multi(fromArray, {
      to: res.from.language.iso,
      domain: config.domain,
      file: res.from.language.ttsfile,
      client: "gtx",
      agent: config.agent,
      responseType: "buffer",
    });

    var toArray = [];
    res.to.text.array.forEach((o) =>
      tts.split(o).forEach((t) => toArray.push(t))
    );
    await tts.multi(toArray, {
      to: res.to.language.iso,
      domain: config.domain,
      file: res.to.language.ttsfile,
      client: "gtx",
      agent: config.agent,
    });
  } catch (error) {
    logError("TTS generation failed", error);
  }
}

async function createNotionPage(
  word,
  cambridgeUrl,
  shouldFetchCambridge,
  cambridgeDataPromise
) {
  try {
    // Check if pages with this word already exist
    const existingPages = await findAllPagesByWord(word);
    const levelValues = [];
    let highestLevel = 0;

    if (existingPages.length > 0) {
      for (const page of existingPages) {
        const levelValue = await getLevelValue(page.id);
        if (levelValue) {
          levelValues.push(levelValue);
        }
      }

      // Delete all existing pages
      for (const page of existingPages) {
        await deletePage(page.id);
      }

      // Determine the highest level among existing pages
      if (levelValues.length > 0) {
        levelValues.sort((a, b) => b - a); // Descending order
        highestLevel = levelValues[0];
      }
    }

    // Create a new page
    var properties = {
      Word: {
        title: [{ text: { content: word } }],
      },
      Status: {
        type: "status",
        status: { name: highestLevel > 0 ? "Learning" : "New" },
      },
      Level: {
        type: "number",
        number: highestLevel,
      },
    };

    if (shouldFetchCambridge) {
      properties.CambridgeLink = {
        rich_text: [
          {
            text: {
              content: cambridgeUrl,
              link: { url: cambridgeUrl },
            },
          },
        ],
      };
    }

    const page = await createPage(properties);

    // Add Cambridge data if available
    if (shouldFetchCambridge && page && page.id) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const cambridgeData = await cambridgeDataPromise;

      if (cambridgeData) {
        await appendToPage(page.id, cambridgeData);
      }
    }
  } catch (error) {
    logError("Notion page creation failed", error);
  }
}

// Main worker logic
(async () => {
  try {
    // Handle TTS if requested
    if (taskData.tts && taskData.tts.enabled) {
      await generateTTS(taskData.tts.res, taskData.tts.config);
    }

    // Handle Notion if requested
    if (taskData.notion && taskData.notion.enabled) {
      const { word, cambridgeUrl, shouldFetchCambridge, wordCount } =
        taskData.notion;

      if (wordCount <= 10) {
        // Fetch Cambridge data if needed
        let cambridgeDataPromise = Promise.resolve(null);
        if (shouldFetchCambridge) {
          cambridgeDataPromise = extractCambridgeData(cambridgeUrl);
        }

        await createNotionPage(
          word,
          cambridgeUrl,
          shouldFetchCambridge,
          cambridgeDataPromise
        );
      }
    }

    process.exit(0);
  } catch (error) {
    logError("Background worker failed", error);
    process.exit(1);
  }
})();
