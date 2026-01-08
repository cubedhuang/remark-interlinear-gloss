// @ts-check

import assert from "node:assert/strict";
import test from "node:test";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import remarkGloss from "../src/index.ts";

const toHtml = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkGloss)
  .use(remarkRehype)
  .use(rehypeStringify);

test("remarkGloss", async (t) => {
  await t.test("should expose the public api", async () => {
    assert.deepEqual(
      Object.keys(await import("remark-interlinear-gloss")).sort(),
      ["default"]
    );
  });

  await t.test("should ignore non-gloss directives", async () => {
    const result = String(await toHtml.process(":::other\nfoo\n:::"));
    assert.ok(!result.includes("gloss"));
  });

  await t.test("should render a simple gloss", async () => {
    const result = String(await toHtml.process(":::gloss\njan\n= person\n:::"));
    assert.ok(result.includes('class="gloss"'));
    assert.ok(result.includes('class="gloss-body"'));
    assert.ok(result.includes("jan"));
    assert.ok(result.includes("person"));
  });

  await t.test("should align multiple words into columns", async () => {
    const result = String(
      await toHtml.process(":::gloss\nmi sona\n= 1 understand\n:::")
    );
    const columnCount = (result.match(/gloss-column/g) || []).length;
    assert.equal(columnCount, 2);
  });

  await t.test("should render header lines", async () => {
    const result = String(
      await toHtml.process(
        ":::gloss\n| Toki Pona Example\nni o lon\n= DEM OPT exist\n:::"
      )
    );
    assert.ok(result.includes('class="gloss-header"'));
    assert.ok(result.includes("Toki Pona Example"));
  });

  await t.test("should render footer lines", async () => {
    const result = String(
      await toHtml.process(
        ":::gloss\nsuno o lon\n= light OPT exist\n| 'Let there be light.'\n:::"
      )
    );
    assert.ok(result.includes('class="gloss-footer"'));
    assert.ok(result.includes("'Let there be light.'"));
  });

  await t.test("should render transliteration lines", async () => {
    const result = String(
      await toHtml.process(":::gloss\n你\n/ nǐ\n= 2SG\n:::")
    );
    assert.ok(result.includes("gloss-word-transliteration"));
    assert.ok(result.includes("nǐ"));
  });

  await t.test("should handle multiple header lines", async () => {
    const result = String(
      await toHtml.process(
        ":::gloss\n| this is a header\n| this is another header\npona\n= good\n:::"
      )
    );
    assert.ok(result.includes("this is a header"));
    assert.ok(result.includes("<br>"));
    assert.ok(result.includes("this is another header"));
  });

  await t.test("should handle multiple footer lines", async () => {
    const result = String(
      await toHtml.process(
        ':::gloss\npan lipu\n= bread sheet\n| "pancakes"\n| (lit. sheet-like staple food)\n:::'
      )
    );
    assert.ok(result.includes('"pancakes"'));
    assert.ok(result.includes("<br>"));
    assert.ok(result.includes("(lit. sheet-like staple food)"));
  });

  await t.test("should preserve markdown formatting in headers", async () => {
    const result = String(
      await toHtml.process(":::gloss\n| *Important* example\nwe\n= 1PL\n:::")
    );
    assert.ok(result.includes("<em>Important</em> example"));
  });

  await t.test("should handle empty gloss block", async () => {
    const result = String(await toHtml.process(":::gloss\n:::"));
    assert.ok(result.includes('class="gloss"'));
  });

  await t.test("should handle gloss with only headers", async () => {
    const result = String(
      await toHtml.process(":::gloss\n| Just a header\n:::")
    );
    assert.ok(result.includes('class="gloss-header"'));
    assert.ok(!result.includes('class="gloss-body"'));
  });

  await t.test("should handle uneven column counts", async () => {
    const result = String(
      await toHtml.process(":::gloss\nwan tu luka\n= one two\n:::")
    );
    const columnCount = (result.match(/gloss-column/g) || []).length;
    assert.equal(columnCount, 3);
  });

  await t.test("should handle three-lines", async () => {
    const result = String(
      await toHtml.process(":::gloss\nhey\n/ hey\n= hey\n:::")
    );
    assert.ok(result.includes("gloss-word-text"));
    assert.ok(result.includes("gloss-word-transliteration"));
    assert.ok(result.includes("gloss-word-gloss"));
  });
});
