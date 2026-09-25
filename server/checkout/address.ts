import { z } from "zod";

import { IN_STATES, US_STATES } from "@shared/geo";

export { IN_STATES, US_STATES };

const text = (max: number) => z.string().trim().min(1).max(max);

/** The personal part of an address, stored encrypted. */
export const addressFieldsSchema = z
  .object({
    fullName: text(120),
    phone: z.string().trim().min(7).max(20),
    line1: text(200),
    line2: z.string().trim().max(200).optional().default(""),
    city: text(100),
    state: text(100),
    postalCode: z.string().trim().min(3).max(12),
    country: z.enum(["IN", "US"]),
  })
  .superRefine((a, ctx) => {
    const digits = a.phone.replace(/\D/g, "");
    if (a.country === "IN") {
      if (!/^[1-9]\d{5}$/.test(a.postalCode)) ctx.addIssue({ code: "custom", path: ["postalCode"], message: "Enter a 6-digit PIN code" });
      if (!IN_STATES.includes(a.state)) ctx.addIssue({ code: "custom", path: ["state"], message: "Choose a state" });
      if (!/^(91)?[6-9]\d{9}$/.test(digits)) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a 10-digit mobile number" });
    } else {
      if (!/^\d{5}(-\d{4})?$/.test(a.postalCode)) ctx.addIssue({ code: "custom", path: ["postalCode"], message: "Enter a 5-digit ZIP code" });
      if (!US_STATES[a.state]) ctx.addIssue({ code: "custom", path: ["state"], message: "Choose a state" });
      if (!/^1?\d{10}$/.test(digits)) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a 10-digit phone number" });
    }
  });

export type AddressFields = z.infer<typeof addressFieldsSchema>;

export const createAddressSchema = z.object({
  label: z.string().trim().min(1).max(40).default("Home"),
  isDefault: z.boolean().optional(),
  address: addressFieldsSchema,
});

export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/** Short, non-identifying summary for lists: "Home · Mumbai 400001". */
export function addressSummary(a: AddressFields): string {
  return `${a.city} ${a.postalCode}`;
}
