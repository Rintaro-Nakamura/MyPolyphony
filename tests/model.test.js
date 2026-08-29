import test from "node:test";
import assert from "node:assert/strict";

import "../model.js";

const {
  ROLE_OTHER,
  ROLE_SELF,
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

const ids = (...values) => {
  const queue = [...values];
  return () => queue.shift();
};

test("発言を確定するたびに話者が交替する", () => {
  let state = createInitialState();
  state = updateDraft(state, "最初の声");
  state = commitDraft(state, ids("m1"));
  state = updateDraft(state, "もう一つの声");
  state = commitDraft(state, ids("m2"));

  assert.deepEqual(
    state.messages.map(({ role, text }) => ({ role, text })),
    [
      { role: ROLE_SELF, text: "最初の声" },
      { role: ROLE_OTHER, text: "もう一つの声" },
    ],
  );
  assert.equal(state.nextRole, ROLE_SELF);
  assert.equal(state.draft, "");
});

test("次の話者を手動変更しても、発言後は自動で交替する", () => {
  let state = createInitialState();
  state = updateDraft(state, "最初の自分の声");
  state = commitDraft(state, ids("m1"));
  assert.equal(state.nextRole, ROLE_OTHER);

  state = toggleNextRole(state);
  assert.equal(state.nextRole, ROLE_SELF);

  state = updateDraft(state, "続けて自分の声");
  state = commitDraft(state, ids("m2"));
  assert.deepEqual(state.messages.map(({ role }) => role), [ROLE_SELF, ROLE_SELF]);
  assert.equal(state.nextRole, ROLE_OTHER);
});

test("編集は話者を変えず、削除後の次話者は最後の発言から決まる", () => {
  const state = {
    messages: [
      { id: "m1", role: ROLE_SELF, text: "自分の声" },
      { id: "m2", role: ROLE_OTHER, text: "相手の声" },
      { id: "m3", role: ROLE_SELF, text: "続き" },
    ],
    draft: "途中",
    nextRole: ROLE_OTHER,
  };

  const edited = editMessage(state, "m2", "編集した相手の声");
  assert.equal(edited.messages[1].role, ROLE_OTHER);
  assert.equal(edited.messages[1].text, "編集した相手の声");

  const deleted = deleteMessage(edited, "m2");
  assert.deepEqual(deleted.messages.map(({ id }) => id), ["m1", "m3"]);
  assert.equal(deleted.nextRole, ROLE_OTHER);
  assert.equal(deleted.draft, "途中");
});

test("端末内保存は発言、下書き、次話者、開始日時を復元する", () => {
  const state = {
    messages: [{ id: "m1", role: ROLE_SELF, text: "保存する\r\n本文" }],
    draft: "入力\r途中",
    nextRole: ROLE_OTHER,
    startedAt: "2026-08-07T12:34:00.000Z",
  };

  const serialized = serializeStoredState(state);
  const storedData = JSON.parse(serialized);
  const restored = parseStoredState(serialized);

  assert.deepEqual(Object.keys(storedData).sort(), [
    "draft",
    "messages",
    "nextRole",
    "startedAt",
    "version",
  ]);
  assert.equal("font" in storedData, false);
  assert.deepEqual(restored, {
    messages: [{ id: "m1", role: ROLE_SELF, text: "保存する\n本文" }],
    draft: "入力\n途中",
    nextRole: ROLE_OTHER,
    startedAt: "2026-08-07T12:34:00.000Z",
  });
});

test("開始日時は発言後も維持され、旧保存データには移行日時を補う", () => {
  const startedAt = new Date("2026-08-07T01:02:00.000Z");
  let state = createInitialState(startedAt);
  state = updateDraft(state, "最初の発言");
  state = commitDraft(state, ids("m1"));
  assert.equal(state.startedAt, startedAt.toISOString());

  const legacy = JSON.stringify({
    version: 1,
    messages: state.messages,
    draft: "",
    nextRole: state.nextRole,
  });
  const migratedAt = new Date("2026-08-07T03:04:00.000Z");
  assert.equal(parseStoredState(legacy, migratedAt).startedAt, migratedAt.toISOString());
});

test("空の保存状態だけ開始日時を現在時刻へ更新する", () => {
  const previousStartedAt = "2026-08-06T01:02:00.000Z";
  const refreshedAt = new Date("2026-08-07T03:04:00.000Z");
  const emptyState = {
    messages: [],
    draft: "",
    nextRole: ROLE_OTHER,
    startedAt: previousStartedAt,
  };

  const refreshed = refreshStartedAtIfEmpty(emptyState, refreshedAt);
  assert.notEqual(refreshed, emptyState);
  assert.equal(refreshed.startedAt, refreshedAt.toISOString());
  assert.equal(refreshed.nextRole, ROLE_OTHER);

  const withMessage = {
    ...emptyState,
    messages: [{ id: "m1", role: ROLE_SELF, text: "続きの発言" }],
  };
  assert.equal(refreshStartedAtIfEmpty(withMessage, refreshedAt), withMessage);
  assert.equal(withMessage.startedAt, previousStartedAt);

  const withDraft = { ...emptyState, draft: "入力途中" };
  assert.equal(refreshStartedAtIfEmpty(withDraft, refreshedAt), withDraft);
  assert.equal(withDraft.startedAt, previousStartedAt);
});

test("JSONは話者、順序、改行を保って往復する", () => {
  const messages = [
    { id: "m1", role: ROLE_SELF, text: "一行目\n二行目" },
    { id: "m2", role: ROLE_OTHER, text: "返事" },
  ];
  const json = serializeDialogue(messages, new Date("2026-08-06T12:00:00.000Z"));
  const exported = JSON.parse(json);
  const startedAt = new Date("2026-08-07T08:09:00.000Z");
  const restored = parseDialogue(json, ids("r1", "r2"), startedAt);

  assert.deepEqual(Object.keys(exported).sort(), ["exportedAt", "format", "messages", "version"]);
  assert.equal("font" in exported, false);

  assert.deepEqual(
    restored.messages,
    [
      { id: "r1", role: ROLE_SELF, text: "一行目\n二行目" },
      { id: "r2", role: ROLE_OTHER, text: "返事" },
    ],
  );
  assert.equal(restored.nextRole, ROLE_SELF);
  assert.equal(restored.startedAt, startedAt.toISOString());
});

test("壊れたJSONと未対応バージョンを拒否する", () => {
  assert.throws(() => parseDialogue("{broken"), SyntaxError);
  assert.throws(
    () =>
      parseDialogue(
        JSON.stringify({
          format: "my-polyphony-dialogue",
          version: 2,
          exportedAt: "2026-08-06T12:00:00.000Z",
          messages: [],
        }),
      ),
    /未対応/,
  );
});

test("TXTは話者ラベルと本文中の改行を保持する", () => {
  const text = serializePlainText([
    { id: "m1", role: ROLE_SELF, text: "一行目\n二行目" },
    { id: "m2", role: ROLE_OTHER, text: "応答" },
  ]);

  assert.equal(text, "自分：\n「一行目\n二行目」\n\n相手：\n「応答」");
});

test("ファイル名はローカル日時の固定形式になる", () => {
  const date = new Date(2026, 7, 6, 21, 4, 9);
  assert.equal(createExportBasename(date), "my-polyphony-20260806-210409");
});
