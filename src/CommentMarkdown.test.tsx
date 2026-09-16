import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentMarkdown } from "./CommentMarkdown";

it("renders GitHub comment formatting and preserves code", () => {
  const html = renderToStaticMarkup(
    <CommentMarkdown
      body={
        '**Bold**\nnext line\n\n- [x] Done\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst tag = "<div>";\n```'
      }
    />,
  );
  expect(html).toContain("<strong>Bold</strong><br/>");
  expect(html).toContain('type="checkbox"');
  expect(html).toContain("<table>");
  expect(html).toContain("&lt;div&gt;");
});

it("does not render executable HTML or unsafe links", () => {
  const html = renderToStaticMarkup(
    <CommentMarkdown
      body={
        "[unsafe](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n<!-- hidden -->\n\n[GitHub](https://github.com)"
      }
    />,
  );
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("hidden");
  expect(html).toContain('href="https://github.com" target="_blank" rel="noreferrer"');
});
