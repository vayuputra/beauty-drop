import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiUrl } from "@/lib/api";
import { useUser } from "./use-user";

/** Starts Google sign-in (a full-page redirect through the API). */
export function startGoogleLogin() {
  window.location.href = apiUrl("/api/login");
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useUser();

  const logout = () => {
    queryClient.setQueryData([api.user.get.path], null);
    window.location.href = apiUrl("/api/logout");
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout,
  };
}
