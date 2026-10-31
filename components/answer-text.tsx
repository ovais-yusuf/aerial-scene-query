import { Fragment, type ReactNode } from "react";

// A small, dependency free renderer for the short answers the copilot returns.
// It handles paragraphs, hard line breaks, bullet and numbered lists, inline
// bold, and inline code. Everything is built as React elements, so user and
// model text is escaped by React and never injected as raw HTML.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let token = 0;
  let match: RegExpExecArray | null;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const raw = match[0];
    if (raw.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${token}`} className="font-semibold text-ink">
          {raw.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c${token}`}
          className="rounded bg-ink/[0.06] px-1 py-0.5 font-mono text-[0.85em]"
        >
          {raw.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = INLINE.lastIndex;
    token += 1;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

const BULLET = /^[-*]\s+(.*)/;
const NUMBERED = /^\d+\.\s+(.*)/;

export function AnswerText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let index = 0;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const key = `p${blocks.length}`;
    const content: ReactNode[] = [];
    paragraph.forEach((line, i) => {
      if (i > 0) content.push(<br key={`${key}-br${i}`} />);
      content.push(
        <Fragment key={`${key}-l${i}`}>{renderInline(line, `${key}-l${i}`)}</Fragment>,
      );
    });
    blocks.push(
      <p key={key} className="text-[13px] leading-6 text-ink first:mt-0">
        {content}
      </p>,
    );
    paragraph = [];
  }

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (trimmed === "") {
      flushParagraph();
      index += 1;
      continue;
    }

    const isNumbered = NUMBERED.test(trimmed);
    const isBullet = BULLET.test(trimmed);

    if (isNumbered || isBullet) {
      flushParagraph();
      const ordered = isNumbered;
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        const numberedMatch = NUMBERED.exec(candidate);
        const bulletMatch = BULLET.exec(candidate);
        if (ordered && numberedMatch) {
          items.push(numberedMatch[1]);
          index += 1;
        } else if (!ordered && bulletMatch) {
          items.push(bulletMatch[1]);
          index += 1;
        } else {
          break;
        }
      }
      const key = `list${blocks.length}`;
      const listItems = items.map((item, i) => (
        <li key={`${key}-i${i}`} className="pl-1 text-[13px] leading-6 text-ink">
          {renderInline(item, `${key}-i${i}`)}
        </li>
      ));
      blocks.push(
        ordered ? (
          <ol key={key} className="ml-4 list-decimal space-y-1 marker:text-muted">
            {listItems}
          </ol>
        ) : (
          <ul key={key} className="ml-4 list-disc space-y-1 marker:text-crimson">
            {listItems}
          </ul>
        ),
      );
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();

  return <div className="space-y-2.5">{blocks}</div>;
}
