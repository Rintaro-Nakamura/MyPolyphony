import test from "node:test";
import assert from "node:assert/strict";

import "../view.js";

const { formatDialogueStartedAt, roleLabel } = globalThis.MyPolyphonyView;

test("表示層は話者の内部値を画面上の名称へ変換する", () => {
  assert.equal(roleLabel("self"), "自分");
  assert.equal(roleLabel("other"), "相手");
});

test("表示層は対話開始日時を日本語の見出しへ整形する", () => {
  const value = new Date(2026, 7, 29, 9, 5).toISOString();
  assert.equal(formatDialogueStartedAt(value), "8 月 29 日（土）　9 時 05 分");
});
