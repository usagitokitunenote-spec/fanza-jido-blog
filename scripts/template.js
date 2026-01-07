export function buildPostHtml(row) {
  return `
<h2>作品基本情報</h2>

<table border="1">
<tr><th>作品名</th><td>${row.title}</td></tr>
<tr><th>商品コード</th><td>${row.content_id}</td></tr>
<tr><th>配信開始日</th><td>${row.release_date || ""}</td></tr>
<tr><th>ジャンル</th><td>${row.genres || ""}</td></tr>
<tr>
  <th>公式ページ</th>
  <td>
    <a href="${row.dmm_affiliate_url}" target="_blank" rel="nofollow sponsored">
      公式ページはこちら
    </a>
  </td>
</tr>
</table>

<h2>画像</h2>
<img src="${row.jacket_image}" alt="${row.title}" style="max-width:100%;" />

<h2>作品概要</h2>
<p>
本ページでは、FANZAで配信されている<br>
「${row.title}（${row.content_id}）」の作品情報を掲載しています。
</p>

<p>※当記事はPRを含みます。</p>
`;
}
