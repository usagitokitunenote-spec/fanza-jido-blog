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
const MODE = (process.env.MODE || "update").toLowerCase(); // update | skip
const WP_STATUS = (process.env.WP_STATUS || "draft").toLowerCase(); // draft | publish
const MAX_TAGS = Number(process.env.MAX_TAGS || 10);

// 更新時にアイキャッチを強制更新したい場合だけ 1
const FORCE_FEATURED = (process.env.FORCE_FEATURED || "0") === "1";

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

/* ======================
   Sheet fetch (CSV via gviz)
   ※シートが「リンク閲覧可」になっている必要あり
====================== */
async function fetchSheetRows() {
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(GOOGLE_SHEET_ID)}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`Sheet fetch failed ${res.status}: ${text.slice(0, 200)}`);

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
  });

  return records;
}

/* ======================
   Taxonomy / tag helpers
====================== */
const termCache = new Map(); // key: `${tax}|${name}` => id

async function upsertTerm(taxonomy, name) {
  const n = String(name || "").trim();
  if (!n) return null;

  const key = `${taxonomy}|${n}`;
  if (termCache.has(key)) return termCache.get(key);

  // slug指定したい場合はここで追加も可能（今はWP任せ）
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
   “ざっくりタグ” allowlist
   genres/relatedWords を全部タグ化しない（汚くなるため）
====================== */
const TAG_ALLOWLIST = new Map([
  // 属性
  ["jk", "JK"], ["女子校生", "JK"], ["女子校生・JK", "JK"],
  ["jd", "JD"], ["女子大生", "JD"],
  ["素人", "素人"], ["人妻", "人妻"], ["主婦", "主婦"], ["ol", "OL"], ["OL", "OL"],

  // プレイ系
  ["フェラ", "フェラ"], ["フェラチオ", "フェラ"],
  ["足コキ", "足コキ"], ["手コキ", "手コキ"], ["パイズリ", "パイズリ"],
  ["中出し", "中出し"], ["顔射", "顔射"], ["口内射精", "口内射精"],

  // シチュ系（必要なら増やす）
  ["ナンパ", "ナンパ"], ["盗撮", "盗撮"], ["逆ナン", "逆ナン"], ["ハーレム", "ハーレム"],
]);

function buildPostTags(row) {
  // 入力は genres を中心に。relatedWords列が将来増えたらここに足す。
  const raw = splitCsv(row.genres);
  const out = [];
  const seen = new Set();

  for (const g of raw) {
    const key = g.trim();
    if (!key) continue;

    // allowlistに合うものだけ採用
    const mapped =
      TAG_ALLOWLIST.get(key) ||
      TAG_ALLOWLIST.get(key.toLowerCase()) ||
      null;

    if (!mapped) continue;

    if (!seen.has(mapped)) {
      seen.add(mapped);
      out.push(mapped);
    }
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

async function upsertWpTag(name) {
  // WP標準タグは /tags
  const n = String(name || "").trim();
  if (!n) return null;

  const key = `post_tag|${n}`;
  if (termCache.has(key)) return termCache.get(key);

  const found = await wp(`/wp-json/wp/v2/tags?search=${encodeURIComponent(n)}&per_page=100`);
  const exact = (found || []).find(t => String(t.name).trim() === n);
  if (exact) {
    termCache.set(key, exact.id);
    return exact.id;
  }

  const created = await wp(`/wp-json/wp/v2/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: n }),
  });
  termCache.set(key, created.id);
  return created.id;
}

/* ======================
   Featured image upload
====================== */
function guessContentType(url) {
  const u = String(url || "").toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function uploadFeaturedImage(jacketUrl, filenameBase) {
  const url = String(jacketUrl || "").trim();
  if (!url) return null;

  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`Image download failed ${imgRes.status}: ${url}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());

  const contentType = guessContentType(url);
  const ext = contentType === "image/png" ? "png"
    : contentType === "image/webp" ? "webp"
    : contentType === "image/gif" ? "gif"
    : "jpg";
  const filename = `${filenameBase}.${ext}`;

  const media = await wp(`/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": contentType,
    },
    body: buf,
  });

  return media?.id ?? null;
}

/* ======================
   Main
====================== */
async function main() {
  console.log("SHEET_NAME:", SHEET_NAME);
  console.log("POST_LIMIT:", POST_LIMIT, "MODE:", MODE, "WP_STATUS:", WP_STATUS);

  const rows = await fetchSheetRows();

  // 対象：api_statusがOK、content_idあり、アフィURLあり
  const targets = rows
    .filter(r => String(r.api_status || "").startsWith("OK"))
    .filter(r => String(r.content_id || "").trim())
    .filter(r => String(r.dmm_affiliate_url || "").trim())
    .slice(0, POST_LIMIT);

  console.log("Targets:", targets.length);

  for (const row of targets) {
    const contentId = String(row.content_id).trim();
    const title = String(row.title || "").trim();
    const slug = normalizeSlug(contentId);

    // 既存判定（slug=content_id）
    const exist = await wp(`/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&per_page=1`);
    const existingPost = (exist && exist.length) ? exist[0] : null;

    if (existingPost && MODE === "skip") {
      console.log("Skip existing:", slug);
      continue;
    }

    // タクソノミーIDを用意
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

    const makerIds = [];
    if (String(row.maker || "").trim()) {
      const id = await upsertTerm("maker", row.maker);
      if (id) makerIds.push(id);
    }

    const labelIds = [];
    if (String(row.label || "").trim()) {
      const id = await upsertTerm("label", row.label);
      if (id) labelIds.push(id);
    }

    const seriesIds = [];
    const series = String(row.series || "").trim();
    if (series && series !== "----") {
      const id = await upsertTerm("series", series);
      if (id) seriesIds.push(id);
    }

    // 標準タグ（allowlist）
    const tagNames = buildPostTags(row);
    const tagIds = [];
    for (const t of tagNames) {
      const id = await upsertWpTag(t);
      if (id) tagIds.push(id);
    }

    // 本文HTML生成（テンプレ）
    const html = buildPostHtml(row);

    // featured image（新規 or 強制更新時）
    let featuredMediaId = null;
    const alreadyHasFeatured = existingPost?.featured_media && Number(existingPost.featured_media) > 0;

    if (!existingPost || FORCE_FEATURED || !alreadyHasFeatured) {
      if (String(row.jacket_image || "").trim()) {
        try {
          featuredMediaId = await uploadFeaturedImage(row.jacket_image, slug);
        } catch (e) {
          console.log("Featured image upload failed (continue):", slug, String(e).slice(0, 200));
        }
      }
    }

    const payload = {
      title: `${contentId} ${title}`,
      slug,
      status: WP_STATUS,
      content: html,

      // 標準タグ
      tags: tagIds,

      // カスタムタクソノミー
      actress: actressIds,
      director: directorIds,
      maker: makerIds,
      label: labelIds,
      series: seriesIds,
    };

    if (featuredMediaId) payload.featured_media = featuredMediaId;

    if (!existingPost) {
      const created = await wp(`/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("Created:", created.id, slug);
    } else {
      const updated = await wp(`/wp-json/wp/v2/posts/${existingPost.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("Updated:", updated.id, slug);
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
