import { readFileSync } from "node:fs";

const source = readFileSync(process.argv[2], "utf8");
const ours = readFileSync(process.argv[3], "utf8");

function sliceDash(html, startNeedle, endNeedle) {
  const start = html.indexOf(startNeedle);
  const end = html.indexOf(endNeedle, start + 1);
  return html.slice(start, end > -1 ? end : undefined);
}

const src = sliceDash(source, 'id="route-dashboard"', 'id="route-assessment"');
const our = sliceDash(ours, 'id="route-dashboard"', '<section id="route-assessment"');

function tokens(html) {
  const out = [];
  const tagRe = /<(section|article|div|span|strong|p|h1|h2|table|thead|tbody|tr|th|td|select|option|label|i|b|button|a|small)\b([^>]*)>/g;
  let match;
  while ((match = tagRe.exec(html))) {
    const attrs = match[2];
    const id = /(?:\sid="([^"]*)")/.exec(attrs)?.[1] ?? "";
    const cls = /(?:\sclass="([^"]*)")/.exec(attrs)?.[1] ?? "";
    if (id.startsWith("partner") || cls.includes("partner-")) continue;
    out.push(`${match[1]}${id ? "#" + id : ""}${cls ? "." + cls.trim().split(/\s+/).join(".") : ""}`);
  }
  return out;
}

const a = tokens(src);
const b = tokens(our);

let i = 0;
let j = 0;
let mismatches = 0;
while (i < a.length && j < b.length) {
  if (a[i] === b[j]) {
    i += 1;
    j += 1;
    continue;
  }
  const nextInB = b.indexOf(a[i], j);
  const nextInA = a.indexOf(b[j], i);
  if (nextInB === -1 && nextInA === -1) {
    mismatches += 1;
    if (mismatches <= 12) console.log(`DIFF\n  source: ${a[i]}\n  ours:   ${b[j]}`);
    i += 1;
    j += 1;
    continue;
  }
  if (nextInB !== -1 && (nextInA === -1 || nextInB - j <= nextInA - i)) {
    mismatches += 1;
    if (mismatches <= 12) console.log(`OURS MISSING: ${b.slice(j, nextInB).join(" > ").slice(0, 200)}`);
    j = nextInB;
  } else {
    mismatches += 1;
    if (mismatches <= 12) console.log(`OURS EXTRA: ${a.slice(i, nextInA).join(" > ").slice(0, 200)}`);
    i = nextInA;
  }
}
if (i < a.length) {
  console.log("SOURCE TAIL:", a.slice(i).join(" > ").slice(0, 400));
  mismatches += 1;
}
if (j < b.length) {
  console.log("OURS TAIL:", b.slice(j).join(" > ").slice(0, 400));
  mismatches += 1;
}
console.log(`\nsource nodes: ${a.length}, ours: ${b.length}, mismatches: ${mismatches}`);
