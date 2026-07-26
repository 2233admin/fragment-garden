import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

type MarkdownContentProps = Readonly<{
  className?: string;
  content: string;
  emptyMessage?: string;
}>;

function transformSafeUrl(url: string): string | null {
  const transformedUrl = defaultUrlTransform(url);

  if (transformedUrl.length === 0) {
    return null;
  }

  if (transformedUrl.startsWith("#") || transformedUrl.startsWith("/")) {
    return transformedUrl;
  }

  try {
    const protocol = new URL(transformedUrl).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:"
      ? transformedUrl
      : null;
  } catch {
    return null;
  }
}

export function MarkdownContent({
  className = "",
  content,
  emptyMessage = "这条笔记暂时没有正文。",
}: MarkdownContentProps) {
  if (content.trim().length === 0) {
    return <p className={`text-sm leading-7 text-garden-muted ${className}`}>{emptyMessage}</p>;
  }

  return (
    <div className={`min-w-0 text-[0.98rem] leading-8 text-garden-ink ${className}`}>
      <ReactMarkdown
        components={{
          a: ({ children, href }) => (
            <a
              className="font-semibold text-garden-accent underline decoration-garden-line underline-offset-4 hover:text-garden-accent-strong"
              href={href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-5 border-l-4 border-garden-accent/45 bg-garden-soft/35 py-2 pr-4 pl-5 text-garden-muted">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => (
            <h1 className="mt-8 mb-3 font-display text-2xl font-semibold text-garden-ink first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-7 mb-3 font-display text-xl font-semibold text-garden-ink first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-6 mb-2 text-base font-semibold text-garden-ink first:mt-0">
              {children}
            </h3>
          ),
          li: ({ children }) => <li className="my-1 pl-1">{children}</li>,
          ol: ({ children }) => <ol className="my-4 list-decimal space-y-1 pl-6">{children}</ol>,
          p: ({ children }) => (
            <p className="my-3 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-garden-ink">{children}</strong>
          ),
          ul: ({ children }) => <ul className="my-4 list-disc space-y-1 pl-6">{children}</ul>,
        }}
        skipHtml
        urlTransform={(url) => transformSafeUrl(url)}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
