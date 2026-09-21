(() => {
const {
  ROLE_SELF,
  isRole,
  nextRoleFromMessages,
  oppositeRole,
} = globalThis.MyPolyphonyModel;

const COMMAND_NONE = "none";
const COMMAND_COMMIT = "commit";
const COMMAND_COMMIT_PRESERVE_ROLE = "commit-preserve-role";
const COMMAND_SWITCH_ROLE = "switch-role";
const COMMAND_REOPEN_PREVIOUS = "reopen-previous";

const ROLE_AFTER_COMMIT_ALTERNATE = "alternate";
const ROLE_AFTER_COMMIT_PRESERVE = "preserve";
const ROLE_AFTER_DELETE_FROM_MESSAGES = "from-messages";
const ROLE_AFTER_DELETE_PRESERVE = "preserve";
const ROLE_AFTER_IMPORT_FROM_MESSAGES = "from-messages";
const ROLE_AFTER_IMPORT_INITIAL = "initial";

const SWITCH_SHORTCUT_CTRL_ALT_M = "ctrl-alt-m";
const SWITCH_SHORTCUT_TAB = "tab";
const SWITCH_SHORTCUT_TAB_WHEN_EMPTY = "tab-when-empty";
const SWITCH_SHORTCUT_NONE = "none";

const SUBMIT_SHORTCUT_ENTER = "enter";
const SUBMIT_SHORTCUT_DIALOGUE_ENTER = "dialogue-enter";
const SUBMIT_SHORTCUT_SHIFT_ENTER = "shift-enter";
const SUBMIT_SHORTCUT_MOD_ENTER = "modifier-enter";

const ALTERNATING_INTERACTION_POLICY = Object.freeze({
  roleAfterCommit: ROLE_AFTER_COMMIT_ALTERNATE,
  roleAfterDelete: ROLE_AFTER_DELETE_FROM_MESSAGES,
  roleAfterImport: ROLE_AFTER_IMPORT_FROM_MESSAGES,
  globalSwitchShortcut: SWITCH_SHORTCUT_CTRL_ALT_M,
  desktopSwitchShortcut: SWITCH_SHORTCUT_NONE,
  desktopSubmitShortcut: SUBMIT_SHORTCUT_ENTER,
  mobileSubmitShortcut: SUBMIT_SHORTCUT_MOD_ENTER,
});

const MANUAL_SWITCH_INTERACTION_POLICY = Object.freeze({
  roleAfterCommit: ROLE_AFTER_COMMIT_PRESERVE,
  roleAfterDelete: ROLE_AFTER_DELETE_PRESERVE,
  roleAfterImport: ROLE_AFTER_IMPORT_INITIAL,
  globalSwitchShortcut: SWITCH_SHORTCUT_NONE,
  desktopSwitchShortcut: SWITCH_SHORTCUT_TAB_WHEN_EMPTY,
  desktopSubmitShortcut: SUBMIT_SHORTCUT_ENTER,
  mobileSubmitShortcut: SUBMIT_SHORTCUT_MOD_ENTER,
});

const DIALOGUE_ENTER_INTERACTION_POLICY = Object.freeze({
  roleAfterCommit: ROLE_AFTER_COMMIT_ALTERNATE,
  roleAfterDelete: ROLE_AFTER_DELETE_FROM_MESSAGES,
  roleAfterImport: ROLE_AFTER_IMPORT_FROM_MESSAGES,
  globalSwitchShortcut: SWITCH_SHORTCUT_NONE,
  desktopSwitchShortcut: SWITCH_SHORTCUT_TAB,
  mobileSwitchShortcut: SWITCH_SHORTCUT_TAB,
  desktopSubmitShortcut: SUBMIT_SHORTCUT_DIALOGUE_ENTER,
  mobileSubmitShortcut: SUBMIT_SHORTCUT_DIALOGUE_ENTER,
});

function assertPolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new TypeError("対話操作の方針が正しくありません。");
  }
}

function roleAfterCommit(role, policy, command = COMMAND_COMMIT) {
  assertPolicy(policy);
  if (!isRole(role)) {
    throw new TypeError("発言後の話者を決められません。");
  }

  if (command === COMMAND_COMMIT_PRESERVE_ROLE) {
    return role;
  }
  if (command !== COMMAND_COMMIT) {
    throw new TypeError("発言確定の命令が正しくありません。");
  }

  if (policy.roleAfterCommit === ROLE_AFTER_COMMIT_ALTERNATE) {
    return oppositeRole(role);
  }
  if (policy.roleAfterCommit === ROLE_AFTER_COMMIT_PRESERVE) {
    return role;
  }

  throw new TypeError("発言後の話者方針が正しくありません。");
}

function roleAfterDelete(messages, currentRole, policy) {
  assertPolicy(policy);
  if (!Array.isArray(messages) || !isRole(currentRole)) {
    throw new TypeError("削除後の話者を決められません。");
  }

  if (policy.roleAfterDelete === ROLE_AFTER_DELETE_FROM_MESSAGES) {
    return nextRoleFromMessages(messages);
  }
  if (policy.roleAfterDelete === ROLE_AFTER_DELETE_PRESERVE) {
    return currentRole;
  }

  throw new TypeError("削除後の話者方針が正しくありません。");
}

function roleAfterImport(messages, policy, initialRole = ROLE_SELF) {
  assertPolicy(policy);
  if (!Array.isArray(messages) || !isRole(initialRole)) {
    throw new TypeError("読み込み後の話者を決められません。");
  }

  if (policy.roleAfterImport === ROLE_AFTER_IMPORT_FROM_MESSAGES) {
    return nextRoleFromMessages(messages);
  }
  if (policy.roleAfterImport === ROLE_AFTER_IMPORT_INITIAL) {
    return initialRole;
  }

  throw new TypeError("読み込み後の話者方針が正しくありません。");
}

function shouldIgnoreKeyboardEvent(event) {
  return Boolean(
    event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229,
  );
}

function hasNoModifiers(event) {
  return !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
}

function submitCommandForKey(event, shortcut) {
  if (event.key !== "Enter") {
    return COMMAND_NONE;
  }

  if (shortcut === SUBMIT_SHORTCUT_DIALOGUE_ENTER) {
    if (hasNoModifiers(event)) {
      return COMMAND_COMMIT;
    }
    if (
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      return COMMAND_COMMIT_PRESERVE_ROLE;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      return COMMAND_COMMIT;
    }
    return COMMAND_NONE;
  }
  if (shortcut === SUBMIT_SHORTCUT_ENTER) {
    return !event.shiftKey ? COMMAND_COMMIT : COMMAND_NONE;
  }
  if (shortcut === SUBMIT_SHORTCUT_SHIFT_ENTER) {
    return event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
      ? COMMAND_COMMIT
      : COMMAND_NONE;
  }
  if (shortcut === SUBMIT_SHORTCUT_MOD_ENTER) {
    return (event.ctrlKey || event.metaKey) && !event.altKey
      ? COMMAND_COMMIT
      : COMMAND_NONE;
  }

  return COMMAND_NONE;
}

function globalCommandForKey(event, { policy, editorOpen = false } = {}) {
  assertPolicy(policy);
  if (shouldIgnoreKeyboardEvent(event) || event.repeat || editorOpen) {
    return COMMAND_NONE;
  }

  if (
    policy.globalSwitchShortcut === SWITCH_SHORTCUT_CTRL_ALT_M &&
    event.ctrlKey &&
    event.altKey &&
    !event.shiftKey &&
    !event.metaKey &&
    event.key?.toLowerCase() === "m"
  ) {
    return COMMAND_SWITCH_ROLE;
  }

  return COMMAND_NONE;
}

function desktopCommandForKey(event, draft, policy) {
  assertPolicy(policy);
  if (typeof draft !== "string") {
    throw new TypeError("下書きが正しくありません。");
  }
  if (shouldIgnoreKeyboardEvent(event)) {
    return COMMAND_NONE;
  }

  if (
    event.key === "Backspace" &&
    draft.length === 0 &&
    hasNoModifiers(event)
  ) {
    return COMMAND_REOPEN_PREVIOUS;
  }

  if (
    (policy.desktopSwitchShortcut === SWITCH_SHORTCUT_TAB ||
      (policy.desktopSwitchShortcut === SWITCH_SHORTCUT_TAB_WHEN_EMPTY &&
        draft.trim().length === 0)) &&
    event.key === "Tab" &&
    hasNoModifiers(event) &&
    !event.repeat
  ) {
    return COMMAND_SWITCH_ROLE;
  }

  return submitCommandForKey(event, policy.desktopSubmitShortcut);
}

function mobileCommandForKey(event, policy) {
  assertPolicy(policy);
  if (shouldIgnoreKeyboardEvent(event)) {
    return COMMAND_NONE;
  }

  if (
    policy.mobileSwitchShortcut === SWITCH_SHORTCUT_TAB &&
    event.key === "Tab" &&
    hasNoModifiers(event) &&
    !event.repeat
  ) {
    return COMMAND_SWITCH_ROLE;
  }

  return submitCommandForKey(event, policy.mobileSubmitShortcut);
}

globalThis.MyPolyphonyInteraction = Object.freeze({
  COMMAND_NONE,
  COMMAND_COMMIT,
  COMMAND_COMMIT_PRESERVE_ROLE,
  COMMAND_SWITCH_ROLE,
  COMMAND_REOPEN_PREVIOUS,
  ROLE_AFTER_COMMIT_ALTERNATE,
  ROLE_AFTER_COMMIT_PRESERVE,
  ROLE_AFTER_DELETE_FROM_MESSAGES,
  ROLE_AFTER_DELETE_PRESERVE,
  ROLE_AFTER_IMPORT_FROM_MESSAGES,
  ROLE_AFTER_IMPORT_INITIAL,
  SWITCH_SHORTCUT_CTRL_ALT_M,
  SWITCH_SHORTCUT_TAB,
  SWITCH_SHORTCUT_TAB_WHEN_EMPTY,
  SWITCH_SHORTCUT_NONE,
  SUBMIT_SHORTCUT_ENTER,
  SUBMIT_SHORTCUT_DIALOGUE_ENTER,
  SUBMIT_SHORTCUT_SHIFT_ENTER,
  SUBMIT_SHORTCUT_MOD_ENTER,
  ALTERNATING_INTERACTION_POLICY,
  MANUAL_SWITCH_INTERACTION_POLICY,
  DIALOGUE_ENTER_INTERACTION_POLICY,
  roleAfterCommit,
  roleAfterDelete,
  roleAfterImport,
  globalCommandForKey,
  desktopCommandForKey,
  mobileCommandForKey,
});
})();
