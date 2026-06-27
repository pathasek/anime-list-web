import React from 'react';

// ============================================================
// CATEGORY DEFINITIONS — all forms found across 280 reviews
// ============================================================
const CATEGORIES = [
  { patterns: ['Animace', 'animace', 'Animaci', 'Animací'], name: 'Animace' },
  { patterns: ['CGI'], name: 'CGI' },
  { patterns: ['MC'], name: 'MC' },
  { patterns: ['Vedlejší postavy', 'Vedlejších postav'], name: 'Vedlejší postavy' },
  { patterns: ['Waifu'], name: 'Waifu' },
  { patterns: ['Plot', 'Plotu', 'Plotem'], name: 'Plot' },
  { patterns: ['Pacing', 'Pacingu', 'Pacingem'], name: 'Pacing' },
  { patterns: ['Story Conclusion', 'Závěr příběhu', 'Závěru příběhu'], name: 'Story Conclusion' },
  { patterns: ['Originalita', 'Originalitě', 'Originalitu', 'Originalitou'], name: 'Originalita' },
  { patterns: ['Emoce', 'Emocí', 'Emocemi', 'Emocím'], name: 'Emoce' },
  { patterns: ['Enjoyment', 'Enjoymentu', 'Enjoymentem'], name: 'Enjoyment' },
  { patterns: ['OP'], name: 'OP' },
  { patterns: ['ED'], name: 'ED' },
  { patterns: ['OST'], name: 'OST' },
];

// Prefixes that appear before category names in reviews
const PREFIXES = ['Celkový', 'Samotný', 'Ačkoliv', 'celkový'];

// ============================================================
// RATING COLOR MAPPING
// ============================================================
const RATING_CSS = {
  10: 'var(--rating-10)', 9: 'var(--rating-9)', 8: 'var(--rating-8)',
  7: 'var(--rating-7)', 6: 'var(--rating-6)', 5: 'var(--rating-5)',
};

function getRatingColor(score) {
  const n = Math.floor(score);
  const clamped = Math.max(5, Math.min(10, n));
  return RATING_CSS[clamped] || RATING_CSS[5];
}

// ============================================================
// BUILD MASTER REGEX
// ============================================================
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMasterRegex() {
  // Collect all category patterns
  const allPatterns = [];
  CATEGORIES.forEach(cat => {
    cat.patterns.forEach(p => allPatterns.push({ pattern: p, name: cat.name }));
  });

  // Sort by length descending (longest match first)
  allPatterns.sort((a, b) => b.pattern.length - a.pattern.length);

  // Build regex: (prefix)? (category) \s* \(? \s* (number) \s* / \s* 10 \s* \)?
  const prefixGroup = PREFIXES.map(escapeRegex).join('|');
  const catGroup = allPatterns.map(c => escapeRegex(c.pattern)).join('|');

  // Full pattern: optional prefix + category + whitespace + optional ( + number + /10 + optional )
  const pattern = `(?:\\b(?:${prefixGroup})\\s+)?\\b(${catGroup})\\s*(\\(?)\\s*(\\d+[.,]?\\d*)\\s*/\\s*10\\s*(\\)?)`;
  
  return new RegExp(pattern, 'gi');
}

// Also build FH regex
const FH_REGEX = /\b(Uděluji\s+|Dávám\s+)?FH\s+(\d+[.,]?\d*)\s*\/\s*10/gi;

const normalizeDashes = (str) => {
  if (!str) return str;
  // Replace en-dash (\u2013), em-dash (\u2014), and minus sign (\u2212) with standard hyphen-minus (-)
  return str.replace(/[\u2013\u2014\u2212]/g, '-');
};

// ============================================================
// FORMAT REVIEW FUNCTION
// ============================================================
export function formatReview(text, animeName) {
  if (!text) return null;

  const normalizedText = normalizeDashes(text);
  const normalizedAnimeName = normalizeDashes(animeName);

  const masterRegex = buildMasterRegex();
  const parts = [];
  let lastIndex = 0;
  let match;

  // Combined regex: match both categories and FH
  const combinedRegex = new RegExp(
    `${masterRegex.source}|${FH_REGEX.source}`,
    'gi'
  );

  // Reset lastIndex
  combinedRegex.lastIndex = 0;

  while ((match = combinedRegex.exec(normalizedText)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      const beforeText = normalizedText.slice(lastIndex, match.index);
      parts.push(...highlightAnimeName(beforeText, normalizedAnimeName, parts.length === 0));
    }

    const fullMatch = match[0];

    // Check if it's an FH match (FH groups: 5=prefix, 6=score)
    if (match[6] !== undefined) {
      // FH match
      const prefix = match[5] || '';
      const score = parseFloat(match[6].replace(',', '.'));
      const color = getRatingColor(score);
      parts.push(
        <span key={parts.length}>
          {prefix && <span style={{ fontWeight: 'bold' }}>{prefix} </span>}
          <span style={{ fontWeight: 'bold' }}>FH </span>
          <span style={{ fontWeight: 'bold', color }}>{match[6]}/10</span>
        </span>
      );
    } else {
      // Category match: groups (1=cat, 2=(, 3=score, 4=))
      const catName = match[1];
      const openParen = match[2] || '';
      const closeParen = match[4] || '';
      const score = parseFloat(match[3].replace(',', '.'));
      const color = getRatingColor(score);

      // Find canonical category name
      let canonical = catName;
      for (const cat of CATEGORIES) {
        if (cat.patterns.some(p => p.toLowerCase() === catName.toLowerCase())) {
          canonical = cat.name;
          break;
        }
      }

      parts.push(
        <span key={parts.length}>
          <span style={{ fontWeight: 'bold' }}>{canonical} </span>
          {openParen}
          <span style={{ fontWeight: 'bold', color }}>{match[3]}/10</span>
          {closeParen}
        </span>
      );
    }

    lastIndex = combinedRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < normalizedText.length) {
    const remaining = normalizedText.slice(lastIndex);
    parts.push(...highlightAnimeName(remaining, normalizedAnimeName, parts.length === 0));
  }

  return parts.length > 0 ? parts : normalizedText;
}

// ============================================================
// HIGHLIGHT ANIME NAME (bold)
// ============================================================
function highlightAnimeName(text, animeName, isFirst) {
  if (!animeName || !text.includes(animeName)) {
    return [<span key={Math.random()}>{text}</span>];
  }

  const parts = [];
  const escaped = escapeRegex(animeName);
  const regex = new RegExp(escaped, 'gi');
  let lastIdx = 0;
  let m;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(<span key={parts.length}>{text.slice(lastIdx, m.index)}</span>);
    }
    parts.push(
      <span key={parts.length} style={{ fontWeight: 'bold', fontStyle: 'italic', color: 'var(--text-primary)' }}>
        {m[0]}
      </span>
    );
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(<span key={parts.length}>{text.slice(lastIdx)}</span>);
  }

  return parts;
}
