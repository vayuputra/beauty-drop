import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type UpdateUserRequest } from "@shared/routes";
import { type User } from "@shared/schema";

// Get current user (wrapper around auth endpoint with specific type)
export function useUser() {
  return useQuery({
    queryKey: [api.user.get.path],
    queryFn: async () => {
      const res = await fetch(api.user.get.path, { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return api.user.get.responses[200].parse(await res.json());
    },
    retry: false,
  });
}

// Update user preferences/profile
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: UpdateUserRequest) => {
      const validated = api.user.update.input.parse(updates);
      const res = await fetch(api.user.update.path, {
        method: api.user.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 401) throw new Error("Unauthorized");
        if (res.status === 400) throw new Error("Validation failed");
        throw new Error("Failed to update profile");
      }
      
      return api.user.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData([api.user.get.path], data);
    },
  });
}
