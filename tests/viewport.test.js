import test from "node:test";
import assert from "node:assert/strict";

import "../viewport.js";

const {
  CHAT_MOBILE_VIEWPORT_POLICY,
  FOLLOW_INPUT_VIEWPORT_POLICY,
  STATIC_DESKTOP_VIEWPORT_POLICY,
  applyAfterCommitScroll,
  calculateRevealDelta,
  focusDraftInput,
} = globalThis.MyPolyphonyViewport;

test("入力位置が表示範囲を越えた分だけスクロール量を求める", () => {
  assert.equal(calculateRevealDelta(700, 800, 32), 0);
  assert.equal(calculateRevealDelta(790, 800, 32), 22);
  assert.equal(calculateRevealDelta(860, 800, 32), 92);
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

test("入力追従方針は入力位置が下端を越えた分だけページを送る", () => {
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
