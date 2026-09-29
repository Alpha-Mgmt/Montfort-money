import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://montfortmoney.com";
  return ["", "/signup", "/login", "/privacy", "/terms"].map((p) => ({
    url: base + p,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : 0.5,
  }));
}
