(() => {
const FONT_STORAGE_KEY = "my-polyphony:v1:font";
const DEFAULT_FONT_PREFERENCE = "mincho";
const FONT_PREFERENCE_LABELS = Object.freeze({
  mincho: "明朝",
  gothic: "ゴシック",
  "noto-sans": "Noto Sans JP 優先",
});

const ENTER_BEHAVIOR_STORAGE_KEY = "my-polyphony:v1:enter-behavior";
const ENTER_BEHAVIOR_ALTERNATE = "alternate";
const ENTER_BEHAVIOR_PRESERVE = "preserve";
const DEFAULT_ENTER_BEHAVIOR = ENTER_BEHAVIOR_ALTERNATE;

const VIEW_MODES = Object.freeze(["desktop", "mobile"]);

function normalizeFontPreference(value) {
  return Object.hasOwn(FONT_PREFERENCE_LABELS, value) ? value : DEFAULT_FONT_PREFERENCE;
}

function normalizeEnterBehavior(value) {
  return value === ENTER_BEHAVIOR_PRESERVE
    ? ENTER_BEHAVIOR_PRESERVE
    : DEFAULT_ENTER_BEHAVIOR;
}

function isViewMode(value) {
  return VIEW_MODES.includes(value);
}

globalThis.MyPolyphonyPreferences = Object.freeze({
  DEFAULT_ENTER_BEHAVIOR,
  DEFAULT_FONT_PREFERENCE,
  ENTER_BEHAVIOR_ALTERNATE,
  ENTER_BEHAVIOR_PRESERVE,
  ENTER_BEHAVIOR_STORAGE_KEY,
  FONT_PREFERENCE_LABELS,
  FONT_STORAGE_KEY,
  VIEW_MODES,
  isViewMode,
  normalizeEnterBehavior,
  normalizeFontPreference,
});
})();
