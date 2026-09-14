import { cn } from "@/lib/cn";

/**
 * Renders a CMS page body: blank lines separate paragraphs, a line starting
 * with "## " is a heading, lines starting with "- " form a list. Plain text
 * in, so nothing an admin types can inject markup.
 */
export function PageBody({ body, compact = false }: { body: string; compact?: boolean }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={cn("flex flex-col", compact ? "gap-2.5" : "gap-4")}>
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <h2 key={i} className={cn("font-display font-extrabold text-ink", compact ? "text-sm" : "mt-2 text-lg")}>
              {block.slice(3)}
            </h2>
          );
        }
        const lines = block.split("\n");
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className={cn("list-disc ps-5 text-ink-soft", compact ? "text-sm leading-7" : "text-[15px] leading-8")}>
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className={cn("whitespace-pre-line text-ink-soft", compact ? "text-sm leading-7" : "text-[15px] leading-8")}>
            {block}
          </p>
        );
      })}
    </div>
  );
}
