import * as fs from 'node:fs';

const APP_SCRIPT_TAG_PATTERN = /<script[^>]*\ssrc=(["'])mcp-app\.js\1[^>]*>\s*<\/script>/gi;
const SHARED_THEME_TOKENS_PLACEHOLDER = '/* @shared-theme-tokens */';

function inlineSharedThemeTokens(htmlTemplate, sharedThemeTokens, templatePath) {
  const placeholderSections = htmlTemplate.split(SHARED_THEME_TOKENS_PLACEHOLDER);
  if (placeholderSections.length !== 2) {
    throw new Error(
      `Expected exactly one shared theme placeholder in ${templatePath}, found ${placeholderSections.length - 1}.`,
    );
  }

  return `${placeholderSections[0]}${sharedThemeTokens.trim()}${placeholderSections[1]}`;
}

function inlineAppBundle(htmlTemplate, bundledCode, templatePath) {
  const scriptTagMatches = [...htmlTemplate.matchAll(APP_SCRIPT_TAG_PATTERN)];
  if (scriptTagMatches.length !== 1) {
    throw new Error(
      `Expected exactly one mcp-app.js script placeholder in ${templatePath}, found ${scriptTagMatches.length}.`,
    );
  }

  const safeBundledCode = bundledCode.replace(/<\/script/gi, '<\\/script');
  return htmlTemplate.replace(APP_SCRIPT_TAG_PATTERN, () => `<script>\n${safeBundledCode}</script>`);
}

export function buildAppHtmlTemplate({ templatePath, sharedThemeTokens, bundledCode }) {
  const htmlTemplate = fs.readFileSync(templatePath, 'utf-8');
  const htmlWithSharedTheme = inlineSharedThemeTokens(htmlTemplate, sharedThemeTokens, templatePath);
  return inlineAppBundle(htmlWithSharedTheme, bundledCode, templatePath);
}
