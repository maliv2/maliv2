// Renders a stats card for upstream open-source contributions.
// Only merged PRs to repositories the user does not own are counted.
// Usage: GITHUB_TOKEN=... node scripts/stats-card.mjs <login> <out.svg>
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [login = "maliv2", out = "dist/stats-card.svg"] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

const data = await gql(
  `query($q: String!, $login: String!) {
    search(query: $q, type: ISSUE, first: 100) {
      nodes { ... on PullRequest { additions deletions repository { nameWithOwner stargazerCount } } }
    }
    user(login: $login) {
      contributionsCollection {
        contributionCalendar { totalContributions }
      }
    }
  }`,
  { q: `is:pr is:merged author:${login} -user:${login}`, login },
);

const repos = new Map();
let mergedPrs = 0;
let additions = 0;
let deletions = 0;
for (const node of data.search.nodes) {
  if (!node?.repository) continue;
  mergedPrs++;
  additions += node.additions;
  deletions += node.deletions;
  repos.set(node.repository.nameWithOwner, node.repository.stargazerCount);
}
const totalStars = [...repos.values()].reduce((a, b) => a + b, 0);
const cc = data.user.contributionsCollection;

const compact = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
const full = (n) => n.toLocaleString("en-US");

const icons = {
  star: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
  merge: "M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z",
  repo: "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
  commit: "M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  pulse: "M6 2c.306 0 .582.187.696.471L10 10.731l1.304-3.26A.751.751 0 0 1 12 7h3.25a.75.75 0 0 1 0 1.5h-2.742l-1.812 4.528a.751.751 0 0 1-1.392 0L6 4.77 4.696 8.03A.75.75 0 0 1 4 8.5H.75a.75.75 0 0 1 0-1.5h2.742l1.812-4.529A.751.751 0 0 1 6 2Z",
};

const rows = [
  ["star", "Stars of projects I contribute to:", full(totalStars)],
  ["merge", "Merged upstream PRs:", full(mergedPrs)],
  ["repo", "Projects contributed to:", full(repos.size)],
  ["commit", "Lines changed in merged PRs:", `+${full(additions)} / -${full(deletions)}`],
  ["pulse", "Contributions (last year):", full(cc.contributionCalendar.totalContributions)],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const rowSvg = rows
  .map(([icon, label, value], i) => {
    const y = 72 + i * 26;
    return `<g class="row" style="animation-delay:${150 + i * 150}ms" transform="translate(25 ${y})">
      <svg viewBox="0 0 16 16" width="16" height="16" y="-12"><path class="icon" d="${icons[icon]}"/></svg>
      <text class="label" x="25">${esc(label)}</text>
      <text class="value" x="265">${esc(value)}</text>
    </g>`;
  })
  .join("\n");

const r = 40;
const circ = 2 * Math.PI * r;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="210" viewBox="0 0 495 210" role="img" aria-labelledby="t">
  <title id="t">${esc(login)}'s open-source stats: ${full(totalStars)} stars across ${repos.size} contributed projects</title>
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, sans-serif; fill: #70a5fd; }
    .label { font: 600 14px 'Segoe UI', Ubuntu, sans-serif; fill: #38bdae; }
    .value { font: 700 14px 'Segoe UI', Ubuntu, sans-serif; fill: #38bdae; }
    .icon { fill: #bf91f3; }
    .big { font: 800 18px 'Segoe UI', Ubuntu, sans-serif; fill: #bf91f3; }
    .small { font: 600 11px 'Segoe UI', Ubuntu, sans-serif; fill: #70a5fd; }
    .row { opacity: 0; animation: fade .3s ease-in-out forwards; }
    .ring { stroke-dasharray: ${circ}; stroke-dashoffset: ${circ}; animation: draw 1.2s ease-out forwards; }
    @keyframes fade { to { opacity: 1; } }
    @keyframes draw { to { stroke-dashoffset: 0; } }
  </style>
  <rect width="494" height="209" x=".5" y=".5" rx="10" fill="#1a1b27"/>
  <text class="title" x="25" y="38">${esc(login)}'s Open-Source Stats</text>
  ${rowSvg}
  <g transform="translate(405 108)">
    <circle r="${r}" fill="none" stroke="#70a5fd" stroke-opacity=".2" stroke-width="6"/>
    <circle class="ring" r="${r}" fill="none" stroke="#70a5fd" stroke-width="6" stroke-linecap="round" transform="rotate(-90)"/>
    <svg viewBox="0 0 16 16" width="16" height="16" x="-8" y="-28"><path class="icon" d="${icons.star}"/></svg>
    <text class="big" text-anchor="middle" y="7">${compact(totalStars)}</text>
    <text class="small" text-anchor="middle" y="24">stars</text>
  </g>
</svg>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(`stars=${totalStars} mergedPrs=${mergedPrs} repos=${[...repos.keys()].join(",")}`);
