import fetch from "node-fetch";
import { parse } from "csv-parse/sync";
import { buildPostHtml } from "./template.js";

/* ======================
   Env
====================== */
function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const WP_BASE_URL = mustEnv("WP_BASE_URL").replace(/\/$/, "");
const WP_USER = mustEnv("WP_USER");
const WP_APP_PASS = mustEnv("WP_APP_PASS");
const GOOGLE_SHEET_ID = mustEnv("GOOGLE_SHEET_ID");

const SHEET_NAME = process.env.SHEET_NAME || "シート4";
const POST_LIMIT = Number(process.env.POST_LIMIT || 20);
const MODE = (process.env.MODE || "skip").toLowerCase(); // skip / update
const WP_STATUS = (process.env.WP_STATUS || "draft").toLowerCase();
const MAX_TAGS = Number(process.env.MAX_TAGS || 10);
const RANDOM_PICK = (process.env.RANDOM_PICK || "1") === "1";
const FORCE_FEATURED = (process.env.FORCE_FEATURED || "0") === "1";

/* ======================
   手編集・index済み（守る）9件：slug除外
====================== */
const EXCLUDE_SLUGS = new Set([
  "smus063",
  "suji00285",
  "parathd04123",
  "kbms00203",
  "smjs065",
  "miab00571",
  "mkon00119",
  "dvmm00325",
  "smub042",
]);

/* ======================
   WP REST helpers
====================== */
const auth = Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString("base64");

async function wp(path, options = {}) {
  const res = await fetch(`${WP_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WP API error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function normalizeSlug(s) {
  return String(s || "").trim().toLowerCase();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ======================
   Sheet fetch
====================== */
async function fetchSheetRows() {
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(GOOGLE_SHEET_ID)}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`Sheet fetch failed ${res.status}`);

  return parse(text, { columns: true, skip_empty_lines: true });
}

/* ======================
   Taxonomy helpers
====================== */
const termCache = new Map();

async function upsertTerm(taxonomy, name) {
  const n = String(name || "").trim();
  if (!n) return null;

  const key = `${taxonomy}|${n}`;
  if (termCache.has(key)) return termCache.get(key);

  const found = await wp(`/wp-json/wp/v2/${taxonomy}?search=${encodeURIComponent(n)}&per_page=100`);
  const exact = (found || []).find(t => String(t.name).trim() === n);
  if (exact) {
    termCache.set(key, exact.id);
    return exact.id;
  }

  const created = await wp(`/wp-json/wp/v2/${taxonomy}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: n }),
  });

  termCache.set(key, created.id);
  return created.id;
}

function splitCsv(v) {
  const s = String(v || "").trim();
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

/* ======================
   WP tags（ざっくり）
====================== */
const TAG_ALLOWLIST = new Map([
  ["jk", "JK"], ["女子校生", "JK"],
  ["jd", "JD"], ["女子大生", "JD"],
  ["素人", "素人"], ["人妻", "人妻"], ["ol", "OL"], ["OL", "OL"],
  ["フェラ", "フェラ"], ["中出し", "中出し"], ["足コキ", "足コキ"],
]);

function buildPostTags(row) {
  const raw = splitCsv(row.genres);
  const out = [];
  const seen = new Set();

  for (const g of raw) {
    const m = TAG_ALLOWLIST.get(g) || TAG_ALLOWLIST.get(g.toLowerCase());
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

async function upsertWpTag(name) {
  const n = String(name || "").trim();
  if (!n) return null;

  const found = await wp(`/wp-json/wp/v2/tags?search=${encodeURIComponent(n)}&per_page=100`);
  const exact = (found || []).find(t => String(t.name).trim() === n);
  if (exact) return exact.id;

  const created = await wp(`/wp-json/wp/v2/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: n }),
  });
  return created.id;
}

/* ======================
   Featured image
====================== */
async function uploadFeaturedImage(jacketUrl, filenameBase) {
  const imgRes = await fetch(jacketUrl);
  if (!imgRes.ok) return null;

  const buf = Buffer.from(await imgRes.arrayBuffer());
  const media = await wp(`/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Disposition": `attachment; filename="${filenameBase}.jpg"`,
      "Content-Type": "image/jpeg",
    },
    body: buf,
  });
  return media?.id ?? null;
}

/* ======================
   Main
====================== */
async function main() {
  const rows = await fetchSheetRows();

  // 対象抽出
  let candidates = rows
    .filter(r => /^OK:/i.test(String(r.api_status || "").trim()))
    .filter(r => String(r.content_id || "").trim())
    .filter(r => String(r.dmm_affiliate_url || "").trim());

  // ランダム化（順番荒れてもOKならONでも可）
  if (RANDOM_PICK) {
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
  }

  let processed = 0;

  for (const row of candidates) {
    if (processed >= POST_LIMIT) break;

    const slug = normalizeSlug(row.content_id);

    // ✅ 手編集・index済みは触らない
    if (EXCLUDE_SLUGS.has(slug)) {
      console.log("Exclude (manual/indexed):", slug);
      continue;
    }

    // 既存確認（slugで決め打ち）
    const exist = await wp(`/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&per_page=1`);
    const hasExisting = exist && exist.length;
    const postId = hasExisting ? exist[0].id : null;

    // ✅ MODEごとの挙動を固定
    // skip：既存は触らない、新規だけ作る
    if (MODE === "skip" && hasExisting) {
      console.log("Skip existing:", slug);
      continue;
    }
    // update：既存だけ更新、新規は作らない
    if (MODE === "update" && !hasExisting) {
      console.log("Skip create (update-only):", slug);
      continue;
    }

    // genre（ジャンル）
    const genreIds = [];
    for (const g of splitCsv(row.genres)) {
      const id = await upsertTerm("genre", g);
      if (id) genreIds.push(id);
    }

    // 他タクソノミー
    const actressIds = [];
    for (const a of splitCsv(row.actresses)) {
      const id = await upsertTerm("actress", a);
      if (id) actressIds.push(id);
    }

    const directorIds = [];
    for (const d of splitCsv(row.directors)) {
      const id = await upsertTerm("director", d);
      if (id) directorIds.push(id);
    }

    const makerIds = row.maker ? [await upsertTerm("maker", row.maker)] : [];
    const labelIds = row.label ? [await upsertTerm("label", row.label)] : [];

    const seriesIds = [];
    if (row.series && row.series !== "----") {
      const id = await upsertTerm("series", row.series);
      if (id) seriesIds.push(id);
    }

    // WP標準タグ
    const tagIds = [];
    for (const t of buildPostTags(row)) {
      const id = await upsertWpTag(t);
      if (id) tagIds.push(id);
    }

    const html = buildPostHtml(row);

    // featured_media：
    // - create（MODE=skipで新規）なら付ける
    // - updateなら FORCE_FEATURED=1 のときだけ更新
    let featuredMediaId = null;
    if (row.jacket_image && (!hasExisting || FORCE_FEATURED)) {
      featuredMediaId = await uploadFeaturedImage(row.jacket_image, slug);
    }

    const payload = {
      title: `【${row.maker_code}】 ${row.title}`,
      slug,
      status: WP_STATUS,
      content: html,
      tags: tagIds,

      genre: genreIds,
      actress: actressIds,
      director: directorIds,
      maker: makerIds.filter(Boolean),
      label: labelIds.filter(Boolean),
      series: seriesIds,
    };

    if (featuredMediaId) payload.featured_media = featuredMediaId;

    // ✅ endpoint：update-only時は必ず posts/{id}
    // skipで新規のときは posts
    const endpoint = hasExisting
      ? `/wp-json/wp/v2/posts/${postId}`
      : `/wp-json/wp/v2/posts`;

    const saved = await wp(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    processed++;
    console.log(hasExisting ? "Updated:" : "Created:", saved.id, slug);

    await sleep(200);
  }

  console.log("Processed:", processed, "MODE:", MODE);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});