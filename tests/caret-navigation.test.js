import test from "node:test";
import assert from "node:assert/strict";

import "../caret-navigation.js";

const {
  closestOffsetOnLine,
  graphemeBoundaries,
  isCaretOnEdgeLine,
} = globalThis.MyPolyphonyCaretNavigation;

test("キャレット位置は結合文字と絵文字の途中を移動先にしない", () => {
  assert.deepEqual(graphemeBoundaries("A😀e\u0301"), [0, 1, 3, 5]);
});

test("上下移動は文字数ではなく描画上もっとも近い横位置を選ぶ", () => {
  const positions = [
    { offset: 0, left: 100, top: 20, height: 24 },
    { offset: 1, left: 116, top: 20, height: 24 },
    { offset: 2, left: 132, top: 20, height: 24 },
    { offset: 3, left: 148, top: 20, height: 24 },
    { offset: 4, left: 100, top: 44, height: 24 },
    { offset: 5, left: 108, top: 44, height: 24 },
    { offset: 6, left: 142, top: 44, height: 24 },
  ];

  assert.equal(closestOffsetOnLine(positions, "first", 139), 2);
  assert.equal(closestOffsetOnLine(positions, "last", 139), 6);
});

test("短い行では末尾に寄せても、希望する横位置そのものは変更しない", () => {
  const shortLine = [
    { offset: 0, left: 100, top: 20, height: 24 },
    { offset: 1, left: 116, top: 20, height: 24 },
    { offset: 2, left: 132, top: 20, height: 24 },
  ];
  const longLine = [
    { offset: 0, left: 100, top: 44, height: 24 },
    { offset: 1, left: 124, top: 44, height: 24 },
    { offset: 2, left: 148, top: 44, height: 24 },
    { offset: 3, left: 172, top: 44, height: 24 },
  ];
  const preferredX = 168;

  assert.equal(closestOffsetOnLine(shortLine, "first", preferredX), 2);
  assert.equal(closestOffsetOnLine(longLine, "last", preferredX), 3);
});

test("同じ発言内では最初と最後の表示行だけを境界として扱う", () => {
  const positions = [
    { offset: 0, left: 100, top: 20, height: 24 },
    { offset: 4, left: 100, top: 44, height: 24 },
    { offset: 8, left: 100, top: 68, height: 24 },
  ];

  assert.equal(isCaretOnEdgeLine(positions, positions[0], "first"), true);
  assert.equal(isCaretOnEdgeLine(positions, positions[1], "first"), false);
  assert.equal(isCaretOnEdgeLine(positions, positions[1], "last"), false);
  assert.equal(isCaretOnEdgeLine(positions, positions[2], "last"), true);
});
