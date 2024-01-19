import { Client } from "@notionhq/client";

import config from "../config.json" assert { type: "json" };

const notion = new Client({
  auth: config.token,
});

export const createPage = (emoji, properties) => {
  notion.pages.create({
    icon: {
      type: "emoji",
      emoji,
    },
    parent: {
      type: "database_id",
      database_id: config.database_id,
    },
    properties,
  });
};
