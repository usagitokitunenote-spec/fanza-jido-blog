import fetch from "node-fetch";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const WP_BASE_URL = mustEnv("WP_BASE_URL").replace(/\/$/, "");
const WP_USER = mustEnv("WP_USER");
const WP_APP_PASS = mustEnv("WP_APP_PASS"); // 空白そのままでOK
const POST_LIMIT = Number(process.env.POST_LIMIT || 20);

const auth = Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString("base64");

async function wp(path) {
  const res = await fetch(`${WP_BASE_URL}${path}`, {
    headers: {
      Authorization: `Basic ${auth}`
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WP error ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  console.log("=== WP Connection Test ===");
  console.log("Base:", WP_BASE_URL);
  console.log("Limit:", POST_LIMIT);

  const posts = await wp("/wp-json/wp/v2/posts?per_page=1");
  console.log("Connected OK. Posts length:", posts.length);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
