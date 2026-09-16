import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

export function CommentMarkdown({ body }: { body?: string }) {
  return (
    <div className="comment-markdown">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              {children}
            </a>
          ),
        }}
      >
        {body || ""}
      </Markdown>
    </div>
  );
}
