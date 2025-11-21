import { Client } from "@notionhq/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get credentials from environment variables or config.json
let token = process.env.notion_token;
let database_id = process.env.notion_database_id;

// Fallback to config.json if environment variables are not set
if (!token || !database_id) {
  try {
    const configPath = join(__dirname, "..", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    token = token || config.token;
    database_id = database_id || config.database_id;
  } catch (error) {
    console.log("No config.json found, using environment variables only");
  }
}

const notion = new Client({
  auth: token,
});

export const createPage = async (properties) => {
  try {
    const response = await notion.pages.create({
      parent: {
        type: "database_id",
        database_id: database_id,
      },
      properties,
      template: {
        type: "default",
      },
    });
    return response;
  } catch (error) {
    console.error("Error creating Notion page:", error.message);
    throw error;
  }
};

export const appendToPage = async (pageId, pronunciations) => {
  try {
    const children = [];

    // Add "Pronunciation:" header
    children.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: { content: "Pronunciation:" },
            annotations: { bold: true },
          },
        ],
      },
    });

    // Add each pronunciation with audio
    for (const item of pronunciations) {
      // Add region and IPA
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: item.region },
              annotations: { bold: true },
            },
            {
              type: "text",
              text: { content: `: /${item.ipa}/` },
            },
          ],
        },
      });

      // Add audio block if available
      if (item.audioUrl) {
        children.push({
          object: "block",
          type: "audio",
          audio: {
            type: "external",
            external: {
              url: item.audioUrl,
            },
          },
        });
      }
    }

    const response = await notion.blocks.children.append({
      block_id: pageId,
      children: children,
    });

    return response;
  } catch (error) {
    console.error("Error appending to Notion page:", error.message);
    throw error;
  }
};
