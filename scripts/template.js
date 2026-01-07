/* ===== FANZA 本番テンプレ（最新版） ===== */

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function nl2br(t) {
  const s = String(t ?? "");
  if (s.includes("<") && s.includes(">")) return s;
  return esc(s).replace(/\n/g, "<br>");
}

function csv(v) {
  return String(v ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

function taxLinks(v, base) {
  return csv(v).map(n => `<a href="/${base}/${encodeURIComponent(n)}/">${esc(n)}</a>`).join(", ");
}

function stars(n) {
  const r = Math.round(Number(n) || 0);
  return `<span class="stars">${"★".repeat(r)}${"☆".repeat(5 - r)}</span>`;
}

export function buildPostHtml(r) {
  /* ==== 上部：ジャケット ==== */
  const jacket = r.jacket_image
    ? `<figure class="fanza-jacket"><img src="${esc(r.jacket_image)}" alt="${esc(r.title)}"></figure>`
    : "";

  /* ==== 基本情報テーブル ==== */
  const info = `
<table class="fanza-table">
<tr><th>作品名</th><td>${esc(r.title)}</td></tr>
<tr><th>メーカー番号</th><td>${esc(r.maker_code)}</td></tr>
<tr><th>配信番号</th><td>${esc(r.content_id)}</td></tr>
<tr><th>配信開始日</th><td>${esc(r.release_date)}</td></tr>
<tr><th>収録時間</th><td>${esc(r.duration_minutes)}分</td></tr>
<tr><th>ジャンル</th><td>${esc(r.genres)}</td></tr>
<tr><th>動画ページ</th>
<td><a href="${esc(r.dmm_affiliate_url)}" target="_blank" rel="nofollow sponsored">動画ページはこちら</a></td></tr>
${r.play_count ? `<tr><th>再生数</th><td>${esc(r.play_count)}</td></tr>` : ""}
${r.maker ? `<tr><th>メーカー</th><td>${taxLinks(r.maker, "maker")}</td></tr>` : ""}
${r.label ? `<tr><th>レーベル</th><td>${taxLinks(r.label, "label")}</td></tr>` : ""}
${r.series && r.series !== "----" ? `<tr><th>シリーズ</th><td>${taxLinks(r.series, "series")}</td></tr>` : ""}
${r.directors ? `<tr><th>監督</th><td>${taxLinks(r.directors, "director")}</td></tr>` : ""}
${r.actresses ? `<tr><th>出演者</th><td>${taxLinks(r.actresses, "actress")}</td></tr>` : ""}
</table>`;

  /* ==== 画像一覧 ==== */
  const images = Array.from({ length: 20 }, (_, i) => r[`sample_image_${i + 1}`])
    .filter(Boolean)
    .map((u, i) => `<img src="${esc(u)}" alt="サンプル画像${i + 1}">`)
    .join("");

  /* ==== レビュー ==== */
  const reviews = Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    if (!r[`review${n}_comment`]) return "";
    return `
<div class="review">
  ${stars(r[`review${n}_rating`])}
  <p>${esc(r[`review${n}_comment`]).slice(0, 150)}…</p>
</div>`;
  }).join("");

  return `
${jacket}

<h2>作品基本情報</h2>
${info}

<h2>画像一覧</h2>
<div class="fanza-images">${images || "<p>画像なし</p>"}</div>

<h2>サンプル動画</h2>
<iframe src="${esc(r.sampleMovieURL)}" width="560" height="360" loading="lazy" allowfullscreen></iframe>

<h2>作品説明</h2>
<div class="description">${nl2br(r.description)}</div>

<h2>レビュー評価</h2>
<p>${esc(r.review_summary)}</p>

<h2>レビュー本文（一部抜粋）</h2>
${reviews || "<p>レビューなし</p>"}

<h2>動画はこちらから</h2>
<p><a href="${esc(r.dmm_affiliate_url)}" target="_blank" rel="nofollow sponsored">▶ 動画はこちらから</a></p>

<h2>作品概要</h2>
<p>
本ページでは、FANZAで配信されている<br>
「${esc(r.title)}（${esc(r.maker_code)}）」の作品情報、ジャンル、レビュー評価、サンプル動画などを一覧形式で掲載しています。
</p>

<p class="pr">※当記事はPRを含みます。</p>
`;
}

