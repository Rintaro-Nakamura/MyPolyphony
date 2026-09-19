(() => {
const SCROLL_NONE = "none";
const SCROLL_FEED_END = "feed-end";
const SCROLL_REVEAL_INPUT = "reveal-input";

const STATIC_DESKTOP_VIEWPORT_POLICY = Object.freeze({
  afterCommit: SCROLL_NONE,
  focusPreventScroll: true,
  bottomInset: 32,
});

const CHAT_MOBILE_VIEWPORT_POLICY = Object.freeze({
  afterCommit: SCROLL_FEED_END,
  focusPreventScroll: false,
  bottomInset: 16,
});

const FOLLOW_INPUT_VIEWPORT_POLICY = Object.freeze({
  afterCommit: SCROLL_REVEAL_INPUT,
  focusPreventScroll: true,
  bottomInset: 32,
});

function calculateRevealDelta(targetBottom, viewportBottom, bottomInset = 0) {
  for (const value of [targetBottom, viewportBottom, bottomInset]) {
    if (!Number.isFinite(value)) {
      throw new TypeError("スクロール位置の計算値が正しくありません。");
    }
  }

  return Math.max(0, targetBottom + bottomInset - viewportBottom);
}

function applyAfterCommitScroll({
  policy,
  feed = null,
  input = null,
  windowObject = globalThis.window,
}) {
  if (!policy || typeof policy !== "object") {
    throw new TypeError("画面追従の方針が正しくありません。");
  }

  if (policy.afterCommit === SCROLL_NONE) {
    return 0;
  }

  if (policy.afterCommit === SCROLL_FEED_END) {
    if (!feed) {
      throw new TypeError("末尾へ移動する表示領域がありません。");
    }
    const previous = feed.scrollTop;
    feed.scrollTop = feed.scrollHeight;
    return feed.scrollTop - previous;
  }

  if (policy.afterCommit === SCROLL_REVEAL_INPUT) {
    if (!input || !windowObject) {
      throw new TypeError("入力位置を表示するための画面情報がありません。");
    }
    const viewportBottom = windowObject.innerHeight;
    const targetBottom = input.getBoundingClientRect().bottom;
    const delta = calculateRevealDelta(targetBottom, viewportBottom, policy.bottomInset ?? 0);
    if (delta > 0) {
      windowObject.scrollBy({ top: delta, behavior: "auto" });
    }
    return delta;
  }

  throw new TypeError("画面追従の方針が正しくありません。");
}

function focusDraftInput(input, policy) {
  if (!input || !policy || typeof policy !== "object") {
    throw new TypeError("入力欄のフォーカス条件が正しくありません。");
  }

  input.focus({ preventScroll: Boolean(policy.focusPreventScroll) });
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

globalThis.MyPolyphonyViewport = Object.freeze({
  SCROLL_NONE,
  SCROLL_FEED_END,
  SCROLL_REVEAL_INPUT,
  STATIC_DESKTOP_VIEWPORT_POLICY,
  CHAT_MOBILE_VIEWPORT_POLICY,
  FOLLOW_INPUT_VIEWPORT_POLICY,
  calculateRevealDelta,
  applyAfterCommitScroll,
  focusDraftInput,
});
})();
