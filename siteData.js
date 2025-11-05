import fetch from "node-fetch";

let siteCache = "";

export async function loadSiteData() {
  try {
    const res = await fetch(process.env.SITE_URL);
    const html = await res.text();
    siteCache = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    console.log("✅ Website data loaded successfully.");
  } catch (err) {
    console.error("❌ Failed to load site content:", err);
  }
}

export function getSiteData() {
  return siteCache;
}
