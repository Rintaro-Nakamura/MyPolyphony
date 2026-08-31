(() => {
const FONT_STORAGE_KEY = "my-polyphony:v1:font";
const DEFAULT_FONT_PREFERENCE = "mincho";
const FONT_PREFERENCE_LABELS = Object.freeze({
  mincho: "明朝",
  gothic: "ゴシック",
  "noto-sans": "Noto Sans JP 優先",
});

const VIEW_MODES = Object.freeze(["desktop", "mobile"]);

function normalizeFontPreference(value) {
  return Object.hasOwn(FONT_PREFERENCE_LABELS, value) ? value : DEFAULT_FONT_PREFERENCE;
}

function isViewMode(value) {
  return VIEW_MODES.includes(value);
}

globalThis.MyPolyphonyPreferences = Object.freeze({
  DEFAULT_FONT_PREFERENCE,
  FONT_PREFERENCE_LABELS,
  FONT_STORAGE_KEY,
  VIEW_MODES,
  isViewMode,
  normalizeFontPreference,
});
})();
