import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

// Type for merged user data (auth claims + DB preferences)
export interface MergedUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  country: string | null;
  preferences: {
    interests: string[];
    budget: string;
    skinType?: string;
    skinTone?: string;
  } | null;
}

export type UpdateUserRequest = {
  country?: string;
  preferences?: {
    interests: string[];
    budget: string;
    skinType?: string;
    skinTone?: string;
  };
};

// Get current user (merged auth + DB data)
export function useUser() {
  return useQuery<MergedUser | null>({
    queryKey: [api.user.get.path],
    queryFn: async () => {
      const res = await fetch(api.user.get.path, { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    retry: false,
  });
}

// Update user preferences/profile
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: UpdateUserRequest) => {
      const res = await fetch(api.user.update.path, {
        method: api.user.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 401) throw new Error("Unauthorized");
        if (res.status === 400) throw new Error("Validation failed");
        throw new Error("Failed to update profile");
      }
      
      return res.json();
    },
    onSuccess: () => {
      // Refetch user to get merged data
      queryClient.invalidateQueries({ queryKey: [api.user.get.path] });
    },
  });
}
