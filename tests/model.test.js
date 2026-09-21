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
  mergeMessageBackward,
  mergeMessageForward,
  parseDialogue,
  parseStoredState,
  pullLastMessageIntoDraft,
  refreshStartedAtIfEmpty,
  serializeDialogue,
  serializePlainText,
  serializeStoredState,
  setNextRole,
  setMessageRole,
  splitMessage,
  toggleNextRole,
  updateDraft,
} = globalThis.MyPolyphonyModel;

const ids = (...values) => {
  const queue = [...values];
  return () => queue.shift();
};

test("発言の確定は選択中の話者を記録し、話者選択そのものは維持する", () => {
  let state = createInitialState();
  state = updateDraft(state, "最初の声");
  state = commitDraft(state, ids("m1"));
  state = updateDraft(state, "もう一つの声");
  state = commitDraft(state, ids("m2"));

  assert.deepEqual(
    state.messages.map(({ role, text }) => ({ role, text })),
    [
      { role: ROLE_SELF, text: "最初の声" },
      { role: ROLE_SELF, text: "もう一つの声" },
    ],
  );
  assert.equal(state.nextRole, ROLE_SELF);
  assert.equal(state.draft, "");
});

test("話者選択は発言確定から独立して変更できる", () => {
  let state = createInitialState();
  state = updateDraft(state, "最初の自分の声");
  state = commitDraft(state, ids("m1"));
  assert.equal(state.nextRole, ROLE_SELF);

  state = toggleNextRole(state);
  assert.equal(state.nextRole, ROLE_OTHER);

  state = updateDraft(state, "相手の声");
  state = commitDraft(state, ids("m2"));
  assert.deepEqual(state.messages.map(({ role }) => role), [ROLE_SELF, ROLE_OTHER]);
  assert.equal(state.nextRole, ROLE_OTHER);

  state = setNextRole(state, ROLE_SELF);
  assert.equal(state.nextRole, ROLE_SELF);
});

test("編集と削除は現在選択中の話者を変えない", () => {
  const state = {
    messages: [
      { id: "m1", role: ROLE_SELF, text: "自分の声" },
      { id: "m2", role: ROLE_OTHER, text: "相手の声" },
      { id: "m3", role: ROLE_SELF, text: "続き" },
    ],
    draft: "途中",
    nextRole: ROLE_SELF,
  };

  const edited = editMessage(state, "m2", "編集した相手の声");
  assert.equal(edited.messages[1].role, ROLE_OTHER);
  assert.equal(edited.messages[1].text, "編集した相手の声");

  const deleted = deleteMessage(edited, "m2");
  assert.deepEqual(deleted.messages.map(({ id }) => id), ["m1", "m3"]);
  assert.equal(deleted.nextRole, ROLE_SELF);
  assert.equal(deleted.draft, "途中");
});

test("紙面上の発言は空文字まで直接編集できる", () => {
  const state = {
    messages: [{ id: "m1", role: ROLE_SELF, text: "消してよい発言" }],
    draft: "残す下書き",
    nextRole: ROLE_OTHER,
  };

  const edited = editMessage(state, "m1", "");

  assert.equal(edited.messages[0].text, "");
  assert.equal(edited.draft, "残す下書き");
  assert.equal(edited.nextRole, ROLE_OTHER);
  assert.doesNotThrow(() => serializeStoredState({
    ...edited,
    startedAt: "2026-08-07T12:34:00.000Z",
  }));
});

test("発言は選択範囲を境として分かれ、空の括弧も保持する", () => {
  const state = {
    messages: [{ id: "m1", role: ROLE_SELF, text: "あいうえお" }],
    draft: "途中の下書き",
    nextRole: ROLE_SELF,
  };

  const split = splitMessage(state, "m1", 2, 3, ROLE_OTHER, ids("m2"));
  assert.deepEqual(split.messages, [
    { id: "m1", role: ROLE_SELF, text: "あい" },
    { id: "m2", role: ROLE_OTHER, text: "えお" },
  ]);
  assert.equal(split.draft, "途中の下書き");
  assert.equal(split.nextRole, ROLE_SELF);

  const atEnd = splitMessage(split, "m2", 2, 2, ROLE_OTHER, ids("m3"));
  assert.deepEqual(atEnd.messages.at(-1), {
    id: "m3",
    role: ROLE_OTHER,
    text: "",
  });
});

test("発言境界の削除は直前または現在の話者へ本文を統合する", () => {
  const state = {
    messages: [
      { id: "m1", role: ROLE_SELF, text: "現在はさ" },
      { id: "m2", role: ROLE_OTHER, text: "うん" },
      { id: "m3", role: ROLE_SELF, text: "こうなっているじゃん？" },
    ],
    draft: "残す下書き",
    nextRole: ROLE_OTHER,
  };

  const backward = mergeMessageBackward(state, "m3");
  assert.deepEqual(backward.messages.at(-1), {
    id: "m2",
    role: ROLE_OTHER,
    text: "うんこうなっているじゃん？",
  });

  const forward = mergeMessageForward(state, "m1");
  assert.deepEqual(forward.messages[0], {
    id: "m1",
    role: ROLE_SELF,
    text: "現在はさうん",
  });
  assert.equal(forward.draft, "残す下書き");
  assert.equal(forward.nextRole, ROLE_OTHER);
});

test("過去の末尾発言は本文と話者を保ったまま下書きへ戻せる", () => {
  const state = {
    messages: [
      { id: "m1", role: ROLE_SELF, text: "現在はさ" },
      { id: "m2", role: ROLE_OTHER, text: "うん" },
    ],
    draft: "",
    nextRole: ROLE_SELF,
  };

  const reopened = pullLastMessageIntoDraft(state);
  assert.deepEqual(reopened.messages.map(({ id }) => id), ["m1"]);
  assert.equal(reopened.draft, "うん");
  assert.equal(reopened.nextRole, ROLE_OTHER);
});

test("紙面上のTabは対象発言の話者だけを変更する", () => {
  const state = {
    messages: [{ id: "m1", role: ROLE_SELF, text: "発言" }],
    draft: "下書き",
    nextRole: ROLE_SELF,
  };

  const changed = setMessageRole(state, "m1", ROLE_OTHER);
  assert.equal(changed.messages[0].role, ROLE_OTHER);
  assert.equal(changed.draft, "下書き");
  assert.equal(changed.nextRole, ROLE_SELF);
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

test("JSON読み込み後の話者は呼び出し側の方針で決められる", () => {
  const json = serializeDialogue(
    [{ id: "m1", role: ROLE_SELF, text: "読み込む発言" }],
    new Date("2026-08-06T12:00:00.000Z"),
  );
  const restored = parseDialogue(
    json,
    ids("r1"),
    new Date("2026-08-07T08:09:00.000Z"),
    () => ROLE_SELF,
  );

  assert.equal(restored.nextRole, ROLE_SELF);
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
