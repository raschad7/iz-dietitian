/**
 * ESLint plugin: bans raw hex colour literals in .tsx/.jsx.
 *
 * This app has exactly one place hex colours are allowed to live:
 * src/app/globals.css, where the Enzyme primitives and semantic tokens are
 * defined (see design-system.md). Everywhere else — component classNames,
 * inline style objects, SVG fill/stroke props — a hex literal is a value
 * that skipped the token system, and it will drift the first time the
 * palette changes because nothing will find it. Reach for a semantic
 * Tailwind utility (bg-primary, text-status-medical-fg, ...) or, if a value
 * genuinely isn't a design token (e.g. an arbitrary per-record colour), a
 * CSS custom property, instead.
 */

const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

function findViolations(value) {
  const matches = value.match(new RegExp(HEX_COLOR, 'g'));
  return matches ?? [];
}

const noRawHex = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban raw hex colour literals outside globals.css — consume a semantic token instead.',
    },
    schema: [],
    messages: {
      rawHex:
        '"{{hex}}" is a raw hex colour. Hex values belong only in src/app/globals.css — use a semantic Tailwind utility (bg-primary, text-status-medical-fg, ...) or a CSS custom property here.',
    },
  },

  create(context) {
    function report(node, value) {
      for (const hex of findViolations(value)) {
        context.report({ node, messageId: 'rawHex', data: { hex } });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        report(node, node.value);
      },

      TemplateElement(node) {
        const raw = node.value.cooked ?? node.value.raw;
        if (!raw) return;
        report(node, raw);
      },
    };
  },
};

const plugin = {
  meta: { name: 'no-raw-hex' },
  rules: {
    'no-raw-hex': noRawHex,
  },
};

export default plugin;
