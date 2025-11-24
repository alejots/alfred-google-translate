"use strict";
import alfy from "alfy";
import tts from "./tts.js";
import translator from "./translate.js";
import Configstore from "configstore";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import languages from "./languages.js";
import SocksProxyAgent from "socks-proxy-agent";
import { createPage, appendToPage } from "./helpers/notion.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const languagePair = new Configstore("language-config-pair");
const history = new Configstore("translate-history");

var g_config = {
  voice: process.env.voice || "remote",
  save: process.env.save_count || 20,
  domain: process.env.domain || "https://translate.google.com",
  agent: process.env.socks_proxy
    ? new SocksProxyAgent(process.env.socks_proxy)
    : undefined,
};

var pair = languagePair.get("pair");

if (pair) {
  // Language pair mode - use auto detection with target language
  var pair0 = pair[0];
  var pair1 = pair[1];

  if (pair0 === "auto" || pair1 === "auto") {
    // One language is auto, translate to the non-auto language
    doTranslate({
      text: alfy.input,
      from: {
        language: "auto",
        ttsfile: os.tmpdir() + "/" + uuidv4() + ".mp3",
      },
      to: {
        language: pair0 === "auto" ? pair1 : pair0,
        ttsfile: os.tmpdir() + "/" + uuidv4() + ".mp3",
      },
    });
  } else {
    // Both languages specified - use auto detection
    // The API will detect the language and translate to the appropriate target
    // We'll use the first language in the pair as the primary target
    doTranslate({
      text: alfy.input,
      from: {
        language: "auto",
        ttsfile: os.tmpdir() + "/" + uuidv4() + ".mp3",
      },
      to: {
        language: pair1,
        ttsfile: os.tmpdir() + "/" + uuidv4() + ".mp3",
      },
    });
  }
} else {
  // manual
  var source = languagePair.get("source");
  var target = languagePair.get("target");
  var from = "auto";
  var to = "en";
  if (source && target) {
    from = source;
    to = target;
  }

  doTranslate({
    text: alfy.input,
    from: {
      language: from,
      ttsfile: os.tmpdir() + "/" + uuidv4() + ".mp3",
    },
    to: {
      language: to,
      ttsfile: os.tmpdir() + "/" + uuidv4() + ".mp3",
    },
  });
}

async function validateUrl(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual", // Don't follow redirects automatically
    });

    // If status is 200, the page exists
    // If status is 3xx (redirect), check where it's redirecting to
    if (response.status === 200) {
      return true;
    } else if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      // If redirecting to base dictionary path, word doesn't exist
      const exists = location && !location.endsWith("/english-spanish/");
      return exists;
    }

    return false;
  } catch (error) {
    return false;
  }
}

async function extractCambridgeData(url) {
  try {
    const scriptPath = join(__dirname, "scripts", "extract_senses.js");
    const { stdout } = await execFileAsync("node", [scriptPath, url]);
    const jsonOutput = stdout.trim();

    // Parse and return the JSON object with pronunciations and senses
    const data = JSON.parse(jsonOutput);
    return data;
  } catch (error) {
    console.error("Error extracting Cambridge data:", error);
    return null;
  }
}

function doTranslate(opts) {
  translator
    .translate(opts.text, {
      from: opts.from.language,
      to: opts.to.language,
      domain: g_config.domain,
      client: "gtx",
      agent: g_config.agent,
    })
    .then(function (res) {
      var items = [];

      if (res.from.language.didYouMean) {
        // Language detection is uncertain
        items.push({
          title: res.to.text.value,
          subtitle: `Detected the input language is ${
            languages[res.from.language.iso]
          }, not one of your configuration.`,
        });
      } else if (
        res.from.corrected.corrected ||
        res.from.corrected.didYouMean
      ) {
        var corrected = res.from.corrected.value
          .replace(/\[/, "")
          .replace(/\]/, "");

        // Correct
        items.push({
          title: res.to.text.value,
          subtitle: `Show translation for ${corrected}?`,
          autocomplete: corrected,
        });
      } else {
        var fromPhonetic = res.from.text.phonetic;
        var fromText = res.from.text.value;
        var fromArg =
          g_config.voice === "remote"
            ? opts.from.ttsfile
            : g_config.voice === "local"
            ? fromText
            : "";
        // Input
        items.push({
          title: fromText,
          subtitle: `Phonetic: ${fromPhonetic}`,
          quicklookurl: `${g_config.domain}/#view=home&op=translate&sl=${
            opts.from.language
          }&tl=${opts.to.language}&text=${encodeURIComponent(fromText)}`,
          arg: fromArg,
          text: {
            copy: fromText,
            largetype: fromText,
          },
          icon: {
            path: g_config.voice === "none" ? "icon.png" : "tts.png",
          },
        });

        var toPhonetic = res.to.text.phonetic;
        var toText = res.to.text.value;
        var toArg =
          g_config.voice === "remote"
            ? opts.to.ttsfile
            : g_config.voice === "local"
            ? toText
            : "";
        // Translation
        items.push({
          title: toText,
          subtitle: `Phonetic: ${toPhonetic}`,
          quicklookurl: `${g_config.domain}/#view=home&op=translate&sl=${
            opts.to.language
          }&tl=${opts.from.language}&text=${encodeURIComponent(toText)}`,
          arg: toArg,
          text: {
            copy: toText,
            largetype: toText,
          },
          icon: {
            path: g_config.voice === "none" ? "icon.png" : "tts.png",
          },
        });

        // Definitions
        res.to.definitions.forEach((definition) => {
          items.push({
            title: `Definition[${definition.partsOfSpeech}]: ${definition.value}`,
            subtitle: `Example: ${definition.example}`,
            text: {
              copy: definition.value,
              largetype: `Definition: ${definition.value}\n\nExample: ${definition.example}`,
            },
          });
        });

        // Translation Of
        res.to.translations.forEach((translation) => {
          items.push({
            title: `Translation[${translation.partsOfSpeech}]: ${translation.value}`,
            subtitle: `Frequency: ${translation.frequency.toFixed(
              4
            )} Synonyms: ${translation.synonyms}`,
            text: {
              copy: translation.value,
              largetype: `Translation: ${translation.value}\n\nSynonyms: ${translation.synonyms}`,
            },
          });
        });
      }

      alfy.output(items);

      res.from.language.ttsfile = opts.from.ttsfile;
      res.to.language = { iso: opts.to.language, ttsfile: opts.to.ttsfile };

      // Start both TTS and Notion page creation in the background (non-blocking)
      // Don't await - let them run independently
      if (g_config.voice === "remote") {
        generateTTSInBackground(res).catch((error) => {
          console.error("Background TTS generation failed:", error.message);
        });
      }

      createNotionPageInBackground(res, opts).catch((error) => {
        console.error("Background Notion creation failed:", error.message);
      });

      return res;
    })
    .then((res) => {
      // history, todo: could be optimized
      if (g_config.save > 0) {
        var value = {
          time: Date.now(),
          from: res.from.text.value,
          to: res.to.text.value,
        };
        var histories = history.get("history")
          ? JSON.parse(history.get("history"))
          : [];
        if (histories.length >= g_config.save) histories.shift();
        histories.push(value);
        history.set("history", JSON.stringify(histories));
      }

      return res;
    });
}

// Background function to generate TTS without blocking
async function generateTTSInBackground(res) {
  var fromArray = [];
  res.from.text.array.forEach((o) =>
    tts.split(o).forEach((t) => fromArray.push(t))
  );
  tts.multi(fromArray, {
    to: res.from.language.iso,
    domain: g_config.domain,
    file: res.from.language.ttsfile,
    client: "gtx",
    agent: g_config.agent,
    responseType: "buffer",
  });
  var toArray = [];
  res.to.text.array.forEach((o) =>
    tts.split(o).forEach((t) => toArray.push(t))
  );
  tts.multi(toArray, {
    to: res.to.language.iso,
    domain: g_config.domain,
    file: res.to.language.ttsfile,
    client: "gtx",
    agent: g_config.agent,
  });
}

// Background function to create Notion page without blocking Alfred results
async function createNotionPageInBackground(res, opts) {
  // Filter out translations with more than 10 words
  if (alfy.input.split(" ").length > 10) {
    return;
  }

  const cambridgeUrl = `https://dictionary.cambridge.org/dictionary/english-spanish/${encodeURIComponent(
    alfy.input
  )}`;

  // Check if Cambridge link exists only for translations shorter than 3 words
  const wordCount = alfy.input.split(" ").length;
  const linkExists = wordCount <= 3 ? await validateUrl(cambridgeUrl) : false;

  var properties = {
    Word: {
      title: [
        {
          text: {
            content: alfy.input,
          },
        },
      ],
    },
    Status: {
      type: "status",
      status: {
        name: "New",
      },
    },
  };

  // Only add Cambridge link if it exists
  if (linkExists) {
    properties.CambridgeLink = {
      rich_text: [
        {
          text: {
            content: cambridgeUrl,
            link: {
              url: cambridgeUrl,
            },
          },
        },
      ],
    };
  }

  // Create the page first
  try {
    const page = await createPage(properties);

    // If we have a Cambridge link and the page was created successfully, add content
    if (linkExists && page && page.id) {
      // Wait a bit for the page/template to be fully initialized
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Extract and add pronunciation and senses
      const cambridgeData = await extractCambridgeData(cambridgeUrl);
      if (cambridgeData) {
        await appendToPage(page.id, cambridgeData);
      }
    }
  } catch (error) {
    console.error("Failed to create Notion page:", error.message);
  }
}
