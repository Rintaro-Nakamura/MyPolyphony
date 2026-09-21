import test from "node:test";
import assert from "node:assert/strict";

import "../viewport.js";

const {
  CHAT_MOBILE_VIEWPORT_POLICY,
  DESKTOP_CARET_VIEWPORT_POLICY,
  FOLLOW_INPUT_VIEWPORT_POLICY,
  STATIC_DESKTOP_VIEWPORT_POLICY,
  applyAfterCommitScroll,
  calculateCaretRevealDelta,
  calculateRevealDelta,
  focusDraftInput,
  isAtViewportBottom,
  revealCaretLine,
} = globalThis.MyPolyphonyViewport;

test("入力位置が表示範囲を越えた分だけスクロール量を求める", () => {
  assert.equal(calculateRevealDelta(700, 800, 32), 0);
  assert.equal(calculateRevealDelta(790, 800, 32), 22);
  assert.equal(calculateRevealDelta(860, 800, 32), 92);
});

test("入力欄が画面下端の基準位置にあるかを判定する", () => {
  assert.equal(isAtViewportBottom({
    targetBottom: 666,
    viewportBottom: 720,
    bottomInset: 32,
  }), false);
  assert.equal(isAtViewportBottom({
    targetBottom: 687.75,
    viewportBottom: 720,
    bottomInset: 32,
  }), true);
  assert.equal(isAtViewportBottom({
    targetBottom: 1106,
    viewportBottom: 720,
    bottomInset: 32,
  }), false);
});

test("キャレット行が表示領域を越えた方向へ必要な分だけ追従する", () => {
  const viewport = {
    viewportTop: 80,
    viewportBottom: 800,
    topInset: 16,
    bottomInset: 32,
  };

  assert.equal(calculateCaretRevealDelta({
    ...viewport,
    caretTop: 120,
    caretBottom: 148,
  }), 0);
  assert.equal(calculateCaretRevealDelta({
    ...viewport,
    caretTop: 70,
    caretBottom: 98,
  }), -26);
  assert.equal(calculateCaretRevealDelta({
    ...viewport,
    caretTop: 760,
    caretBottom: 792,
  }), 24);
});

test("キャレット行の追従は画面内では静止し、画面外では最小限スクロールする", () => {
  const calls = [];
  const windowObject = {
    innerHeight: 800,
    scrollBy(options) {
      calls.push(options);
    },
  };

  assert.equal(revealCaretLine({
    caretRect: { top: 140, bottom: 164 },
    policy: DESKTOP_CARET_VIEWPORT_POLICY,
    viewportTop: 80,
    windowObject,
  }), 0);
  assert.equal(revealCaretLine({
    caretRect: { top: 62, bottom: 86 },
    policy: DESKTOP_CARET_VIEWPORT_POLICY,
    viewportTop: 80,
    windowObject,
  }), -34);
  assert.deepEqual(calls, [{ top: -34, behavior: "auto" }]);
});

test("静的なPC表示では確定後の画面位置を変更しない", () => {
  const windowObject = {
    innerHeight: 800,
    scrollBy() {
      throw new Error("スクロールは呼ばれません。");
    },
  };

  assert.equal(
    applyAfterCommitScroll({
      policy: STATIC_DESKTOP_VIEWPORT_POLICY,
      windowObject,
    }),
    0,
  );
});

test("チャット表示は確定後に会話領域の末尾へ移動する", () => {
  const feed = { scrollTop: 120, scrollHeight: 840 };

  assert.equal(
    applyAfterCommitScroll({
      policy: CHAT_MOBILE_VIEWPORT_POLICY,
      feed,
    }),
    720,
  );
  assert.equal(feed.scrollTop, 840);
});

test("入力追従方針は入力欄全体が下端を越えた分だけページを送る", () => {
  const calls = [];
  const windowObject = {
    innerHeight: 800,
    scrollBy(options) {
      calls.push(options);
    },
  };
  const input = {
    getBoundingClientRect() {
      return { bottom: 850 };
    },
  };

  assert.equal(
    applyAfterCommitScroll({
      policy: FOLLOW_INPUT_VIEWPORT_POLICY,
      input,
      windowObject,
    }),
    82,
  );
  assert.deepEqual(calls, [{ top: 82, behavior: "auto" }]);
});

test("入力欄へのフォーカスは方針に従い、末尾へキャレットを置く", () => {
  const calls = [];
  const input = {
    value: "入力途中",
    focus(options) {
      calls.push(["focus", options]);
    },
    setSelectionRange(start, end) {
      calls.push(["selection", start, end]);
    },
  };

  focusDraftInput(input, STATIC_DESKTOP_VIEWPORT_POLICY);
  assert.deepEqual(calls, [
    ["focus", { preventScroll: true }],
    ["selection", 4, 4],
  ]);
});
