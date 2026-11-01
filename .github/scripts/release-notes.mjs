#!/usr/bin/env node
/**
 * Write the exact CHANGELOG.md section for a version tag to standard output.
 *
 * Usage: node .github/scripts/release-notes.mjs v1.2.3 [output-file]
 */

import { readFileSync, writeFileSync } from "node:fs";

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function changelogSection(markdown, version) {
  const escapedVersion = escapeRegex(version);
  const heading = new RegExp(
    `^##\\s+(?:\\[${escapedVersion}\\]|${escapedVersion})(?:\\s+-.*)?\\r?$`,
    "mu",
  );
  const match = heading.exec(markdown);
  if (!match || match.index === undefined) return null;

  const afterHeading = match.index + match[0].length;
  const nextHeading = /^##\s/mu.exec(markdown.slice(afterHeading));
  const end = nextHeading?.index === undefined ? markdown.length : afterHeading + nextHeading.index;
  return markdown.slice(match.index, end);
}

function main() {
  const tag = process.argv[2];
  if (!tag) {
    console.error("Usage: node .github/scripts/release-notes.mjs v<version> [output-file]");
    process.exit(1);
  }

  const version = tag.replace(/^v/u, "");
  const section = changelogSection(readFileSync("CHANGELOG.md", "utf8"), version);
  if (!section) {
    console.error(`::error::No CHANGELOG.md section found for ${tag}`);
    process.exit(1);
  }

  const outputFile = process.argv[3];
  if (outputFile) {
    writeFileSync(outputFile, section, "utf8");
  } else {
    process.stdout.write(section);
  }
}

main();
