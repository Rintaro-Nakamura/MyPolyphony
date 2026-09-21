import test from "node:test";
import assert from "node:assert/strict";

import "../model.js";
import "../interaction.js";
import "../editors.js";

const {
  ALTERNATING_INTERACTION_POLICY,
  COMMAND_COMMIT,
  COMMAND_COMMIT_PRESERVE_ROLE,
  DIALOGUE_ENTER_INTERACTION_POLICY,
  DIALOGUE_ENTER_PRESERVE_INTERACTION_POLICY,
  MANUAL_SWITCH_INTERACTION_POLICY,
} = globalThis.MyPolyphonyInteraction;
const { bindDesktopEditor, bindMobileEditor } = globalThis.MyPolyphonyEditors;

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
}

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
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    ...overrides,
  };
}

test("PC版エディタはキー解釈とアプリ操作を接続する", () => {
  const composer = eventTarget();
  const draftInput = eventTarget();
  const roleButton = eventTarget();
  const calls = [];
  let draft = "発言";

  bindDesktopEditor({
    composer,
    draftInput,
    roleButton,
    getDraft: () => draft,
    interactionPolicy: MANUAL_SWITCH_INTERACTION_POLICY,
    onDraftInput: () => calls.push("input"),
    onCommit: (source) => calls.push(["commit", source]),
    onReopenPrevious: (source) => calls.push(["reopen", source]),
    onSwitchRole: () => calls.push("switch"),
  });

  const enter = keyEvent("Enter");
  draftInput.listeners.get("keydown")(enter);
  assert.equal(enter.prevented, true);
  assert.deepEqual(calls.at(-1), ["commit", draftInput]);

  draft = "";
  const tab = keyEvent("Tab");
  draftInput.listeners.get("keydown")(tab);
  assert.equal(tab.prevented, true);
  assert.equal(calls.at(-1), "switch");

  roleButton.listeners.get("click")();
  assert.equal(calls.at(-1), "switch");

  const backspace = keyEvent("Backspace");
  draftInput.listeners.get("keydown")(backspace);
  assert.equal(backspace.prevented, true);
  assert.deepEqual(calls.at(-1), ["reopen", draftInput]);
});

test("PC版とスマートフォン版はそれぞれの確定キーを解釈する", () => {
  const composer = eventTarget();
  const draftInput = eventTarget();
  const roleButton = eventTarget();
  let commits = 0;

  bindMobileEditor({
    composer,
    draftInput,
    roleButton,
    interactionPolicy: ALTERNATING_INTERACTION_POLICY,
    onDraftInput: () => {},
    onCommit: () => {
      commits += 1;
    },
    onSwitchRole: () => {},
  });

  const plainEnter = keyEvent("Enter");
  draftInput.listeners.get("keydown")(plainEnter);
  assert.equal(plainEnter.prevented, false);
  assert.equal(commits, 0);

  const controlEnter = keyEvent("Enter", { ctrlKey: true });
  draftInput.listeners.get("keydown")(controlEnter);
  assert.equal(controlEnter.prevented, true);
  assert.equal(commits, 1);
});

test("対話入力方針の命令を確定処理と話者切替へ渡す", () => {
  const composer = eventTarget();
  const draftInput = eventTarget();
  const roleButton = eventTarget();
  const calls = [];

  bindDesktopEditor({
    composer,
    draftInput,
    roleButton,
    getDraft: () => "書きかけ",
    interactionPolicy: DIALOGUE_ENTER_INTERACTION_POLICY,
    onDraftInput: () => {},
    onCommit: (source, command) => calls.push(["commit", source, command]),
    onReopenPrevious: () => calls.push(["reopen"]),
    onSwitchRole: (options) => calls.push(["switch", options]),
  });

  const plainEnter = keyEvent("Enter");
  draftInput.listeners.get("keydown")(plainEnter);
  assert.equal(plainEnter.prevented, true);
  assert.deepEqual(calls.at(-1), ["commit", draftInput, COMMAND_COMMIT]);

  const shiftEnter = keyEvent("Enter", { shiftKey: true });
  draftInput.listeners.get("keydown")(shiftEnter);
  assert.equal(shiftEnter.prevented, true);
  assert.deepEqual(calls.at(-1), [
    "commit",
    draftInput,
    COMMAND_COMMIT_PRESERVE_ROLE,
  ]);

  const tab = keyEvent("Tab");
  draftInput.listeners.get("keydown")(tab);
  assert.equal(tab.prevented, true);
  assert.deepEqual(calls.at(-1), [
    "switch",
    { source: draftInput, preserveSelection: true },
  ]);

  roleButton.listeners.get("click")();
  assert.deepEqual(calls.at(-1), [
    "switch",
    { source: draftInput, preserveSelection: false },
  ]);

  composer.listeners.get("submit")(keyEvent("submit"));
  assert.deepEqual(calls.at(-1), ["commit", draftInput, COMMAND_COMMIT]);
});

test("PC版エディタは接続後に変更されたEnterの方針を使用する", () => {
  const composer = eventTarget();
  const draftInput = eventTarget();
  const roleButton = eventTarget();
  const calls = [];
  let interactionPolicy = DIALOGUE_ENTER_INTERACTION_POLICY;

  bindDesktopEditor({
    composer,
    draftInput,
    roleButton,
    getDraft: () => "書きかけ",
    getInteractionPolicy: () => interactionPolicy,
    onDraftInput: () => {},
    onCommit: (source, command) => calls.push([source, command]),
    onReopenPrevious: () => {},
    onSwitchRole: () => {},
  });

  draftInput.listeners.get("keydown")(keyEvent("Enter"));
  assert.deepEqual(calls.at(-1), [draftInput, COMMAND_COMMIT]);

  interactionPolicy = DIALOGUE_ENTER_PRESERVE_INTERACTION_POLICY;
  draftInput.listeners.get("keydown")(keyEvent("Enter"));
  assert.deepEqual(calls.at(-1), [draftInput, COMMAND_COMMIT_PRESERVE_ROLE]);
});
