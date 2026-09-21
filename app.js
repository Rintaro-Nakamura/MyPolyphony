(() => {
const {
  MODE_STORAGE_KEY,
  STORAGE_KEY,
  commitDraft,
  createExportBasename,
  createInitialState,
  deleteMessage,
  editMessage,
  parseDialogue,
  parseStoredState,
  refreshStartedAtIfEmpty,
  serializeDialogue,
  serializePlainText,
  serializeStoredState,
  setNextRole,
  toggleNextRole,
  updateDraft,
} = globalThis.MyPolyphonyModel;
const {
  DEFAULT_FONT_PREFERENCE,
  FONT_PREFERENCE_LABELS,
  FONT_STORAGE_KEY,
  isViewMode,
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
  COMMAND_SWITCH_ROLE,
  DIALOGUE_ENTER_INTERACTION_POLICY,
  ROLE_AFTER_COMMIT_ALTERNATE,
  globalCommandForKey,
  roleAfterCommit,
  roleAfterDelete,
  roleAfterImport,
} = globalThis.MyPolyphonyInteraction;
const { bindDesktopEditor, bindMobileEditor } = globalThis.MyPolyphonyEditors;
const {
  CHAT_MOBILE_VIEWPORT_POLICY,
  STATIC_DESKTOP_VIEWPORT_POLICY,
  applyAfterCommitScroll,
  focusDraftInput,
} = globalThis.MyPolyphonyViewport;

const elements = collectElements(document);

// 各表示で採用する操作方針。共有データを変えず、表示ごとに別方針へ交換できる。
const desktopInteractionPolicy = DIALOGUE_ENTER_INTERACTION_POLICY;
const mobileInteractionPolicy = DIALOGUE_ENTER_INTERACTION_POLICY;
const desktopViewportPolicy = STATIC_DESKTOP_VIEWPORT_POLICY;
const mobileViewportPolicy = CHAT_MOBILE_VIEWPORT_POLICY;

// アプリの一時状態。保存される対話データの形は model.js が定義する。
const mobileMedia = window.matchMedia("(max-width: 767px)");
let state = createInitialState();
let viewMode = mobileMedia.matches ? "mobile" : "desktop";
let fontPreference = DEFAULT_FONT_PREFERENCE;
let hasManualMode = false;
let editingId = null;
let saveTimer = null;
let toastTimer = null;
let storageWriteBlocked = false;
let immersiveMode = "off";

function interactionPolicyForMode(mode = viewMode) {
  return mode === "mobile" ? mobileInteractionPolicy : desktopInteractionPolicy;
}

function interactionPolicyForSource(source) {
  return source === elements.mobileDraft
    ? mobileInteractionPolicy
    : desktopInteractionPolicy;
}

function viewportPolicyForMode(mode = viewMode) {
  return mode === "mobile" ? mobileViewportPolicy : desktopViewportPolicy;
}

// 設定と初期状態の復元
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
  const interactionPolicy = interactionPolicyForMode();
  state = toggleNextRole(state);
  persistNow();
  renderComposer();
  if (!preserveSelection || document.activeElement !== source) {
    focusComposer();
  }
  const afterCommitMessage =
    interactionPolicy.roleAfterCommit === ROLE_AFTER_COMMIT_ALTERNATE
      ? "発言後は自動で交替します。"
      : "発言後もこの話者を続けます。";
  announce(`次の話者を${roleLabel(state.nextRole)}に切り替えました。${afterCommitMessage}`);
}

function handleRoleShortcut(event) {
  const command = globalCommandForKey(event, {
    policy: interactionPolicyForMode(),
    editorOpen: elements.editDialog.open,
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
        input: viewMode === "mobile" ? elements.mobileDraft : elements.desktopDraft,
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

function openEditor(id) {
  const message = findMessage(id);
  if (!message) {
    return;
  }

  editingId = id;
  elements.editRoleLabel.textContent = `${roleLabel(message.role)}の発言`;
  elements.editText.value = message.text;
  elements.editDialog.showModal();
  window.requestAnimationFrame(() => {
    elements.editText.focus();
    elements.editText.setSelectionRange(message.text.length, message.text.length);
  });
}

function closeEditor() {
  editingId = null;
  elements.editDialog.close();
}

function saveEdit(event) {
  event.preventDefault();
  if (!editingId) {
    return;
  }

  if (elements.editText.value.trim().length === 0) {
    elements.editText.setCustomValidity("発言を入力してください。");
    elements.editText.reportValidity();
    elements.editText.setCustomValidity("");
    return;
  }

  state = editMessage(state, editingId, elements.editText.value);
  persistNow();
  closeEditor();
  renderAll();
  showToast("発言を更新しました");
}

function removeMessage(id) {
  const message = findMessage(id);
  if (!message) {
    return;
  }

  const excerpt = message.text.replace(/\s+/g, " ").slice(0, 28);
  if (!window.confirm(`「${excerpt}${message.text.length > 28 ? "…" : ""}」を削除しますか？`)) {
    return;
  }

  const currentRole = state.nextRole;
  const interactionPolicy = interactionPolicyForMode();
  state = deleteMessage(state, id);
  state = setNextRole(
    state,
    roleAfterDelete(state.messages, currentRole, interactionPolicy),
  );
  persistNow();
  renderAll({ focus: true });
  announce("発言を削除しました。");
}

function handleMessageAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "edit") {
    openEditor(button.dataset.id);
  } else if (button.dataset.action === "delete") {
    removeMessage(button.dataset.id);
  }
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

  bindDesktopEditor({
    composer: elements.desktopComposer,
    draftInput: elements.desktopDraft,
    roleButton: elements.desktopRoleLabel,
    getDraft: () => state.draft,
    interactionPolicy: desktopInteractionPolicy,
    onDraftInput: handleDraftInput,
    onCommit: commitCurrentDraft,
    onSwitchRole: handleRoleToggle,
  });

  bindMobileEditor({
    composer: elements.mobileComposer,
    draftInput: elements.mobileDraft,
    roleButton: elements.mobileRoleLabel,
    interactionPolicy: mobileInteractionPolicy,
    onDraftInput: handleDraftInput,
    onCommit: commitCurrentDraft,
    onSwitchRole: handleRoleToggle,
  });
  elements.mobileFullscreenButton.addEventListener("click", toggleMobileFullscreen);

  elements.desktopMessages.addEventListener("click", handleMessageAction);
  elements.mobileMessages.addEventListener("click", handleMessageAction);

  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", importJson);
  elements.exportJsonButton.addEventListener("click", exportJson);
  elements.exportTextButton.addEventListener("click", exportText);
  elements.fontSelect.addEventListener("change", changeFontPreference);
  elements.resetButton.addEventListener("click", resetDialogue);
  elements.loadExampleButton.addEventListener("click", loadToolSpecificationExample);
  elements.dismissNoticeButton.addEventListener("click", dismissNotice);

  elements.editForm.addEventListener("submit", saveEdit);
  elements.closeEditButton.addEventListener("click", closeEditor);
  elements.cancelEditButton.addEventListener("click", closeEditor);
  elements.editText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
      event.preventDefault();
      elements.editForm.requestSubmit();
    }
  });

  elements.editDialog.addEventListener("click", (event) => {
    if (event.target === elements.editDialog) {
      closeEditor();
    }
  });

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
