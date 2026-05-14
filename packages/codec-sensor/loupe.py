#!/usr/bin/env python3
"""
loupe — CSV & JSON → beautiful self-contained interactive HTML dashboard.

Usage:
    python loupe.py data.csv -o dashboard.html
    python loupe.py data.json -o dashboard.html
    cat data.csv | python loupe.py - -o dashboard.html
"""

import argparse
import csv
import html
import json
import os
import sys
from datetime import datetime

__version__ = "0.1.0"


# ═══════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════

def load_csv(text):
    reader = csv.DictReader(text.splitlines())
    rows = [dict(row) for row in reader]
    columns = reader.fieldnames or (list(rows[0].keys()) if rows else [])
    return columns, rows


def load_json(text):
    data = json.loads(text)
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        # Try common wrappers: {"data": [...]} {"rows": [...]} {"items": [...]}
        for key in ("data", "rows", "items", "results", "records"):
            if key in data and isinstance(data[key], list):
                rows = data[key]
                break
        else:
            rows = [data]
    else:
        raise ValueError("JSON must be an array or object containing an array.")

    # Flatten one level of nesting if values are scalars
    flat = []
    for row in rows:
        if isinstance(row, dict):
            flat.append({str(k): str(v) if not isinstance(v, (dict, list)) else json.dumps(v)
                         for k, v in row.items()})
        else:
            flat.append({"value": str(row)})

    columns = list(flat[0].keys()) if flat else []
    return columns, flat


def detect_type(values):
    """Detect column type: number | date | boolean | text."""
    clean = [v.strip() for v in values if v.strip()]
    if not clean:
        return "text"

    # Boolean
    bools = {"true", "false", "yes", "no", "1", "0", "t", "f", "y", "n"}
    if all(v.lower() in bools for v in clean):
        return "boolean"

    # Number
    try:
        [float(v.replace(",", "").replace("$", "").replace("%", "").replace("€", "").replace("£", ""))
         for v in clean]
        return "number"
    except ValueError:
        pass

    # Date
    date_fmts = ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d",
                 "%d-%m-%Y", "%m-%d-%Y", "%b %d, %Y", "%d %b %Y")
    for fmt in date_fmts:
        try:
            [datetime.strptime(v, fmt) for v in clean[:20]]
            return "date"
        except ValueError:
            pass

    return "text"


def column_stats(values, col_type):
    """Compute summary stats for a column."""
    clean = [v.strip() for v in values if v.strip()]
    if col_type == "number":
        nums = []
        for v in clean:
            try:
                nums.append(float(v.replace(",", "").replace("$", "").replace("%", "").replace("€", "").replace("£", "")))
            except ValueError:
                pass
        if nums:
            return {"min": min(nums), "max": max(nums),
                    "mean": sum(nums) / len(nums), "count": len(nums)}
    return {"unique": len(set(clean)), "count": len(clean)}


# ═══════════════════════════════════════════════════════════════
# HTML GENERATION
# ═══════════════════════════════════════════════════════════════

CSS = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f0f11;--bg2:#18181b;--bg3:#27272a;
  --border:#3f3f46;--text:#e4e4e7;--sub:#a1a1aa;--muted:#71717a;
  --accent:#6366f1;--accent2:#a855f7;
  --green:#22c55e;--red:#ef4444;--amber:#f59e0b;
  --radius:10px;--font:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;
  --mono:'SF Mono','Cascadia Code','JetBrains Mono',Consolas,monospace;
}
[data-theme=light]{
  --bg:#fafaf9;--bg2:#ffffff;--bg3:#f5f5f4;
  --border:#e7e5e4;--text:#1c1917;--sub:#78716c;--muted:#a8a29e;
}
body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;min-height:100vh}
header{
  display:flex;align-items:center;gap:16px;padding:18px 24px;
  background:var(--bg2);border-bottom:1px solid var(--border);
  position:sticky;top:0;z-index:10;flex-wrap:wrap;
}
.logo{font-size:20px;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;white-space:nowrap}
.meta{color:var(--sub);font-size:13px;white-space:nowrap}
.search{
  flex:1;min-width:160px;max-width:320px;padding:7px 12px;
  background:var(--bg3);border:1px solid var(--border);border-radius:8px;
  color:var(--text);font-size:13px;outline:none;margin-left:auto;
}
.search:focus{border-color:var(--accent)}
.btn{
  padding:6px 12px;border-radius:8px;border:1px solid var(--border);
  background:var(--bg3);color:var(--sub);cursor:pointer;font-size:12px;
  white-space:nowrap;
}
.btn:hover{border-color:var(--accent);color:var(--text)}
.dashboard-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.6fr);gap:16px;padding:18px 24px 0}
.chart-card{
  background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);
  padding:16px;min-width:0;
}
.chart-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.chart-title{font-size:13px;font-weight:700;color:var(--text)}
.chart-meta{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:3px}
.chart-canvas{
  display:block;width:100%;height:260px;border-radius:8px;
  background:linear-gradient(180deg,var(--bg),var(--bg3));border:1px solid var(--border);
}
.profile-card{
  background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);
  padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0;
}
.profile-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--border);padding-bottom:8px}
.profile-row:last-child{border-bottom:0;padding-bottom:0}
.profile-label{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.profile-value{font-family:var(--mono);font-size:12px;color:var(--text);text-align:right;overflow:hidden;text-overflow:ellipsis}
.stats-row{
  display:flex;gap:12px;padding:16px 24px;flex-wrap:wrap;
  border-bottom:1px solid var(--border);background:var(--bg);
}
.stat-card{
  background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);
  padding:12px 16px;min-width:130px;flex:1;max-width:200px;
}
.stat-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.stat-val{font-size:18px;font-weight:600;color:var(--text)}
.stat-sub{font-size:11px;color:var(--sub);margin-top:2px}
.bar{height:4px;background:var(--bg3);border-radius:2px;margin-top:8px;overflow:hidden}
.bar-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.table-wrap{overflow-x:auto;padding:0 24px 24px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}
th{
  text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--muted);border-bottom:1px solid var(--border);cursor:pointer;
  white-space:nowrap;user-select:none;background:var(--bg);position:sticky;top:62px;
}
th:hover{color:var(--accent)}
th .sort-icon{margin-left:4px;opacity:.4;font-size:10px}
th.sorted .sort-icon{opacity:1;color:var(--accent)}
td{
  padding:9px 12px;border-bottom:1px solid var(--border);
  color:var(--text);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
tr:hover td{background:var(--bg3)}
td.num{font-family:var(--mono);font-size:12px;color:var(--text)}
td.bool-true{color:var(--green)}
td.bool-false{color:var(--red)}
.mini-bar{
  display:inline-block;height:4px;background:var(--accent);
  border-radius:2px;vertical-align:middle;margin-left:6px;opacity:.6;
}
footer{
  display:flex;align-items:center;justify-content:space-between;
  padding:12px 24px;border-top:1px solid var(--border);
  color:var(--sub);font-size:12px;background:var(--bg2);flex-wrap:wrap;gap:8px;
}
.page-btns{display:flex;gap:6px;align-items:center}
.page-btn{
  padding:4px 10px;border-radius:6px;border:1px solid var(--border);
  background:var(--bg3);color:var(--sub);cursor:pointer;font-size:12px;
}
.page-btn:hover{border-color:var(--accent);color:var(--text)}
.page-btn.active{background:var(--accent);border-color:var(--accent);color:#fff}
.empty{text-align:center;padding:48px;color:var(--muted)}
@media (max-width: 820px){
  header{padding:14px 16px}
  .dashboard-grid{grid-template-columns:1fr;padding:14px 16px 0}
  .stats-row{padding:14px 16px}
  .table-wrap{padding:0 16px 18px}
  .chart-canvas{height:220px}
  th{top:58px}
  footer{padding:12px 16px}
}
"""

JS = r"""
const DATA = /*DATA*/;
const COLS = /*COLS*/;
const TYPES = /*TYPES*/;

const PAGE_SIZE = 50;
let filtered = DATA;
let sortCol = null, sortDir = 1, page = 0;
let query = "";

const tbody = document.querySelector("tbody");
const footer_info = document.getElementById("footer-info");
const search = document.getElementById("search");
const chart = document.getElementById("chart");
const chartTitle = document.getElementById("chart-title");
const chartMeta = document.getElementById("chart-meta");

function parseNum(v) {
  return parseFloat(String(v).replace(/[,$%€£]/g, "")) || 0;
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sort(col) {
  if (sortCol === col) sortDir *= -1;
  else { sortCol = col; sortDir = 1; }
  page = 0;
  render();
  document.querySelectorAll("th").forEach(th => {
    th.classList.toggle("sorted", th.dataset.col === col);
    if (th.dataset.col === col)
      th.querySelector(".sort-icon").textContent = sortDir > 0 ? "↑" : "↓";
    else
      th.querySelector(".sort-icon").textContent = "↕";
  });
}

function filter(q) {
  query = q.toLowerCase();
  page = 0;
  filtered = query
    ? DATA.filter(row => COLS.some(c => String(row[c] ?? "").toLowerCase().includes(query)))
    : DATA;
  render();
}

function render() {
  let rows = filtered.slice();
  if (sortCol) {
    rows.sort((a, b) => {
      const av = a[sortCol] ?? "", bv = b[sortCol] ?? "";
      if (TYPES[sortCol] === "number")
        return (parseNum(av) - parseNum(bv)) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
  }

  // Column mins/maxes for mini bars
  const numMeta = {};
  for (const c of COLS) {
    if (TYPES[c] === "number") {
      const vals = rows.map(r => parseNum(r[c]));
      numMeta[c] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
  }

  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const total = rows.length;
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);

  tbody.innerHTML = slice.length ? slice.map(row => `
    <tr>${COLS.map(c => {
      const v = row[c] ?? "";
      const t = TYPES[c];
      if (t === "number") {
        const n = parseNum(v);
        const {min, max} = numMeta[c];
        const pct = max !== min ? Math.round((n - min) / (max - min) * 60) : 60;
        return `<td class="num">${escapeHtml(v)}<span class="mini-bar" style="width:${pct}px"></span></td>`;
      }
      if (t === "boolean") {
        const b = ["true","yes","1","t","y"].includes(String(v).toLowerCase());
        return `<td class="bool-${b}">${b ? "✓" : "✗"}</td>`;
      }
      return `<td title="${escapeHtml(v)}">${escapeHtml(v)}</td>`;
    }).join("")}
    </tr>`).join("") : `<tr><td class="empty" colspan="${COLS.length}">No results found</td></tr>`;

  footer_info.textContent = total === DATA.length
    ? `Showing ${start}–${end} of ${total.toLocaleString()} rows`
    : `${total.toLocaleString()} matches · showing ${start}–${end}`;

  renderPager(total);
  renderChart(rows);
}

function renderChart(rows) {
  if (!chart) return;
  const ctx = chart.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = chart.getBoundingClientRect();
  chart.width = Math.max(1, Math.floor(rect.width * ratio));
  chart.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const yCol = COLS.find(c => c !== "timeSec" && TYPES[c] === "number") ||
    COLS.find(c => TYPES[c] === "number");
  if (!yCol || rows.length === 0) {
    chartTitle.textContent = "No numeric preview";
    chartMeta.textContent = "Add a numeric column to draw a signal.";
    return;
  }

  const xCol = COLS.includes("timeSec") ? "timeSec" : null;
  const points = rows.map((row, i) => ({
    x: xCol ? parseNum(row[xCol]) : i,
    y: parseNum(row[yCol]),
  })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (points.length === 0) return;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = { left: 42, right: 16, top: 18, bottom: 30 };
  const innerW = Math.max(1, w - pad.left - pad.right);
  const innerH = Math.max(1, h - pad.top - pad.bottom);
  const xSpan = maxX !== minX ? maxX - minX : 1;
  const ySpan = maxY !== minY ? maxY - minY : 1;
  const sx = x => pad.left + ((x - minX) / xSpan) * innerW;
  const sy = y => pad.top + innerH - ((y - minY) / ySpan) * innerH;

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--border").trim();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (innerH / 4) * i;
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
  }
  ctx.stroke();

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = sx(p.x), y = sy(p.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--sub").trim();
  ctx.font = "11px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
  ctx.fillText(minY.toFixed(3), 8, sy(minY));
  ctx.fillText(maxY.toFixed(3), 8, sy(maxY) + 4);
  ctx.fillText(String(minX), pad.left, h - 10);
  ctx.fillText(String(maxX), w - pad.right - 42, h - 10);

  chartTitle.textContent = `${yCol} over ${xCol || "row"}`;
  chartMeta.textContent = `${points.length.toLocaleString()} point preview · min ${minY.toFixed(4)} · max ${maxY.toFixed(4)}`;
}

function renderPager(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const pager = document.getElementById("pager");
  if (pages <= 1) { pager.innerHTML = ""; return; }
  const range = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages-1 || Math.abs(i - page) <= 2) range.push(i);
    else if (range[range.length-1] !== "…") range.push("…");
  }
  pager.innerHTML = [
    `<button class="page-btn" onclick="go(${page-1})" ${page===0?"disabled":""}>←</button>`,
    ...range.map(i => i === "…"
      ? `<span style="color:var(--muted)">…</span>`
      : `<button class="page-btn ${i===page?"active":""}" onclick="go(${i})">${i+1}</button>`),
    `<button class="page-btn" onclick="go(${page+1})" ${page>=pages-1?"disabled":""}>→</button>`,
  ].join("");
}

function go(p) {
  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  if (p < 0 || p >= pages) return;
  page = p;
  render();
  window.scrollTo(0, 0);
}

function toggleTheme() {
  const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = t === "dark" ? "" : "light";
  document.getElementById("theme-btn").textContent = t === "light" ? "☀" : "◑";
  render();
}

search.addEventListener("input", e => filter(e.target.value));
window.addEventListener("resize", () => render());
document.querySelectorAll("th[data-col]").forEach(th =>
  th.addEventListener("click", () => sort(th.dataset.col)));

render();
"""


def generate_html(columns, rows, filename, col_types):
    n = len(rows)
    nc = len(columns)

    # Build stats cards (up to 5 numeric columns)
    stat_cards = []
    for col in columns:
        if col_types[col] == "number":
            vals = [r.get(col, "") for r in rows]
            stats = column_stats(vals, "number")
            if stats and "min" in stats:
                pct = min(100, int((stats["mean"] - stats["min"]) /
                                  max(stats["max"] - stats["min"], 1) * 100))
                card = (
                    f'<div class="stat-card">'
                    f'<div class="stat-label">{html.escape(col)}</div>'
                    f'<div class="stat-val">{stats["mean"]:.1f}</div>'
                    f'<div class="stat-sub">avg · {stats["min"]:.0f}–{stats["max"]:.0f}</div>'
                    f'<div class="bar"><div class="bar-fill" style="width:{pct}%"></div></div>'
                    f'</div>'
                )
                stat_cards.append(card)
            if len(stat_cards) >= 5:
                break

    # Table header
    headers = "".join(
        f'<th data-col="{html.escape(col, quote=True)}">{html.escape(col)}<span class="sort-icon">↕</span></th>'
        for col in columns
    )

    stats_html = ""
    if stat_cards:
        stats_html = f'<div class="stats-row">{" ".join(stat_cards)}</div>'

    # Escape data for JS embedding
    data_json = json.dumps(rows, ensure_ascii=False)
    cols_json = json.dumps(columns, ensure_ascii=False)
    types_json = json.dumps(col_types, ensure_ascii=False)

    js = (JS
          .replace("/*DATA*/", data_json)
          .replace("/*COLS*/", cols_json)
          .replace("/*TYPES*/", types_json))

    short_name = os.path.basename(filename)
    safe_short_name = html.escape(short_name)
    title = f"{short_name} — loupe"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>{CSS}</style>
</head>
<body>
<header>
  <div class="logo">⊙ loupe</div>
  <div class="meta">{safe_short_name} · {nc} col{"s" if nc!=1 else ""} · {n:,} row{"s" if n!=1 else ""}</div>
  <input class="search" id="search" type="search" placeholder="Search all columns…" autocomplete="off">
  <button class="btn" id="theme-btn" onclick="toggleTheme()">◑</button>
</header>
<section class="dashboard-grid" aria-label="Data preview">
  <div class="chart-card">
    <div class="chart-head">
      <div>
        <div class="chart-title" id="chart-title">Signal preview</div>
        <div class="chart-meta" id="chart-meta">Rendering numeric columns…</div>
      </div>
    </div>
    <canvas class="chart-canvas" id="chart"></canvas>
  </div>
  <aside class="profile-card" aria-label="Dataset profile">
    <div class="profile-row"><span class="profile-label">File</span><span class="profile-value">{safe_short_name}</span></div>
    <div class="profile-row"><span class="profile-label">Rows</span><span class="profile-value">{n:,}</span></div>
    <div class="profile-row"><span class="profile-label">Columns</span><span class="profile-value">{nc}</span></div>
    <div class="profile-row"><span class="profile-label">Numeric</span><span class="profile-value">{sum(1 for c in columns if col_types[c] == "number")}</span></div>
  </aside>
</section>
{stats_html}
<div class="table-wrap">
  <table>
    <thead><tr>{headers}</tr></thead>
    <tbody></tbody>
  </table>
</div>
<footer>
  <span id="footer-info"></span>
  <div class="page-btns" id="pager"></div>
</footer>
<script>{js}</script>
</body>
</html>"""


# ═══════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════

def main():
    p = argparse.ArgumentParser(
        description="loupe — CSV & JSON → beautiful self-contained interactive HTML dashboard.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n"
               "  python loupe.py sales.csv -o sales.html\n"
               "  python loupe.py users.json -o users.html\n"
               "  cat data.csv | python loupe.py - -o out.html\n",
    )
    p.add_argument("input", help="Input file (.csv or .json) or - for stdin")
    p.add_argument("-o", "--output", default="-", help="Output HTML file (default: stdout)")
    p.add_argument("-f", "--format", choices=["csv", "json"], help="Force input format")
    p.add_argument("--version", action="version", version=f"loupe {__version__}")
    args = p.parse_args()

    # Read input
    if args.input == "-":
        text = sys.stdin.read()
        filename = "stdin.csv"
    else:
        with open(args.input, encoding="utf-8", errors="replace") as f:
            text = f.read()
        filename = args.input

    # Parse
    fmt = args.format or ("json" if args.input.endswith(".json") else "csv")
    try:
        if fmt == "json":
            columns, rows = load_json(text)
        else:
            columns, rows = load_csv(text)
    except Exception as e:
        print(f"Error parsing input: {e}", file=sys.stderr)
        sys.exit(1)

    if not rows:
        print("Warning: no rows found in input.", file=sys.stderr)

    # Detect column types
    col_types = {}
    for col in columns:
        vals = [row.get(col, "") for row in rows]
        col_types[col] = detect_type(vals)

    # Generate
    html = generate_html(columns, rows, filename, col_types)

    # Output
    if args.output == "-":
        sys.stdout.write(html)
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(html)
        size_kb = len(html.encode()) / 1024
        print(f"✓ {args.output} ({size_kb:.0f}kb · {len(rows):,} rows · {len(columns)} columns)", file=sys.stderr)


if __name__ == "__main__":
    main()
