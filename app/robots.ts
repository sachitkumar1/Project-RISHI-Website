import type { MetadataRoute } from "next";

/**
 * Keeps the member dashboard and API out of search results while letting the
 * public pages be crawled. Also points crawlers at the sitemap, which is how
 * Google finds out a page changed without waiting for its own schedule.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard/", "/login"] }],
    sitemap: "https://ucbprojectrishi.org/sitemap.xml",
  };
}
