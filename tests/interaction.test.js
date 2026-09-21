import test from "node:test";
import assert from "node:assert/strict";

import "../model.js";
import "../interaction.js";

const {
  ROLE_OTHER,
  ROLE_SELF,
  commitDraft,
  createInitialState,
  setNextRole,
  updateDraft,
} = globalThis.MyPolyphonyModel;
const {
  ALTERNATING_INTERACTION_POLICY,
  COMMAND_COMMIT,
  COMMAND_COMMIT_PRESERVE_ROLE,
  COMMAND_NONE,
  COMMAND_SWITCH_ROLE,
  DIALOGUE_ENTER_INTERACTION_POLICY,
  MANUAL_SWITCH_INTERACTION_POLICY,
  SUBMIT_SHORTCUT_SHIFT_ENTER,
  desktopCommandForKey,
  globalCommandForKey,
  mobileCommandForKey,
  roleAfterCommit,
  roleAfterDelete,
  roleAfterImport,
} = globalThis.MyPolyphonyInteraction;

function keyEvent(key, overrides = {}) {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    defaultPrevented: false,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    ...overrides,
  };
}

test("発言後の話者は対話モデルではなく操作方針が決める", () => {
  assert.equal(
    roleAfterCommit(ROLE_SELF, ALTERNATING_INTERACTION_POLICY),
    ROLE_OTHER,
  );
  assert.equal(
    roleAfterCommit(ROLE_SELF, MANUAL_SWITCH_INTERACTION_POLICY),
    ROLE_SELF,
  );
  assert.equal(
    roleAfterCommit(
      ROLE_SELF,
      DIALOGUE_ENTER_INTERACTION_POLICY,
      COMMAND_COMMIT_PRESERVE_ROLE,
    ),
    ROLE_SELF,
  );
});

test("同じ対話モデルに異なる発言後方針を適用できる", () => {
  const commitWithPolicy = (state, text, id, policy) => {
    const withDraft = updateDraft(state, text);
    const committedRole = withDraft.nextRole;
    const committed = commitDraft(withDraft, () => id);
    return setNextRole(committed, roleAfterCommit(committedRole, policy));
  };

  let alternating = createInitialState(new Date("2026-08-07T00:00:00.000Z"));
  alternating = commitWithPolicy(
    alternating,
    "一つ目",
    "a1",
    ALTERNATING_INTERACTION_POLICY,
  );
  alternating = commitWithPolicy(
    alternating,
    "二つ目",
    "a2",
    ALTERNATING_INTERACTION_POLICY,
  );

  let preserving = createInitialState(new Date("2026-08-07T00:00:00.000Z"));
  preserving = commitWithPolicy(
    preserving,
    "一つ目",
    "p1",
    MANUAL_SWITCH_INTERACTION_POLICY,
  );
  preserving = commitWithPolicy(
    preserving,
    "二つ目",
    "p2",
    MANUAL_SWITCH_INTERACTION_POLICY,
  );

  assert.deepEqual(alternating.messages.map(({ role }) => role), [ROLE_SELF, ROLE_OTHER]);
  assert.deepEqual(preserving.messages.map(({ role }) => role), [ROLE_SELF, ROLE_SELF]);
});

test("削除後と読み込み後の話者も操作方針ごとに決められる", () => {
  const messages = [{ id: "m1", role: ROLE_SELF, text: "発言" }];

  assert.equal(
    roleAfterDelete(messages, ROLE_SELF, ALTERNATING_INTERACTION_POLICY),
    ROLE_OTHER,
  );
  assert.equal(
    roleAfterDelete(messages, ROLE_OTHER, MANUAL_SWITCH_INTERACTION_POLICY),
    ROLE_OTHER,
  );
  assert.equal(
    roleAfterImport(messages, ALTERNATING_INTERACTION_POLICY),
    ROLE_OTHER,
  );
  assert.equal(
    roleAfterImport(messages, MANUAL_SWITCH_INTERACTION_POLICY),
    ROLE_SELF,
  );
});

test("従来方針はEnterで確定し、Ctrl+Alt+Mで話者を切り替える", () => {
  assert.equal(
    desktopCommandForKey(keyEvent("Enter"), "発言", ALTERNATING_INTERACTION_POLICY),
    COMMAND_COMMIT,
  );
  assert.equal(
    desktopCommandForKey(
      keyEvent("Enter", { shiftKey: true }),
      "発言",
      ALTERNATING_INTERACTION_POLICY,
    ),
    COMMAND_NONE,
  );
  assert.equal(
    globalCommandForKey(
      keyEvent("m", { ctrlKey: true, altKey: true }),
      { policy: ALTERNATING_INTERACTION_POLICY },
    ),
    COMMAND_SWITCH_ROLE,
  );
  assert.equal(
    globalCommandForKey(
      keyEvent("m", { ctrlKey: true, altKey: true }),
      { policy: ALTERNATING_INTERACTION_POLICY, editorOpen: true },
    ),
    COMMAND_NONE,
  );
  assert.equal(
    globalCommandForKey(
      keyEvent("m", { ctrlKey: true, altKey: true, isComposing: true }),
      { policy: ALTERNATING_INTERACTION_POLICY },
    ),
    COMMAND_NONE,
  );
});

test("手動切替方針は空の下書きで押されたTabだけを話者交代として扱う", () => {
  assert.equal(
    desktopCommandForKey(keyEvent("Tab"), "", MANUAL_SWITCH_INTERACTION_POLICY),
    COMMAND_SWITCH_ROLE,
  );
  assert.equal(
    desktopCommandForKey(keyEvent("Tab"), "  \n", MANUAL_SWITCH_INTERACTION_POLICY),
    COMMAND_SWITCH_ROLE,
  );
  assert.equal(
    desktopCommandForKey(keyEvent("Tab"), "書きかけ", MANUAL_SWITCH_INTERACTION_POLICY),
    COMMAND_NONE,
  );
  assert.equal(
    desktopCommandForKey(
      keyEvent("Tab", { isComposing: true }),
      "",
      MANUAL_SWITCH_INTERACTION_POLICY,
    ),
    COMMAND_NONE,
  );
});

test("対話入力方針はEnter系で話者交代と話者継続を使い分ける", () => {
  assert.equal(
    desktopCommandForKey(
      keyEvent("Enter"),
      "発言",
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_COMMIT,
  );
  assert.equal(
    desktopCommandForKey(
      keyEvent("Enter", { ctrlKey: true }),
      "発言",
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_COMMIT,
  );
  assert.equal(
    desktopCommandForKey(
      keyEvent("Enter", { metaKey: true }),
      "発言",
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_COMMIT,
  );
  assert.equal(
    desktopCommandForKey(
      keyEvent("Enter", { shiftKey: true }),
      "発言",
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_COMMIT_PRESERVE_ROLE,
  );
  assert.equal(
    desktopCommandForKey(
      keyEvent("Enter", { ctrlKey: true, shiftKey: true }),
      "発言",
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_NONE,
  );
  assert.equal(
    desktopCommandForKey(
      keyEvent("Enter", { isComposing: true }),
      "発言",
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_NONE,
  );
});

test("対話入力方針は下書きの有無にかかわらずTabで話者を切り替える", () => {
  assert.equal(
    desktopCommandForKey(
      keyEvent("Tab"),
      "書きかけ",
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_SWITCH_ROLE,
  );
  assert.equal(
    desktopCommandForKey(
      keyEvent("Tab"),
      "",
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_SWITCH_ROLE,
  );
  assert.equal(
    mobileCommandForKey(
      keyEvent("Tab"),
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_SWITCH_ROLE,
  );
});

test("チャット表示もPC表示と同じEnter系の話者規則を使う", () => {
  assert.equal(
    mobileCommandForKey(keyEvent("Enter"), DIALOGUE_ENTER_INTERACTION_POLICY),
    COMMAND_COMMIT,
  );
  assert.equal(
    mobileCommandForKey(
      keyEvent("Enter", { ctrlKey: true }),
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_COMMIT,
  );
  assert.equal(
    mobileCommandForKey(
      keyEvent("Enter", { shiftKey: true }),
      DIALOGUE_ENTER_INTERACTION_POLICY,
    ),
    COMMAND_COMMIT_PRESERVE_ROLE,
  );
});

test("確定キーは方針としてEnterとShift+Enterを交換できる", () => {
  const shiftEnterPolicy = {
    ...MANUAL_SWITCH_INTERACTION_POLICY,
    desktopSubmitShortcut: SUBMIT_SHORTCUT_SHIFT_ENTER,
  };

  assert.equal(
    desktopCommandForKey(keyEvent("Enter"), "発言", shiftEnterPolicy),
    COMMAND_NONE,
  );
  assert.equal(
    desktopCommandForKey(
      keyEvent("Enter", { shiftKey: true }),
      "発言",
      shiftEnterPolicy,
    ),
    COMMAND_COMMIT,
  );
});

test("スマートフォン方針は修飾キー付きEnterだけを確定として扱う", () => {
  assert.equal(
    mobileCommandForKey(
      keyEvent("Enter", { ctrlKey: true }),
      ALTERNATING_INTERACTION_POLICY,
    ),
    COMMAND_COMMIT,
  );
  assert.equal(
    mobileCommandForKey(keyEvent("Enter"), ALTERNATING_INTERACTION_POLICY),
    COMMAND_NONE,
  );
  assert.equal(
    mobileCommandForKey(
      keyEvent("Enter", { metaKey: true, isComposing: true }),
      ALTERNATING_INTERACTION_POLICY,
    ),
    COMMAND_NONE,
  );
});
