/**
 * ESLint plugin: bans physical (left/right) Tailwind utilities in favour of
 * logical (start/end) ones.
 *
 * This app is RTL-first and ships Arabic and English from the same components.
 * A `pl-4` that looks correct in English silently becomes wrong in Arabic, and
 * the bug is invisible until someone reads the RTL build. Making it a lint error
 * is cheaper than catching it in review every time.
 */

/** Physical utility → logical replacement. Order matters: first match wins. */
const BANNED_UTILITIES = [
  { pattern: /^-?pl-/, replacement: 'ps-' },
  { pattern: /^-?pr-/, replacement: 'pe-' },
  { pattern: /^-?ml-/, replacement: 'ms-' },
  { pattern: /^-?mr-/, replacement: 'me-' },
  { pattern: /^text-left$/, replacement: 'text-start' },
  { pattern: /^text-right$/, replacement: 'text-end' },
  { pattern: /^-?left-/, replacement: 'start-' },
  { pattern: /^-?right-/, replacement: 'end-' },
  { pattern: /^-?border-l(-|$)/, replacement: 'border-s' },
  { pattern: /^-?border-r(-|$)/, replacement: 'border-e' },
];

/** Call expressions whose string arguments are class lists. */
const CLASS_BUILDER_CALLEES = new Set(['cn', 'clsx', 'classnames', 'classNames', 'cva', 'tv', 'twMerge', 'twJoin']);

const CLASS_ATTRIBUTES = new Set(['className', 'class']);

/**
 * Strips Tailwind variant prefixes (`md:`, `hover:`, `rtl:`) and the important
 * modifier so the bare utility can be matched.
 */
function toBareUtility(token) {
  const withoutVariants = token.slice(token.lastIndexOf(':') + 1);
  return withoutVariants.replace(/^!/, '').replace(/!$/, '');
}

function findViolations(value) {
  const violations = [];

  for (const token of value.split(/\s+/)) {
    if (!token) continue;

    const utility = toBareUtility(token);
    const match = BANNED_UTILITIES.find((entry) => entry.pattern.test(utility));

    if (match) {
      violations.push({ token: utility, replacement: match.replacement });
    }
  }

  return violations;
}

function getCalleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') return callee.property.name;
  return undefined;
}

/** Walks ancestors to decide whether a string is used as a CSS class list. */
function isInClassContext(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === 'JSXAttribute') {
      const name = current.name.type === 'JSXIdentifier' ? current.name.name : undefined;
      return name !== undefined && CLASS_ATTRIBUTES.has(name);
    }

    if (current.type === 'CallExpression') {
      const name = getCalleeName(current.callee);
      if (name !== undefined && CLASS_BUILDER_CALLEES.has(name)) return true;
    }

    if (current.type === 'Program') return false;
  }

  return false;
}

const noPhysicalProperties = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce logical Tailwind utilities (ps-/pe-/ms-/me-/text-start/text-end/border-s/border-e).',
    },
    schema: [],
    messages: {
      physicalUtility:
        '"{{token}}" is a physical property and breaks in RTL. Use "{{replacement}}" instead. This app renders Arabic (RTL) and English (LTR) from the same markup.',
    },
  },

  create(context) {
    function report(node, value) {
      for (const violation of findViolations(value)) {
        context.report({ node, messageId: 'physicalUtility', data: violation });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        if (!isInClassContext(node)) return;
        report(node, node.value);
      },

      TemplateElement(node) {
        const raw = node.value.cooked ?? node.value.raw;
        if (!raw || !isInClassContext(node)) return;
        report(node, raw);
      },
    };
  },
};

const plugin = {
  meta: { name: 'logical-properties' },
  rules: {
    'no-physical-properties': noPhysicalProperties,
  },
};

export default plugin;
