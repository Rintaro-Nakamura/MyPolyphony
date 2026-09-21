(() => {
const {
  MODE_STORAGE_KEY,
  STORAGE_KEY,
  commitDraft,
  createExportBasename,
  createId,
  createInitialState,
  editMessage,
  mergeMessageBackward,
  mergeMessageForward,
  oppositeRole,
  parseDialogue,
  parseStoredState,
  pullLastMessageIntoDraft,
  refreshStartedAtIfEmpty,
  serializeDialogue,
  serializePlainText,
  serializeStoredState,
  setMessageRole,
  setNextRole,
  splitMessage,
  toggleNextRole,
  updateDraft,
} = globalThis.MyPolyphonyModel;
const {
  DEFAULT_ENTER_BEHAVIOR,
  DEFAULT_FONT_PREFERENCE,
  ENTER_BEHAVIOR_ALTERNATE,
  ENTER_BEHAVIOR_PRESERVE,
  ENTER_BEHAVIOR_STORAGE_KEY,
  FONT_PREFERENCE_LABELS,
  FONT_STORAGE_KEY,
  isViewMode,
  normalizeEnterBehavior,
  normalizeFontPreference,
} = globalThis.MyPolyphonyPreferences;
const { readStorage, removeStorage, writeStorage } = globalThis.MyPolyphonyStorage;
const {
  autoGrow,
  collectElements,
  createDesktopMessage,
  createMobileMessage,
  formatDialogueStartedAt,
  renderDesktopComposer,
  renderMobileComposer,
  roleLabel,
} = globalThis.MyPolyphonyView;
const {
  COMMAND_COMMIT,
  COMMAND_COMMIT_PRESERVE_ROLE,
  COMMAND_SWITCH_ROLE,
  DIALOGUE_ENTER_INTERACTION_POLICY,
  DIALOGUE_ENTER_PRESERVE_INTERACTION_POLICY,
  createShiftDoubleTapDetector,
  desktopCommandForKey,
  globalCommandForKey,
  roleAfterCommit,
  roleAfterImport,
} = globalThis.MyPolyphonyInteraction;
const { bindDesktopEditor, bindMobileEditor } = globalThis.MyPolyphonyEditors;
const { createDesktopCaretNavigation } = globalThis.MyPolyphonyCaretNavigation;
const {
  CHAT_MOBILE_VIEWPORT_POLICY,
  DESKTOP_CARET_VIEWPORT_POLICY,
  FOLLOW_INPUT_VIEWPORT_POLICY,
  applyAfterCommitScroll,
  focusDraftInput,
  revealCaretLine,
} = globalThis.MyPolyphonyViewport;

const elements = collectElements(document);
const desktopCaretNavigation = createDesktopCaretNavigation({
  messagesContainer: elements.desktopMessages,
  draftInput: elements.desktopDraft,
  onRevealCaret(caretRect) {
    const headerBottom = document.querySelector(".site-header")
      ?.getBoundingClientRect().bottom ?? 0;
    revealCaretLine({
      caretRect,
      policy: DESKTOP_CARET_VIEWPORT_POLICY,
      viewportTop: Math.max(0, headerBottom),
    });
  },
});
const shiftDoubleTapDetector = createShiftDoubleTapDetector();

// 各表示で採用する操作方針。共有データを変えず、表示ごとに別方針へ交換できる。
const desktopInteractionPolicies = Object.freeze({
  [ENTER_BEHAVIOR_ALTERNATE]: DIALOGUE_ENTER_INTERACTION_POLICY,
  [ENTER_BEHAVIOR_PRESERVE]: DIALOGUE_ENTER_PRESERVE_INTERACTION_POLICY,
});
const mobileInteractionPolicies = Object.freeze({
  [ENTER_BEHAVIOR_ALTERNATE]: DIALOGUE_ENTER_INTERACTION_POLICY,
  [ENTER_BEHAVIOR_PRESERVE]: DIALOGUE_ENTER_PRESERVE_INTERACTION_POLICY,
});
const desktopViewportPolicy = FOLLOW_INPUT_VIEWPORT_POLICY;
const mobileViewportPolicy = CHAT_MOBILE_VIEWPORT_POLICY;

// アプリの一時状態。保存される対話データの形は model.js が定義する。
const mobileMedia = window.matchMedia("(max-width: 767px)");
let state = createInitialState();
let viewMode = mobileMedia.matches ? "mobile" : "desktop";
let enterBehavior = DEFAULT_ENTER_BEHAVIOR;
let fontPreference = DEFAULT_FONT_PREFERENCE;
let hasManualMode = false;
let saveTimer = null;
let toastTimer = null;
let storageWriteBlocked = false;
let immersiveMode = "off";

function interactionPolicyForMode(mode = viewMode) {
  const policies = mode === "mobile"
    ? mobileInteractionPolicies
    : desktopInteractionPolicies;
  return policies[enterBehavior];
}

function interactionPolicyForSource(source) {
  return interactionPolicyForMode(
    source === elements.mobileDraft ? "mobile" : "desktop",
  );
}

function viewportPolicyForMode(mode = viewMode) {
  return mode === "mobile" ? mobileViewportPolicy : desktopViewportPolicy;
}

// 設定と初期状態の復元
function renderEnterBehaviorHint() {
  const preservesRole = enterBehavior === ENTER_BEHAVIOR_PRESERVE;
  elements.desktopHintAlternate.hidden = preservesRole;
  elements.desktopHintPreserve.hidden = !preservesRole;
}

function applyEnterBehavior(value) {
  enterBehavior = normalizeEnterBehavior(value);
  document.documentElement.dataset.enterBehavior = enterBehavior;
  renderEnterBehaviorHint();
}

function persistEnterBehavior() {
  const result = writeStorage(ENTER_BEHAVIOR_STORAGE_KEY, enterBehavior);
  if (result.ok) {
    return true;
  }

  showNotice(
    "Enterキーの設定をこのブラウザに保存できませんでした。現在のページでは選んだ働きを利用できます。",
    "warning",
  );
  console.warn(result.error);
  return false;
}

function toggleEnterBehavior() {
  const nextBehavior = enterBehavior === ENTER_BEHAVIOR_ALTERNATE
    ? ENTER_BEHAVIOR_PRESERVE
    : ENTER_BEHAVIOR_ALTERNATE;
  applyEnterBehavior(nextBehavior);
  const persisted = persistEnterBehavior();
  const message = enterBehavior === ENTER_BEHAVIOR_PRESERVE
    ? "Enterで同じ声を続けます"
    : "Enterで次の声へ移ります";
  showToast(persisted ? message : `${message}（保存なし）`);
  announce(`${message}。`);
}

function applyFontPreference(value) {
  fontPreference = normalizeFontPreference(value);
  document.documentElement.dataset.dialogueFont = fontPreference;
  elements.fontSelect.value = fontPreference;
}

function persistFontPreference() {
  const result = writeStorage(FONT_STORAGE_KEY, fontPreference);
  if (result.ok) {
    return true;
  }

  showNotice(
    "書体の設定をこのブラウザに保存できませんでした。現在のページでは選んだ書体を利用できます。",
    "warning",
  );
  console.warn(result.error);
  return false;
}

function changeFontPreference(event) {
  applyFontPreference(event.currentTarget.value);
  const persisted = persistFontPreference();
  const label = FONT_PREFERENCE_LABELS[fontPreference];
  showToast(persisted ? `書体を${label}に変更しました` : `書体を${label}に変更しました（保存なし）`);
  announce(`対話篇の書体を${label}に変更しました。`);
}

function stopAutoSaveAfterLoadFailure(error) {
  storageWriteBlocked = true;
  showNotice(
    "端末内の保存データを読み込めなかったため、自動保存を停止しました。読み込みまたは「新しく始める」を選ぶまで、元の保存データは上書きしません。",
    "error",
  );
  console.error(error);
}

function loadInitialState() {
  const dialogueResult = readStorage(STORAGE_KEY);
  if (dialogueResult.ok) {
    try {
      if (dialogueResult.value) {
        const restored = parseStoredState(dialogueResult.value);
        state = refreshStartedAtIfEmpty(restored);
        if (state !== restored) {
          persistNow();
        }
      }
    } catch (error) {
      stopAutoSaveAfterLoadFailure(error);
    }
  } else {
    stopAutoSaveAfterLoadFailure(dialogueResult.error);
  }

  const modeResult = readStorage(MODE_STORAGE_KEY);
  if (modeResult.ok) {
    const storedMode = modeResult.value;
    if (isViewMode(storedMode)) {
      viewMode = storedMode;
      hasManualMode = true;
    }
  } else {
    console.warn("表示モードの設定を読み込めませんでした。", modeResult.error);
  }

  applyFontPreference(DEFAULT_FONT_PREFERENCE);
  const fontResult = readStorage(FONT_STORAGE_KEY);
  if (fontResult.ok) {
    applyFontPreference(fontResult.value);
  } else {
    console.warn("書体の設定を読み込めませんでした。", fontResult.error);
  }

  applyEnterBehavior(DEFAULT_ENTER_BEHAVIOR);
  const enterBehaviorResult = readStorage(ENTER_BEHAVIOR_STORAGE_KEY);
  if (enterBehaviorResult.ok) {
    applyEnterBehavior(enterBehaviorResult.value);
  } else {
    console.warn("Enterキーの設定を読み込めませんでした。", enterBehaviorResult.error);
  }
}

// 利用者への通知と保存
function showNotice(message, level = "warning") {
  elements.noticeText.textContent = message;
  elements.notice.dataset.level = level;
  elements.notice.hidden = false;
}

function dismissNotice() {
  elements.notice.hidden = true;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  elements.toast.classList.add("toast--visible");

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("toast--visible");
    window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 180);
  }, 2600);
}

function announce(message) {
  elements.liveRegion.textContent = "";
  window.requestAnimationFrame(() => {
    elements.liveRegion.textContent = message;
  });
}

function setSaveStatus(message, level = "saved") {
  elements.saveStatus.textContent = message;
  elements.saveStatus.dataset.level = level;
}

function reportSaveFailure(error) {
  setSaveStatus("自動保存できません", "error");
  showNotice(
    "端末内に自動保存できませんでした。ページを閉じる前にJSONを書き出して、対話篇を保護してください。",
    "error",
  );
  console.error(error);
}

function persistNow() {
  window.clearTimeout(saveTimer);
  saveTimer = null;

  if (storageWriteBlocked) {
    setSaveStatus("自動保存を停止中", "error");
    return false;
  }

  let serializedState;
  try {
    serializedState = serializeStoredState(state);
  } catch (error) {
    reportSaveFailure(error);
    return false;
  }

  const result = writeStorage(STORAGE_KEY, serializedState);
  if (result.ok) {
    setSaveStatus("この端末に保存済み", "saved");
    return true;
  }

  reportSaveFailure(result.error);
  return false;
}

function schedulePersist() {
  if (storageWriteBlocked) {
    setSaveStatus("自動保存を停止中", "error");
    return;
  }

  setSaveStatus("保存中…", "saving");
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persistNow, 220);
}

function persistMode() {
  const result = writeStorage(MODE_STORAGE_KEY, viewMode);
  if (!result.ok) {
    showNotice("表示モードの設定を保存できませんでした。対話篇の内容には影響ありません。", "warning");
    console.warn(result.error);
  }
}

// 表示モードとモバイル全画面表示
function setMode(mode, { manual = false, focus = false } = {}) {
  if (!isViewMode(mode)) {
    return;
  }

  viewMode = mode;
  if (manual) {
    hasManualMode = true;
    persistMode();
  }

  elements.desktopView.hidden = mode !== "desktop";
  elements.mobileView.hidden = mode !== "mobile";
  elements.modeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });

  if (focus) {
    window.requestAnimationFrame(() => focusComposer());
  }
}

function renderMobileFullscreenButton() {
  const isActive = immersiveMode !== "off";
  const label = isActive ? "全画面表示を閉じる" : "チャットを全画面で開く";

  elements.mobileFullscreenButton.textContent = isActive ? "×" : "⛶";
  elements.mobileFullscreenButton.setAttribute("aria-label", label);
  elements.mobileFullscreenButton.setAttribute("aria-pressed", String(isActive));
  elements.mobileFullscreenButton.title = label;
}

function setImmersiveMode(mode) {
  immersiveMode = mode;
  document.documentElement.classList.toggle("mobile-immersive", mode !== "off");
  renderMobileFullscreenButton();
}

function restoreResponsiveModeAfterImmersive() {
  if (!hasManualMode) {
    setMode(mobileMedia.matches ? "mobile" : "desktop");
  }
}

async function enterMobileFullscreen() {
  if (viewMode !== "mobile" || !mobileMedia.matches) {
    return;
  }

  setImmersiveMode("fallback");

  const requestFullscreen = document.documentElement.requestFullscreen;
  if (typeof requestFullscreen !== "function") {
    announce("チャットを画面いっぱいに表示しました");
    return;
  }

  try {
    await requestFullscreen.call(document.documentElement);
    setImmersiveMode("native");
    announce("チャットを全画面で表示しました");
  } catch (error) {
    setImmersiveMode("fallback");
    announce("ブラウザ内でチャットを画面いっぱいに表示しました");
    console.warn("全画面表示を開始できなかったため、画面内表示へ切り替えました。", error);
  }
}

async function exitMobileFullscreen() {
  if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.warn("全画面表示を終了できませんでした。", error);
      if (document.fullscreenElement) {
        setImmersiveMode("native");
        announce("ブラウザの終了操作で全画面表示を閉じてください");
        return;
      }
    }
  }

  setImmersiveMode("off");
  restoreResponsiveModeAfterImmersive();
  announce("全画面表示を閉じました");
}

function toggleMobileFullscreen() {
  if (immersiveMode === "off") {
    void enterMobileFullscreen();
    return;
  }

  void exitMobileFullscreen();
}

function handleFullscreenChange() {
  if (document.fullscreenElement === document.documentElement && immersiveMode !== "off") {
    setImmersiveMode("native");
    return;
  }

  if (!document.fullscreenElement && immersiveMode === "native") {
    setImmersiveMode("off");
    restoreResponsiveModeAfterImmersive();
    announce("全画面表示を閉じました");
  }
}

function handleFullscreenError(event) {
  if (immersiveMode === "off") {
    return;
  }

  setImmersiveMode("fallback");
  announce("ブラウザ内でチャットを画面いっぱいに表示しました");
  console.warn("全画面表示の要求が拒否されました。", event);
}

// 描画と入力欄の同期
function syncDraftInputs(source = null) {
  [elements.desktopDraft, elements.mobileDraft].forEach((input) => {
    if (input !== source && input.value !== state.draft) {
      input.value = state.draft;
    }
    autoGrow(input);
  });
}

function renderMessages() {
  const desktopFragment = document.createDocumentFragment();
  const mobileFragment = document.createDocumentFragment();

  state.messages.forEach((message, index) => {
    desktopFragment.append(createDesktopMessage(message, index));
    mobileFragment.append(createMobileMessage(message, index));
  });

  elements.desktopMessages.replaceChildren(desktopFragment);
  elements.mobileMessages.replaceChildren(mobileFragment);
  elements.desktopEmpty.hidden = state.messages.length > 0;
  elements.mobileEmpty.hidden = state.messages.length > 0;
  elements.messageCount.textContent = `発言 ${state.messages.length}`;
  elements.exportJsonButton.disabled = state.messages.length === 0;
  elements.exportTextButton.disabled = state.messages.length === 0;
}

function renderNoteHeader() {
  elements.dialogueStartedAt.dateTime = state.startedAt;
  elements.dialogueStartedAt.textContent = formatDialogueStartedAt(state.startedAt);
}

function renderComposer() {
  renderDesktopComposer(
    {
      composer: elements.desktopComposer,
      roleButton: elements.desktopRoleLabel,
    },
    state.nextRole,
  );
  renderMobileComposer(
    {
      composer: elements.mobileComposer,
      draftInput: elements.mobileDraft,
      roleButton: elements.mobileRoleLabel,
    },
    state.nextRole,
  );

  syncDraftInputs();
}

function handleRoleToggle({ source = null, preserveSelection = false } = {}) {
  state = toggleNextRole(state);
  persistNow();
  renderComposer();
  if (!preserveSelection || document.activeElement !== source) {
    focusComposer();
  }
  const afterCommitMessage = enterBehavior === ENTER_BEHAVIOR_PRESERVE
    ? "Enterで発言した後もこの話者を続けます。"
    : "Enterで発言した後は自動で交替します。";
  announce(`次の話者を${roleLabel(state.nextRole)}に切り替えました。${afterCommitMessage}`);
}

function handleShiftDoubleTapKeydown(event) {
  shiftDoubleTapDetector.handleKeydown(event);
}

function handleShiftDoubleTapKeyup(event) {
  if (shiftDoubleTapDetector.handleKeyup(event)) {
    toggleEnterBehavior();
  }
}

function handleRoleShortcut(event) {
  const command = globalCommandForKey(event, {
    policy: interactionPolicyForMode(),
  });
  if (command !== COMMAND_SWITCH_ROLE) {
    return;
  }

  event.preventDefault();
  handleRoleToggle();
}

function renderAll({ focus = false, scroll = false } = {}) {
  renderNoteHeader();
  renderMessages();
  renderComposer();
  setMode(viewMode);

  if (scroll) {
    window.requestAnimationFrame(() => {
      applyAfterCommitScroll({
        policy: viewportPolicyForMode(),
        feed: viewMode === "mobile" ? elements.mobileFeed : null,
        input: viewMode === "mobile" ? elements.mobileDraft : elements.desktopComposer,
        windowObject: window,
      });
    });
  }

  if (focus) {
    window.requestAnimationFrame(() => focusComposer());
  }
}

function focusComposer() {
  const target = viewMode === "mobile" ? elements.mobileDraft : elements.desktopDraft;
  focusDraftInput(target, viewportPolicyForMode());
}

// 対話篇の編集操作
function handleDraftInput(event) {
  desktopCaretNavigation.reset();
  state = updateDraft(state, event.currentTarget.value);
  syncDraftInputs(event.currentTarget);
  schedulePersist();
}

function commitCurrentDraft(source, command = COMMAND_COMMIT) {
  state = updateDraft(state, source.value);
  if (state.draft.trim().length === 0) {
    source.setCustomValidity("発言を入力してください。");
    source.reportValidity();
    source.setCustomValidity("");
    return;
  }

  const committedRole = state.nextRole;
  const interactionPolicy = interactionPolicyForSource(source);
  state = commitDraft(state);
  state = setNextRole(
    state,
    roleAfterCommit(committedRole, interactionPolicy, command),
  );
  persistNow();
  renderAll({ focus: true, scroll: true });
  announce(`${roleLabel(committedRole)}の発言を追加しました。次は${roleLabel(state.nextRole)}です。`);
}

function findMessage(id) {
  return state.messages.find((message) => message.id === id);
}

function inlineEditorFromEvent(event) {
  return event.target.closest?.(".desktop-message__text") ?? null;
}

function findInlineEditor(id) {
  return [...elements.desktopMessages.querySelectorAll(".desktop-message__text")]
    .find((editor) => editor.dataset.messageId === id) ?? null;
}

function selectionOffsets(editor) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  ) {
    return null;
  }

  const beforeStart = range.cloneRange();
  beforeStart.selectNodeContents(editor);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = range.cloneRange();
  beforeEnd.selectNodeContents(editor);
  beforeEnd.setEnd(range.endContainer, range.endOffset);

  return {
    start: beforeStart.toString().length,
    end: beforeEnd.toString().length,
  };
}

function setInlineSelection(editor, start, end = start) {
  const range = document.createRange();
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const points = [];
  let traversed = 0;
  let node = walker.nextNode();

  while (node) {
    const next = traversed + node.data.length;
    if (points[0] === undefined && start <= next) {
      points[0] = [node, start - traversed];
    }
    if (points[1] === undefined && end <= next) {
      points[1] = [node, end - traversed];
      break;
    }
    traversed = next;
    node = walker.nextNode();
  }

  if (points[0] === undefined) {
    points[0] = [editor, editor.childNodes.length];
  }
  if (points[1] === undefined) {
    points[1] = [editor, editor.childNodes.length];
  }

  range.setStart(...points[0]);
  range.setEnd(...points[1]);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function focusInlineEditor(id, start, end = start) {
  window.requestAnimationFrame(() => {
    const editor = findInlineEditor(id);
    if (!editor) {
      return;
    }

    editor.focus();
    setInlineSelection(editor, start, end);
  });
}

function updateMobileMessageText(id, text) {
  const article = [...elements.mobileMessages.querySelectorAll(".mobile-message")]
    .find((message) => message.dataset.messageId === id);
  const content = article?.querySelector(".mobile-message__content");
  if (content) {
    content.textContent = text;
  }
}

function handleInlineMessageClick(event) {
  desktopCaretNavigation.reset();
  if (inlineEditorFromEvent(event)) {
    return;
  }

  const article = event.target.closest?.(".desktop-message");
  if (!article) {
    return;
  }

  const message = findMessage(article.dataset.messageId);
  if (!message) {
    return;
  }

  focusInlineEditor(message.id, message.text.length);
}

function handleInlineMessageInput(event) {
  const editor = inlineEditorFromEvent(event);
  if (!editor) {
    return;
  }

  desktopCaretNavigation.reset();
  const selected = selectionOffsets(editor);
  const rawText = editor.textContent ?? "";
  const text = rawText.replace(/[\r\n]+/g, "");
  if (rawText !== text) {
    const rawOffset = selected?.start ?? text.length;
    const offset = rawText.slice(0, rawOffset).replace(/[\r\n]+/g, "").length;
    editor.textContent = text;
    setInlineSelection(editor, offset);
  }

  state = editMessage(state, editor.dataset.messageId, text);
  persistNow();
  updateMobileMessageText(editor.dataset.messageId, text);
}

function handleInlineMessageKeydown(event) {
  const editor = inlineEditorFromEvent(event);
  if (!editor || event.defaultPrevented || event.isComposing || event.keyCode === 229) {
    return;
  }

  if (desktopCaretNavigation.handleKeydown(event)) {
    return;
  }

  const message = findMessage(editor.dataset.messageId);
  const selected = selectionOffsets(editor);
  if (!message || !selected) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    editor.blur();
    return;
  }

  const index = state.messages.findIndex(({ id }) => id === message.id);
  const collapsed = selected.start === selected.end;

  if (event.key === "Backspace" && collapsed && selected.start === 0) {
    event.preventDefault();
    if (index === 0) {
      return;
    }

    const previous = state.messages[index - 1];
    const joinOffset = previous.text.length;
    state = mergeMessageBackward(state, message.id);
    persistNow();
    renderMessages();
    focusInlineEditor(previous.id, joinOffset);
    return;
  }

  if (
    event.key === "Delete" &&
    collapsed &&
    selected.end === message.text.length
  ) {
    event.preventDefault();
    if (index === state.messages.length - 1) {
      return;
    }

    const joinOffset = message.text.length;
    state = mergeMessageForward(state, message.id);
    persistNow();
    renderMessages();
    focusInlineEditor(message.id, joinOffset);
    return;
  }

  if (event.key !== "Enter" && event.key !== "Tab") {
    return;
  }

  const interactionPolicy = interactionPolicyForMode("desktop");
  const command = desktopCommandForKey(
    event,
    message.text,
    interactionPolicy,
  );
  if (command === COMMAND_SWITCH_ROLE) {
    event.preventDefault();
    state = setMessageRole(state, message.id, oppositeRole(message.role));
    persistNow();
    renderMessages();
    focusInlineEditor(message.id, selected.start, selected.end);
    announce(`${roleLabel(oppositeRole(message.role))}の発言に切り替えました。`);
    return;
  }
  if (command !== COMMAND_COMMIT && command !== COMMAND_COMMIT_PRESERVE_ROLE) {
    return;
  }

  event.preventDefault();
  const newId = createId();
  const newRole = roleAfterCommit(
    message.role,
    interactionPolicy,
    command,
  );
  state = splitMessage(
    state,
    message.id,
    selected.start,
    selected.end,
    newRole,
    () => newId,
  );
  persistNow();
  renderMessages();
  focusInlineEditor(newId, 0);
}

function reopenPreviousMessage(source) {
  if (state.messages.length === 0 || state.draft.length > 0) {
    return;
  }

  state = pullLastMessageIntoDraft(state);
  persistNow();
  renderMessages();
  renderComposer();
  window.requestAnimationFrame(() => {
    focusDraftInput(source, desktopViewportPolicy);
    source.setSelectionRange(state.draft.length, state.draft.length);
  });
  announce("直前の発言を入力欄へ戻しました。");
}

// 読み込みと書き出し
function downloadFile(contents, filename, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  if (state.draft.trim()) {
    showToast("書き出しました（入力途中の下書きは含まれません）");
  } else {
    showToast("対話篇を書き出しました");
  }
  elements.settingsMenu.open = false;
}

function exportJson() {
  const basename = createExportBasename();
  downloadFile(
    serializeDialogue(state.messages),
    `${basename}.json`,
    "application/json;charset=utf-8",
  );
}

function exportText() {
  const basename = createExportBasename();
  downloadFile(
    `${serializePlainText(state.messages)}\n`,
    `${basename}.txt`,
    "text/plain;charset=utf-8",
  );
}

function loadDialogueSource(
  source,
  {
    confirmation = "現在の対話篇を、読み込んだ内容で置き換えますか？",
    toastMessage = null,
    focus = true,
    scroll = true,
  } = {},
) {
  const imported = parseDialogue(
    source,
    undefined,
    undefined,
    (messages) => roleAfterImport(messages, interactionPolicyForMode()),
  );
  const hasCurrentWork = state.messages.length > 0 || state.draft.trim().length > 0 || storageWriteBlocked;
  if (hasCurrentWork && !window.confirm(confirmation)) {
    return false;
  }

  state = imported;
  storageWriteBlocked = false;
  dismissNotice();
  persistNow();
  renderAll({ focus, scroll });
  showToast(toastMessage ?? `${state.messages.length}件の発言を読み込みました`);
  return true;
}

async function importJson(event) {
  const [file] = event.currentTarget.files;
  event.currentTarget.value = "";
  if (!file) {
    return;
  }

  try {
    const loaded = loadDialogueSource(await file.text());
    if (loaded) {
      elements.settingsMenu.open = false;
    }
  } catch (error) {
    showNotice(`JSONを読み込めませんでした。${error.message}`, "error");
    console.error(error);
  }
}

function loadToolSpecificationExample() {
  try {
    const loaded = loadDialogueSource(elements.toolSpecificationExample.textContent, {
      confirmation: "現在の対話篇を、制作者の具体例で置き換えますか？",
      toastMessage: "具体例を読み込みました",
      focus: false,
      scroll: false,
    });
    if (!loaded) {
      return;
    }

    window.requestAnimationFrame(() => {
      elements.mobileFeed.scrollTop = 0;
      window.scrollTo({ top: 0 });
    });
    announce("制作者の具体例を読み込みました。54件の発言があります。");
  } catch (error) {
    showNotice(`制作者の具体例を読み込めませんでした。${error.message}`, "error");
    console.error(error);
  }
}

function resetDialogue() {
  const hasWork = state.messages.length > 0 || state.draft.trim().length > 0 || storageWriteBlocked;
  if (
    hasWork &&
    !window.confirm("現在の対話篇を消して、新しく始めますか？ この操作は元に戻せません。")
  ) {
    return;
  }

  state = createInitialState();
  storageWriteBlocked = false;
  dismissNotice();

  const result = removeStorage(STORAGE_KEY);
  if (!result.ok) {
    console.warn(result.error);
  }

  persistNow();
  renderAll({ focus: true });
  showToast("新しい対話篇を開きました");
}

// イベントの接続をここへ集約し、各補助モジュールを副作用から切り離す。
function bindEvents() {
  document.addEventListener("keydown", handleShiftDoubleTapKeydown);
  document.addEventListener("keyup", handleShiftDoubleTapKeyup);
  document.addEventListener("pointerdown", shiftDoubleTapDetector.reset);
  window.addEventListener("blur", shiftDoubleTapDetector.reset);
  document.addEventListener("keydown", handleRoleShortcut);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.settingsMenu.open) {
      elements.settingsMenu.open = false;
      elements.settingsMenu.querySelector("summary").focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (elements.settingsMenu.open && !elements.settingsMenu.contains(event.target)) {
      elements.settingsMenu.open = false;
    }
  });

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode, { manual: true, focus: true }));
  });

  mobileMedia.addEventListener("change", (event) => {
    if (immersiveMode !== "off") {
      return;
    }

    if (!hasManualMode) {
      setMode(event.matches ? "mobile" : "desktop");
    }
  });

  elements.desktopDraft.addEventListener(
    "keydown",
    desktopCaretNavigation.handleKeydown,
  );
  elements.desktopDraft.addEventListener("pointerdown", desktopCaretNavigation.reset);

  bindDesktopEditor({
    composer: elements.desktopComposer,
    draftInput: elements.desktopDraft,
    roleButton: elements.desktopRoleLabel,
    getDraft: () => state.draft,
    getInteractionPolicy: () => interactionPolicyForMode("desktop"),
    onDraftInput: handleDraftInput,
    onCommit: commitCurrentDraft,
    onReopenPrevious: reopenPreviousMessage,
    onSwitchRole: handleRoleToggle,
  });

  bindMobileEditor({
    composer: elements.mobileComposer,
    draftInput: elements.mobileDraft,
    roleButton: elements.mobileRoleLabel,
    getInteractionPolicy: () => interactionPolicyForMode("mobile"),
    onDraftInput: handleDraftInput,
    onCommit: commitCurrentDraft,
    onSwitchRole: handleRoleToggle,
  });
  elements.mobileFullscreenButton.addEventListener("click", toggleMobileFullscreen);

  elements.desktopMessages.addEventListener("click", handleInlineMessageClick);
  elements.desktopMessages.addEventListener("input", handleInlineMessageInput);
  elements.desktopMessages.addEventListener("keydown", handleInlineMessageKeydown);

  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", importJson);
  elements.exportJsonButton.addEventListener("click", exportJson);
  elements.exportTextButton.addEventListener("click", exportText);
  elements.fontSelect.addEventListener("change", changeFontPreference);
  elements.resetButton.addEventListener("click", resetDialogue);
  elements.loadExampleButton.addEventListener("click", loadToolSpecificationExample);
  elements.dismissNoticeButton.addEventListener("click", dismissNotice);

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("fullscreenerror", handleFullscreenError);

  window.addEventListener("beforeunload", () => {
    if (saveTimer) {
      persistNow();
    }
  });
}

bindEvents();
loadInitialState();
renderAll();
})();
