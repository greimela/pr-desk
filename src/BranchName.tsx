import { useEffect, useState } from "react";

export function BranchName({ name }: { name: string }) {
  const [status, setStatus] = useState("");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (status === "") return;
    const timer = window.setTimeout(() => setStatus(""), 1000);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <span className="relative inline-flex min-w-0 max-w-full items-center">
      <button
        type="button"
        className="inline-flex min-w-0 max-w-[310px] items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs"
        aria-label={`Copy branch name ${name}`}
        title={`Copy branch name: ${name}`}
        disabled={copying}
        onClick={async (event) => {
          event.stopPropagation();
          setCopying(true);
          setStatus("");
          try {
            await navigator.clipboard.writeText(name);
            setStatus("Copied!");
          } catch {
            setStatus("Copy failed. Try again.");
          } finally {
            setCopying(false);
          }
        }}
      >
        <span className="truncate">{name}</span>
        <svg
          aria-hidden="true"
          className="size-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" />
        </svg>
      </button>
      {status && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 rounded-md bg-[#20342b] px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-sm"
        >
          {status}
        </span>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>
    </span>
  );
}
