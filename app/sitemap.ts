import type { MetadataRoute } from "next";

const BASE = "https://ucbprojectrishi.org";

/**
 * The public pages, for search engines.
 *
 * `lastModified` is what tells Google a page is worth re-crawling — without a
 * sitemap it re-checks on its own schedule, which is why an updated page can
 * keep showing an old description in search results for weeks.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = [
    ["", 1.0],
    ["/about", 0.8],
    ["/projects", 0.8],
    ["/projects/education", 0.6],
    ["/projects/health", 0.6],
    ["/projects/water-sanitation", 0.6],
    ["/projects/womens-empowerment", 0.6],
    ["/donate", 0.9],
    ["/apply", 0.7],
    ["/contact", 0.6],
    ["/privacy", 0.3],
    ["/terms", 0.3],
  ] as const;

  return paths.map(([path, priority]) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority,
  }));
}
