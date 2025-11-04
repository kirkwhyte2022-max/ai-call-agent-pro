// siteData.js — fetch and cache website content
import fetch from "node-fetch";

let siteCache = "";

export async function loadSiteData() {
  try {
    const res = await fetch(process.env.SITE_URL);
    const html = await res.text();
    siteCache = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    console.log("✅ Site cache loaded successfully");
  } catch (err) {
    console.error("❌ Failed to load site data:", err);
  }
}

export function getSiteData() {
  return siteCache;
}
