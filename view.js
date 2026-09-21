(() => {
function collectElements(root) {
  return {
    notice: root.querySelector("#notice"),
    noticeText: root.querySelector("#noticeText"),
    dismissNoticeButton: root.querySelector("#dismissNoticeButton"),
    modeButtons: [...root.querySelectorAll(".mode-button")],
    importButton: root.querySelector("#importButton"),
    importInput: root.querySelector("#importInput"),
    settingsMenu: root.querySelector("#settingsMenu"),
    fontSelect: root.querySelector("#fontSelect"),
    exportJsonButton: root.querySelector("#exportJsonButton"),
    exportTextButton: root.querySelector("#exportTextButton"),
    resetButton: root.querySelector("#resetButton"),
    loadExampleButton: root.querySelector("#loadExampleButton"),
    toolSpecificationExample: root.querySelector("#toolSpecificationExample"),
    saveStatus: root.querySelector("#saveStatus"),
    messageCount: root.querySelector("#messageCount"),
    desktopView: root.querySelector("#desktopView"),
    desktopMessages: root.querySelector("#desktopMessages"),
    desktopEmpty: root.querySelector("#desktopEmpty"),
    desktopComposer: root.querySelector("#desktopComposer"),
    desktopDraft: root.querySelector("#desktopDraft"),
    desktopHintAlternate: root.querySelector("#desktopHintAlternate"),
    desktopHintPreserve: root.querySelector("#desktopHintPreserve"),
    desktopRoleLabel: root.querySelector("#desktopRoleLabel"),
    dialogueStartedAt: root.querySelector("#dialogueStartedAt"),
    mobileView: root.querySelector("#mobileView"),
    mobileFeed: root.querySelector("#mobileFeed"),
    mobileMessages: root.querySelector("#mobileMessages"),
    mobileEmpty: root.querySelector("#mobileEmpty"),
    mobileComposer: root.querySelector("#mobileComposer"),
    mobileDraft: root.querySelector("#mobileDraft"),
    mobileFullscreenButton: root.querySelector("#mobileFullscreenButton"),
    mobileRoleLabel: root.querySelector("#mobileRoleLabel"),
    toast: root.querySelector("#toast"),
    liveRegion: root.querySelector("#liveRegion"),
  };
}

function roleLabel(role) {
  return role === "self" ? "自分" : "相手";
}

function formatDialogueStartedAt(value) {
  const date = new Date(value);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日（${weekday}）　${date.getHours()} 時 ${minute} 分`;
}

function renderRoleButton(button, role, { compact = false } = {}) {
  const label = roleLabel(role);
  const alternateLabel = roleLabel(role === "self" ? "other" : "self");
  button.textContent = compact ? `次は${label}` : `次は ${label}`;
  button.setAttribute(
    "aria-label",
    `次の話者は${label}です。クリックすると${alternateLabel}に切り替わります。`,
  );
  button.title = `クリックで「次は${alternateLabel}」に切り替え`;
}

function renderDesktopComposer({ composer, roleButton }, role) {
  renderRoleButton(roleButton, role);
  composer.dataset.role = role;
}

function renderMobileComposer({ composer, draftInput, roleButton }, role) {
  const label = roleLabel(role);
  renderRoleButton(roleButton, role, { compact: true });
  draftInput.placeholder = `${label}として書く`;
  composer.dataset.role = role;
}

function autoGrow(textarea) {
  textarea.style.height = "0px";
  const maximum = textarea.id === "mobileDraft" ? 132 : 240;
  textarea.style.height = `${Math.min(textarea.scrollHeight, maximum)}px`;
}

function createDesktopMessage(message, index, root = globalThis.document) {
  const article = root.createElement("article");
  article.className = `desktop-message desktop-message--${message.role}`;
  article.dataset.messageId = message.id;
  article.setAttribute("aria-label", `${roleLabel(message.role)}の発言 ${index + 1}`);

  const number = root.createElement("span");
  number.className = "desktop-message__number";
  number.textContent = String(index + 1).padStart(2, "0");
  number.setAttribute("aria-hidden", "true");

  const content = root.createElement("p");
  content.className = "desktop-message__content";
  content.append(root.createTextNode("「"));
  const text = root.createElement("span");
  text.className = "desktop-message__text";
  text.dataset.messageId = message.id;
  text.contentEditable = "plaintext-only";
  text.spellcheck = true;
  text.setAttribute("role", "textbox");
  text.setAttribute("aria-multiline", "false");
  text.setAttribute("aria-label", `${roleLabel(message.role)}の発言本文`);
  text.setAttribute("aria-describedby", "desktopHint");
  text.textContent = message.text;
  content.append(text, root.createTextNode("」"));

  article.append(number, content);
  return article;
}

function createMobileMessage(message, index, root = globalThis.document) {
  const article = root.createElement("article");
  article.className = `mobile-message mobile-message--${message.role}`;
  article.dataset.messageId = message.id;
  article.setAttribute("aria-label", `${roleLabel(message.role)}の発言 ${index + 1}`);

  const bubble = root.createElement("div");
  bubble.className = "mobile-message__bubble";

  const speaker = root.createElement("span");
  speaker.className = "visually-hidden";
  speaker.textContent = `${roleLabel(message.role)}：`;

  const content = root.createElement("p");
  content.className = "mobile-message__content";
  content.textContent = message.text;

  bubble.append(speaker, content);
  article.append(bubble);
  return article;
}

globalThis.MyPolyphonyView = Object.freeze({
  autoGrow,
  collectElements,
  createDesktopMessage,
  createMobileMessage,
  formatDialogueStartedAt,
  renderDesktopComposer,
  renderMobileComposer,
  roleLabel,
});
})();
