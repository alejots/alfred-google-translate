"use strict";
import alfy from "alfy";
import translator from "./translate.js";
import Configstore from "configstore";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import languages from "./languages.js";
import { SocksProxyAgent } from "socks-proxy-agent";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const languagePair = new Configstore("language-config-pair");
const history = new Configstore("translate-history");

const config = {
  voice: process.env.voice || "remote",
  save: process.env.save_count || 20,
  domain: process.env.domain || "https://translate.google.com",
  agent: process.env.socks_proxy
    ? new SocksProxyAgent(process.env.socks_proxy)
    : undefined,
};

const pair = languagePair.get("pair");

if (pair) {
  // Language pair mode - use auto detection with target language
  const [pair0, pair1] = pair;

  if (pair0 === "auto" || pair1 === "auto") {
    // One language is auto, translate to the non-auto language
    doTranslate({
      text: alfy.input,
      from: {
        language: "auto",
        ttsfile: `${os.tmpdir()}/${uuidv4()}.mp3`,
      },
      to: {
        language: pair0 === "auto" ? pair1 : pair0,
        ttsfile: `${os.tmpdir()}/${uuidv4()}.mp3`,
      },
    });
  } else {
    // Both languages specified - use auto detection
    doTranslate({
      text: alfy.input,
      from: {
        language: "auto",
        ttsfile: `${os.tmpdir()}/${uuidv4()}.mp3`,
      },
      to: {
        language: pair1,
        ttsfile: `${os.tmpdir()}/${uuidv4()}.mp3`,
      },
    });
  }
} else {
  // Manual mode
  const from = languagePair.get("source") || "auto";
  const to = languagePair.get("target") || "en";

  doTranslate({
    text: alfy.input,
    from: {
      language: from,
      ttsfile: `${os.tmpdir()}/${uuidv4()}.mp3`,
    },
    to: {
      language: to,
      ttsfile: `${os.tmpdir()}/${uuidv4()}.mp3`,
    },
  });
}

async function doTranslate(opts) {
  const wordCount = opts.text.split(" ").length;
  const cambridgeUrl = `https://dictionary.cambridge.org/dictionary/english-spanish/${encodeURIComponent(
    opts.text
  )}`;

  // Fetch Google Translate results
  translator
    .translate(opts.text, {
      from: opts.from.language,
      to: opts.to.language,
      domain: config.domain,
      client: "gtx",
      agent: config.agent,
    })
    .then(async (res) => {
      const items = buildResultItems(res, opts);

      alfy.output(items);

      // Save history immediately (synchronous, fast)
      saveToHistory(res);

      // Prepare data for background worker
      res.from.language.ttsfile = opts.from.ttsfile;
      res.to.language = { iso: opts.to.language, ttsfile: opts.to.ttsfile };

      // Spawn background worker as detached process
      spawnBackgroundWorker(res, cambridgeUrl, wordCount);
    });
}

function buildResultItems(res, opts) {
  const items = [];

  if (res.from.language.didYouMean) {
    // Language detection is uncertain
    items.push({
      title: res.to.text.value,
      subtitle: `Detected the input language is ${
        languages[res.from.language.iso]
      }, not one of your configuration.`,
    });
    return items;
  }

  if (res.from.corrected.corrected || res.from.corrected.didYouMean) {
    const corrected = res.from.corrected.value.replace(/\[|\]/g, "");
    items.push({
      title: res.to.text.value,
      subtitle: `Show translation for ${corrected}?`,
      autocomplete: corrected,
    });
    return items;
  }

  // Add input text
  const fromPhonetic = res.from.text.phonetic;
  const fromText = res.from.text.value;
  const fromArg =
    config.voice === "remote"
      ? opts.from.ttsfile
      : config.voice === "local"
      ? fromText
      : "";

  items.push({
    title: fromText,
    subtitle: `Phonetic: ${fromPhonetic}`,
    quicklookurl: `${config.domain}/#view=home&op=translate&sl=${
      opts.from.language
    }&tl=${opts.to.language}&text=${encodeURIComponent(fromText)}`,
    arg: fromArg,
    text: {
      copy: fromText,
      largetype: fromText,
    },
    icon: {
      path: config.voice === "none" ? "icon.png" : "tts.png",
    },
  });

  // Add translation
  const toPhonetic = res.to.text.phonetic;
  const toText = res.to.text.value;
  const toArg =
    config.voice === "remote"
      ? opts.to.ttsfile
      : config.voice === "local"
      ? toText
      : "";

  items.push({
    title: toText,
    subtitle: `Phonetic: ${toPhonetic}`,
    quicklookurl: `${config.domain}/#view=home&op=translate&sl=${
      opts.to.language
    }&tl=${opts.from.language}&text=${encodeURIComponent(toText)}`,
    arg: toArg,
    text: {
      copy: toText,
      largetype: toText,
    },
    icon: {
      path: config.voice === "none" ? "icon.png" : "tts.png",
    },
  });

  // Add definitions
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

  // Add translations
  res.to.translations.forEach((translation) => {
    items.push({
      title: `Translation[${translation.partsOfSpeech}]: ${translation.value}`,
      subtitle: `Frequency: ${translation.frequency.toFixed(4)} Synonyms: ${
        translation.synonyms
      }`,
      text: {
        copy: translation.value,
        largetype: `Translation: ${translation.value}\n\nSynonyms: ${translation.synonyms}`,
      },
    });
  });

  return items;
}

function saveToHistory(res) {
  if (config.save <= 0) {
    return;
  }

  const value = {
    time: Date.now(),
    from: res.from.text.value,
    to: res.to.text.value,
  };

  const histories = history.get("history")
    ? JSON.parse(history.get("history"))
    : [];

  if (histories.length >= config.save) {
    histories.shift();
  }

  histories.push(value);
  history.set("history", JSON.stringify(histories));
}

function spawnBackgroundWorker(res, cambridgeUrl, wordCount) {
  const taskData = {
    tts: {
      enabled: config.voice === "remote",
      res: res,
      config: {
        domain: config.domain,
        agent: config.agent,
      },
    },
    notion: {
      enabled: true,
      word: alfy.input,
      cambridgeUrl: cambridgeUrl,
      shouldFetchCambridge: wordCount <= 3,
      wordCount: wordCount,
    },
  };

  const worker = spawn(
    "node",
    [join(__dirname, "background-worker.js"), JSON.stringify(taskData)],
    {
      detached: true,
      stdio: "ignore",
    }
  );
  worker.unref();
}
