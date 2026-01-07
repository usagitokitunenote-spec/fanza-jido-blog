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
  // 記事内リンク（内部リンク）
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
  return `<span class="stars" aria-label="${r} stars">${"★".repeat(r)}${"☆".repeat(5 - r)}</span>`;
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
    items.push({ i, comment, nickname, publishDate, rating });
  }
  return items;
}

export function buildPostHtml(r) {
  const title = String(r.title ?? "").trim();
  const affUrl = String(r.dmm_affiliate_url ?? "").trim();

  // 表示ルール：メーカー番号=maker_code、配信番号=content_id
  const makerCode = String(r.maker_code ?? "").trim();
  const contentId = String(r.content_id ?? "").trim();

  // 上部：ジャケットを最上段に
  const jacketBlock = r.jacket_image
    ? `<figure class="fanza-jacket"><img src="${esc(r.jacket_image)}" alt="${esc(title)}" loading="lazy"></figure>`
    : "";

  // ジャンル：記事内リンク化（/genre/xxx/）
  const genreLinks = makeGenreLinks(r.genres);

  // タクソノミーリンク（記事内）
  const actressLinks = makeTaxLinksFromCsv(r.actresses, "actress");
  const directorLinks = makeTaxLinksFromCsv(r.directors, "director");
  const makerLink = r.maker ? `<a href="/maker/${slugifyForPath(r.maker)}/">${esc(r.maker)}</a>` : "";
  const labelLink = r.label ? `<a href="/label/${slugifyForPath(r.label)}/">${esc(r.label)}</a>` : "";
  const series = String(r.series ?? "").trim();
  const seriesLink = (series && series !== "----")
    ? `<a href="/series/${slugifyForPath(series)}/">${esc(series)}</a>`
    : "";

  // 収録時間：数字だけ→分を付ける
  const duration = String(r.duration_minutes ?? "").trim();
  const durationText = duration ? `${esc(duration)}分` : "";

  // 作品説明：descriptionそのまま
  const descriptionBlock = r.description
    ? nl2br(r.description)
    : "<p>作品説明は取得できませんでした。</p>";

  // 画像一覧
  const sampleImages = collectSampleImages(r);
  const sampleImagesBlock = sampleImages.length
    ? `<div class="fanza-images-grid">` +
      sampleImages.map((u, idx) =>
        `<figure class="fanza-sample"><img src="${esc(u)}" alt="${esc(title)} サンプル画像${idx + 1}" loading="lazy"></figure>`
      ).join("") +
      `</div>`
    : `<p>サンプル画像はありません。</p>`;

  // 動画：iframe埋め込み
  const movieBlock = r.sampleMovieURL
    ? `<div class="fanza-movie"><iframe src="${esc(r.sampleMovieURL)}" width="560" height="360" frameborder="0" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`
    : `<p>サンプル動画はありません。</p>`;

  // レビュー
  const reviews = collectReviews(r);
  const reviewItemsHtml = reviews.length
    ? `<div class="fanza-reviews">` +
      reviews.map(rv => {
        const name = rv.nickname ? esc(rv.nickname) : "匿名";
        const date = rv.publishDate ? esc(rv.publishDate) : "";
        const stars = rv.rating ? starsHtml(rv.rating) : "";
        const header = `${name}${date ? ` / ${date}` : ""}`;
        return `
<article class="fanza-review">
  <header class="fanza-review-header">${header} ${stars}</header>
  <p class="fanza-review-body">${excerpt(rv.comment, 150)}</p>
</article>
`.trim();
      }).join("") +
      `</div>`
    : `<p>レビュー本文はありません。</p>`;

  // 基本情報テーブル（商品コード表記は廃止）
  const infoRows = [
    `<tr><th>作品名</th><td>${esc(title)}</td></tr>`,
    `<tr><th>メーカー番号</th><td>${esc(makerCode)}</td></tr>`,
    `<tr><th>配信番号</th><td>${esc(contentId)}</td></tr>`,
    r.release_date ? `<tr><th>配信開始日</th><td>${esc(r.release_date)}</td></tr>` : "",
    durationText ? `<tr><th>収録時間</th><td>${durationText}</td></tr>` : "",
    genreLinks ? `<tr><th>ジャンル</th><td><div class="genre-wrap">${genreLinks}</div></td></tr>` : "",
    affUrl ? `<tr><th>動画ページ</th><td><a href="${esc(affUrl)}" target="_blank" rel="nofollow sponsored noopener">動画ページはこちら</a></td></tr>` : "",
    r.play_count ? `<tr><th>再生数/人気指標</th><td>${esc(r.play_count)}</td></tr>` : "",
    makerLink ? `<tr><th>メーカー</th><td>${makerLink}</td></tr>` : "",
    labelLink ? `<tr><th>レーベル</th><td>${labelLink}</td></tr>` : "",
    seriesLink ? `<tr><th>シリーズ</th><td>${seriesLink}</td></tr>` : "",
    directorLinks ? `<tr><th>監督</th><td>${directorLinks}</td></tr>` : "",
    actressLinks ? `<tr><th>出演者</th><td>${actressLinks}</td></tr>` : "",
  ].filter(Boolean).join("");

  const reviewSummaryBlock = r.review_summary
    ? `<p class="review-summary">${esc(r.review_summary)}</p>`
    : (r.avg_rating || r.rating_total)
      ? `<p class="review-summary">平均評価：★${esc(r.avg_rating || "")}（${esc(r.rating_total || "")}件）</p>`
      : `<p class="review-summary">レビュー評価は取得できませんでした。</p>`;

  return `
${jacketBlock}

<h2>作品基本情報</h2>
<table class="fanza-table"><tbody>${infoRows}</tbody></table>

<h2>画像一覧</h2>
${sampleImagesBlock}

<h2>サンプル動画</h2>
${movieBlock}

<h2>作品説明</h2>
<div class="fanza-description">${descriptionBlock}</div>

<h2>みんなのレビュー評価数</h2>
${reviewSummaryBlock}

<h2>レビュー（一部抜粋）</h2>
${reviewItemsHtml}

<p>本作品のすべてのレビューについては、動画ページのレビュー一覧をご確認ください。</p>
${affUrl ? `<p><a href="${esc(affUrl)}" target="_blank" rel="nofollow sponsored noopener">▶ 動画ページのレビュー一覧へ</a></p>` : ""}

<h2>作品の続きは、</h2>
${affUrl ? `<p class="cta"><a href="${esc(affUrl)}" target="_blank" rel="nofollow sponsored noopener">▶ こちらから</a></p>` : ""}

<h2>作品概要</h2>
<p>
本ページでは、FANZAで配信されている<br>
「${esc(title)}（${esc(makerCode)}）」の作品情報、ジャンル、レビュー評価、サンプル動画などを一覧形式で掲載しています。
</p>

<p class="pr">※当記事はPRを含みます。</p>
`.trim();
}
