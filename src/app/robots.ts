import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/signup", "/login", "/privacy", "/terms"], disallow: ["/app", "/api", "/auth"] }],
    sitemap: "https://montfortmoney.com/sitemap.xml",
  };
}
