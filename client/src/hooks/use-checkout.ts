import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "@/lib/api";

export interface AddressFields {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: "IN" | "US";
}

export interface SavedAddress {
  id: number;
  label: string;
  country: string;
  isDefault: boolean;
  summary: string;
  address: AddressFields;
}

export interface CheckoutStep {
  id: number;
  step: string;
  status: "ok" | "warning" | "failed";
  detail: string | null;
  at: string;
}

export interface CheckoutJob {
  id: number;
  productId: number;
  offerId: number;
  variantId: number | null;
  quantity: number;
  strategy: "cart_permalink" | "amazon_cart" | "handoff";
  status: "preparing" | "ready_for_payment" | "handed_off" | "failed" | "cancelled";
  retailerName: string;
  quotedPrice: number | null;
  confirmedPrice: number | null;
  currency: string;
  addressConsentAt: string | null;
  error: string | null;
  createdAt: string;
  steps: CheckoutStep[];
  product?: { id: number; name: string; brand: string; imageUrl: string; category: string };
}

/** Error with the server's message and (for form validation) the offending field. */
export class ApiError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || body.message || "Something went wrong", body.field);
  return body as T;
}

const post = (path: string, body?: unknown) =>
  apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

const ADDRESSES = ["/api/addresses"];
const JOBS = ["/api/checkout/jobs"];

export function useAddresses(enabled = true) {
  return useQuery({ queryKey: ADDRESSES, queryFn: async () => json<SavedAddress[]>(await apiFetch(ADDRESSES[0])), enabled });
}

export function useCreateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { label: string; isDefault?: boolean; address: AddressFields }) => json<SavedAddress>(await post("/api/addresses", v)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADDRESSES }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => json(await apiFetch(`/api/addresses/${id}`, { method: "DELETE" })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADDRESSES }),
  });
}

export function useCheckoutJobs(enabled = true) {
  return useQuery({ queryKey: JOBS, queryFn: async () => json<CheckoutJob[]>(await apiFetch(JOBS[0])), enabled });
}

export function useCreateCheckoutJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { offerId: number; variantId?: number | null; quantity: number; addressId?: number | null; shareAddress?: boolean }) =>
      json<CheckoutJob>(await post("/api/checkout/jobs", v)),
    onSuccess: () => qc.invalidateQueries({ queryKey: JOBS }),
  });
}

export function useCancelCheckoutJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => json<CheckoutJob>(await post(`/api/checkout/jobs/${id}/cancel`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: JOBS }),
  });
}

/** Opens the seller's checkout in a new tab. The server builds the link and records the hand-off. */
export function openCheckout(jobId: number, queryClient?: ReturnType<typeof useQueryClient>) {
  window.open(apiUrl(`/api/checkout/jobs/${jobId}/open`), "_blank", "noopener");
  // The hand-off changes the job's status; refresh shortly after.
  if (queryClient) setTimeout(() => queryClient.invalidateQueries({ queryKey: JOBS }), 1500);
}
