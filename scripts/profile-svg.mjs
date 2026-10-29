// Renders the profile hero and the merge-graph cards from live GitHub data.
// Only merged PRs to repositories the user does not own are counted.
// Writes <out>/hero-{dark,light}.svg and <out>/merges-{dark,light}.svg.
// Usage: GITHUB_TOKEN=... node scripts/profile-svg.mjs <login> [out-dir]
import { writeFileSync, mkdirSync } from "node:fs";

const [login = "maliv2", out = "dist"] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    query: `query($q: String!) {
      search(query: $q, type: ISSUE, first: 100) {
        nodes { ... on PullRequest { title number mergedAt additions deletions repository { nameWithOwner stargazerCount } } }
      }
    }`,
    variables: { q: `is:pr is:merged author:${login} -user:${login}` },
  }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));

const prs = json.data.search.nodes
  .filter((n) => n?.repository)
  .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
const repos = new Map(prs.map((p) => [p.repository.nameWithOwner, p.repository.stargazerCount]));
const stars = [...repos.values()].reduce((a, b) => a + b, 0);
const additions = prs.reduce((a, p) => a + p.additions, 0);
const deletions = prs.reduce((a, p) => a + p.deletions, 0);

const THEMES = {
  dark: { bg: "#0d1117", border: "#30363d", fg: "#e6edf3", muted: "#7d8590", line: "#30363d", accent: "#ff8a3d", add: "#3fb950", del: "#f85149" },
  light: { bg: "#ffffff", border: "#d0d7de", fg: "#1f2328", muted: "#59636e", line: "#d0d7de", accent: "#d9480f", add: "#1a7f37", del: "#cf222e" },
};
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
// "fix(telegram): inline taps ..." -> "Telegram: inline taps ..."
const pretty = (title) => {
  const m = title.match(/^\w+(?:\(([^)]+)\))?!?:\s*(.+)$/);
  if (!m) return title;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  return m[1] ? `${cap(m[1])}: ${m[2]}` : cap(m[2]);
};

const style = (t, extra = "") => `<style>
    .sans { font-family: ${SANS}; }
    .mono { font-family: ${MONO}; }
    .fg { fill: ${t.fg}; } .muted { fill: ${t.muted}; } .accent { fill: ${t.accent}; }
    .add { fill: ${t.add}; } .del { fill: ${t.del}; }
    .in { opacity: 0; animation: in .5s ease-out forwards; }
    .draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.4s ease-out forwards; }
    .pulse { transform-box: fill-box; transform-origin: center; animation: pulse 2.4s ease-out infinite; }
    @keyframes in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes pulse { from { opacity: .8; transform: scale(1); } to { opacity: 0; transform: scale(3.2); } }
    ${extra}
  </style>`;

function hero(t) {
  const W = 900, H = 320, Y = 262;
  // Each merged PR is a branch that leaves main and merges back, oldest on the left.
  const step = prs.length > 1 ? 680 / (prs.length - 1) : 0;
  const w = Math.min(64, Math.max(step, 24) * 0.85);
  const xAt = (i) => (prs.length > 1 ? 160 + i * step : 760);
  const branches = [...prs]
    .reverse()
    .map((p, i) => {
      const x = xAt(i);
      const h = [22, 34, 28][i % 3];
      const d = `M${x - w} ${Y} C${x - w * 0.7} ${Y} ${x - w * 0.8} ${Y - h} ${x - w * 0.55} ${Y - h} L${x - w * 0.3} ${Y - h} C${x - w * 0.05} ${Y - h} ${x - w * 0.15} ${Y} ${x} ${Y}`;
      const delay = 600 + i * 120;
      return `<path class="draw" pathLength="1" d="${d}" fill="none" stroke="${t.accent}" stroke-opacity=".55" stroke-width="1.5" style="animation-delay:${delay}ms"/>
    <circle class="in" cx="${x - w * 0.42}" cy="${Y - h}" r="3" fill="${t.bg}" stroke="${t.accent}" stroke-width="1.5" style="animation-delay:${delay + 300}ms"/>
    <circle class="in" cx="${x}" cy="${Y}" r="4.5" fill="${t.accent}" style="animation-delay:${delay + 500}ms"/>`;
    })
    .join("\n    ");
  const latest = xAt(prs.length - 1);
  const stat = (x, value, label, delay) =>
    `<g class="in" style="animation-delay:${delay}ms"><text x="${x}" y="122" text-anchor="end" class="sans fg" font-size="40" font-weight="700">${esc(value)}</text>
    <text x="${x}" y="144" text-anchor="end" class="mono muted" font-size="12">${esc(label)}</text></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">
  <title id="t">Mali (${esc(login)}): ${prs.length} merged upstream pull requests across ${repos.size} open-source projects</title>
  ${style(t)}
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
  <text x="40" y="46" class="mono muted" font-size="13">~/${esc(login)} <tspan class="accent">●</tspan> main</text>
  <text x="${W - 40}" y="46" text-anchor="end" class="mono muted" font-size="13">upstream only · updated every 6h</text>
  <g class="in" style="animation-delay:100ms"><text x="38" y="128" class="sans fg" font-size="68" font-weight="800" letter-spacing="-2">Mali<tspan class="accent">.</tspan></text></g>
  <g class="in" style="animation-delay:250ms"><text x="40" y="168" class="sans fg" font-size="21">I fix the bugs that hide in edge cases.</text></g>
  <g class="in" style="animation-delay:400ms"><text x="40" y="196" class="mono muted" font-size="13">security · oauth · concurrency · parsing — in other people's code</text></g>
  ${stat(560, prs.length, "merged PRs", 300)}
  ${stat(690, repos.size, "projects", 420)}
  ${stat(W - 40, `★ ${compact(stars)}`, "stars on those repos", 540)}
  <path class="draw" pathLength="1" d="M40 ${Y} H${W - 40}" stroke="${t.line}" stroke-width="2" style="animation-delay:300ms"/>
  <text x="40" y="${Y + 34}" class="mono muted" font-size="12">first merge · ${esc(prs.at(-1)?.mergedAt.slice(0, 10) ?? "—")}</text>
  <text x="${W - 40}" y="${Y + 34}" text-anchor="end" class="mono muted" font-size="12"><tspan class="add">+${additions.toLocaleString("en-US")}</tspan> <tspan class="del">−${deletions.toLocaleString("en-US")}</tspan> lines merged</text>
  ${branches}
  ${prs.length ? `<circle class="pulse" cx="${latest}" cy="${Y}" r="4.5" fill="${t.accent}"/>` : ""}
</svg>
`;
}

function merges(t) {
  const SHOW = 8, W = 900, ROW = 66, TOP = 64;
  const shown = prs.slice(0, SHOW);
  const more = prs.length - shown.length;
  const H = TOP + shown.length * ROW + (more > 0 ? 44 : 16);
  const rows = shown
    .map((p, i) => {
      const y = TOP + i * ROW;
      const delay = 150 + i * 110;
      return `<g class="in" style="animation-delay:${delay}ms">
    <path d="M48 ${y + 4} C70 ${y + 4} 70 ${y + 14} 70 ${y + 24} V${y + 34} C70 ${y + 46} 70 ${y + 54} 48 ${y + 54}" fill="none" stroke="${t.accent}" stroke-opacity=".55" stroke-width="1.5"/>
    <circle cx="70" cy="${y + 29}" r="3.5" fill="${t.bg}" stroke="${t.accent}" stroke-width="1.5"/>
    <circle cx="48" cy="${y + 54}" r="5" fill="${t.accent}"/>
    <text x="100" y="${y + 24}" class="mono" font-size="13"><tspan class="accent">${esc(p.repository.nameWithOwner)}</tspan><tspan class="muted"> #${p.number}</tspan></text>
    <text x="100" y="${y + 46}" class="sans fg" font-size="15">${esc(cut(pretty(p.title), 84))}</text>
    <text x="${W - 40}" y="${y + 24}" text-anchor="end" class="mono muted" font-size="12">${p.mergedAt.slice(0, 10)}</text>
    <text x="${W - 40}" y="${y + 46}" text-anchor="end" class="mono" font-size="12"><tspan class="add">+${p.additions}</tspan> <tspan class="del">−${p.deletions}</tspan></text>
  </g>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">
  <title id="t">Latest merged upstream pull requests by ${esc(login)}</title>
  ${style(t)}
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
  <text x="40" y="40" class="mono muted" font-size="13"><tspan class="accent">$</tspan> git log --merges --author=${esc(login)} --upstream</text>
  <path class="draw" pathLength="1" d="M48 ${TOP - 4} V${TOP + shown.length * ROW - 6}" stroke="${t.line}" stroke-width="2"/>
  ${rows}
  ${more > 0 ? `<text x="100" y="${H - 22}" class="mono muted" font-size="12">… and ${more} more merged pull request${more > 1 ? "s" : ""}</text>` : ""}
</svg>
`;
}

mkdirSync(out, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(`${out}/hero-${name}.svg`, hero(t));
  writeFileSync(`${out}/merges-${name}.svg`, merges(t));
}
console.log(`mergedPrs=${prs.length} repos=${[...repos.keys()].join(",")} stars=${stars}`);
