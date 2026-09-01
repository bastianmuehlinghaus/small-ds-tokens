/**
 * Transforms scripts/figma-dump.json (flat, slash-delimited Figma variable names)
 * into W3C DTCG token files under tokens/.
 *
 * Aliases are preserved as references ({color.neutral.900}), never flattened to
 * literals. The tier structure has to survive into code so that stylelint can
 * tell a Tier 1 primitive from a Tier 2 semantic token.
 */
import fs from "node:fs";
import path from "node:path";

const dump = JSON.parse(fs.readFileSync("scripts/figma-dump.json", "utf8"));

/**
 * Figma path -> DTCG $type.
 * Checked by path *segment*, not prefix: Tier 3 nests the group deeper
 * (button/primary/color/background/default), so a `^color/` prefix test would
 * mistype every component colour token as a dimension.
 */
function typeOf(p) {
  const seg = p.split("/");
  if (seg.includes("color")) return "color";
  if (p.startsWith("motion/duration/")) return "duration";
  if (p.startsWith("motion/easing/")) return "cubicBezier";
  if (seg[0] === "opacity") return "number";
  if (p.startsWith("typography/font-family/")) return "fontFamily";
  if (p.startsWith("typography/font-weight/")) return "fontWeight";
  return "dimension";
}

/** {a/b/c} -> {a.b.c} — DTCG uses dots for reference paths. */
const deref = (v) =>
  typeof v === "string" ? v.replace(/\{([^}]+)\}/g, (_, r) => `{${r.split("/").join(".")}}`) : v;

/** Insert a leaf at a slash path, building nested objects on the way down. */
function put(tree, slashPath, leaf) {
  const parts = slashPath.split("/");
  let node = tree;
  for (const part of parts.slice(0, -1)) node = node[part] ??= {};
  node[parts.at(-1)] = leaf;
}

/** Flat map -> nested DTCG tree. `pick` chooses a mode from multi-mode values. */
function toDTCG(flat, pick) {
  const tree = {};
  for (const [name, raw] of Object.entries(flat)) {
    const value = pick ? raw[pick] : raw;
    put(tree, name, { $type: typeOf(name), $value: deref(value) });
  }
  return tree;
}

const write = (file, data) => {
  fs.writeFileSync(path.join("tokens", file), JSON.stringify(data, null, 2) + "\n");
  return file;
};

const written = [];

written.push(write("tier1-primitives.json", toDTCG(dump.tier1)));
written.push(write("tier2-color.json", toDTCG(dump.tier2color, "Light")));
written.push(write("tier2-color.dark.json", toDTCG(dump.tier2color, "Dark")));
written.push(write("tier2-layout.json", toDTCG(dump.tier2layout)));
written.push(write("tier3-components.json", toDTCG(dump.tier3)));

// The 13 text styles are Figma *styles*, not variables — composite tokens whose
// members each reference a Tier 1 typography primitive.
const type = {};
for (const [name, s] of Object.entries(dump.textStyles)) {
  put(type, "type/" + name.toLowerCase().replace(/\//g, "-"), {
    $type: "typography",
    $value: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, deref(v)])),
  });
}
written.push(write("typography-styles.json", type));

// The 3 effect styles, composed from color/shadow/* so elevation themes by mode.
const elevation = {};
for (const [name, layers] of Object.entries(dump.effectStyles)) {
  put(elevation, name, {
    $type: "shadow",
    $value: layers.map((l) => ({ ...l, color: deref(l.color) })),
  });
}
written.push(write("elevation.json", elevation));

const count = (o) => JSON.stringify(o).match(/"\$value"/g)?.length ?? 0;
console.log("Wrote " + written.length + " DTCG files to tokens/:");
for (const f of written) {
  console.log("  " + f.padEnd(26) + count(JSON.parse(fs.readFileSync(path.join("tokens", f), "utf8"))) + " tokens");
}
