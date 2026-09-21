(() => {
const INLINE_EDITOR_SELECTOR = ".desktop-message__text";
const VERTICAL_KEYS = new Set(["ArrowUp", "ArrowDown"]);
const HORIZONTAL_KEYS = new Set(["ArrowLeft", "ArrowRight"]);

function graphemeBoundaries(text) {
  const boundaries = [0];
  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const { index, segment } of segmenter.segment(text)) {
      const end = index + segment.length;
      if (end > boundaries.at(-1)) {
        boundaries.push(end);
      }
    }
    return boundaries;
  }

  let offset = 0;
  for (const character of text) {
    offset += character.length;
    boundaries.push(offset);
  }
  return boundaries;
}

function lineTolerance(position) {
  return Math.max(2, (position?.height ?? 0) * 0.35);
}

function edgeLineTop(positions, edge) {
  const tops = positions.map(({ top }) => top);
  return edge === "first" ? Math.min(...tops) : Math.max(...tops);
}

function positionsOnEdgeLine(positions, edge) {
  if (positions.length === 0) {
    return [];
  }

  const lineTop = edgeLineTop(positions, edge);
  return positions.filter(
    (position) => Math.abs(position.top - lineTop) <= lineTolerance(position),
  );
}

function isCaretOnEdgeLine(positions, caretPosition, edge) {
  if (positions.length === 0 || !caretPosition) {
    return true;
  }

  const lineTop = edgeLineTop(positions, edge);
  return Math.abs(caretPosition.top - lineTop) <= lineTolerance(caretPosition);
}

function closestOffsetOnLine(positions, edge, preferredX) {
  const candidates = positionsOnEdgeLine(positions, edge);
  if (candidates.length === 0) {
    return 0;
  }

  return candidates.reduce((closest, candidate) => {
    const candidateDistance = Math.abs(candidate.left - preferredX);
    const closestDistance = Math.abs(closest.left - preferredX);
    if (candidateDistance !== closestDistance) {
      return candidateDistance < closestDistance ? candidate : closest;
    }
    return candidate.offset > closest.offset ? candidate : closest;
  }).offset;
}

function rangeRectForOffset(node, offset, host) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const collapsedRect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  if (collapsedRect && (collapsedRect.height > 0 || collapsedRect.width > 0)) {
    return collapsedRect;
  }

  const textLength = node.data.length;
  if (textLength > 0) {
    const characterRange = document.createRange();
    if (offset < textLength) {
      characterRange.setStart(node, offset);
      characterRange.setEnd(node, Math.min(textLength, offset + 1));
      const rect = characterRange.getClientRects()[0] ?? characterRange.getBoundingClientRect();
      if (rect) {
        return {
          left: rect.left,
          top: rect.top,
          right: rect.left,
          bottom: rect.bottom,
          width: 0,
          height: rect.height,
        };
      }
    } else {
      characterRange.setStart(node, Math.max(0, offset - 1));
      characterRange.setEnd(node, offset);
      const rects = [...characterRange.getClientRects()];
      const rect = rects.at(-1) ?? characterRange.getBoundingClientRect();
      if (rect) {
        return {
          left: rect.right,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: 0,
          height: rect.height,
        };
      }
    }
  }

  const hostRect = host.getBoundingClientRect();
  const lineHeight = Number.parseFloat(getComputedStyle(host).lineHeight) || hostRect.height;
  return {
    left: hostRect.left,
    top: hostRect.top,
    right: hostRect.left,
    bottom: hostRect.top + lineHeight,
    width: 0,
    height: lineHeight,
  };
}

function positionForOffset(node, offset, host, horizontalScroll = 0) {
  const rect = rangeRectForOffset(node, offset, host);
  return {
    offset,
    left: rect.left - horizontalScroll,
    top: rect.top,
    height: rect.height,
  };
}

function createInlineMeasurement(editor) {
  const text = editor.textContent ?? "";
  let node = editor.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    node = document.createTextNode(text);
    editor.replaceChildren(node);
  }

  const positions = graphemeBoundaries(text).map((offset) =>
    positionForOffset(node, offset, editor),
  );
  return {
    positions,
    positionAt(offset) {
      return positionForOffset(node, offset, editor);
    },
    destroy() {},
  };
}

const MIRRORED_STYLE_PROPERTIES = [
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "borderTopWidth",
  "boxSizing",
  "direction",
  "fontFamily",
  "fontFeatureSettings",
  "fontKerning",
  "fontSize",
  "fontStretch",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "overflowWrap",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "tabSize",
  "textAlign",
  "textIndent",
  "textTransform",
  "wordBreak",
  "wordSpacing",
];

function createTextareaMeasurement(textarea) {
  const computed = getComputedStyle(textarea);
  const rect = textarea.getBoundingClientRect();
  const mirror = document.createElement("div");
  const text = textarea.value;

  for (const property of MIRRORED_STYLE_PROPERTIES) {
    mirror.style[property] = computed[property];
  }
  Object.assign(mirror.style, {
    position: "fixed",
    visibility: "hidden",
    pointerEvents: "none",
    zIndex: "-1",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    minHeight: "0",
    maxHeight: "none",
    margin: "0",
    overflowX: "hidden",
    overflowY: textarea.scrollHeight > textarea.clientHeight ? "scroll" : "hidden",
    resize: "none",
    whiteSpace: "pre-wrap",
  });
  mirror.textContent = `${text}\u200b`;
  document.body.append(mirror);

  const node = mirror.firstChild;
  const positions = graphemeBoundaries(text).map((offset) =>
    positionForOffset(node, offset, mirror, textarea.scrollLeft),
  );
  return {
    positions,
    positionAt(offset) {
      return positionForOffset(node, offset, mirror, textarea.scrollLeft);
    },
    destroy() {
      mirror.remove();
    },
  };
}

function selectionOffsets(editor, draftInput) {
  if (editor === draftInput) {
    return {
      start: editor.selectionStart,
      end: editor.selectionEnd,
    };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return null;
  }

  const beforeStart = range.cloneRange();
  beforeStart.selectNodeContents(editor);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = range.cloneRange();
  beforeEnd.selectNodeContents(editor);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  return {
    start: beforeStart.toString().length,
    end: beforeEnd.toString().length,
  };
}

function setInlineSelection(editor, offset) {
  const range = document.createRange();
  const node = editor.firstChild;
  if (node?.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.min(offset, node.data.length));
  } else {
    range.setStart(editor, 0);
  }
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function editorText(editor, draftInput) {
  return editor === draftInput ? editor.value : editor.textContent ?? "";
}

function focusAtOffset(editor, offset, draftInput) {
  editor.focus({ preventScroll: true });
  if (editor === draftInput) {
    editor.setSelectionRange(offset, offset);
  } else {
    setInlineSelection(editor, offset);
  }
  editor.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function isPlainArrow(event) {
  return !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
}

function createDesktopCaretNavigation({ messagesContainer, draftInput }) {
  let preferredX = null;

  function reset() {
    preferredX = null;
  }

  function editors() {
    return [
      ...messagesContainer.querySelectorAll(INLINE_EDITOR_SELECTOR),
      draftInput,
    ];
  }

  function sourceFromEvent(event) {
    if (event.target === draftInput) {
      return draftInput;
    }
    return event.target.closest?.(INLINE_EDITOR_SELECTOR) ?? null;
  }

  function moveHorizontally(event, source, selection, sequence) {
    reset();
    if (selection.start !== selection.end) {
      return false;
    }

    const index = sequence.indexOf(source);
    const textLength = editorText(source, draftInput).length;
    const movingBackward = event.key === "ArrowLeft";
    const atBoundary = movingBackward
      ? selection.start === 0
      : selection.end === textLength;
    if (!atBoundary) {
      return false;
    }

    const target = sequence[index + (movingBackward ? -1 : 1)];
    event.preventDefault();
    if (!target) {
      return true;
    }

    const targetOffset = movingBackward
      ? editorText(target, draftInput).length
      : 0;
    focusAtOffset(target, targetOffset, draftInput);
    return true;
  }

  function moveVertically(event, source, selection, sequence) {
    if (selection.start !== selection.end) {
      reset();
      return false;
    }

    const movingBackward = event.key === "ArrowUp";
    const currentEdge = movingBackward ? "first" : "last";
    const targetEdge = movingBackward ? "last" : "first";
    const createMeasurement = source === draftInput
      ? createTextareaMeasurement
      : createInlineMeasurement;
    const measurement = createMeasurement(source);

    try {
      const caretPosition = measurement.positionAt(selection.start);
      if (preferredX === null) {
        preferredX = caretPosition.left;
      }
      if (!isCaretOnEdgeLine(measurement.positions, caretPosition, currentEdge)) {
        return false;
      }
    } finally {
      measurement.destroy();
    }

    const index = sequence.indexOf(source);
    const target = sequence[index + (movingBackward ? -1 : 1)];
    event.preventDefault();
    if (!target) {
      return true;
    }

    const targetMeasurement = target === draftInput
      ? createTextareaMeasurement(target)
      : createInlineMeasurement(target);
    try {
      const targetOffset = closestOffsetOnLine(
        targetMeasurement.positions,
        targetEdge,
        preferredX,
      );
      focusAtOffset(target, targetOffset, draftInput);
    } finally {
      targetMeasurement.destroy();
    }
    return true;
  }

  function handleKeydown(event) {
    const source = sourceFromEvent(event);
    if (!source || event.defaultPrevented || event.isComposing || event.keyCode === 229) {
      return false;
    }

    if (!VERTICAL_KEYS.has(event.key) && !HORIZONTAL_KEYS.has(event.key)) {
      reset();
      return false;
    }
    if (!isPlainArrow(event)) {
      reset();
      return false;
    }

    const selection = selectionOffsets(source, draftInput);
    if (!selection) {
      reset();
      return false;
    }
    const sequence = editors();

    if (HORIZONTAL_KEYS.has(event.key)) {
      return moveHorizontally(event, source, selection, sequence);
    }
    return moveVertically(event, source, selection, sequence);
  }

  return Object.freeze({ handleKeydown, reset });
}

globalThis.MyPolyphonyCaretNavigation = Object.freeze({
  closestOffsetOnLine,
  createDesktopCaretNavigation,
  graphemeBoundaries,
  isCaretOnEdgeLine,
});
})();
