import test from "node:test";
import assert from "node:assert/strict";

import "../storage.js";

const { readStorage, removeStorage, writeStorage } = globalThis.MyPolyphonyStorage;

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("保存境界はブラウザ保存の読み書きと削除を同じ形式で返す", () => {
  const storage = createMemoryStorage();

  assert.deepEqual(writeStorage("key", "value", storage), { ok: true, value: undefined });
  assert.deepEqual(readStorage("key", storage), { ok: true, value: "value" });
  assert.deepEqual(removeStorage("key", storage), { ok: true, value: undefined });
  assert.deepEqual(readStorage("key", storage), { ok: true, value: null });
});

test("保存境界は例外を投げず、失敗理由を呼び出し側へ返す", () => {
  const error = new Error("blocked");
  const blockedStorage = {
    getItem() {
      throw error;
    },
  };

  const result = readStorage("key", blockedStorage);
  assert.equal(result.ok, false);
  assert.equal(result.error, error);
});
