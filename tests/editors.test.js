import test from "node:test";
import assert from "node:assert/strict";

import "../model.js";
import "../interaction.js";
import "../editors.js";

const {
  ALTERNATING_INTERACTION_POLICY,
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
