/* scripts/template.js
   FANZA作品データ（スプレッドシート1行）→ WordPress記事HTML生成
   要件:
   - 感想/要約なし（データを網羅）
   - 公式ページリンクは dmm_affiliate_url のみ（direct_urlは使わない）
   - 画像: jacket + sample_image_1..20
   - 動画: sampleMovieURL を埋め込み（iframe）
   - series が "----" は非表示
   - play_count はあれば表示（なければ非表示）
   - レビュー最大5件（120〜150字でカット）
   - 記事末尾にPR固定文
*/

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
  // 作品説明は改変・要約なし。ただしプレーンテキストなら改行だけbrへ。
  const s = String(text ?? "");
  if (s.includes("<") && s.includes(">")) return s; // それっぽくHTMLならそのまま
  return escHtml(s).replace(/\r\n|\n|\r/g, "<br>");
}

function slugifyJaLike(input) {
  // /actress/xxx/ の xxx 用。日本語はURLエンコードよりも
  // 「簡易ローマ字化」は大変なので、まずは安全な簡易slugにします。
  // 同名衝突を避けたい場合は、後で別ルールに変更OK。
  const s = String(input ?? "").trim();
  if (!s) return "";
  // 英数と日本語を残しつつ、空白→-、記号除去
  const cleaned = s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\-]/gu, "");
  // 最後は encodeURIComponent で安全化
  return encodeURIComponent(cleaned);
}

function splitCsv(v) {
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

function makeTaxLinks(csvOrText, basePath) {
  const items = splitCsv(csvOrText);
  if (items.length === 0) return "";
  return items.map(name => {
    const slug = slugifyJaLike(name);
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

function excerpt(text, maxChars = 140) {
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
    const key = `sample_image_${i}`;
    const u = String(row[key] ?? "").trim();
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

    items.push({
      rating,
      publishDate,
      nickname,
      helpful,
      comment
    });
  }
  return items;
}

export function buildPostHtml(row) {
  const contentId = String(row.content_id ?? "").trim();
  const title = String(row.title ?? "").trim();

  const affUrl = String(row.dmm_affiliate_url ?? "").trim();
  // 公式ページリンクは affUrl のみ使用（direct_urlは使わない）

  const releaseDate = String(row.release_date ?? "").trim();
  const duration = String(row.duration_minutes ?? "").trim();
  const maker = String(row.maker ?? "").trim();
  const label = String(row.label ?? "").trim();
  const series = String(row.series ?? "").trim();
  const directors = String(row.directors ?? "").trim();
  const actresses = String(row.actresses ?? "").trim();
  const makerCode = String(row.maker_code ?? "").trim();
  const deliveryCode = String(row.delivery_code ?? "").trim();
  const genres = String(row.genres ?? "").trim();
  const playCount = String(row.play_count ?? "").trim();

  const jacket = String(row.jacket_image ?? "").trim();
  const sampleMovieURL = String(row.sampleMovieURL ?? "").trim();

  const description = row.description ?? row.item_description ?? row.product_description ?? "";
  const descriptionHtml = description ? nl2brHtml(description) : "";

  const reviewSummary = String(row.review_summary ?? "").trim();
  const avgRating = String(row.avg_rating ?? "").trim();
  const ratingTotal = String(row.rating_total ?? "").trim();

  const actressLinks = makeTaxLinks(actresses, "actress");
  const directorLinks = makeTaxLinks(directors, "director");
  const makerLink = maker ? `<a href="/maker/${slugifyJaLike(maker)}/">${escHtml(maker)}</a>` : "";
  const labelLink = label ? `<a href="/label/${slugifyJaLike(label)}/">${escHtml(label)}</a>` : "";
  const seriesLink = (series && series !== "----")
    ? `<a href="/series/${slugifyJaLike(series)}/">${escHtml(series)}</a>`
    : "";

  const sampleImages = collectSampleImages(row);

  const reviews = collectReviews(row);
  const reviewCount = ratingTotal || String(reviews.length);

  // レビューの星列挙（機械的に出す）
  const reviewStars = reviews
    .map(r => starsLine(r.rating))
    .filter(Boolean)
    .map(line => `<div>${escHtml(line)}</div>`)
    .join("");

  // レビュー抜粋
  const reviewItemsHtml = reviews.length
    ? reviews.map((r) => {
        const headerParts = [];
        if (r.nickname) headerParts.push(escHtml(r.nickname));
        if (r.publishDate) headerParts.push(escHtml(r.publishDate));
        const header = headerParts.join(" / ");
        const rateLine = r.rating ? escHtml(starsLine(r.rating)) : "";
        const helpful = r.helpful ? `（参考になった：${escHtml(r.helpful)}）` : "";
        return `
<article class="fanza-review">
  <header>${header}${rateLine ? ` / ${rateLine}` : ""} ${helpful}</header>
  <p>${excerpt(r.comment, 150)}</p>
</article>
`.trim();
      }).join("\n")
    : `<p>レビュー本文は取得できませんでした。</p>`;

  // 基本情報テーブルの行
  const rows = [
    tableRow("作品名", escHtml(title)),
    tableRow("商品コード", escHtml(contentId)),
    tableRow("配信開始日", escHtml(releaseDate)),
    tableRow("ジャンル", escHtml(genres)), // 全部表示（CSVのまま）
    tableRow(
      "公式ページ",
      affUrl
        ? `<a href="${escHtml(affUrl)}" rel="nofollow sponsored noopener" target="_blank">公式ページはこちら</a>`
        : ""
    ),
    playCount ? tableRow("再生数/人気指標", escHtml(playCount)) : "",
    maker ? tableRow("メーカー", makerLink || escHtml(maker)) : "",
    label ? tableRow("レーベル", labelLink || escHtml(label)) : "",
    (series && series !== "----") ? tableRow("シリーズ", seriesLink || escHtml(series)) : "",
    directors ? tableRow("監督", directorLinks || escHtml(directors)) : "",
    actresses ? tableRow("出演者", actressLinks || escHtml(actresses)) : "",
    makerCode ? tableRow("メーカー品番", escHtml(makerCode)) : "",
    deliveryCode ? tableRow("配信品番", escHtml(deliveryCode)) : "",
    duration ? tableRow("収録時間", escHtml(duration)) : ""
  ].filter(Boolean).join("\n");

  const jacketBlock = jacket
    ? `
<figure class="fanza-jacket">
  <img src="${escHtml(jacket)}" alt="${escHtml(title)}" loading="lazy">
</figure>
`.trim()
    : "";

  const sampleImagesBlock = sampleImages.length
    ? sampleImages.map((u, idx) => `
<figure class="fanza-sample">
  <img src="${escHtml(u)}" alt="${escHtml(title)} サンプル画像${idx + 1}" loading="lazy">
</figure>
`.trim()).join("\n")
    : `<p>サンプル画像はありません。</p>`;

  // 動画埋め込み（要望どおり iframe）
  const movieBlock = sampleMovieURL
    ? `
<iframe
  src="${escHtml(sampleMovieURL)}"
  width="560"
  height="360"
  frameborder="0"
  allowfullscreen
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
></iframe>
`.trim()
    : `<p>サンプル動画はありません。</p>`;

  // 説明が無い場合でもセクションは出す（空は避ける）
  const descriptionBlock = descriptionHtml
    ? descriptionHtml
    : `<p>作品説明は取得できませんでした。</p>`;

  // レビュー評価ブロック（review_summary優先、なければavg/total）
  const reviewSummaryBlock = (() => {
    const lines = [];
    if (reviewSummary) lines.push(`<p>${escHtml(reviewSummary)}</p>`);
    if (!reviewSummary && (avgRating || ratingTotal)) {
      if (ratingTotal) lines.push(`<p>レビュー件数：${escHtml(ratingTotal)}件</p>`);
      if (avgRating) lines.push(`<p>平均評価：★${escHtml(avgRating)}</p>`);
    }
    // 星列挙は機械的に表示（レビューがある時だけ）
    if (reviews.length) {
      lines.push(`<p>レビュー数：${escHtml(reviewCount)}件</p>`);
      lines.push(`<div class="fanza-review-stars">${reviewStars || ""}</div>`);
    }
    return lines.length ? lines.join("\n") : `<p>レビュー評価は取得できませんでした。</p>`;
  })();

  // 最終HTML（要件の順序どおり）
  return `
<h2>作品基本情報</h2>
<table class="fanza-spec">
  <tbody>
    ${rows}
  </tbody>
</table>

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
