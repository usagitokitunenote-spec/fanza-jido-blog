function safeUnicode(str) {
  if (str == null) return "";
  return String(str)
    // 上位サロゲートだけ／下位サロゲートだけ、の壊れ文字を除去
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

function esc(v) {
  return safeUnicode(v)
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
  return items
    .map(name => {
      const slug = slugifyForPath(name);
      return `<a href="/${basePath}/${slug}/">${esc(name)}</a>`;
    })
    .join(", ");
}

function makeGenreLinks(csvGenres) {
  const items = splitCsv(csvGenres);
  if (!items.length) return "";
  return items
    .map(g => {
      const slug = slugifyForPath(g);
      return `<a class="genre" href="/genre/${slug}/">${esc(g)}</a>`;
    })
    .join(" ");
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

/* ===== サンプル画像：横スワイプ＋折りたたみ（文言は維持） ===== */
function buildSwipeImagesBlock(urls, visibleCount = 8) {
  const list = Array.isArray(urls) ? urls : [];
  if (!list.length) return "";

  const head = list.slice(0, visibleCount);
  const rest = list.slice(visibleCount);

  const swipe = imgs => `
<div class="fanza-swipe">
  ${imgs
    .map(
      u => `
    <div class="fanza-swipe-item">
      <img src="${esc(u)}" loading="lazy" alt="">
    </div>`.trim()
    )
    .join("")}
</div>`.trim();

  if (!rest.length) return swipe(head);

  return `
${swipe(head)}
<details class="fanza-images-more">
  <summary><span class="fanza-more-ic" aria-hidden="true">＋</span> 画像をもっと見る（全${list.length}枚）</summary>
  ${swipe(rest)}
</details>
`.trim();
}

/* ===== サンプル動画直下：HTMLボタンCTA（押したら白に反転） ===== */
function buildFanzaHtmlButton(affUrl) {
  if (!affUrl) return "";
  return `
<div class="fanza-html-cta">
  <a href="${esc(affUrl)}" class="fanza-btn" target="_blank" rel="nofollow sponsored noopener">
    作品ページをFANZAで確認する
  </a>
</div>
`.trim();
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

  /* ===== ② ジャケット（画像クリックでアフィへ） =====
     - sample_image_1 を最優先（＝ジャケ扱い）
     - なければ従来通り jacket_image
     ※ HTML構造・文言は変更しない
  */
  const jacketSrc =
    String(r.sample_image_1 ?? "").trim() ||
    String(r.jacket_image ?? "").trim();

  const jacketBlock = jacketSrc
    ? (affUrl
        ? `<figure class="fanza-jacket">
            <a href="${esc(affUrl)}" target="_blank" rel="nofollow sponsored noopener">
              <img src="${esc(jacketSrc)}" alt="${esc(title)}" loading="lazy">
            </a>
          </figure>`
        : `<figure class="fanza-jacket"><img src="${esc(jacketSrc)}" alt="${esc(title)}" loading="lazy"></figure>`
      )
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
    r.release_date ? `<tr><th>配信開始日</th><td>${esc(r.release_date)}</td></tr>` : "",
    r.duration_minutes ? `<tr><th>収録時間</th><td>${esc(r.duration_minutes)}分</td></tr>` : "",
    r.genres ? `<tr><th>ジャンル</th><td>${makeGenreLinks(r.genres)}</td></tr>` : "",
  ]
    .filter(Boolean)
    .join("");

  /* ===== 画像（横スワイプ＋折りたたみ） ===== */
  const sampleImages = collectSampleImages(r);
  const sampleImagesBlock = sampleImages.length ? buildSwipeImagesBlock(sampleImages, 8) : "";

  /* ===== 動画 ===== */
  const movieBlock = r.sampleMovieURL
    ? `<iframe src="${esc(r.sampleMovieURL)}" width="560" height="360" allowfullscreen loading="lazy"></iframe>`
    : "";

  /* ✅ サンプル動画直下：HTMLボタンCTA */
  const movieCtaButtonBlock = buildFanzaHtmlButton(affUrl);

  /* ===== レビュー（条件表示） ===== */
  const reviews = collectReviews(r);
  const hasReviews = reviews.length > 0;

  const reviewItemsHtml = hasReviews
    ? reviews
        .map(
          rv => `
<div class="fanza-review">
  <div>${esc(rv.nickname || "匿名")} ${starsHtml(rv.rating)}</div>
  <div>${excerpt(rv.comment, 150)}</div>
</div>`.trim()
        )
        .join("")
    : "";

  const reviewSummaryText = String(r.review_summary ?? "").trim();
  const hasRatingInfo =
    !!reviewSummaryText ||
    String(r.avg_rating ?? "").trim() !== "" ||
    String(r.rating_total ?? "").trim() !== "";

  const reviewSummaryBlock = reviewSummaryText
    ? `<p class="review-summary">${esc(reviewSummaryText)}</p>`
    : String(r.avg_rating ?? "").trim() || String(r.rating_total ?? "").trim()
      ? `<p class="review-summary">平均評価：★${esc(r.avg_rating || "")}（${esc(r.rating_total || "")}件）</p>`
      : "";

  /* ===== CTA（現行維持） ===== */
  const ctaBlock = affUrl
    ? `
<h2 id="more">作品の続きは、</h2>
<p><a href="${esc(affUrl)}" target="_blank" rel="nofollow sponsored">▶ こちらから</a></p>
`.trim()
    : "";

  return `
${titleBlock}
${jacketBlock}

<h2 id="spec">作品基本情報</h2>
<table class="fanza-table">${infoRows}</table>

<h2 id="images">見どころポイント</h2>
${sampleImagesBlock}

<h2 id="movie">サンプル動画</h2>
${movieBlock}
${movieCtaButtonBlock}

<h2 id="desc">作品説明</h2>
${nl2br(r.description)}

${hasRatingInfo ? `<h2 id="rating">レビュー評価</h2>\n${reviewSummaryBlock}` : ""}

${hasReviews ? `<h2 id="reviews">レビュー（一部抜粋）</h2>\n${reviewItemsHtml}` : ""}

${ctaBlock}

<h2 id="summary">作品概要</h2>
<p>
本ページでは、FANZAで配信されている<br>
「${esc(title)}（${esc(makerCode)}）」の作品情報、ジャンル、レビュー評価、サンプル動画などを一覧形式で掲載しています。
</p>

<p class="pr">※当記事はPRを含みます。</p>
`.trim();
}