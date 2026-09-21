import test from "node:test";
import assert from "node:assert/strict";

import "../view.js";

const {
  createDesktopMessage,
  formatDialogueStartedAt,
  renderDesktopComposer,
  renderMobileComposer,
  roleLabel,
} = globalThis.MyPolyphonyView;

function fakeDocument() {
  const createElement = (tagName) => ({
    tagName,
    className: "",
    dataset: {},
    attributes: {},
    children: [],
    append(...children) {
      this.children.push(...children);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  });

  return {
    createElement,
    createTextNode(textContent) {
      return { nodeType: 3, textContent };
    },
  };
}

test("表示層は話者の内部値を画面上の名称へ変換する", () => {
  assert.equal(roleLabel("self"), "自分");
  assert.equal(roleLabel("other"), "相手");
});

test("表示層は対話開始日時を日本語の見出しへ整形する", () => {
  const value = new Date(2026, 7, 29, 9, 5).toISOString();
  assert.equal(formatDialogueStartedAt(value), "8 月 29 日（土）　9 時 05 分");
});

function roleButton() {
  return {
    textContent: "",
    title: "",
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

test("文書表示とチャット表示はそれぞれの話者表示を描画する", () => {
  const desktopComposer = { dataset: {} };
  const desktopRoleButton = roleButton();
  renderDesktopComposer(
    { composer: desktopComposer, roleButton: desktopRoleButton },
    "other",
  );

  assert.equal(desktopComposer.dataset.role, "other");
  assert.equal(desktopRoleButton.textContent, "次は 相手");
  assert.match(desktopRoleButton.attributes["aria-label"], /クリックすると自分/);

  const mobileComposer = { dataset: {} };
  const mobileRoleButton = roleButton();
  const mobileDraft = { placeholder: "" };
  renderMobileComposer(
    {
      composer: mobileComposer,
      draftInput: mobileDraft,
      roleButton: mobileRoleButton,
    },
    "self",
  );

  assert.equal(mobileComposer.dataset.role, "self");
  assert.equal(mobileRoleButton.textContent, "次は自分");
  assert.equal(mobileDraft.placeholder, "自分として書く");
});

test("文書の発言本文そのものを編集可能な要素として描画する", () => {
  const article = createDesktopMessage(
    { id: "m1", role: "self", text: "紙面上の言葉" },
    0,
    fakeDocument(),
  );
  const content = article.children[1];
  const editor = content.children[1];

  assert.equal(editor.className, "desktop-message__text");
  assert.equal(editor.dataset.messageId, "m1");
  assert.equal(editor.contentEditable, "plaintext-only");
  assert.equal(editor.textContent, "紙面上の言葉");
  assert.equal(editor.attributes.role, "textbox");
  assert.equal(editor.attributes["aria-describedby"], "desktopHint");
  assert.equal(article.children.length, 2, "編集・削除ボタンは発言に付けない");
});
