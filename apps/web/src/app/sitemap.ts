import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";


const SITE_URL = "https://rangmanchai.com";

const publicRoutes = [
  {
    path: "/",
    priority: 1,
    changeFrequency: "weekly" as const,
  },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
