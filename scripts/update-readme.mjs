// Rewrites the merged-PR parts of README.md from live GitHub data.
// Only merged PRs to repositories the user does not own are listed.
// Titles already in the table are kept, so hand-edited wording survives.
// Usage: GITHUB_TOKEN=... node scripts/update-readme.mjs <login> [README.md]
import { readFileSync, writeFileSync } from "node:fs";

const [login = "maliv2", file = "README.md"] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");

const START = "<!-- MERGED-PRS:START -->";
const END = "<!-- MERGED-PRS:END -->";
const EMOJI = { openclaw: "🦞", abraunegg: "☁️" };

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    query: `query($q: String!) {
      search(query: $q, type: ISSUE, first: 100) {
        nodes { ... on PullRequest { title url mergedAt repository { name nameWithOwner owner { login } } } }
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

let readme = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const s = readme.indexOf(START);
const e = readme.indexOf(END);
if (s < 0 || e < s) throw new Error(`markers ${START} / ${END} not found in ${file}`);

// Keep titles already shown for a PR, keyed by its URL.
const known = new Map();
for (const m of readme.slice(s, e).matchAll(/\| \[([^\]]+)\]\((https:\/\/github\.com\/[^)]+\/pull\/\d+)\) \|/g)) {
  known.set(m[2], m[1]);
}

// "fix(telegram): inline taps ..." -> "Telegram: inline taps ..."
const pretty = (title) => {
  const m = title.match(/^\w+(?:\(([^)]+)\))?!?:\s*(.+)$/);
  if (!m) return title;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  return m[1] ? `${cap(m[1])}: ${m[2]}` : cap(m[2]);
};
const md = (t) => t.replace(/\|/g, "\\|").replace(/\[/g, "\\[").replace(/\]/g, "\\]");

const repos = [...new Map(prs.map((p) => [p.repository.nameWithOwner, p.repository])).values()];
const pins = repos
  .map(
    (r) =>
      `  <a href="https://github.com/${r.nameWithOwner}"><img src="https://github-readme-stats.vercel.app/api/pin/?username=${r.owner.login}&repo=${r.name}&theme=tokyonight&hide_border=true&border_radius=10&description_lines_count=2" alt="${r.name}" /></a>`,
  )
  .join("\n");
const badge = "![merged](https://img.shields.io/badge/merged-8957e5?style=flat-square&logo=github)";
const rows = prs
  .map((p) => {
    const r = p.repository;
    const title = known.get(p.url) ?? md(pretty(p.title));
    return `| ${EMOJI[r.owner.login] ?? "📦"} [**${r.nameWithOwner}**](https://github.com/${r.nameWithOwner}) | [${title}](${p.url}) | ${badge} |`;
  })
  .join("\n");

const section = `${START}
<p align="center">
${pins}
</p>

| Project | Pull request | Status |
| --- | --- | :---: |
${rows}
`;
readme = readme.slice(0, s) + section + readme.slice(e);

// Header badge count and the typing line's "Merged in a, b & c".
readme = readme.replace(/Merged%20upstream%20PRs-\d+-/, `Merged%20upstream%20PRs-${prs.length}-`);
const names = repos.map((r) => r.name);
const list = names.length > 1 ? `${names.slice(0, -1).join(",+")}+%26+${names.at(-1)}` : names[0] ?? "";
readme = readme.replace(/Merged\+in\+[^";&]*/, `Merged+in+${list}`);

writeFileSync(file, readme);
console.log(`mergedPrs=${prs.length} repos=${repos.map((r) => r.nameWithOwner).join(",")}`);
