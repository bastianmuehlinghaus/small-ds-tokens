/**
 * Figma extraction script — NOT run by node.
 *
 * Paste this into the Figma MCP `use_figma` tool (load the `figma-use` skill
 * first) against file key DABmspHvLwmzYjMrFBjVQW, then save the returned JSON
 * over scripts/figma-dump.json and run `npm run build`.
 *
 * The REST Variables API would be the obvious route, but it is Enterprise-only
 * and this file lives on a Pro plan. This also reads Tier 1, which is not
 * published to the library and so is invisible to search_design_system.
 */
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const all = await figma.variables.getLocalVariablesAsync();
const idToName = new Map(all.map((v) => [v.id, v.name]));

const h = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
const toHex = (c) => "#" + h(c.r) + h(c.g) + h(c.b) + (c.a !== undefined && c.a < 1 ? h(c.a) : "");
const ser = (val) => {
  if (val && typeof val === "object") {
    if (val.type === "VARIABLE_ALIAS") return "{" + (idToName.get(val.id) || val.id) + "}";
    if ("r" in val) return toHex(val);
  }
  return val;
};

const dump = (name) => {
  const c = collections.find((x) => x.name === name);
  const modes = new Map(c.modes.map((m) => [m.modeId, m.name]));
  const single = c.modes.length === 1;
  const o = {};
  all
    .filter((v) => v.variableCollectionId === c.id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((v) => {
      const entries = Object.entries(v.valuesByMode).map(([mid, val]) => [modes.get(mid), ser(val)]);
      o[v.name] = single ? entries[0][1] : Object.fromEntries(entries);
    });
  return o;
};

const ref = (bv) =>
  Object.fromEntries(Object.entries(bv || {}).map(([k, v]) => [k, "{" + (idToName.get(v.id) || v.id) + "}"]));

const textStyles = {};
for (const s of await figma.getLocalTextStylesAsync()) textStyles[s.name] = ref(s.boundVariables);

const effectStyles = {};
for (const s of await figma.getLocalEffectStylesAsync()) {
  effectStyles[s.name] = s.effects.map((e) => ({
    offsetX: e.offset.x, offsetY: e.offset.y, blur: e.radius, spread: e.spread,
    color: e.boundVariables?.color ? "{" + idToName.get(e.boundVariables.color.id) + "}" : toHex(e.color),
  }));
}

return {
  _meta: {
    fileKey: "DABmspHvLwmzYjMrFBjVQW",
    fileName: figma.root.name,
    extractedAt: new Date().toISOString().slice(0, 10),
    totalVariables: all.length,
    collections: Object.fromEntries(
      collections.map((c) => [c.name, { count: c.variableIds.length, modes: c.modes.map((m) => m.name) }])
    ),
  },
  tier1: dump("Tier 1 / Primitives"),
  tier2color: dump("Tier 2 / Semantics — Color"),
  tier2layout: dump("Tier 2 / Semantics — Layout"),
  tier3: dump("Tier 3 / Components"),
  textStyles,
  effectStyles,
};
