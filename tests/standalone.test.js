import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("index.htmlは外部JavaScriptやCSSに依存しない", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=/gi)];
  const externalStyles = [
    ...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi),
  ];
  const inlineApp = html.match(
    /<script\s+id=["']my-polyphony-app["']>([\s\S]*?)<\/script>/i,
  );
  const inlineStyles = html.match(
    /<style\s+id=["']my-polyphony-styles["']>([\s\S]*?)<\/style>/i,
  );

  assert.equal(externalScripts.length, 0);
  assert.equal(externalStyles.length, 0);
  assert.ok(inlineApp, "埋め込みJavaScriptが見つかりません。");
  assert.ok(inlineStyles, "埋め込みCSSが見つかりません。");
  assert.doesNotThrow(() => new vm.Script(inlineApp[1], { filename: "index.html:inline" }));
});

test("空の保存状態と新規開始では開始日時を更新する", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /state = refreshStartedAtIfEmpty\(restored\)/);
  assert.match(html, /if \(state !== restored\) \{\s*persistNow\(\);/);
  assert.doesNotMatch(
    html,
    /function resetDialogue\(\) \{[\s\S]*?if \(!hasWork\) \{\s*focusComposer\(\);\s*return;/,
  );
  assert.match(
    html,
    /function resetDialogue\(\) \{[\s\S]*?hasWork &&[\s\S]*?state = createInitialState\(\);/,
  );
});

test("開始の鍵括弧を残し、紹介を本文の後へ移している", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const desktopView = html.indexOf('id="desktopView"');
  const composer = html.indexOf('id="desktopComposer"');
  const intro = html.indexOf('class="intro"');
  const footer = html.indexOf('class="page-footer"');

  assert.ok(desktopView >= 0 && composer > desktopView);
  assert.ok(intro > composer && footer > intro);
  assert.equal(html.includes("思考の下書き"), false);
  assert.equal(html.includes('id="desktopEmpty"'), true);
  assert.equal(html.includes("自分の「声」との対話を始めましょう。"), true);
});

test("次の話者表示を送信ではない切替ボタンとして備えている", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(
    html,
    /<button\s+id="desktopRoleLabel"[\s\S]*?type="button"[\s\S]*?>次は 自分<\/button>/,
  );
  assert.match(
    html,
    /<button\s+id="mobileRoleLabel"[\s\S]*?type="button"[\s\S]*?>次は自分<\/button>/,
  );
});

test("設定に対話篇の入出力と書体選択をまとめている", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const settingsStart = html.indexOf('id="settingsMenu"');
  const settingsEnd = html.indexOf("</details>", settingsStart);
  const settings = html.slice(settingsStart, settingsEnd);

  assert.ok(settingsStart >= 0 && settingsEnd > settingsStart);
  assert.match(settings, /<summary class="tool-button">設定<\/summary>/);
  assert.match(settings, /id="importButton"/);
  assert.match(settings, /id="exportJsonButton"/);
  assert.match(settings, /id="exportTextButton"/);
  assert.match(settings, /id="fontSelect"/);
  assert.ok(settings.indexOf('id="importButton"') < settings.indexOf('id="fontSelect"'));
  assert.match(settings, /<option value="mincho">明朝（現在の書体）<\/option>/);
  assert.match(settings, /<option value="gothic">ゴシック<\/option>/);
  assert.match(settings, /<option value="noto-sans">Noto Sans JP 優先<\/option>/);
  assert.doesNotMatch(html, /id="exportMenu"|class="export-menu/);
});

test("書体設定を対話データと分けて端末内へ保存する", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /const FONT_STORAGE_KEY = "my-polyphony:v1:font"/);
  assert.match(html, /const DEFAULT_FONT_PREFERENCE = "mincho"/);
  assert.match(html, /Object\.hasOwn\(FONT_PREFERENCE_LABELS, value\)/);
  assert.match(html, /localStorage\.getItem\(FONT_STORAGE_KEY\)/);
  assert.match(html, /localStorage\.setItem\(FONT_STORAGE_KEY, fontPreference\)/);
  assert.match(html, /document\.documentElement\.dataset\.dialogueFont = fontPreference/);
  assert.match(html, /:root\[data-dialogue-font="gothic"\]/);
  assert.match(html, /:root\[data-dialogue-font="noto-sans"\]/);
  assert.match(html, /\.mobile-composer textarea[\s\S]*?font-family:\s*var\(--font-dialogue\)/);
  assert.doesNotMatch(html, /@font-face|fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test("Ctrl + Alt + Mで次の話者を切り替えられる", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.doesNotMatch(html, /<kbd>Ctrl<\/kbd>＋<kbd>Alt<\/kbd>＋<kbd>M<\/kbd>/);
  assert.match(html, /function handleRoleShortcut\(event\)/);
  assert.match(html, /event\.ctrlKey &&\s*event\.altKey/);
  assert.match(html, /event\.key\?\.toLowerCase\(\) === "m"/);
  assert.match(html, /event\.repeat \|\|\s*event\.isComposing/);
  assert.match(html, /elements\.editDialog\.open/);
  assert.match(html, /document\.addEventListener\("keydown", handleRoleShortcut\)/);
});

test("文書上部に対話の開始日時を示す罫線付きヘッダーがある", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const paper = html.indexOf('class="paper"');
  const noteHeader = html.indexOf('class="dialogue-note-header"', paper);
  const messages = html.indexOf('id="desktopMessages"', paper);

  assert.ok(paper >= 0 && noteHeader > paper && messages > noteHeader);
  assert.match(html, /<time id="dialogueStartedAt"><\/time>/);
  assert.match(html, /\.dialogue-note-header[\s\S]*?border-bottom:\s*1px solid/);
  assert.match(html, /\.dialogue-note-header[\s\S]*?justify-content:\s*flex-end/);
  assert.match(html, /\.dialogue-note-header[\s\S]*?color:\s*#8b887f/);
  assert.match(html, /\.dialogue-note-header time[\s\S]*?translateX\(34px\)/);
  assert.match(html, /\.dialogue-note-header[\s\S]*?height:\s*68px/);
  assert.match(html, /\.paper[\s\S]*?padding:\s*0 var\(--paper-gutter\)/);
  assert.equal(html.includes("対話のはじまり"), false);
});

test("スマホ表示だけに全画面の開始・解除機能を備えている", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(
    html,
    /<button\s+id="mobileFullscreenButton"[\s\S]*?aria-label="チャットを全画面で開く"[\s\S]*?aria-pressed="false"/,
  );
  assert.match(html, /\.phone-header__fullscreen\s*\{[\s\S]*?display:\s*none;/);
  assert.match(
    html,
    /@media \(max-width: 767px\)[\s\S]*?\.phone-header__fullscreen\s*\{[\s\S]*?display:\s*grid;/,
  );
  assert.match(
    html,
    /html\.mobile-immersive \.phone-frame\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?border:\s*0;/,
  );
  assert.match(html, /requestFullscreen\.call\(document\.documentElement\)/);
  assert.match(html, /await document\.exitFullscreen\(\)/);
  assert.match(html, /document\.addEventListener\("fullscreenchange", handleFullscreenChange\)/);
  assert.match(html, /setImmersiveMode\("fallback"\)/);
});

test("仕様の具体例を内蔵JSONから既存UIへ読み込める", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const exampleScript = html.match(
    /<script id="toolSpecificationExample" type="application\/json">([\s\S]*?)<\/script>/,
  );

  assert.ok(exampleScript, "仕様の具体例JSONが見つかりません。");
  const example = JSON.parse(exampleScript[1]);
  assert.equal(example.format, "my-polyphony-dialogue");
  assert.equal(example.version, 1);
  assert.equal(example.messages.length, 54);
  assert.match(
    html,
    /<button id="loadExampleButton"[\s\S]*?>\s*制作者の具体例を見る\s*<\/button>/,
  );
  assert.match(html, /loadDialogueSource\(elements\.toolSpecificationExample\.textContent/);
  assert.match(
    html,
    /elements\.loadExampleButton\.addEventListener\("click", loadToolSpecificationExample\)/,
  );
  assert.doesNotMatch(exampleScript[1], /，|．/);
  assert.doesNotMatch(html, /dialogue-example__details|example-utterance/);
});

test("単一HTMLの埋め込みCSSとJavaScriptを開発用ファイルに同期している", async () => {
  const [html, styles, model, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
    readFile(new URL("../model.js", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
  ]);
  const inlineStyles = html.match(
    /<style\s+id=["']my-polyphony-styles["']>([\s\S]*?)<\/style>/i,
  );
  const inlineApp = html.match(
    /<script\s+id=["']my-polyphony-app["']>([\s\S]*?)<\/script>/i,
  );
  const normalize = (source) => source.replace(/\r\n?/g, "\n").trim();
  const removeEmbeddingIndent = (source) => source.replace(/^ {6}/gm, "");

  assert.ok(inlineStyles);
  assert.ok(inlineApp);
  assert.equal(normalize(removeEmbeddingIndent(inlineStyles[1])), normalize(styles));
  assert.equal(
    normalize(removeEmbeddingIndent(inlineApp[1])),
    normalize(`${model.trimEnd()}\n\n${app.trimStart()}`),
  );
});
