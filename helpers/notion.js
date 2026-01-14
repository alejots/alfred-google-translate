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

export const updatePage = async (pageId, properties, icon = null) => {
  try {
    const updateParams = {
      page_id: pageId,
      properties,
    };

    if (icon) {
      updateParams.icon = {
        type: "emoji",
        emoji: icon,
      };
    }

    const response = await notion.pages.update(updateParams);
    return response;
  } catch (error) {
    logError("Error updating Notion page", error);
    return null;
  }
};

export const clearPageContent = async (pageId) => {
  try {
    // Get all children blocks of the page
    const response = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });

    // Delete all children blocks
    for (const block of response.results) {
      try {
        await notion.blocks.delete({
          block_id: block.id,
        });
      } catch (error) {
        logError(`Error deleting block ${block.id}`, error);
      }
    }

    return true;
  } catch (error) {
    logError("Error clearing page content", error);
    return false;
  }
};

// Helper function to append blocks in batches (Notion limit: 100 blocks per request)
async function appendBlocksInBatches(pageId, blocks) {
  const BATCH_SIZE = 100;
  let totalAppended = 0;

  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE);
    try {
      await notion.blocks.children.append({
        block_id: pageId,
        children: batch,
      });
      totalAppended += batch.length;
      console.error(
        `✅ Appended batch ${Math.floor(i / BATCH_SIZE) + 1} (${
          batch.length
        } blocks)`
      );
    } catch (error) {
      logError(`Error appending batch at index ${i}`, error);
      throw error;
    }
  }

  return totalAppended;
}

// Append blocks with support for toggleable headings with children
async function appendBlocksWithToggles(pageId, blocksData) {
  let totalAppended = 0;

  for (const item of blocksData) {
    if (item.type === "toggle_with_children") {
      // Append the toggleable heading first
      const response = await notion.blocks.children.append({
        block_id: pageId,
        children: [item.heading],
      });
      totalAppended += 1;
      console.error(
        `✅ Appended toggleable heading: ${item.heading.heading_2.rich_text[0].text.content}`
      );

      // Get the ID of the newly created heading block
      const headingBlockId = response.results[0].id;

      // Append children to the heading in batches
      const childrenAppended = await appendBlocksInBatches(
        headingBlockId,
        item.children
      );
      totalAppended += childrenAppended;
      console.error(`✅ Appended ${childrenAppended} blocks to toggle`);
    } else {
      // Regular block - append directly
      await notion.blocks.children.append({
        block_id: pageId,
        children: [item.block],
      });
      totalAppended += 1;
    }
  }

  return totalAppended;
}

export const appendToPage = async (pageId, data) => {
  try {
    const children = [];

    // Add word information if available
    if (data.wordInfo && data.wordInfo.word) {
      const wordInfoBlocks = [];

      // Part of speech
      if (data.wordInfo.partOfSpeech) {
        wordInfoBlocks.push({
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
        wordInfoBlocks.push({
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

      // Add heading for Word Information
      if (wordInfoBlocks.length > 0) {
        children.push({
          type: "regular",
          block: {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [
                {
                  type: "text",
                  text: { content: "📖 Word Information" },
                },
              ],
            },
          },
        });
        // Add all word info blocks
        for (const block of wordInfoBlocks) {
          children.push({ type: "regular", block });
        }
      }
    }

    // Add pronunciations if available
    if (data.pronunciations && data.pronunciations.length > 0) {
      const pronBlocks = [];

      // Add each pronunciation with audio
      for (const item of data.pronunciations) {
        // Add region and IPA
        pronBlocks.push({
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
          pronBlocks.push({
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

      children.push({
        type: "regular",
        block: {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [
              {
                type: "text",
                text: { content: "🔊 Pronunciation" },
              },
            ],
          },
        },
      });
      // Add all pronunciation blocks
      for (const block of pronBlocks) {
        children.push({ type: "regular", block });
      }
    }

    // Process sections (new structure)
    if (data.sections && data.sections.length > 0) {
      console.error(`\n📝 Creating sections with content...`);

      for (const section of data.sections) {
        const sectionBlocks = [];
        let totalContent = 0;

        // Add senses if available
        if (section.senses && section.senses.length > 0) {
          console.error(
            `   Adding ${section.senses.length} senses to ${section.name}`
          );
          totalContent += section.senses.length;

          // Add each sense
          for (const [index, sense] of section.senses.entries()) {
            // Create sense content blocks (without toggle for individual senses)
            const senseContent = [];

            // Add divider for Global section, or title for CALD section
            if (section.id === "K-EN-ES-GLOBAL") {
              // Add horizontal divider for Global section
              if (index > 0) {
                // Only add divider before senses after the first one
                senseContent.push({
                  object: "block",
                  type: "divider",
                  divider: {},
                });
              }

              // Add phrase-head as green title if available
              if (sense.phraseHead) {
                senseContent.push({
                  object: "block",
                  type: "heading_3",
                  heading_3: {
                    rich_text: [
                      {
                        type: "text",
                        text: { content: sense.phraseHead },
                        annotations: { bold: true, color: "green" },
                      },
                    ],
                  },
                });
              }
            } else {
              // Add title for CALD section
              let titleText = `${index + 1}. `;
              if (sense.title) {
                titleText += sense.title;
              } else {
                titleText += "Definition";
              }
              if (sense.level) {
                titleText += ` (${sense.level})`;
              }

              senseContent.push({
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
            }

            // Grammar info
            if (sense.grammar) {
              senseContent.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    {
                      type: "text",
                      text: { content: `Grammar: ${sense.grammar}` },
                      annotations: { italic: true, color: "gray" },
                    },
                  ],
                },
              });
            }

            // Add definition
            if (sense.definition) {
              senseContent.push({
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
              senseContent.push({
                object: "block",
                type: "callout",
                callout: {
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
              senseContent.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    {
                      type: "text",
                      text: { content: "Examples:" },
                      annotations: { bold: true },
                    },
                  ],
                },
              });

              for (const example of sense.examples) {
                // English example
                if (example.en) {
                  senseContent.push({
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [
                        {
                          type: "text",
                          text: { content: example.en },
                        },
                      ],
                    },
                  });
                }

                // Spanish translation of example
                if (example.es) {
                  senseContent.push({
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                      rich_text: [
                        {
                          type: "text",
                          text: { content: `→ ${example.es}` },
                          annotations: { italic: true, color: "gray" },
                        },
                      ],
                    },
                  });
                }
              }
            }

            // Add spacing
            senseContent.push({
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [],
              },
            });

            sectionBlocks.push(...senseContent);
          }
        }

        // Add phrasal verbs if available
        if (section.phrasalVerbs && section.phrasalVerbs.length > 0) {
          console.error(
            `   Adding ${section.phrasalVerbs.length} phrasal verbs to ${section.name}`
          );
          totalContent += section.phrasalVerbs.length;

          sectionBlocks.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: `🔗 Phrasal Verbs (${section.phrasalVerbs.length})`,
                  },
                  annotations: { bold: true },
                },
              ],
            },
          });

          for (const phrasalVerb of section.phrasalVerbs) {
            sectionBlocks.push({
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
        }

        // Add idioms if available
        if (section.idioms && section.idioms.length > 0) {
          console.error(
            `   Adding ${section.idioms.length} idioms to ${section.name}`
          );
          totalContent += section.idioms.length;

          sectionBlocks.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: `💡 Idioms (${section.idioms.length})` },
                  annotations: { bold: true },
                },
              ],
            },
          });

          for (const idiom of section.idioms) {
            sectionBlocks.push({
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
        }

        // Add section as toggle only if it has content
        if (sectionBlocks.length > 0) {
          children.push({
            type: "toggle_with_children",
            heading: {
              object: "block",
              type: "heading_2",
              heading_2: {
                rich_text: [
                  {
                    type: "text",
                    text: { content: `📚 ${section.name}` },
                  },
                ],
                is_toggleable: true,
              },
            },
            children: sectionBlocks,
          });
        }
      }
    }

    // Support old structure (backward compatibility)
    else if (data.senses && data.senses.length > 0) {
      console.error(
        `\n📝 Creating ${data.senses.length} sense blocks (old structure)...`
      );

      // Add each sense as a toggle block
      for (const [index, sense] of data.senses.entries()) {
        const senseBlocks = [];

        // Add definition
        if (sense.definition) {
          senseBlocks.push({
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
          senseBlocks.push({
            object: "block",
            type: "callout",
            callout: {
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
          senseBlocks.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: "Examples:" },
                  annotations: { bold: true },
                },
              ],
            },
          });

          for (const example of sense.examples) {
            // English example
            if (example.en) {
              senseBlocks.push({
                object: "block",
                type: "bulleted_list_item",
                bulleted_list_item: {
                  rich_text: [
                    {
                      type: "text",
                      text: { content: example.en },
                    },
                  ],
                },
              });
            }

            // Spanish translation of example
            if (example.es) {
              senseBlocks.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    {
                      type: "text",
                      text: { content: `→ ${example.es}` },
                      annotations: { italic: true, color: "gray" },
                    },
                  ],
                },
              });
            }
          }
        }

        // Create toggle title
        const titleText = sense.level
          ? `${index + 1}. ${sense.title || "Definition"} (${sense.level})`
          : `${index + 1}. ${sense.title || "Definition"}`;

        children.push({
          type: "toggle_with_children",
          heading: {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [
                {
                  type: "text",
                  text: { content: titleText },
                },
              ],
              is_toggleable: true,
            },
          },
          children: senseBlocks,
        });
      }

      // Add phrasal verbs if available (old structure)
      if (data.phrasalVerbs && data.phrasalVerbs.length > 0) {
        const phrasalVerbBlocks = [];

        for (const phrasalVerb of data.phrasalVerbs) {
          phrasalVerbBlocks.push({
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

        children.push({
          type: "toggle_with_children",
          heading: {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: `🔗 Phrasal Verbs (${data.phrasalVerbs.length})`,
                  },
                },
              ],
              is_toggleable: true,
            },
          },
          children: phrasalVerbBlocks,
        });
      }

      // Add idioms if available (old structure)
      if (data.idioms && data.idioms.length > 0) {
        const idiomBlocks = [];

        for (const idiom of data.idioms) {
          idiomBlocks.push({
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

        children.push({
          type: "toggle_with_children",
          heading: {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [
                {
                  type: "text",
                  text: { content: `💡 Idioms (${data.idioms.length})` },
                },
              ],
              is_toggleable: true,
            },
          },
          children: idiomBlocks,
        });
      }
    }

    console.error(`\n📦 Total items to append: ${children.length}`);

    // Append blocks with toggle support
    const totalAppended = await appendBlocksWithToggles(pageId, children);

    console.error(`✅ Successfully appended ${totalAppended} blocks to Notion`);

    return { success: true, blocksAppended: totalAppended };
  } catch (error) {
    logError("Error appending to Notion page", error);
    return null;
  }
};
