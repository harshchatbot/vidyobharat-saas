import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";


const SITE_URL = "https://rangmanchai.com";

const publicRoutes = [
  {
    path: "/",
    priority: 1,
    changeFrequency: "weekly" as const,
  },
  { path: "/features/auto-edit", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/features/ai-copilot", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/ai-reel-maker", priority: 0.8, changeFrequency: "monthly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
