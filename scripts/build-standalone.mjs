import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(projectRoot, "index.html");
const checkOnly = process.argv.includes("--check");

const normalizeLineEndings = (source) => source.replace(/\r\n?/g, "\n");

function indentForEmbedding(source, indentation, lineEnding) {
  return normalizeLineEndings(source)
    .trim()
    .split("\n")
    .map((line) => (line.length === 0 ? "" : `${indentation}${line}`))
    .join(lineEnding);
}

function replaceEmbeddedSource(html, { tagName, id, source, lineEnding }) {
  const pattern = new RegExp(
    `(<${tagName}\\s+id=["']${id}["'][^>]*>)[\\s\\S]*?(</${tagName}>)`,
    "i",
  );
  const match = html.match(pattern);

  if (!match) {
    throw new Error(`index.html に #${id} の埋め込み先が見つかりません。`);
  }

  const tagLineStart = html.lastIndexOf(lineEnding, match.index) + lineEnding.length;
  const tagIndentation = html.slice(tagLineStart, match.index);
  const contentIndentation = `${tagIndentation}  `;
  const embedded = indentForEmbedding(source, contentIndentation, lineEnding);
  return html.replace(
    pattern,
    `${match[1]}${lineEnding}${embedded}${lineEnding}${tagIndentation}${match[2]}`,
  );
}

async function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function buildStandalone() {
  const [currentHtml, styles, ...scripts] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("styles.css"),
    readProjectFile("model.js"),
    readProjectFile("preferences.js"),
    readProjectFile("storage.js"),
    readProjectFile("view.js"),
    readProjectFile("interaction.js"),
    readProjectFile("editors.js"),
    readProjectFile("viewport.js"),
    readProjectFile("app.js"),
  ]);
  const lineEnding = currentHtml.includes("\r\n") ? "\r\n" : "\n";

  let generatedHtml = replaceEmbeddedSource(currentHtml, {
    tagName: "style",
    id: "my-polyphony-styles",
    source: styles,
    lineEnding,
  });
  generatedHtml = replaceEmbeddedSource(generatedHtml, {
    tagName: "script",
    id: "my-polyphony-app",
    source: scripts.map((source) => source.trim()).join("\n\n"),
    lineEnding,
  });

  if (generatedHtml === currentHtml) {
    console.log("index.html は編集元と同期しています。");
    return;
  }

  if (checkOnly) {
    console.error("index.html が編集元と同期していません。`npm run build` を実行してください。");
    process.exitCode = 1;
    return;
  }

  await writeFile(indexPath, generatedHtml, "utf8");
  console.log("styles.css と JavaScript 編集元から index.html を更新しました。");
}

await buildStandalone();
