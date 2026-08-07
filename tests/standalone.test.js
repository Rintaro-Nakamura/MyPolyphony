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
  assert.equal(html.includes("ここから、もう一人の自分との対話を始めましょう。"), true);
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
