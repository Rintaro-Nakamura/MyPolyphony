(() => {
const {
  MODE_STORAGE_KEY,
  ROLE_OTHER,
  ROLE_SELF,
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
  toggleNextRole,
  updateDraft,
} = globalThis.MyPolyphonyModel;

const elements = {
  notice: document.querySelector("#notice"),
  noticeText: document.querySelector("#noticeText"),
  dismissNoticeButton: document.querySelector("#dismissNoticeButton"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  importButton: document.querySelector("#importButton"),
  importInput: document.querySelector("#importInput"),
  exportMenu: document.querySelector("#exportMenu"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  exportTextButton: document.querySelector("#exportTextButton"),
  resetButton: document.querySelector("#resetButton"),
  saveStatus: document.querySelector("#saveStatus"),
  messageCount: document.querySelector("#messageCount"),
  desktopView: document.querySelector("#desktopView"),
  desktopMessages: document.querySelector("#desktopMessages"),
  desktopEmpty: document.querySelector("#desktopEmpty"),
  desktopComposer: document.querySelector("#desktopComposer"),
  desktopDraft: document.querySelector("#desktopDraft"),
  desktopRoleLabel: document.querySelector("#desktopRoleLabel"),
  dialogueStartedAt: document.querySelector("#dialogueStartedAt"),
  mobileView: document.querySelector("#mobileView"),
  mobileFeed: document.querySelector("#mobileFeed"),
  mobileMessages: document.querySelector("#mobileMessages"),
  mobileEmpty: document.querySelector("#mobileEmpty"),
  mobileComposer: document.querySelector("#mobileComposer"),
  mobileDraft: document.querySelector("#mobileDraft"),
  mobileFullscreenButton: document.querySelector("#mobileFullscreenButton"),
  mobileRoleLabel: document.querySelector("#mobileRoleLabel"),
  editDialog: document.querySelector("#editDialog"),
  editForm: document.querySelector("#editForm"),
  editText: document.querySelector("#editText"),
  editRoleLabel: document.querySelector("#editRoleLabel"),
  closeEditButton: document.querySelector("#closeEditButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  toast: document.querySelector("#toast"),
  liveRegion: document.querySelector("#liveRegion"),
};

const mobileMedia = window.matchMedia("(max-width: 767px)");
let state = createInitialState();
let viewMode = mobileMedia.matches ? "mobile" : "desktop";
let hasManualMode = false;
let editingId = null;
let saveTimer = null;
let toastTimer = null;
let storageWriteBlocked = false;
let immersiveMode = "off";

function roleLabel(role) {
  return role === ROLE_SELF ? "自分" : "相手";
}

function formatDialogueStartedAt(value) {
  const date = new Date(value);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日（${weekday}）　${date.getHours()} 時 ${minute} 分`;
}

function loadInitialState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const restored = parseStoredState(stored);
      state = refreshStartedAtIfEmpty(restored);
      if (state !== restored) {
        persistNow();
      }
    }
  } catch (error) {
    storageWriteBlocked = true;
    showNotice(
      "端末内の保存データを読み込めなかったため、自動保存を停止しました。読み込みまたは「新しく始める」を選ぶまで、元の保存データは上書きしません。",
      "error",
    );
    console.error(error);
  }

  try {
    const storedMode = localStorage.getItem(MODE_STORAGE_KEY);
    if (storedMode === "desktop" || storedMode === "mobile") {
      viewMode = storedMode;
      hasManualMode = true;
    }
  } catch (error) {
    console.warn("表示モードの設定を読み込めませんでした。", error);
  }
}

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

function persistNow() {
  window.clearTimeout(saveTimer);
  saveTimer = null;

  if (storageWriteBlocked) {
    setSaveStatus("自動保存を停止中", "error");
    return false;
  }

  try {
    localStorage.setItem(STORAGE_KEY, serializeStoredState(state));
    setSaveStatus("この端末に保存済み", "saved");
    return true;
  } catch (error) {
    setSaveStatus("自動保存できません", "error");
    showNotice(
      "端末内に自動保存できませんでした。ページを閉じる前にJSONを書き出して、対話篇を保護してください。",
      "error",
    );
    console.error(error);
    return false;
  }
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
  try {
    localStorage.setItem(MODE_STORAGE_KEY, viewMode);
  } catch (error) {
    showNotice("表示モードの設定を保存できませんでした。対話篇の内容には影響ありません。", "warning");
    console.warn(error);
  }
}

function setMode(mode, { manual = false, focus = false } = {}) {
  if (mode !== "desktop" && mode !== "mobile") {
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

function autoGrow(textarea) {
  textarea.style.height = "0px";
  const maximum = textarea === elements.mobileDraft ? 132 : 240;
  textarea.style.height = `${Math.min(textarea.scrollHeight, maximum)}px`;
}

function syncDraftInputs(source = null) {
  [elements.desktopDraft, elements.mobileDraft].forEach((input) => {
    if (input !== source && input.value !== state.draft) {
      input.value = state.draft;
    }
    autoGrow(input);
  });
}

function makeActionButton(label, action, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `message-action message-action--${action}`;
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = label;
  return button;
}

function createDesktopMessage(message, index) {
  const article = document.createElement("article");
  article.className = `desktop-message desktop-message--${message.role}`;
  article.dataset.messageId = message.id;
  article.setAttribute("aria-label", `${roleLabel(message.role)}の発言 ${index + 1}`);

  const number = document.createElement("span");
  number.className = "desktop-message__number";
  number.textContent = String(index + 1).padStart(2, "0");
  number.setAttribute("aria-hidden", "true");

  const content = document.createElement("p");
  content.className = "desktop-message__content";
  content.append(document.createTextNode("「"));
  const text = document.createElement("span");
  text.textContent = message.text;
  content.append(text, document.createTextNode("」"));

  const actions = document.createElement("div");
  actions.className = "message-actions";
  actions.append(
    makeActionButton("編集", "edit", message.id),
    makeActionButton("削除", "delete", message.id),
  );

  article.append(number, content, actions);
  return article;
}

function createMobileMessage(message, index) {
  const article = document.createElement("article");
  article.className = `mobile-message mobile-message--${message.role}`;
  article.dataset.messageId = message.id;
  article.setAttribute("aria-label", `${roleLabel(message.role)}の発言 ${index + 1}`);

  const bubble = document.createElement("div");
  bubble.className = "mobile-message__bubble";

  const speaker = document.createElement("span");
  speaker.className = "visually-hidden";
  speaker.textContent = `${roleLabel(message.role)}：`;

  const content = document.createElement("p");
  content.textContent = message.text;

  const actions = document.createElement("div");
  actions.className = "message-actions mobile-message__actions";
  actions.append(
    makeActionButton("編集", "edit", message.id),
    makeActionButton("削除", "delete", message.id),
  );

  bubble.append(speaker, content, actions);
  article.append(bubble);
  return article;
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
  const label = roleLabel(state.nextRole);
  const alternateLabel = roleLabel(state.nextRole === ROLE_SELF ? ROLE_OTHER : ROLE_SELF);
  elements.desktopRoleLabel.textContent = `次は ${label}`;
  elements.mobileRoleLabel.textContent = `次は${label}`;
  elements.mobileDraft.placeholder = `${label}として書く`;

  [elements.desktopRoleLabel, elements.mobileRoleLabel].forEach((button) => {
    button.setAttribute(
      "aria-label",
      `次の話者は${label}です。クリックすると${alternateLabel}に切り替わります。`,
    );
    button.title = `クリックで「次は${alternateLabel}」に切り替え`;
  });

  [elements.desktopComposer, elements.mobileComposer].forEach((composer) => {
    composer.dataset.role = state.nextRole;
  });

  syncDraftInputs();
}

function handleRoleToggle() {
  state = toggleNextRole(state);
  persistNow();
  renderComposer();
  focusComposer();
  announce(`次の話者を${roleLabel(state.nextRole)}に切り替えました。発言後は自動で交替します。`);
}

function renderAll({ focus = false, scroll = false } = {}) {
  renderNoteHeader();
  renderMessages();
  renderComposer();
  setMode(viewMode);

  if (scroll && viewMode === "mobile") {
    window.requestAnimationFrame(() => {
      elements.mobileFeed.scrollTop = elements.mobileFeed.scrollHeight;
    });
  }

  if (focus) {
    window.requestAnimationFrame(() => focusComposer());
  }
}

function focusComposer() {
  const target = viewMode === "mobile" ? elements.mobileDraft : elements.desktopDraft;
  target.focus({ preventScroll: viewMode === "desktop" });
  const end = target.value.length;
  target.setSelectionRange(end, end);
}

function handleDraftInput(event) {
  state = updateDraft(state, event.currentTarget.value);
  syncDraftInputs(event.currentTarget);
  schedulePersist();
}

function commitCurrentDraft(source) {
  state = updateDraft(state, source.value);
  if (state.draft.trim().length === 0) {
    source.setCustomValidity("発言を入力してください。");
    source.reportValidity();
    source.setCustomValidity("");
    return;
  }

  const committedRole = state.nextRole;
  state = commitDraft(state);
  persistNow();
  renderAll({ focus: true, scroll: true });
  announce(`${roleLabel(committedRole)}の発言を追加しました。次は${roleLabel(state.nextRole)}です。`);
}

function handleDesktopKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) {
    return;
  }

  event.preventDefault();
  commitCurrentDraft(elements.desktopDraft);
}

function handleMobileKeydown(event) {
  if (
    event.key === "Enter" &&
    (event.ctrlKey || event.metaKey) &&
    !event.isComposing &&
    event.keyCode !== 229
  ) {
    event.preventDefault();
    commitCurrentDraft(elements.mobileDraft);
  }
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

  state = deleteMessage(state, id);
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
  elements.exportMenu.open = false;
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

async function importJson(event) {
  const [file] = event.currentTarget.files;
  event.currentTarget.value = "";
  if (!file) {
    return;
  }

  try {
    const imported = parseDialogue(await file.text());
    const hasCurrentWork = state.messages.length > 0 || state.draft.trim().length > 0 || storageWriteBlocked;
    if (
      hasCurrentWork &&
      !window.confirm("現在の対話篇を、読み込んだ内容で置き換えますか？")
    ) {
      return;
    }

    state = imported;
    storageWriteBlocked = false;
    dismissNotice();
    persistNow();
    renderAll({ focus: true, scroll: true });
    showToast(`${state.messages.length}件の発言を読み込みました`);
  } catch (error) {
    showNotice(`JSONを読み込めませんでした。${error.message}`, "error");
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

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn(error);
  }

  persistNow();
  renderAll({ focus: true });
  showToast("新しい対話篇を開きました");
}

function bindEvents() {
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

  elements.desktopDraft.addEventListener("input", handleDraftInput);
  elements.desktopDraft.addEventListener("keydown", handleDesktopKeydown);
  elements.desktopRoleLabel.addEventListener("click", handleRoleToggle);
  elements.desktopComposer.addEventListener("submit", (event) => {
    event.preventDefault();
    commitCurrentDraft(elements.desktopDraft);
  });

  elements.mobileDraft.addEventListener("input", handleDraftInput);
  elements.mobileDraft.addEventListener("keydown", handleMobileKeydown);
  elements.mobileFullscreenButton.addEventListener("click", toggleMobileFullscreen);
  elements.mobileRoleLabel.addEventListener("click", handleRoleToggle);
  elements.mobileComposer.addEventListener("submit", (event) => {
    event.preventDefault();
    commitCurrentDraft(elements.mobileDraft);
  });

  elements.desktopMessages.addEventListener("click", handleMessageAction);
  elements.mobileMessages.addEventListener("click", handleMessageAction);

  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", importJson);
  elements.exportJsonButton.addEventListener("click", exportJson);
  elements.exportTextButton.addEventListener("click", exportText);
  elements.resetButton.addEventListener("click", resetDialogue);
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
