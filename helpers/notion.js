import { Client } from "@notionhq/client";

import config from "../config.json" assert { type: "json" };

const notion = new Client({
  auth: config.token,
});

export const createPage = async (properties) => {
  try {
    const response = await notion.pages.create({
      parent: {
        type: "database_id",
        database_id: config.database_id,
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
