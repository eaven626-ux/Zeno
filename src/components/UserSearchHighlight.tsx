import React from 'react';

interface HighlightTextProps {
  text: string;
  query: string;
  stripAtFromQuery?: boolean;
  className?: string;
}

export const HighlightText: React.FC<HighlightTextProps> = ({
  text,
  query,
  stripAtFromQuery = false,
  className,
}) => {
  const raw = query.trim();
  const cleanQuery = stripAtFromQuery ? raw.replace(/^@+/, '') : raw;

  if (!cleanQuery) {
    return <span className={className}>{text}</span>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = cleanQuery.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerQuery, cursor);
  let keyCounter = 0;

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(text.slice(cursor, matchIndex));
    }
    parts.push(
      <mark
        key={keyCounter++}
        className="bg-sky-500/20 dark:bg-sky-400/30 text-sky-800 dark:text-sky-200 rounded px-0.5 font-bold"
      >
        {text.slice(matchIndex, matchIndex + cleanQuery.length)}
      </mark>
    );
    cursor = matchIndex + cleanQuery.length;
    matchIndex = lowerText.indexOf(lowerQuery, cursor);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <span className={className}>{parts.length > 0 ? parts : text}</span>;
};
