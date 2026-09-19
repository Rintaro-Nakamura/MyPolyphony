(() => {
const ROLE_SELF = "self";
const ROLE_OTHER = "other";
const ROLES = Object.freeze([ROLE_SELF, ROLE_OTHER]);

const EXPORT_FORMAT = "my-polyphony-dialogue";
const EXPORT_VERSION = 1;
const STORAGE_VERSION = 1;

const STORAGE_KEY = "my-polyphony:v1:current";
const MODE_STORAGE_KEY = "my-polyphony:v1:mode";

function isRole(value) {
  return ROLES.includes(value);
}

function oppositeRole(role) {
  if (!isRole(role)) {
    throw new TypeError("話者が正しくありません。");
  }

  return role === ROLE_SELF ? ROLE_OTHER : ROLE_SELF;
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeStartedAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("対話の開始日時が正しくありません。");
  }

  return date.toISOString();
}

function createInitialState(startedAt = new Date()) {
  return {
    messages: [],
    draft: "",
    nextRole: ROLE_SELF,
    startedAt: normalizeStartedAt(startedAt),
  };
}

function refreshStartedAtIfEmpty(state, startedAt = new Date()) {
  if (!Array.isArray(state?.messages) || typeof state.draft !== "string") {
    throw new TypeError("対話篇の状態が正しくありません。");
  }

  if (state.messages.length > 0 || state.draft.trim().length > 0) {
    return state;
  }

  return {
    ...state,
    startedAt: normalizeStartedAt(startedAt),
  };
}

function nextRoleFromMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return ROLE_SELF;
  }

  return oppositeRole(messages.at(-1).role);
}

function normalizeText(text) {
  return text.replace(/\r\n?/g, "\n");
}

function assertNonEmptyText(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new TypeError("発言本文を入力してください。");
  }
}

function assertMessage(message, { requireId = false } = {}) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new TypeError("発言データが正しくありません。");
  }

  if (!isRole(message.role)) {
    throw new TypeError("発言の話者が正しくありません。");
  }

  assertNonEmptyText(message.text);

  if (requireId && (typeof message.id !== "string" || message.id.length === 0)) {
    throw new TypeError("発言IDが正しくありません。");
  }
}

function commitDraft(state, idFactory = createId) {
  assertNonEmptyText(state.draft);

  const message = {
    id: idFactory(),
    role: state.nextRole,
    text: normalizeText(state.draft),
  };

  return {
    ...state,
    messages: [...state.messages, message],
    draft: "",
  };
}

function updateDraft(state, draft) {
  if (typeof draft !== "string") {
    throw new TypeError("下書きが正しくありません。");
  }

  return {
    ...state,
    draft: normalizeText(draft),
  };
}

function toggleNextRole(state) {
  if (!state || typeof state !== "object" || !isRole(state.nextRole)) {
    throw new TypeError("次の話者が正しくありません。");
  }

  return {
    ...state,
    nextRole: oppositeRole(state.nextRole),
  };
}

function setNextRole(state, nextRole) {
  if (!state || typeof state !== "object" || !isRole(nextRole)) {
    throw new TypeError("次の話者が正しくありません。");
  }

  return {
    ...state,
    nextRole,
  };
}

function editMessage(state, id, text) {
  assertNonEmptyText(text);
  let found = false;

  const messages = state.messages.map((message) => {
    if (message.id !== id) {
      return message;
    }

    found = true;
    return {
      ...message,
      text: normalizeText(text),
    };
  });

  if (!found) {
    throw new RangeError("編集する発言が見つかりません。");
  }

  return {
    ...state,
    messages,
  };
}

function deleteMessage(state, id) {
  const messages = state.messages.filter((message) => message.id !== id);

  if (messages.length === state.messages.length) {
    throw new RangeError("削除する発言が見つかりません。");
  }

  return {
    ...state,
    messages,
  };
}

function serializeStoredState(state) {
  state.messages.forEach((message) => assertMessage(message, { requireId: true }));

  if (typeof state.draft !== "string" || !isRole(state.nextRole)) {
    throw new TypeError("保存する対話篇の状態が正しくありません。");
  }

  const startedAt = normalizeStartedAt(state.startedAt);

  return JSON.stringify({
    version: STORAGE_VERSION,
    messages: state.messages,
    draft: normalizeText(state.draft),
    nextRole: state.nextRole,
    startedAt,
  });
}

function parseStoredState(source, migratedStartedAt = new Date()) {
  const data = JSON.parse(source);

  if (!data || typeof data !== "object" || data.version !== STORAGE_VERSION) {
    throw new TypeError("保存データのバージョンが正しくありません。");
  }

  if (!Array.isArray(data.messages)) {
    throw new TypeError("保存データに発言一覧がありません。");
  }

  data.messages.forEach((message) => assertMessage(message, { requireId: true }));

  if (typeof data.draft !== "string" || !isRole(data.nextRole)) {
    throw new TypeError("保存データの下書き状態が正しくありません。");
  }

  const startedAt = normalizeStartedAt(
    data.startedAt === undefined ? migratedStartedAt : data.startedAt,
  );

  return {
    messages: data.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: normalizeText(message.text),
    })),
    draft: normalizeText(data.draft),
    nextRole: data.nextRole,
    startedAt,
  };
}

function createDialogueExport(messages, exportedAt = new Date()) {
  messages.forEach((message) => assertMessage(message));

  const date = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("書き出し日時が正しくありません。");
  }

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: date.toISOString(),
    messages: messages.map(({ role, text }) => ({
      role,
      text: normalizeText(text),
    })),
  };
}

function serializeDialogue(messages, exportedAt = new Date()) {
  return `${JSON.stringify(createDialogueExport(messages, exportedAt), null, 2)}\n`;
}

function parseDialogue(
  source,
  idFactory = createId,
  startedAt = new Date(),
  nextRoleResolver = nextRoleFromMessages,
) {
  if (typeof nextRoleResolver !== "function") {
    throw new TypeError("読み込み後の話者決定方法が正しくありません。");
  }

  const data = JSON.parse(source);

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("JSONの内容が対話篇ではありません。");
  }

  if (data.format !== EXPORT_FORMAT) {
    throw new TypeError("My PolyphonyのJSONファイルではありません。");
  }

  if (data.version !== EXPORT_VERSION) {
    throw new TypeError(`未対応のJSONバージョンです（version: ${String(data.version)}）。`);
  }

  if (typeof data.exportedAt !== "string" || Number.isNaN(Date.parse(data.exportedAt))) {
    throw new TypeError("JSONの書き出し日時が正しくありません。");
  }

  if (!Array.isArray(data.messages)) {
    throw new TypeError("JSONに発言一覧がありません。");
  }

  data.messages.forEach((message) => assertMessage(message));

  const messages = data.messages.map((message) => ({
    id: idFactory(),
    role: message.role,
    text: normalizeText(message.text),
  }));
  const nextRole = nextRoleResolver(messages);
  if (!isRole(nextRole)) {
    throw new TypeError("読み込み後の話者が正しくありません。");
  }

  return {
    messages,
    draft: "",
    nextRole,
    startedAt: normalizeStartedAt(startedAt),
  };
}

function serializePlainText(messages) {
  messages.forEach((message) => assertMessage(message));

  return messages
    .map((message) => {
      const label = message.role === ROLE_SELF ? "自分" : "相手";
      return `${label}：\n「${normalizeText(message.text)}」`;
    })
    .join("\n\n");
}

function createExportBasename(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("ファイル日時が正しくありません。");
  }

  const pad = (value) => String(value).padStart(2, "0");
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");

  return `my-polyphony-${stamp}`;
}

globalThis.MyPolyphonyModel = Object.freeze({
  ROLE_SELF,
  ROLE_OTHER,
  ROLES,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  STORAGE_VERSION,
  STORAGE_KEY,
  MODE_STORAGE_KEY,
  isRole,
  oppositeRole,
  createId,
  createInitialState,
  refreshStartedAtIfEmpty,
  nextRoleFromMessages,
  commitDraft,
  updateDraft,
  toggleNextRole,
  setNextRole,
  editMessage,
  deleteMessage,
  serializeStoredState,
  parseStoredState,
  createDialogueExport,
  serializeDialogue,
  parseDialogue,
  serializePlainText,
  createExportBasename,
});
})();
