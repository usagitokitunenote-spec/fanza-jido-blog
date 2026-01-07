function escHtml(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2brHtml(text) {
  const s = String(text ?? "");
  // 作品説明がHTMLっぽい場合はそのまま（改変しない）
  if (s.includes("<") && s.includes(">")) return s;
  return escHtml(s).replace(/\r\n|\n|\r/g, "<br>");
}

function splitCsv(v) {
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

function slugifyForPath(input) {
  // 簡易slug（WP側のタクソノミーアーカイブURL用）
  const s = String(input ?? "").trim();
  if (!s) return "";
  const cleaned = s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\-]/gu, "");
  return encodeURIComponent(cleaned);
}

function makeTaxLinks(csv, basePath) {
  const items = splitCsv(csv);
  if (!items.length) return "";
  return items.map(name => {
    const slug = slugifyForPath(name);
    const label = escHtml(name);
    if (!slug) return label;
    return `<a href="/${basePath}/${slug}/">${label}</a>`;
  }).join(", ");
}

function tableRow(label, valueHtml) {
  const v = String(valueHtml ?? "").trim();
  if (!v) return "";
  return `<tr><th>${escHtml(label)}</th><td>${v}</td></tr>`;
}

function excerpt(text, maxChars = 150) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  const cut = s.slice(0, maxChars);
  return escHtml(cut + (s.length > maxChars ? "…" : ""));
}

function starsLine(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n)) return "";
  const full = Math.max(0, Math.min(5, Math.round(n)));
  const stars = "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  return `${stars} ${full}`;
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
    const rating = String(row[`review${i}_rating`] ?? "").trim();
    const publishDate = String(row[`review${i}_publishDate`] ?? "").trim();
    const nickname = String(row[`review${i}_nickname`] ?? "").trim();
    const helpful = String(row[`review${i}_helpfulCount`] ?? "").trim();
    const comment = String(row[`review${i}_comment`] ?? "").trim();

    if (!rating && !publishDate && !nickname && !comment) continue;
    items.push({ rating, publishDate, nickname, helpful, comment });
  }
  return items;
}

export function buildPostHtml(row) {
  const contentId = String(row.content_id ?? "").trim();
  const title = String(row.title ?? "").trim();
  const affUrl = String(row.dmm_affiliate_url ?? "").trim(); // これのみ使用

  const series = String(row.series ?? "").trim();

  const actressLinks = makeTaxLinks(row.actresses, "actress");
  const directorLinks = makeTaxLinks(row.directors, "director");
  const maker = String(row.maker ?? "").trim();
  const label = String(row.label ?? "").trim();

  const makerLink = maker ? `<a href="/maker/${slugifyForPath(maker)}/">${escHtml(maker)}</a>` : "";
  const labelLink = label ? `<a href="/label/${slugifyForPath(label)}/">${escHtml(label)}</a>` : "";
  const seriesLink = (series && series !== "----")
    ? `<a href="/series/${slugifyForPath(series)}/">${escHtml(series)}</a>`
    : "";

  const rows = [
    tableRow("作品名", escHtml(title)),
    tableRow("商品コード", escHtml(contentId)),
    tableRow("配信開始日", escHtml(row.release_date)),
    tableRow("ジャンル", escHtml(row.genres)),
    tableRow(
      "公式ページ",
      affUrl
        ? `<a href="${escHtml(affUrl)}" rel="nofollow sponsored noopener" target="_blank">公式ページはこちら</a>`
        : ""
    ),
    row.play_count ? tableRow("再生数/人気指標", escHtml(row.play_count)) : "",
    maker ? tableRow("メーカー", makerLink || escHtml(maker)) : "",
    label ? tableRow("レーベル", labelLink || escHtml(label)) : "",
    (series && series !== "----") ? tableRow("シリーズ", seriesLink || escHtml(series)) : "",
    row.directors ? tableRow("監督", directorLinks || escHtml(row.directors)) : "",
    row.actresses ? tableRow("出演者", actressLinks || escHtml(row.actresses)) : "",
    row.maker_code ? tableRow("メーカー品番", escHtml(row.maker_code)) : "",
    row.delivery_code ? tableRow("配信品番", escHtml(row.delivery_code)) : "",
    row.duration_minutes ? tableRow("収録時間", escHtml(row.duration_minutes)) : ""
  ].filter(Boolean).join("\n");

  const jacket = String(row.jacket_image ?? "").trim();
  const jacketBlock = jacket
    ? `<figure class="fanza-jacket"><img src="${escHtml(jacket)}" alt="${escHtml(title)}" loading="lazy"></figure>`
    : "";

  const sampleImages = collectSampleImages(row);
  const sampleImagesBlock = sampleImages.length
    ? sampleImages.map((u, idx) =>
        `<figure class="fanza-sample"><img src="${escHtml(u)}" alt="${escHtml(title)} サンプル画像${idx + 1}" loading="lazy"></figure>`
      ).join("\n")
    : `<p>サンプル画像はありません。</p>`;

  const sampleMovieURL = String(row.sampleMovieURL ?? "").trim();
  const movieBlock = sampleMovieURL
    ? `<iframe src="${escHtml(sampleMovieURL)}" width="560" height="360" frameborder="0" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
    : `<p>サンプル動画はありません。</p>`;

  const descriptionHtml = nl2brHtml(row.description ?? "");
  const descriptionBlock = descriptionHtml
    ? descriptionHtml
    : `<p>作品説明は取得できませんでした。</p>`;

  const reviews = collectReviews(row);
  const reviewSummary = String(row.review_summary ?? "").trim();
  const avgRating = String(row.avg_rating ?? "").trim();
  const ratingTotal = String(row.rating_total ?? "").trim();

  const reviewStars = reviews
    .map(r => starsLine(r.rating))
    .filter(Boolean)
    .map(line => `<div>${escHtml(line)}</div>`)
    .join("");

  const reviewSummaryBlock = (() => {
    const lines = [];
    if (reviewSummary) lines.push(`<p>${escHtml(reviewSummary)}</p>`);
    if (!reviewSummary && (avgRating || ratingTotal)) {
      if (ratingTotal) lines.push(`<p>レビュー件数：${escHtml(ratingTotal)}件</p>`);
      if (avgRating) lines.push(`<p>平均評価：★${escHtml(avgRating)}</p>`);
    }
    if (reviews.length) {
      lines.push(`<p>レビュー数：${escHtml(ratingTotal || String(reviews.length))}件</p>`);
      lines.push(`<div class="fanza-review-stars">${reviewStars}</div>`);
    }
    return lines.length ? lines.join("\n") : `<p>レビュー評価は取得できませんでした。</p>`;
  })();

  const reviewItemsHtml = reviews.length
    ? reviews.map((r) => {
        const headerParts = [];
        if (r.nickname) headerParts.push(escHtml(r.nickname));
        if (r.publishDate) headerParts.push(escHtml(r.publishDate));
        const header = headerParts.join(" / ");
        const rateLine = r.rating ? escHtml(starsLine(r.rating)) : "";
        return `
<article class="fanza-review">
  <header>${header}${rateLine ? ` / ${rateLine}` : ""}</header>
  <p>${excerpt(r.comment, 150)}</p>
</article>
`.trim();
      }).join("\n")
    : `<p>レビュー本文は取得できませんでした。</p>`;

  return `
<h2>作品基本情報</h2>
<table class="fanza-spec"><tbody>
${rows}
</tbody></table>

<h2>画像一覧</h2>
<div class="fanza-images">
${jacketBlock}
${sampleImagesBlock}
</div>

<h2>サンプル動画</h2>
<div class="fanza-movie">
${movieBlock}
</div>

<h2>作品説明</h2>
<div class="fanza-description">
${descriptionBlock}
</div>

<h2>レビュー評価</h2>
<div class="fanza-review-summary">
${reviewSummaryBlock}
</div>

<h2>レビュー本文（一部抜粋）</h2>
<div class="fanza-reviews">
${reviewItemsHtml}
</div>

<h2>レビュー一覧</h2>
<p>本作品のすべてのレビューについては、公式ページのレビュー一覧をご確認ください。</p>
${affUrl ? `<p><a href="${escHtml(affUrl)}" rel="nofollow sponsored noopener" target="_blank">▶ 公式ページのレビュー一覧へ</a></p>` : ""}

<h2>動画の続きはこちら</h2>
${affUrl ? `<p><a href="${escHtml(affUrl)}" rel="nofollow sponsored noopener" target="_blank">▶ 動画の続きはこちらから</a></p>` : ""}

<h2>作品概要</h2>
<p>
本ページでは、FANZAで配信されている<br>
「${escHtml(title)}（${escHtml(contentId)}）」の作品情報、ジャンル、レビュー評価、サンプル動画などを一覧形式で掲載しています。
</p>

<p class="fanza-pr-note">※当記事はPRを含みます。</p>
`.trim();
}
