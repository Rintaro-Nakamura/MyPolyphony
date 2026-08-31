import test from "node:test";
import assert from "node:assert/strict";

import "../preferences.js";

const {
  DEFAULT_FONT_PREFERENCE,
  FONT_PREFERENCE_LABELS,
  isViewMode,
  normalizeFontPreference,
} = globalThis.MyPolyphonyPreferences;

test("書体設定は既知の値だけを受け入れる", () => {
  assert.equal(normalizeFontPreference("gothic"), "gothic");
  assert.equal(normalizeFontPreference("noto-sans"), "noto-sans");
  assert.equal(normalizeFontPreference("unknown"), DEFAULT_FONT_PREFERENCE);
  assert.equal(normalizeFontPreference(null), DEFAULT_FONT_PREFERENCE);
  assert.equal(FONT_PREFERENCE_LABELS.mincho, "明朝");
});

test("表示モードは文書とチャットの二種類に限定する", () => {
  assert.equal(isViewMode("desktop"), true);
  assert.equal(isViewMode("mobile"), true);
  assert.equal(isViewMode("print"), false);
  assert.equal(isViewMode(undefined), false);
});
