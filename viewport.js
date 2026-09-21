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

const DESKTOP_CARET_VIEWPORT_POLICY = Object.freeze({
  topInset: 16,
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

function isAtViewportBottom({
  targetBottom,
  viewportBottom,
  bottomInset = 0,
  tolerance = 1,
}) {
  for (const value of [
    targetBottom,
    viewportBottom,
    bottomInset,
    tolerance,
  ]) {
    if (!Number.isFinite(value)) {
      throw new TypeError("入力欄の基準位置が正しくありません。");
    }
  }

  const anchoredBottom = viewportBottom - bottomInset;
  return Math.abs(targetBottom - anchoredBottom) <= tolerance;
}

function calculateSharedComposerTravel({
  contentGrowth,
  availableTravel,
  composerShare = 0.1,
}) {
  for (const value of [contentGrowth, availableTravel, composerShare]) {
    if (!Number.isFinite(value)) {
      throw new TypeError("発言と入力欄の移動配分が正しくありません。");
    }
  }
  if (composerShare < 0 || composerShare > 1) {
    throw new RangeError("入力欄の移動割合は0から1の間で指定してください。");
  }

  return Math.min(
    Math.max(0, contentGrowth) * composerShare,
    Math.max(0, availableTravel),
  );
}

function calculateCaretRevealDelta({
  caretTop,
  caretBottom,
  viewportTop,
  viewportBottom,
  topInset = 0,
  bottomInset = 0,
}) {
  for (const value of [
    caretTop,
    caretBottom,
    viewportTop,
    viewportBottom,
    topInset,
    bottomInset,
  ]) {
    if (!Number.isFinite(value)) {
      throw new TypeError("キャレット追従の計算値が正しくありません。");
    }
  }

  const visibleTop = viewportTop + topInset;
  const visibleBottom = viewportBottom - bottomInset;
  if (caretTop < visibleTop) {
    return caretTop - visibleTop;
  }
  if (caretBottom > visibleBottom) {
    return caretBottom - visibleBottom;
  }
  return 0;
}

function revealCaretLine({
  caretRect,
  policy = DESKTOP_CARET_VIEWPORT_POLICY,
  viewportTop = 0,
  windowObject = globalThis.window,
}) {
  if (!caretRect || !policy || !windowObject) {
    throw new TypeError("キャレットを表示するための画面情報がありません。");
  }

  const delta = calculateCaretRevealDelta({
    caretTop: caretRect.top,
    caretBottom: caretRect.bottom,
    viewportTop,
    viewportBottom: windowObject.innerHeight,
    topInset: policy.topInset ?? 0,
    bottomInset: policy.bottomInset ?? 0,
  });
  if (delta !== 0) {
    windowObject.scrollBy({ top: delta, behavior: "auto" });
  }
  return delta;
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
  DESKTOP_CARET_VIEWPORT_POLICY,
  calculateRevealDelta,
  calculateSharedComposerTravel,
  isAtViewportBottom,
  calculateCaretRevealDelta,
  applyAfterCommitScroll,
  focusDraftInput,
  revealCaretLine,
});
})();
