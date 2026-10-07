# @small-ds/tokens

Design tokens for **Small DS**, generated from the
[Figma token library](https://www.figma.com/design/DABmspHvLwmzYjMrFBjVQW/Small-DS--Design-Tokens).
279 variables across four tiers, in Light and Dark modes.

## Install

```sh
npm install @small-ds/tokens
```

## Use

```js
import "@small-ds/tokens/css";            // custom properties, both modes
import "@small-ds/tokens/typography.css"; // .sds-type-* text styles
```

```css
.card {
  background: var(--sds-color-background-raised);
  padding: var(--sds-space-inset-lg);
  border-radius: var(--sds-radius-surface);
  box-shadow: var(--sds-shadow-raised);
}
```

Typed values are available too, when you need a token in JS rather than CSS:

```js
import tokens from "@small-ds/tokens";
tokens["sds-size-control-md"]; // "40px"
```

## Theming

Light is the default. Dark applies automatically from the OS setting, and an
explicit `data-theme` on the root always wins:

```html
<html data-theme="dark">   <!-- forced dark -->
<html data-theme="light">  <!-- forced light, even if the OS is dark -->
<html>                     <!-- follows prefers-color-scheme -->
```

## The four tiers

| Tier | Example | Rule |
|---|---|---|
| 1 — Primitives | `--sds-color-neutral-900`, `--sds-spacing-16` | Raw values. **Not for use in product or component code.** |
| 2 — Semantics | `--sds-color-background-raised`, `--sds-space-inset-lg` | What a value *means*. This is the layer you build with. |
| 3 — Components | `--sds-button-primary-color-background-default` | Per-component decisions, for components that have them. |

**No component may reach past the semantic layer.** Tier 1 exists so Tier 2 has
something to point at; consuming it directly re-hardcodes the value under a
different name and silently opts out of theming.

The one sanctioned exception is `--sds-motion-*`, which has no Tier 2 layer.
Durations do not change between modes, and the easings are already named by
intent (`entrance`, `exit`, `emphasized`), so an alias tier would be 1:1 and
carry no meaning. Use them directly.

Because CSS output preserves the alias chain, dark mode only overrides the 42
Tier 2 colour tokens and everything downstream re-resolves through the cascade:

```css
--sds-button-primary-color-background-default: var(--sds-color-background-knockout);
--sds-color-background-knockout: var(--sds-color-neutral-900); /* light */
--sds-color-background-knockout: var(--sds-color-neutral-100); /* dark */
```

## Units

Typography is in `rem` so it honours the reader's browser font size; layout
stays in `px` so structure is predictable. Consequence: size controls with
`min-height`, never a fixed `height`, or a raised base font size will clip the
label.

| Group | Unit |
|---|---|
| `font-size`, `line-height`, `letter-spacing` | `rem` (÷16) |
| `spacing`, `size`, `radius`, `border-width` | `px` |
| `font-weight` | unitless |
| `motion/duration` | `ms` |

## Fonts

The `font-family` token resolves to a stack ending in the system sans. Söhne is
a commercial Klim typeface and its font files are **deliberately not
redistributed here** — a licence to use it is not a licence to ship it. Self-host
your own licensed copy and the stack will pick it up.

## Regenerating from Figma

The Figma plan is Pro, so the Variables REST API (Enterprise-only) is not
available. Extraction runs through the Figma MCP connection instead, which makes
re-syncing a deliberate, reviewable step rather than a background job — the point
being that `git diff` then shows you exactly which tokens moved before anything
ships.

1. Run the script in `scripts/figma-extract.js` via the Figma MCP `use_figma`
   tool and save its output over `scripts/figma-dump.json`.
2. `npm run build` — regenerates `tokens/` (DTCG) and `dist/`.
3. `npm run verify` — asserts nothing was lost and the alias chain is intact.
4. Review the diff, then commit.

## Layout

```
tokens/     DTCG token files — the committed source of truth
scripts/    Figma extraction, DTCG transform, verification
config/     Style Dictionary build
dist/       Build output (gitignored, published)
```
