import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("index.htmlは外部JavaScriptやCSSに依存しない", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=/gi)];
  const externalStyles = [
    ...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi),
  ];
  const inlineApp = html.match(
    /<script\s+id=["']my-polyphony-app["']>([\s\S]*?)<\/script>/i,
  );
  const inlineStyles = html.match(
    /<style\s+id=["']my-polyphony-styles["']>([\s\S]*?)<\/style>/i,
  );

  assert.equal(externalScripts.length, 0);
  assert.equal(externalStyles.length, 0);
  assert.ok(inlineApp, "埋め込みJavaScriptが見つかりません。");
  assert.ok(inlineStyles, "埋め込みCSSが見つかりません。");
  assert.doesNotThrow(() => new vm.Script(inlineApp[1], { filename: "index.html:inline" }));
});
