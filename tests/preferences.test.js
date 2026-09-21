import test from "node:test";
import assert from "node:assert/strict";

import "../preferences.js";

const {
  DEFAULT_ENTER_BEHAVIOR,
  DEFAULT_FONT_PREFERENCE,
  ENTER_BEHAVIOR_ALTERNATE,
  ENTER_BEHAVIOR_PRESERVE,
  ENTER_BEHAVIOR_STORAGE_KEY,
  FONT_PREFERENCE_LABELS,
  isViewMode,
  normalizeEnterBehavior,
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

test("Enterキーの設定は話者交代と話者継続の二状態に限定する", () => {
  assert.equal(
    normalizeEnterBehavior(ENTER_BEHAVIOR_ALTERNATE),
    ENTER_BEHAVIOR_ALTERNATE,
  );
  assert.equal(
    normalizeEnterBehavior(ENTER_BEHAVIOR_PRESERVE),
    ENTER_BEHAVIOR_PRESERVE,
  );
  assert.equal(normalizeEnterBehavior("unknown"), DEFAULT_ENTER_BEHAVIOR);
  assert.equal(normalizeEnterBehavior(null), DEFAULT_ENTER_BEHAVIOR);
  assert.equal(ENTER_BEHAVIOR_STORAGE_KEY, "my-polyphony:v1:enter-behavior");
});
