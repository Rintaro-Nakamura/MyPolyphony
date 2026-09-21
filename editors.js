(() => {
const {
  COMMAND_COMMIT,
  COMMAND_COMMIT_PRESERVE_ROLE,
  COMMAND_NONE,
  COMMAND_REOPEN_PREVIOUS,
  COMMAND_SWITCH_ROLE,
  desktopCommandForKey,
  mobileCommandForKey,
} = globalThis.MyPolyphonyInteraction;

function executeEditorCommand(
  command,
  event,
  { source, onCommit, onReopenPrevious, onSwitchRole },
) {
  if (command === COMMAND_NONE) {
    return false;
  }

  event.preventDefault();
  if (command === COMMAND_COMMIT || command === COMMAND_COMMIT_PRESERVE_ROLE) {
    onCommit(source, command);
    return true;
  }
  if (command === COMMAND_SWITCH_ROLE) {
    onSwitchRole({ source, preserveSelection: true });
    return true;
  }
  if (command === COMMAND_REOPEN_PREVIOUS) {
    onReopenPrevious(source);
    return true;
  }

  throw new TypeError(`未対応のエディタ命令です（${String(command)}）。`);
}

function bindDesktopEditor({
  composer,
  draftInput,
  roleButton,
  getDraft,
  interactionPolicy,
  getInteractionPolicy,
  onDraftInput,
  onCommit,
  onReopenPrevious,
  onSwitchRole,
}) {
  const handleKeydown = (event) => {
    const policy = getInteractionPolicy?.() ?? interactionPolicy;
    const command = desktopCommandForKey(event, getDraft(), policy);
    executeEditorCommand(command, event, {
      source: draftInput,
      onCommit,
      onReopenPrevious,
      onSwitchRole,
    });
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    onCommit(draftInput, COMMAND_COMMIT);
  };

  draftInput.addEventListener("input", onDraftInput);
  draftInput.addEventListener("keydown", handleKeydown);
  roleButton.addEventListener("click", () => {
    onSwitchRole({ source: draftInput, preserveSelection: false });
  });
  composer.addEventListener("submit", handleSubmit);
}

function bindMobileEditor({
  composer,
  draftInput,
  roleButton,
  interactionPolicy,
  getInteractionPolicy,
  onDraftInput,
  onCommit,
  onSwitchRole,
}) {
  const handleKeydown = (event) => {
    const policy = getInteractionPolicy?.() ?? interactionPolicy;
    const command = mobileCommandForKey(event, policy);
    executeEditorCommand(command, event, {
      source: draftInput,
      onCommit,
      onSwitchRole,
    });
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    onCommit(draftInput, COMMAND_COMMIT);
  };

  draftInput.addEventListener("input", onDraftInput);
  draftInput.addEventListener("keydown", handleKeydown);
  roleButton.addEventListener("click", () => {
    onSwitchRole({ source: draftInput, preserveSelection: false });
  });
  composer.addEventListener("submit", handleSubmit);
}

globalThis.MyPolyphonyEditors = Object.freeze({
  executeEditorCommand,
  bindDesktopEditor,
  bindMobileEditor,
});
})();
