import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

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
const readProjectFile = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
const normalize = (source) => source.replace(/\r\n?/g, "\n").trim();
const removeEmbeddingIndent = (source) => source.replace(/^ {6}/gm, "");

test("配布用index.htmlは外部JavaScriptやCSSに依存しない", async () => {
  const html = await readProjectFile("index.html");
  const inlineStructure = html.match(
    /<style\s+id=["']my-polyphony-structure["']>([\s\S]*?)<\/style>/i,
  );
  const inlineDecoration = html.match(
    /<style\s+id=["']my-polyphony-styles["']>([\s\S]*?)<\/style>/i,
  );
  const inlineApp = html.match(
    /<script\s+id=["']my-polyphony-app["']>([\s\S]*?)<\/script>/i,
  );

  assert.equal([...html.matchAll(/<script\b[^>]*\bsrc\s*=/gi)].length, 0);
  assert.equal(
    [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi)].length,
    0,
  );
  assert.ok(inlineStructure, "埋め込み構造CSSが見つかりません。");
  assert.ok(inlineDecoration, "埋め込み装飾CSSが見つかりません。");
  assert.ok(inlineApp, "埋め込みJavaScriptが見つかりません。");
  assert.doesNotThrow(() => new vm.Script(inlineApp[1], { filename: "index.html:inline" }));
});

test("配布用index.htmlをdev.htmlと編集元へ同期している", async () => {
  const [html, structure, decoration, ...scripts] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("structure.css"),
    readProjectFile("styles.css"),
    ...scriptFiles.map(readProjectFile),
  ]);
  const inlineStructure = html.match(
    /<style\s+id=["']my-polyphony-structure["']>([\s\S]*?)<\/style>/i,
  );
  const inlineDecoration = html.match(
    /<style\s+id=["']my-polyphony-styles["']>([\s\S]*?)<\/style>/i,
  );
  const inlineApp = html.match(
    /<script\s+id=["']my-polyphony-app["']>([\s\S]*?)<\/script>/i,
  );

  assert.ok(inlineStructure);
  assert.ok(inlineDecoration);
  assert.ok(inlineApp);
  assert.equal(normalize(removeEmbeddingIndent(inlineStructure[1])), normalize(structure));
  assert.equal(normalize(removeEmbeddingIndent(inlineDecoration[1])), normalize(decoration));
  assert.equal(
    normalize(removeEmbeddingIndent(inlineApp[1])),
    normalize(scripts.map((source) => source.trim()).join("\n\n")),
  );
});

test("配布生成は日常検査から分離された明示的なコマンドである", async () => {
  const [packageSource, buildSource] = await Promise.all([
    readProjectFile("package.json"),
    readProjectFile("scripts/build-standalone.mjs"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.equal(packageJson.scripts.build, undefined);
  assert.equal(packageJson.scripts["build:release"], "node scripts/build-standalone.mjs");
  assert.equal(packageJson.scripts.test, "npm run test:functional");
  assert.match(packageJson.scripts["check:release"], /--check/);
  assert.doesNotMatch(packageJson.scripts.check, /build-standalone\.mjs --check/);
  assert.match(buildSource, /dev\.html/);
  assert.match(buildSource, /structure\.css/);
  assert.match(buildSource, /styles\.css/);
});
