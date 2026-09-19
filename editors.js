(() => {
const {
  COMMAND_COMMIT,
  COMMAND_NONE,
  COMMAND_SWITCH_ROLE,
  desktopCommandForKey,
  mobileCommandForKey,
} = globalThis.MyPolyphonyInteraction;

function executeEditorCommand(command, event, { source, onCommit, onSwitchRole }) {
  if (command === COMMAND_NONE) {
    return false;
  }

  event.preventDefault();
  if (command === COMMAND_COMMIT) {
    onCommit(source);
    return true;
  }
  if (command === COMMAND_SWITCH_ROLE) {
    onSwitchRole();
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
  onDraftInput,
  onCommit,
  onSwitchRole,
}) {
  const handleKeydown = (event) => {
    const command = desktopCommandForKey(event, getDraft(), interactionPolicy);
    executeEditorCommand(command, event, {
      source: draftInput,
      onCommit,
      onSwitchRole,
    });
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    onCommit(draftInput);
  };

  draftInput.addEventListener("input", onDraftInput);
  draftInput.addEventListener("keydown", handleKeydown);
  roleButton.addEventListener("click", onSwitchRole);
  composer.addEventListener("submit", handleSubmit);
}

function bindMobileEditor({
  composer,
  draftInput,
  roleButton,
  interactionPolicy,
  onDraftInput,
  onCommit,
  onSwitchRole,
}) {
  const handleKeydown = (event) => {
    const command = mobileCommandForKey(event, interactionPolicy);
    executeEditorCommand(command, event, {
      source: draftInput,
      onCommit,
      onSwitchRole,
    });
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    onCommit(draftInput);
  };

  draftInput.addEventListener("input", onDraftInput);
  draftInput.addEventListener("keydown", handleKeydown);
  roleButton.addEventListener("click", onSwitchRole);
  composer.addEventListener("submit", handleSubmit);
}

globalThis.MyPolyphonyEditors = Object.freeze({
  executeEditorCommand,
  bindDesktopEditor,
  bindMobileEditor,
});
})();
