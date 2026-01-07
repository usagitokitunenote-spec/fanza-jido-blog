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
  return esc(s).replace(/\r\n|\n|\r/g, "<br>");
}

function splitCsv(v) {
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

function slugifyForPath(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  const cleaned = s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\-]/gu, "");
  return encodeURIComponent(cleaned);
}

function makeTaxLinksFromCsv(csv, basePath) {
  const items = splitCsv(csv);
  if (!items.length) return "";
  return items.map(name => {
    const slug = slugifyForPath(name);
    return `<a href="/${basePath}/${slug}/">${esc(name)}</a>`;
  }).join(", ");
}

function makeGenreLinks(csvGenres) {
  const items = splitCsv(csvGenres);
  if (!items.length) return "";
  return items.map(g => {
    const slug = slugifyForPath(g);
    return `<a class="genre" href="/genre/${slug}/">${esc(g)}</a>`;
  }).join(" ");
}

function starsHtml(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n)) return "";
  const r = Math.max(0, Math.min(5, Math.round(n)));
  return `<span class="stars">${"★".repeat(r)}${"☆".repeat(5 - r)}</span>`;
}

function excerpt(text, maxChars = 150) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  const cut = s.slice(0, maxChars);
  return esc(cut + (s.length > maxChars ? "…" : ""));
}

function collectSampleImages(row) {
  const urls = [];
  for (let i = 1; i <= 20; i++) {
    const u = String(row[`sample_image_${i}`] ?? "").trim();
    if (u) urls.push(u);
  }
  return urls;
}

function collectReviews(row) {
  const items = [];
  for (let i = 1; i <= 5; i++) {
    const comment = String(row[`review${i}_comment`] ?? "").trim();
    const nickname = String(row[`review${i}_nickname`] ?? "").trim();
    const publishDate = String(row[`review${i}_publishDate`] ?? "").trim();
    const rating = String(row[`review${i}_rating`] ?? "").trim();

    if (!comment && !nickname && !publishDate && !rating) continue;
    items.push({ comment, nickname, publishDate, rating });
  }
  return items;
}

export function buildPostHtml(r) {
  const title = String(r.title ?? "").trim();
  const affUrl = String(r.dmm_affiliate_url ?? "").trim();
  const makerCode = String(r.maker_code ?? "").trim();
  const contentId = String(r.content_id ?? "").trim();

  /* ===== ① タイトル ===== */
  const titleBlock = `<h2 class="fanza-title">${esc(title)}</h2>`;

  /* ===== ② ジャケット ===== */
  const jacketBlock = r.jacket_image
    ? `<figure class="fanza-jacket"><img src="${esc(r.jacket_image)}" alt="${esc(title)}"></figure>`
    : "";

  
  /* ===== 基本情報 ===== */
const infoRows = [
  `<tr><th>作品名</th><td>${
    affUrl
      ? `<a href="${esc(affUrl)}" target="_blank" rel="nofollow sponsored noopener">${esc(title)}</a>`
      : esc(title)
  }</td></tr>`,
  `<tr><th>メーカー番号</th><td>${esc(makerCode)}</td></tr>`,
  `<tr><th>配信番号</th><td>${esc(contentId)}</td></tr>`,
  r.release_date
    ? `<tr><th>配信開始日</th><td>${esc(r.release_date)}</td></tr>`
    : "",
  r.duration_minutes
    ? `<tr><th>収録時間</th><td>${esc(r.duration_minutes)}分</td></tr>`
    : "",
  r.genres
    ? `<tr><th>ジャンル</th><td>${makeGenreLinks(r.genres)}</td></tr>`
    : "",
].filter(Boolean).join("");
  
  const sampleImages = collectSampleImages(r);
  const sampleImagesBlock = sampleImages.length
    ? `<div class="fanza-images-grid">${sampleImages.map(u => `<img src="${esc(u)}">`).join("")}</div>`
    : "";

  const movieBlock = r.sampleMovieURL
    ? `<iframe src="${esc(r.sampleMovieURL)}" width="560" height="360" allowfullscreen></iframe>`
    : "";

  const reviews = collectReviews(r);
  const reviewItemsHtml = reviews.map(rv => `
<div class="fanza-review">
  <div>${esc(rv.nickname || "匿名")} ${starsHtml(rv.rating)}</div>
  <div>${excerpt(rv.comment, 150)}</div>
</div>`).join("");

  return `
${titleBlock}
${jacketBlock}

<h2 id="spec">作品基本情報</h2>
<table class="fanza-table">${infoRows}</table>

<h2 id="images">画像一覧</h2>
${sampleImagesBlock}

<h2 id="movie">サンプル動画</h2>
${movieBlock}

<h2 id="desc">作品説明</h2>
${nl2br(r.description)}

<h2 id="rating">レビュー評価</h2>
${r.review_summary || ""}

<h2 id="reviews">レビュー（一部抜粋）</h2>
${reviewItemsHtml}

<h2 id="more">作品の続きは、</h2>
<p><a href="${esc(affUrl)}" target="_blank" rel="nofollow sponsored">▶ こちらから</a></p>

<h2 id="summary">作品概要</h2>
<p>
本ページでは、FANZAで配信されている<br>
「${esc(title)}（${esc(makerCode)}）」の作品情報、ジャンル、レビュー評価、サンプル動画などを一覧形式で掲載しています。
</p>

<p class="pr">※当記事はPRを含みます。</p>
`.trim();
}
