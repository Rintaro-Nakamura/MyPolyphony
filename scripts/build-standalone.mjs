import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const developmentPath = path.join(projectRoot, "dev.html");
const distributionPath = path.join(projectRoot, "index.html");
const checkOnly = process.argv.includes("--check");

const scriptFiles = [
  "model.js",
  "preferences.js",
  "storage.js",
  "view.js",
  "interaction.js",
  "editors.js",
  "caret-navigation.js",
  "viewport.js",
  "app.js",
];

const normalizeLineEndings = (source) => source.replace(/\r\n?/g, "\n");
const escapeRegExp = (source) => source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function indentForEmbedding(source, indentation, lineEnding) {
  return normalizeLineEndings(source)
    .trim()
    .split("\n")
    .map((line) => (line.length === 0 ? "" : `${indentation}${line}`))
    .join(lineEnding);
}

function embedStylesheet(html, { href, id, source, lineEnding }) {
  const pattern = new RegExp(
    `<link\\s+rel=["']stylesheet["']\\s+href=["']${escapeRegExp(href)}["'][^>]*\\/?>`,
    "i",
  );
  const match = html.match(pattern);

  if (!match) {
    throw new Error(`dev.html に ${href} の読み込み指定が見つかりません。`);
  }

  const tagLineStart = html.lastIndexOf(lineEnding, match.index) + lineEnding.length;
  const tagIndentation = html.slice(tagLineStart, match.index);
  const contentIndentation = `${tagIndentation}  `;
  const embedded = indentForEmbedding(source, contentIndentation, lineEnding);

  const replacement =
    `<style id="${id}">${lineEnding}${embedded}${lineEnding}${tagIndentation}</style>`;
  return html.replace(pattern, () => replacement);
}

function embedScripts(html, { sources, lineEnding }) {
  const pattern = /<!-- my-polyphony-scripts:start -->[\s\S]*?<!-- my-polyphony-scripts:end -->/i;
  const match = html.match(pattern);

  if (!match) {
    throw new Error("dev.html にJavaScript埋め込み範囲が見つかりません。");
  }

  const tagLineStart = html.lastIndexOf(lineEnding, match.index) + lineEnding.length;
  const tagIndentation = html.slice(tagLineStart, match.index);
  const contentIndentation = `${tagIndentation}  `;
  const source = sources.map((item) => item.trim()).join("\n\n");
  const embedded = indentForEmbedding(source, contentIndentation, lineEnding);

  const replacement =
    `<script id="my-polyphony-app">${lineEnding}${embedded}${lineEnding}${tagIndentation}</script>`;
  return html.replace(pattern, () => replacement);
}

function markChatModeAsComingSoon(html, lineEnding) {
  const pattern = /<!-- my-polyphony-chat-mode:start -->[\s\S]*?<!-- my-polyphony-chat-mode:end -->/i;
  const match = html.match(pattern);

  if (!match) {
    throw new Error("dev.html にチャットモードの配布時置換範囲が見つかりません。");
  }

  const tagLineStart = html.lastIndexOf(lineEnding, match.index) + lineEnding.length;
  const indentation = html.slice(tagLineStart, match.index);
  const replacement = [
    '<span class="mode-option mode-option--unavailable">',
    '  <button',
    '    class="mode-button"',
    '    type="button"',
    '    data-mode="mobile"',
    '    aria-pressed="false"',
    '    aria-disabled="true"',
    '    aria-describedby="chatComingSoon"',
    '  >',
    '    チャット',
    '  </button>',
    '  <span id="chatComingSoon" class="mode-option__tooltip" role="tooltip">近日公開予定</span>',
    '</span>',
  ].map((line, index) => index === 0 ? line : `${indentation}${line}`).join(lineEnding);

  return html.replace(pattern, () => replacement);
}

async function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function generateDistributionHtml() {
  const [developmentHtml, structure, decoration, ...scripts] = await Promise.all([
    readFile(developmentPath, "utf8"),
    readProjectFile("structure.css"),
    readProjectFile("styles.css"),
    ...scriptFiles.map(readProjectFile),
  ]);
  const lineEnding = "\n";
  const normalizedDevelopmentHtml = normalizeLineEndings(developmentHtml);

  let generatedHtml = markChatModeAsComingSoon(normalizedDevelopmentHtml, lineEnding);
  generatedHtml = embedStylesheet(generatedHtml, {
    href: "./structure.css",
    id: "my-polyphony-structure",
    source: structure,
    lineEnding,
  });
  generatedHtml = embedStylesheet(generatedHtml, {
    href: "./styles.css",
    id: "my-polyphony-styles",
    source: decoration,
    lineEnding,
  });
  return embedScripts(generatedHtml, { sources: scripts, lineEnding });
}

async function buildStandalone() {
  const generatedHtml = await generateDistributionHtml();
  const currentHtml = await readFile(distributionPath, "utf8").catch(() => "");

  if (generatedHtml === currentHtml) {
    console.log("index.html は開発元と同期しています。");
    return;
  }

  if (checkOnly) {
    console.error(
      "配布用 index.html が開発元と同期していません。配布時に `npm run build:release` を実行してください。",
    );
    process.exitCode = 1;
    return;
  }

  await writeFile(distributionPath, generatedHtml, "utf8");
  console.log("dev.html、二つのCSS層、JavaScript編集元から配布用 index.html を生成しました。");
}

await buildStandalone();
