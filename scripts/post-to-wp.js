import fetch from "node-fetch";
import { buildPostHtml } from "./template.js";

/* ===== 環境変数 ===== */
const WP_BASE_URL = process.env.WP_BASE_URL.replace(/\/$/, "");
const WP_USER = process.env.WP_USER;
const WP_APP_PASS = process.env.WP_APP_PASS;
const POST_LIMIT = Number(process.env.POST_LIMIT || 1);

/* ===== 認証 ===== */
const auth = Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString("base64");

/* ===== WP API ===== */
async function wp(path, options = {}) {
  const res = await fetch(`${WP_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

/* ===== ダミーデータ（最初はここ） =====
   ※ 次のステップでスプレッドシートに置き換える */
const dummyRows = [
  {
    content_id: "TEST-001",
    title: "テスト投稿（自動生成）",
    release_date: "2024-01-01",
    genres: "テスト, 自動投稿",
    jacket_image: "https://via.placeholder.com/600x400.png?text=TEST",
    dmm_affiliate_url: "https://example.com"
  }
];

/* ===== メイン ===== */
async function main() {
  console.log("POST_LIMIT =", POST_LIMIT);

  const rows = dummyRows.slice(0, POST_LIMIT);

  for (const row of rows) {
    const slug = row.content_id.toLowerCase();

    // 既存投稿チェック
    const exist = await wp(`/wp-json/wp/v2/posts?slug=${slug}`);
    if (exist.length > 0) {
      console.log("Skip existing:", slug);
      continue;
    }

    const html = buildPostHtml(row);

    const post = await wp("/wp-json/wp/v2/posts", {
      method: "POST",
      body: JSON.stringify({
        title: `${row.content_id} ${row.title}`,
        slug,
        status: "publish",
        content: html
      })
    });

    console.log("Posted:", post.id);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
