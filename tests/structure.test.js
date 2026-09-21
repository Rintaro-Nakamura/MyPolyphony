import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readProjectFile = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("dev.htmlは構造層、装飾層、役割別JavaScriptを開発元として読み込む", async () => {
  const html = await readProjectFile("dev.html");
  const expectedOrder = [
    "./structure.css",
    "./styles.css",
    "./model.js",
    "./preferences.js",
    "./storage.js",
    "./view.js",
    "./interaction.js",
    "./editors.js",
    "./caret-navigation.js",
    "./viewport.js",
    "./app.js",
  ];
  let previousIndex = -1;

  for (const path of expectedOrder) {
    const index = html.indexOf(path);
    assert.ok(index > previousIndex, `${path} の読み込み順が正しくありません。`);
    previousIndex = index;
  }

  assert.doesNotMatch(html, /id=["']my-polyphony-app["']/);
  assert.doesNotMatch(html, /id=["']my-polyphony-styles["']/);
  assert.match(html, /data-layer="structure"/);
  assert.match(html, /data-layer="decoration"/);
});

test("文書表示の主要な操作要素を備えている", async () => {
  const html = await readProjectFile("dev.html");
  const desktopView = html.indexOf('id="desktopView"');
  const composer = html.indexOf('id="desktopComposer"');
  const intro = html.indexOf('class="intro"');

  assert.ok(desktopView >= 0 && composer > desktopView && intro > composer);
  assert.match(html, /id="desktopEmpty"/);
  assert.match(html, /自分の「声」との対話を始めましょう。/);
  assert.match(
    html,
    /<button\s+id="desktopRoleLabel"[\s\S]*?type="button"[\s\S]*?>次は 自分<\/button>/,
  );
  assert.match(
    html,
    /<button\s+id="mobileRoleLabel"[\s\S]*?type="button"[\s\S]*?>次は自分<\/button>/,
  );
  assert.doesNotMatch(html, /<button[^>]*>発言を置く<\/button>/);
});

test("文書表示は下端到達後の移動を発言領域と入力欄へ配分する", async () => {
  const app = await readProjectFile("app.js");
  const css = await readProjectFile("structure.css");

  assert.match(
    app,
    /const desktopViewportPolicy = FOLLOW_INPUT_VIEWPORT_POLICY;/,
  );
  assert.match(
    app,
    /input: viewMode === "mobile" \? elements\.mobileDraft : elements\.desktopComposer/,
  );
  assert.match(app, /const desktopComposerMotionShare = 0\.1;/);
  assert.match(app, /const desktopComposerMinimumBottomInset = 20;/);
  assert.match(
    app,
    /const desktopMessagesPreviousScrollHeight = prepareDesktopMessagesForCommit\(source\);/,
  );
  assert.match(app, /messages\.scrollTop = messages\.scrollHeight/);
  assert.match(
    css,
    /\.desktop-messages--viewport\s*\{[\s\S]*?height:[\s\S]*?overflow-y:\s*auto/,
  );
  assert.doesNotMatch(css, /\.desktop-composer--pinned/);
  assert.doesNotMatch(app, /position:\s*fixed|hasReachedViewportBottom|pinDesktopComposer/);
});

test("設定に対話篇の入出力と書体選択をまとめている", async () => {
  const html = await readProjectFile("dev.html");
  const settingsStart = html.indexOf('id="settingsMenu"');
  const settingsEnd = html.indexOf("</details>", settingsStart);
  const settings = html.slice(settingsStart, settingsEnd);

  assert.ok(settingsStart >= 0 && settingsEnd > settingsStart);
  assert.match(settings, /id="importButton"/);
  assert.match(settings, /id="exportJsonButton"/);
  assert.match(settings, /id="exportTextButton"/);
  assert.match(settings, /id="fontSelect"/);
  assert.ok(settings.indexOf('id="importButton"') < settings.indexOf('id="fontSelect"'));
});

test("ノートの開始日時、発言領域、スマホ全画面操作を配置している", async () => {
  const html = await readProjectFile("dev.html");
  const paper = html.indexOf('class="paper"');
  const noteHeader = html.indexOf('class="dialogue-note-header"', paper);
  const messages = html.indexOf('id="desktopMessages"', paper);

  assert.ok(paper >= 0 && noteHeader > paper && messages > noteHeader);
  assert.match(html, /<time id="dialogueStartedAt"><\/time>/);
  assert.match(
    html,
    /<button\s+id="mobileFullscreenButton"[\s\S]*?aria-label="チャットを全画面で開く"[\s\S]*?aria-pressed="false"/,
  );
  assert.doesNotMatch(html, /id="editDialog"/);
});

test("構造CSSは表示、スクロール、画面幅による配置変更を受け持つ", async () => {
  const css = await readProjectFile("structure.css");

  assert.match(css, /\[hidden\]\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.visually-hidden\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /\.mobile-feed\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.phone-header__fullscreen\s*\{[\s\S]*?display:\s*none/);
  assert.match(
    css,
    /@media \(max-width:\s*767px\)[\s\S]*?\.phone-header__fullscreen\s*\{[\s\S]*?display:\s*grid/,
  );
  assert.match(css, /html\.mobile-immersive \.phone-frame\s*\{[\s\S]*?height:\s*100dvh/);
  assert.match(
    css,
    /\.desktop-message__text:focus\s*\{[\s\S]*?outline:\s*none/,
  );
  assert.match(css, /\.desktop-message__text\s*\{[\s\S]*?display:\s*inline/);
  assert.match(
    css,
    /\.desktop-message__text:empty\s*\{[\s\S]*?display:\s*inline-block[\s\S]*?min-width:\s*1ch/,
  );
});

test("構造CSSは装飾CSSを外しても必要な変数を自給する", async () => {
  const css = await readProjectFile("structure.css");
  const usedVariables = [
    ...new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((match) => match[1])),
  ];
  const undefinedVariables = usedVariables.filter(
    (name) => !new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(css),
  );

  assert.deepEqual(undefinedVariables, []);
});

test("仕様の具体例を開発画面から読み込める", async () => {
  const html = await readProjectFile("dev.html");
  const exampleScript = html.match(
    /<script id="toolSpecificationExample" type="application\/json">([\s\S]*?)<\/script>/,
  );

  assert.ok(exampleScript, "仕様の具体例JSONが見つかりません。");
  const example = JSON.parse(exampleScript[1]);
  assert.equal(example.format, "my-polyphony-dialogue");
  assert.equal(example.version, 1);
  assert.equal(example.messages.length, 54);
  assert.match(html, /id="loadExampleButton"/);
});
