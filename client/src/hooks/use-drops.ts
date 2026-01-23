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

// Refresh influencers for a product
export function useRefreshInfluencers() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (productId: number) => {
      const res = await fetch(`/api/products/${productId}/refresh-influencers`, {
        method: "POST",
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to refresh influencers");
      return await res.json();
    },
    onSuccess: (_, productId) => {
      queryClient.invalidateQueries({ queryKey: [api.products.get.path, productId] });
    },
  });
}

// Refresh all trending data (batch operation)
export function useRefreshTrending() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/refresh-trending", {
        method: "POST",
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to refresh trending data");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.drops.list.path] });
    },
  });
}

// Refresh image for a product
export function useRefreshImage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (productId: number) => {
      const res = await fetch(`/api/products/${productId}/refresh-image`, {
        method: "POST",
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to refresh image");
      return await res.json();
    },
    onSuccess: (_, productId) => {
      queryClient.invalidateQueries({ queryKey: [api.products.get.path, productId] });
      queryClient.invalidateQueries({ queryKey: [api.drops.list.path] });
    },
  });
}

// Batch refresh all product images
export function useRefreshAllImages() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/refresh-images", {
        method: "POST",
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to refresh images");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.drops.list.path] });
    },
  });
}

// Trust Score hooks
export function useTrustScore(productId: number) {
  return useQuery({
    queryKey: ['/api/products', productId, 'trust-score'],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/trust-score`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch trust score");
      return await res.json();
    },
    enabled: !!productId,
  });
}

export function useCalculateTrustScore() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (productId: number) => {
      const res = await fetch(`/api/products/${productId}/calculate-trust-score`, {
        method: "POST",
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to calculate trust score");
      return await res.json();
    },
    onSuccess: (_, productId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products', productId, 'trust-score'] });
    },
  });
}

// Review Summary hooks
export function useReviewSummary(productId: number) {
  return useQuery({
    queryKey: ['/api/products', productId, 'review-summary'],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/review-summary`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch review summary");
      return await res.json();
    },
    enabled: !!productId,
  });
}

export function useGenerateReviewSummary() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (productId: number) => {
      const res = await fetch(`/api/products/${productId}/generate-review-summary`, {
        method: "POST",
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to generate review summary");
      return await res.json();
    },
    onSuccess: (_, productId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products', productId, 'review-summary'] });
    },
  });
}

// Price Tracker hooks
export function usePriceTrackers() {
  return useQuery({
    queryKey: ['/api/price-trackers'],
    queryFn: async () => {
      const res = await fetch('/api/price-trackers', {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch price trackers");
      return await res.json();
    },
  });
}

export function useCreatePriceTracker() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ productId, targetPrice, notifyOnAnyDrop }: { 
      productId: number; 
      targetPrice?: number; 
      notifyOnAnyDrop?: boolean; 
    }) => {
      const res = await fetch(`/api/products/${productId}/price-tracker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPrice, notifyOnAnyDrop }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to create price tracker");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-trackers'] });
    },
  });
}

export function useDeletePriceTracker() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (trackerId: number) => {
      const res = await fetch(`/api/price-trackers/${trackerId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to delete price tracker");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-trackers'] });
    },
  });
}

// Price History hook
export function usePriceHistory(productId: number) {
  return useQuery({
    queryKey: ['/api/products', productId, 'price-history'],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/price-history`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch price history");
      return await res.json();
    },
    enabled: !!productId,
  });
}
