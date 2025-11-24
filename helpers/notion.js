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
    console.error("Error appending to Notion page:", error.message);
    throw error;
  }
};
