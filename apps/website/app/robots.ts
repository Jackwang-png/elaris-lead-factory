import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://www.wan-wan.top/sitemap.xml",
    host: "https://www.wan-wan.top",
  };
}
