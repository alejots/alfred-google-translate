#!/usr/bin/env node

import { JSDOM } from "jsdom";

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error("Usage: node extract_senses.js <cambridge-dictionary-url>");
  process.exit(1);
}

console.error(`🔍 Fetching URL: ${targetUrl}`);

// Fetch HTML
const response = await fetch(targetUrl, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
});

if (!response.ok) {
  console.error(`❌ Error: Failed to fetch URL (${response.status})`);
  process.exit(1);
}

const html = await response.text();
console.error(`✅ Page downloaded (${html.length} bytes)`);

const dom = new JSDOM(html);
const document = dom.window.document;

// Extract base URL
const urlObj = new globalThis.URL(targetUrl);
const baseURL = urlObj.origin;
console.error(`🌐 Base URL: ${baseURL}`);

// Extract word information
console.error("\n📖 Extracting word information...");

const wordInfo = {
  word: "",
  partOfSpeech: "",
  wordForms: "",
};

// Extract the main word
const wordElement = document.querySelector(".di-title");
wordInfo.word = wordElement ? wordElement.textContent.trim() : "";
if (wordInfo.word) console.error(`   Word: ${wordInfo.word}`);

// Extract part of speech
const posElement = document.querySelector(".pos.dpos");
wordInfo.partOfSpeech = posElement ? posElement.textContent.trim() : "";
if (wordInfo.partOfSpeech)
  console.error(`   Part of speech: ${wordInfo.partOfSpeech}`);

// Extract word forms (e.g., "running | past ran | past participle run")
const wordFormsElement = document.querySelector(".irreg-infls, .rreg-infls");
if (wordFormsElement) {
  wordInfo.wordForms = wordFormsElement.textContent.trim();
  console.error(`   Word forms: ${wordInfo.wordForms}`);
}

// Extract pronunciations
console.error("\n📝 Extracting pronunciation information...");

const pronunciations = [];

// UK pronunciation
const ukPronContainer = document.querySelector(".uk.dloc");
const ukIpaElement = ukPronContainer
  ? ukPronContainer.parentElement.querySelector(".ipa.dipa")
  : null;
const ukAudioElement = ukPronContainer
  ? ukPronContainer.querySelector('source[type="audio/mpeg"]')
  : null;

if (ukIpaElement || ukAudioElement) {
  console.error("✅ Found UK pronunciation");
  const ukIpa = ukIpaElement ? ukIpaElement.textContent.trim() : "";
  let ukAudio = ukAudioElement ? ukAudioElement.getAttribute("src") : "";

  if (ukIpa) console.error(`   IPA: ${ukIpa}`);
  if (ukAudio) {
    if (!ukAudio.startsWith("http")) {
      ukAudio = baseURL + ukAudio;
    }
    console.error(`   Audio: ${ukAudio}`);
  }

  pronunciations.push({
    region: "UK",
    ipa: ukIpa,
    audioUrl: ukAudio,
  });
}

// US pronunciation
const usPronContainer = document.querySelector(".us.dloc");
const usIpaElement = usPronContainer
  ? usPronContainer.parentElement.querySelector(".ipa.dipa")
  : null;
const usAudioElement = usPronContainer
  ? usPronContainer.querySelector('source[type="audio/mpeg"]')
  : null;

if (usIpaElement || usAudioElement) {
  console.error("✅ Found US pronunciation");
  const usIpa = usIpaElement ? usIpaElement.textContent.trim() : "";
  let usAudio = usAudioElement ? usAudioElement.getAttribute("src") : "";

  if (usIpa) console.error(`   IPA: ${usIpa}`);
  if (usAudio) {
    if (!usAudio.startsWith("http")) {
      usAudio = baseURL + usAudio;
    }
    console.error(`   Audio: ${usAudio}`);
  }

  pronunciations.push({
    region: "US",
    ipa: usIpa,
    audioUrl: usAudio,
  });
}

// Extract senses
console.error("\n📚 Extracting senses...");

const senseBlocks = document.querySelectorAll(
  ".sense-block.pr.dsense, .sense-block.pr.dsense-noh"
);
const senses = [];

senseBlocks.forEach((block, index) => {
  console.error(`\n   Sense ${index + 1}:`);

  // Extract sense title (may not exist for dsense-noh blocks)
  const titleElement = block.querySelector(".sense-title strong.gw");
  const title = titleElement ? titleElement.textContent.trim() : "";
  if (title) console.error(`   - Title: ${title}`);

  // Extract CEFR level
  const levelElement = block.querySelector(".epp-xref.dxref");
  const level = levelElement ? levelElement.textContent.trim() : "";
  if (level) console.error(`   - Level: ${level}`);

  // Extract definition
  const defElement = block.querySelector(".def.ddef_d");
  const definition = defElement ? defElement.textContent.trim() : "";
  console.error(`   - Definition: ${definition}`);

  // Extract translation(s) - look in both def-body and trans-block
  const defBlock = block.querySelector(".def-block.ddef_block");
  let transElements = [];

  if (defBlock) {
    // First try to find translations in .def-body (for titled senses)
    transElements = defBlock.querySelectorAll(
      ".def-body > .trans.dtrans.dtrans-se"
    );

    // If not found, look in .trans-block (for untitled senses)
    if (transElements.length === 0) {
      transElements = defBlock.querySelectorAll(
        ".trans-block.dtrans-block > .trans.dtrans.dtrans-se"
      );
    }
  }

  const translations = Array.from(transElements)
    .map((el) => el.textContent.trim())
    .filter((t) => t);
  const translation = translations.join(", ");
  if (translation) console.error(`   - Translation: ${translation}`);

  // Extract examples
  const examples = [];

  // Main example with translation
  const mainExampleElement = block.querySelector(".examp.dexamp .eg.deg");
  const mainExampleTransElement = block.querySelector(
    ".examp.dexamp .trans.dtrans.dtrans-se.hdb"
  );

  if (mainExampleElement) {
    const exampleText = mainExampleElement.textContent.trim();
    const exampleTrans = mainExampleTransElement
      ? mainExampleTransElement.textContent.trim()
      : "";
    examples.push({ en: exampleText, es: exampleTrans });
    console.error(`   - Main example: ${exampleText}`);
    if (exampleTrans) console.error(`     Trans: ${exampleTrans}`);
  }

  // Additional examples (from accordion)
  const additionalExamples = block.querySelectorAll(".daccord .eg.dexamp.hax");
  additionalExamples.forEach((exEl) => {
    const exText = exEl.textContent.trim();
    examples.push({ en: exText, es: "" });
    console.error(`   - Additional: ${exText}`);
  });

  // Add the sense even if there's no title (for adjectives, etc.)
  if (title || definition) {
    senses.push({
      title,
      level,
      definition,
      translation,
      examples,
    });
  }
});

console.error(`\n✅ Extracted ${senses.length} senses`);

// Extract phrasal verbs
console.error("\n🔗 Extracting phrasal verbs...");

const phrasalVerbsSection = document.querySelector(".xref.phrasal_verbs");
const phrasalVerbs = [];

if (phrasalVerbsSection) {
  const phrasalVerbLinks =
    phrasalVerbsSection.querySelectorAll(".item a .phrase");
  phrasalVerbLinks.forEach((link) => {
    const phrase = link.textContent.trim();
    if (phrase) {
      phrasalVerbs.push(phrase);
    }
  });
  console.error(`   Found ${phrasalVerbs.length} phrasal verbs`);
} else {
  console.error("   No phrasal verbs found");
}

// Extract idioms
console.error("\n💡 Extracting idioms...");

const idiomsSection = document.querySelector(".xref.idioms");
const idioms = [];

if (idiomsSection) {
  const idiomLinks = idiomsSection.querySelectorAll(".item a .phrase");
  idiomLinks.forEach((link) => {
    const phrase = link.textContent.trim();
    if (phrase) {
      idioms.push(phrase);
    }
  });
  console.error(`   Found ${idioms.length} idioms`);
} else {
  console.error("   No idioms found");
}

// Output JSON
const result = {
  wordInfo,
  pronunciations,
  senses,
  phrasalVerbs,
  idioms,
};

console.error("\n📋 Results:");
console.log(JSON.stringify(result, null, 2));
