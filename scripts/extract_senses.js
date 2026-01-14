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

// Find all dictionary sections
const dictionarySections = [];
const caldesDiv = document.querySelector('div[data-id="caldes"]');
const englishSpanishDiv = document.querySelector(
  'div[data-id="english-spanish"]'
);
const globalDiv = document.querySelector('div[data-id="K-EN-ES-GLOBAL"]');

if (caldesDiv) {
  dictionarySections.push({
    id: "caldes",
    name: "English-Spanish (CALD)",
    div: caldesDiv,
  });
  console.error("✅ Found section: English-Spanish (CALD)");
}

if (englishSpanishDiv) {
  dictionarySections.push({
    id: "english-spanish",
    name: "English-Spanish",
    div: englishSpanishDiv,
  });
  console.error("✅ Found section: English-Spanish");
}

if (globalDiv) {
  dictionarySections.push({
    id: "K-EN-ES-GLOBAL",
    name: "English-Spanish (Global)",
    div: globalDiv,
  });
  console.error("✅ Found section: English-Spanish (Global)");
}

if (dictionarySections.length === 0) {
  console.error("❌ Error: Could not find any dictionary sections");
  process.exit(1);
}

console.error(
  `\n📚 Processing ${dictionarySections.length} dictionary section(s)...\n`
);

// Extract word information from the first available section
console.error("📖 Extracting word information...");

const wordInfo = {
  word: "",
  partOfSpeech: "",
  wordForms: "",
};

// Try to extract from the first section
const firstSection = dictionarySections[0].div;
const wordElement = firstSection.querySelector(".di-title, .h2.tw-bw.dhw");
wordInfo.word = wordElement ? wordElement.textContent.trim() : "";
if (wordInfo.word) console.error(`   Word: ${wordInfo.word}`);

// Extract part of speech
const posElement = firstSection.querySelector(".pos.dpos");
wordInfo.partOfSpeech = posElement ? posElement.textContent.trim() : "";
if (wordInfo.partOfSpeech)
  console.error(`   Part of speech: ${wordInfo.partOfSpeech}`);

// Extract word forms (e.g., "running | past ran | past participle run")
const wordFormsElement = firstSection.querySelector(
  ".irreg-infls, .rreg-infls"
);
if (wordFormsElement) {
  wordInfo.wordForms = wordFormsElement.textContent.trim();
  console.error(`   Word forms: ${wordInfo.wordForms}`);
}

// Extract pronunciations from first section
console.error("\n📝 Extracting pronunciation information...");

const pronunciations = [];

// UK pronunciation
const ukPronContainer = firstSection.querySelector(".uk.dloc");
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
const usPronContainer = firstSection.querySelector(".us.dloc");
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

// Process each dictionary section
const sections = [];

for (const section of dictionarySections) {
  console.error(`\n📚 Extracting from ${section.name}...`);

  const senseBlocks = section.div.querySelectorAll(
    ".sense-block.pr.dsense, .sense-block.pr.dsense-noh"
  );
  const senses = [];

  senseBlocks.forEach((block, index) => {
    // Check if this sense-block has multiple def-blocks (multiple definitions in one sense)
    const defBlocks = block.querySelectorAll(".def-block.ddef_block");

    if (defBlocks.length > 1) {
      // Structure: One sense-block with multiple def-blocks (e.g., "sear")
      console.error(
        `   Sense block ${index + 1} has ${defBlocks.length} definitions:`
      );

      // Extract grammar info once for all definitions (it's at the sense-block level)
      const grammarElement = block.querySelector(".gram.dgram");
      const grammar = grammarElement
        ? grammarElement.textContent.trim().replace(/[\[\]]/g, "")
        : "";
      if (grammar) console.error(`   - Grammar: ${grammar}`);

      defBlocks.forEach((defBlock, defIndex) => {
        console.error(`   Definition ${defIndex + 1}:`);

        // Extract definition
        const defElement = defBlock.querySelector(".def.ddef_d");
        const definition = defElement ? defElement.textContent.trim() : "";
        if (definition) console.error(`   - Definition: ${definition}`);

        // Extract translation(s)
        let transElements = defBlock.querySelectorAll(
          ".def-body > .trans.dtrans.dtrans-se"
        );

        if (transElements.length === 0) {
          transElements = defBlock.querySelectorAll(
            ".trans-block.dtrans-block > .trans.dtrans.dtrans-se"
          );
        }

        const translations = Array.from(transElements)
          .map((el) => el.textContent.trim())
          .filter((t) => t);
        const translation = translations.join(", ");
        if (translation) console.error(`   - Translation: ${translation}`);

        // Extract examples from this def-block
        const examples = [];
        const seenExamples = new Set();

        const allExamples = defBlock.querySelectorAll(".examp.dexamp");
        allExamples.forEach((exampBlock) => {
          const exampleEn = exampBlock.querySelector(".eg.deg");
          const exampleEs = exampBlock.querySelector(
            ".trans.dtrans.dtrans-se.hdb"
          );

          if (exampleEn) {
            const enText = exampleEn.textContent.trim();
            const esText = exampleEs ? exampleEs.textContent.trim() : "";

            if (!seenExamples.has(enText)) {
              seenExamples.add(enText);
              examples.push({ en: enText, es: esText });
              console.error(`   - Example: ${enText}`);
              if (esText) console.error(`     Trans: ${esText}`);
            }
          }
        });

        // Add this definition as a separate sense
        if (definition) {
          senses.push({
            title: "",
            phraseHead: "",
            level: "",
            grammar,
            definition,
            translation,
            examples,
          });
        }
      });
    } else {
      // Original structure: One sense-block with one definition
      console.error(`   Sense ${index + 1}:`);

      // Extract sense title (may not exist for dsense-noh blocks)
      const titleElement = block.querySelector(".sense-title strong.gw");
      const title = titleElement ? titleElement.textContent.trim() : "";
      if (title) console.error(`   - Title: ${title}`);

      // Extract phrase-head for phrase-blocks (used in Global section)
      const phraseHeadElement = block.querySelector(
        ".phrase-head .phrase.dphrase"
      );
      const phraseHead = phraseHeadElement
        ? phraseHeadElement.textContent.trim()
        : "";
      if (phraseHead) console.error(`   - Phrase: ${phraseHead}`);

      // Extract CEFR level
      const levelElement = block.querySelector(".epp-xref.dxref");
      const level = levelElement ? levelElement.textContent.trim() : "";
      if (level) console.error(`   - Level: ${level}`);

      // Extract grammar info
      const grammarElement = block.querySelector(".gram.dgram");
      const grammar = grammarElement
        ? grammarElement.textContent.trim().replace(/[\[\]]/g, "")
        : "";
      if (grammar) console.error(`   - Grammar: ${grammar}`);

      // Extract definition
      const defElement = block.querySelector(".def.ddef_d");
      const definition = defElement ? defElement.textContent.trim() : "";
      if (definition) console.error(`   - Definition: ${definition}`);

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
      const seenExamples = new Set();

      // Look for all example blocks
      const allExamples = block.querySelectorAll(".examp.dexamp");
      allExamples.forEach((exampBlock) => {
        const exampleEn = exampBlock.querySelector(".eg.deg");
        const exampleEs = exampBlock.querySelector(
          ".trans.dtrans.dtrans-se.hdb"
        );

        if (exampleEn) {
          const enText = exampleEn.textContent.trim();
          const esText = exampleEs ? exampleEs.textContent.trim() : "";

          // Check if we already have this example
          if (!seenExamples.has(enText)) {
            seenExamples.add(enText);
            examples.push({ en: enText, es: esText });
            console.error(`   - Example: ${enText}`);
            if (esText) console.error(`     Trans: ${esText}`);
          }
        }
      });

      // Additional examples (from accordion)
      const additionalExamples = block.querySelectorAll(
        ".daccord .eg.dexamp.hax"
      );
      additionalExamples.forEach((exEl) => {
        const exText = exEl.textContent.trim();
        if (!seenExamples.has(exText)) {
          seenExamples.add(exText);
          examples.push({ en: exText, es: "" });
          console.error(`   - Additional: ${exText}`);
        }
      });

      // Add the sense even if there's no title (for adjectives, etc.)
      if (title || definition || phraseHead) {
        senses.push({
          title,
          phraseHead,
          level,
          grammar,
          definition,
          translation,
          examples,
        });
      }
    }
  });

  console.error(`   ✅ Extracted ${senses.length} senses`);

  // Extract phrasal verbs
  const phrasalVerbsSection = section.div.querySelector(".xref.phrasal_verbs");
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
    if (phrasalVerbs.length > 0) {
      console.error(`   Found ${phrasalVerbs.length} phrasal verbs`);
    }
  }

  // Extract idioms
  const idiomsSection = section.div.querySelector(".xref.idioms");
  const idioms = [];

  if (idiomsSection) {
    const idiomLinks = idiomsSection.querySelectorAll(".item a .phrase");
    idiomLinks.forEach((link) => {
      const phrase = link.textContent.trim();
      if (phrase) {
        idioms.push(phrase);
      }
    });
    if (idioms.length > 0) {
      console.error(`   Found ${idioms.length} idioms`);
    }
  }

  sections.push({
    id: section.id,
    name: section.name,
    senses,
    phrasalVerbs,
    idioms,
  });
}

// Output JSON
const result = {
  wordInfo,
  pronunciations,
  sections,
};

console.error("\n📋 Results:");
console.log(JSON.stringify(result, null, 2));
