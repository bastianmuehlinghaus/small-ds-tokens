/**
 * Builds dist/ from the DTCG files in tokens/.
 *
 * The central idea: CSS output keeps the alias chain intact, so a Tier 3 token
 * emits
 *   --sds-button-primary-color-background-default: var(--sds-color-background-knockout);
 * rather than a baked hex. Dark mode then only has to override the 42 Tier 2
 * colour tokens — everything downstream re-resolves through the cascade.
 */
import StyleDictionary from "style-dictionary";
import fs from "node:fs";
import path from "node:path";

const PREFIX = "sds";
const REM_BASE = 16;

const read = (f) => JSON.parse(fs.readFileSync(path.join("tokens", f), "utf8"));
/** "{color.neutral.100}" -> "var(--sds-color-neutral-100)" */
const ref = (s) => `var(--${PREFIX}-${s.replace(/[{}]/g, "").split(".").join("-")})`;
/** Walk a DTCG tree, yielding [dashed-name, token] for every leaf. */
function* leaves(node, trail = []) {
  for (const [k, v] of Object.entries(node)) {
    if (v && v.$value !== undefined) yield [[...trail, k].join("-"), v];
    else if (v && typeof v === "object") yield* leaves(v, [...trail, k]);
  }
}

/* ---------------------------------------------------------------- transforms */

const isTypographyMetric = (t) =>
  t.path[0] === "typography" &&
  ["font-size", "line-height", "letter-spacing"].includes(t.path[1]);

StyleDictionary.registerTransform({
  name: "sds/typography/rem",
  type: "value",
  transitive: true,
  filter: (t) => isTypographyMetric(t) && typeof t.$value === "number",
  transform: (t) => (t.$value === 0 ? "0" : `${t.$value / REM_BASE}rem`),
});

StyleDictionary.registerTransform({
  name: "sds/dimension/px",
  type: "value",
  transitive: true,
  filter: (t) => t.$type === "dimension" && !isTypographyMetric(t) && typeof t.$value === "number",
  transform: (t) => (t.$value === 0 ? "0" : `${t.$value}px`),
});

StyleDictionary.registerTransform({
  name: "sds/duration/ms",
  type: "value",
  transitive: true,
  filter: (t) => t.$type === "duration" && typeof t.$value === "number",
  transform: (t) => `${t.$value}ms`,
});

// fontWeight, number and cubicBezier deliberately have no transform: they stay
// unitless (400/600), raw (0.3) and verbatim ("cubic-bezier(0, 0, 0.2, 1)").

const TRANSFORMS = [
  "attribute/cti",
  "name/kebab",
  "color/css",
  "sds/typography/rem",
  "sds/dimension/px",
  "sds/duration/ms",
];

/* ------------------------------------------------------------------ formats */

/* JS and TS come from the same token list via two mirrored formats, so the
   declaration can never drift from the implementation. */
const jsKey = (t) => JSON.stringify(t.name);

StyleDictionary.registerFormat({
  name: "sds/js-esm",
  format: ({ dictionary, options }) =>
    ["const tokens = {",
     ...dictionary.allTokens.map(
       (t) => `  ${jsKey(t)}: ${JSON.stringify(String(options.usesDtcg ? t.$value : t.value))},`
     ),
     "};", "", "export default tokens;", ""].join("\n"),
});

StyleDictionary.registerFormat({
  name: "sds/ts-declarations",
  format: ({ dictionary }) =>
    ["declare const tokens: {",
     ...dictionary.allTokens.map((t) => `  ${jsKey(t)}: string;`),
     "};", "", "export default tokens;", ""].join("\n"),
});

/* ------------------------------------------------------------ build (light) */

const sd = new StyleDictionary({
  source: [
    "tokens/tier1-primitives.json",
    "tokens/tier2-color.json",
    "tokens/tier2-layout.json",
    "tokens/tier3-components.json",
  ],
  platforms: {
    css: {
      transforms: TRANSFORMS,
      prefix: PREFIX,
      buildPath: "dist/css/",
      files: [
        {
          destination: "_light.css",
          format: "css/variables",
          options: { outputReferences: true, selector: ":root" },
        },
      ],
    },
    js: {
      transforms: TRANSFORMS,
      prefix: PREFIX,
      buildPath: "dist/js/",
      files: [
        { destination: "tokens.js", format: "sds/js-esm" },
        { destination: "tokens.d.ts", format: "sds/ts-declarations" },
      ],
    },
    json: {
      transforms: TRANSFORMS,
      prefix: PREFIX,
      buildPath: "dist/json/",
      files: [{ destination: "tokens.json", format: "json/flat" }],
    },
  },
});

await sd.buildAllPlatforms();

/* --------------------------------------------- dark mode + composite outputs */

/* Emitted by hand rather than through a second Style Dictionary pass: a `filter`
   narrows `dictionary.allTokens` inside the format, which breaks reference
   lookup against Tier 1. The dark layer is 42 straight aliases, so resolving
   them here is both simpler and easier to read. */
const darkVars = [...leaves(read("tier2-color.dark.json"))].map(
  ([name, t]) => `--${PREFIX}-${name}: ${ref(t.$value)};`
);

const darkCss = [
  "/* Dark mode overrides only the Tier 2 colour layer. Every Tier 3 token",
  "   references Tier 2, so it re-resolves automatically through the cascade. */",
  ':root[data-theme="dark"] {',
  ...darkVars.map((l) => "  " + l),
  "}",
  "",
  "@media (prefers-color-scheme: dark) {",
  '  :root:not([data-theme="light"]) {',
  ...darkVars.map((l) => "    " + l),
  "  }",
  "}",
  "",
].join("\n");

/* Elevation: Figma effect styles, composed from the themed shadow colours so
   they darken with the mode without being redeclared in the dark block. */
const shadowBlock = [
  "",
  "  /* Elevation — composed from the themed shadow colours above. */",
  ...[...leaves(read("elevation.json"))].map(([name, t]) => {
    const v = t.$value.length
      ? t.$value
          .map((l) => `${l.offsetX}px ${l.offsetY}px ${l.blur}px ${l.spread}px ${ref(l.color)}`)
          .join(", ")
      : "none";
    return `  --${PREFIX}-${name}: ${v};`;
  }),
].join("\n");

const lightCss = fs.readFileSync("dist/css/_light.css", "utf8");
fs.writeFileSync(
  "dist/css/tokens.css",
  lightCss.replace(/\n\}\s*$/, shadowBlock + "\n}\n") + "\n" + darkCss
);
fs.rmSync("dist/css/_light.css");

/* Typography classes. The tokens package is the one place allowed to reference
   Tier 1 — components consume these via `composes` and so never touch a
   primitive themselves. */
const typeCss = [
  "/**",
  " * Text styles from Figma. Compose these from component CSS Modules:",
  " *   .trigger { composes: sds-type-label-large from '@small-ds/tokens/typography.css'; }",
  " */",
  ...[...leaves(read("typography-styles.json"))].map(([name, t]) => {
    const v = t.$value;
    return [
      `.${PREFIX}-${name} {`,
      `  font-family: ${ref(v.fontFamily)}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;`,
      `  font-size: ${ref(v.fontSize)};`,
      `  line-height: ${ref(v.lineHeight)};`,
      `  font-weight: ${ref(v.fontWeight)};`,
      `  letter-spacing: ${ref(v.letterSpacing)};`,
      "}",
    ].join("\n");
  }),
  "",
].join("\n\n");
fs.writeFileSync("dist/css/typography.css", typeCss);

console.log("\nBuilt:");
for (const f of ["css/tokens.css", "css/typography.css", "js/tokens.js", "js/tokens.d.ts", "json/tokens.json"]) {
  const p = path.join("dist", f);
  console.log(`  ${f.padEnd(24)} ${fs.existsSync(p) ? (fs.statSync(p).size / 1024).toFixed(1) + " KB" : "MISSING"}`);
}
