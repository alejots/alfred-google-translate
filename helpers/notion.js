import { Client } from "@notionhq/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function logError(message, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ${message}:`, error?.message || error);
  if (error?.stack) {
    console.error(error.stack);
  }
}

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
    logError("No config.json found, using environment variables only", error);
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
    logError("Error creating Notion page", error);
    return null;
  }
};

export const findAllPagesByWord = async (word) => {
  try {
    // Use search API to find pages in the database with matching title
    const response = await notion.search({
      query: word,
      filter: {
        property: "object",
        value: "page",
      },
      page_size: 100, // Increased to handle more duplicates
    });

    // Normalize database_id for comparison (remove hyphens)
    const normalizedDbId = database_id.replace(/-/g, "");

    // Filter results to collect ALL pages in our database with matching Word property
    const matchingPages = [];
    for (const page of response.results) {
      // Get the database ID from parent (could be database_id or data_source_id)
      const pageDbId = page.parent?.database_id || page.parent?.data_source_id;
      const normalizedPageDbId = pageDbId?.replace(/-/g, "");

      if (normalizedPageDbId === normalizedDbId) {
        // Check if the Word property matches exactly
        const wordProperty = page.properties?.Word;
        if (wordProperty?.title?.[0]?.plain_text === word) {
          matchingPages.push(page);
        }
      }
    }

    return matchingPages;
  } catch (error) {
    logError("Error finding all Notion pages by word", error);
    return [];
  }
};

export const getLevelValue = async (pageId) => {
  try {
    const response = await notion.pages.retrieve({ page_id: pageId });

    // Get Level property value (returns null if not set, or the number value)
    const levelProperty = response.properties.Level;

    if (!levelProperty || levelProperty.type !== "number") {
      return null;
    }

    return levelProperty.number;
  } catch (error) {
    logError("Error getting Level property", error);
    return null;
  }
};

export const deletePage = async (pageId) => {
  try {
    await notion.pages.update({
      page_id: pageId,
      archived: true,
    });
    return true;
  } catch (error) {
    logError("Error deleting Notion page", error);
    return false;
  }
};

export const appendToPage = async (pageId, data) => {
  try {
    const children = [];

    // Add word information if available
    if (data.wordInfo && data.wordInfo.word) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: "Word Information:" },
              annotations: { bold: true },
            },
          ],
        },
      });

      // Part of speech
      if (data.wordInfo.partOfSpeech) {
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: "Part of speech: " },
                annotations: { bold: true },
              },
              {
                type: "text",
                text: { content: data.wordInfo.partOfSpeech },
              },
            ],
          },
        });
      }

      // Word forms
      if (data.wordInfo.wordForms) {
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: "Forms: " },
                annotations: { bold: true },
              },
              {
                type: "text",
                text: { content: data.wordInfo.wordForms },
              },
            ],
          },
        });
      }

      // Add spacing
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [],
        },
      });
    }

    // Add pronunciations if available
    if (data.pronunciations && data.pronunciations.length > 0) {
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
      for (const item of data.pronunciations) {
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
    }

    // Add senses if available
    if (data.senses && data.senses.length > 0) {
      // Add "Senses:" header
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: "Senses:" },
              annotations: { bold: true },
            },
          ],
        },
      });

      // Add each sense
      for (const sense of data.senses) {
        // Add sense title with level
        const titleText = sense.level
          ? `${sense.title} - ${sense.level}`
          : sense.title;

        children.push({
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [
              {
                type: "text",
                text: { content: titleText },
              },
            ],
          },
        });

        // Add definition
        if (sense.definition) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: sense.definition },
                  annotations: { italic: true },
                },
              ],
            },
          });
        }

        // Add translation
        if (sense.translation) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: sense.translation },
                  annotations: { bold: true, color: "blue" },
                },
              ],
            },
          });
        }

        // Add examples
        if (sense.examples && sense.examples.length > 0) {
          for (const example of sense.examples) {
            // English example
            if (example.en) {
              children.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    {
                      type: "text",
                      text: { content: `• ${example.en}` },
                    },
                  ],
                },
              });
            }

            // Spanish translation of example
            if (example.es) {
              children.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    {
                      type: "text",
                      text: { content: `  Trans: ${example.es}` },
                      annotations: { italic: true, color: "gray" },
                    },
                  ],
                },
              });
            }
          }
        }

        // Add spacing between senses
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [],
          },
        });
      }
    }

    // Add phrasal verbs if available
    if (data.phrasalVerbs && data.phrasalVerbs.length > 0) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: "Phrasal Verbs:" },
              annotations: { bold: true },
            },
          ],
        },
      });

      // Limit to first 10 phrasal verbs to avoid overwhelming the page
      const phrasalVerbsToShow = data.phrasalVerbs.slice(0, 10);
      for (const phrasalVerb of phrasalVerbsToShow) {
        children.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              {
                type: "text",
                text: { content: phrasalVerb },
              },
            ],
          },
        });
      }

      // Add note if there are more
      if (data.phrasalVerbs.length > 10) {
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: `... and ${data.phrasalVerbs.length - 10} more`,
                },
                annotations: { italic: true, color: "gray" },
              },
            ],
          },
        });
      }

      // Add spacing
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [],
        },
      });
    }

    // Add idioms if available
    if (data.idioms && data.idioms.length > 0) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: "Idioms:" },
              annotations: { bold: true },
            },
          ],
        },
      });

      // Limit to first 10 idioms
      const idiomsToShow = data.idioms.slice(0, 10);
      for (const idiom of idiomsToShow) {
        children.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              {
                type: "text",
                text: { content: idiom },
              },
            ],
          },
        });
      }

      // Add note if there are more
      if (data.idioms.length > 10) {
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: `... and ${data.idioms.length - 10} more` },
                annotations: { italic: true, color: "gray" },
              },
            ],
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
    logError("Error appending to Notion page", error);
    return null;
  }
};
