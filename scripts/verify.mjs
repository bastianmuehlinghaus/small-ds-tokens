/**
 * Guards the build against silent drift from Figma.
 * Run by `npm run verify`, and automatically before publishing.
 */
import fs from "node:fs";

const dump = JSON.parse(fs.readFileSync("scripts/figma-dump.json", "utf8"));
const css = fs.readFileSync("dist/css/tokens.css", "utf8");

const varName = (figmaPath) => "--sds-" + figmaPath.split("/").join("-");
const declared = new Set([...css.matchAll(/^\s*(--sds-[\w-]+):/gm)].map((m) => m[1]));

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

/* 1. Every Figma variable reached the CSS. */
const allFigma = [
  ...Object.keys(dump.tier1),
  ...Object.keys(dump.tier2color),
  ...Object.keys(dump.tier2layout),
  ...Object.keys(dump.tier3),
];
const missing = allFigma.filter((p) => !declared.has(varName(p)));
check(`all ${allFigma.length} Figma variables emitted`, missing.length === 0, missing.slice(0, 5).join(", "));
check("variable count matches Figma", allFigma.length === dump._meta.totalVariables, `${allFigma.length} vs ${dump._meta.totalVariables}`);

/* 2. The alias chain survived. Nothing at Tier 2 or Tier 3 may be a literal —
      if it is, the cascade is broken and dark mode will not propagate. */
const semanticPaths = [...Object.keys(dump.tier2color), ...Object.keys(dump.tier2layout), ...Object.keys(dump.tier3)];
const literals = semanticPaths.filter((p) => {
  const m = css.match(new RegExp(`^\\s*${varName(p)}:\\s*([^;]+);`, "m"));
  return m && !m[1].trim().startsWith("var(");
});
check(`all ${semanticPaths.length} Tier 2/3 tokens are var() references`, literals.length === 0, literals.slice(0, 5).join(", "));

/* 3. Dark mode covers the whole Tier 2 colour layer, and nothing else. */
const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf("@media"));
const darkVars = new Set([...darkBlock.matchAll(/(--sds-[\w-]+):/g)].map((m) => m[1]));
const expectedDark = Object.keys(dump.tier2color).map(varName);
check(`dark mode overrides all ${expectedDark.length} Tier 2 colour tokens`,
  expectedDark.every((v) => darkVars.has(v)) && darkVars.size === expectedDark.length,
  `${darkVars.size} declared`);
check("prefers-color-scheme fallback present", css.includes("@media (prefers-color-scheme: dark)"));

/* 4. The unit split holds: typography in rem, layout in px. */
const unit = (p) => (css.match(new RegExp(`^\\s*${varName(p)}:\\s*([^;]+);`, "m")) || [])[1]?.trim();
const remOk = ["typography/font-size/16", "typography/line-height/24", "typography/letter-spacing/wide"]
  .every((p) => unit(p)?.endsWith("rem"));
const pxOk = ["spacing/16", "size/control/40", "border/radius/12"].every((p) => unit(p)?.endsWith("px"));
check("typography emits rem", remOk, `font-size/16 = ${unit("typography/font-size/16")}`);
check("layout emits px", pxOk, `spacing/16 = ${unit("spacing/16")}`);
check("font-weight stays unitless", unit("typography/font-weight/semibold") === "600");
check("duration emits ms", unit("motion/duration/fast") === "100ms");

/* 5. Typography classes, one per Figma text style. */
const typeCss = fs.readFileSync("dist/css/typography.css", "utf8");
const classes = (typeCss.match(/^\.sds-type-/gm) || []).length;
check(`${Object.keys(dump.textStyles).length} typography classes emitted`, classes === Object.keys(dump.textStyles).length, `${classes} found`);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
