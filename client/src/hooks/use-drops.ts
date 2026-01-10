import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertClick } from "@shared/routes";

// Get list of drops (products)
export function useDrops(country?: string) {
  return useQuery({
    queryKey: [api.drops.list.path, country],
    queryFn: async () => {
      // Build URL with optional country param
      const url = country 
        ? `${api.drops.list.path}?country=${country}`
        : api.drops.list.path;
        
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch drops");
      return api.drops.list.responses[200].parse(await res.json());
    },
    enabled: true, // Always fetch, empty array if none
  });
}

// Get single product details
export function useProduct(id: number) {
  return useQuery({
    queryKey: [api.products.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.products.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch product");
      
      // Note: Response is complex ProductWithDetails type, validating as 'any' in schema
      // In a real app we'd have a full Zod schema for the relations too
      return await res.json();
    },
    enabled: !!id,
  });
}

// Track clicks
export function useTrackClick() {
  return useMutation({
    mutationFn: async (data: InsertClick) => {
      const validated = api.clicks.track.input.parse(data);
      const res = await fetch(api.clicks.track.path, {
        method: api.clicks.track.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to track click");
      return api.clicks.track.responses[201].parse(await res.json());
    },
  });
}
