import { useState } from "react";
import { IN_STATES, US_STATES } from "@shared/geo";
import { ApiError, useCreateAddress, type AddressFields, type SavedAddress } from "@/hooks/use-checkout";

const input =
  "w-full h-11 rounded-xl border border-border bg-card px-3.5 text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:border-destructive";

/** New shipping address. The country follows the product's market, so the right PIN/ZIP and state rules apply. */
export function AddressForm({
  country,
  onSaved,
  onCancel,
}: {
  country: "IN" | "US";
  onSaved: (a: SavedAddress) => void;
  onCancel?: () => void;
}) {
  const create = useCreateAddress();
  const [label, setLabel] = useState("Home");
  const [a, setA] = useState<AddressFields>({ fullName: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "", country });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const set = (k: keyof AddressFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setA({ ...a, [k]: e.target.value });
  const invalid = (k: string) => error?.field === k;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      onSaved(await create.mutateAsync({ label, address: a }));
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, field: err.field } : { message: "Couldn't save the address" });
    }
  };

  const states = country === "IN" ? IN_STATES.map((s) => [s, s] as const) : Object.entries(US_STATES).map(([code, name]) => [code, name] as const);

  return (
    <form onSubmit={submit} className="space-y-2.5" noValidate>
      <div className="flex gap-2">
        {["Home", "Work", "Other"].map((l) => (
          <button
            type="button"
            key={l}
            onClick={() => setLabel(l)}
            aria-pressed={label === l}
            className={`px-3.5 py-1.5 rounded-full text-sm border ${label === l ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <input className={input} placeholder="Full name" aria-label="Full name" autoComplete="shipping name" value={a.fullName} onChange={set("fullName")} aria-invalid={invalid("fullName")} required />
      <input className={input} placeholder={country === "IN" ? "Mobile number" : "Phone"} aria-label="Phone" type="tel" inputMode="tel" autoComplete="shipping tel" value={a.phone} onChange={set("phone")} aria-invalid={invalid("phone")} required />
      <input className={input} placeholder={country === "IN" ? "Flat, house no., building" : "Street address"} aria-label="Address line 1" autoComplete="shipping address-line1" value={a.line1} onChange={set("line1")} aria-invalid={invalid("line1")} required />
      <input className={input} placeholder={country === "IN" ? "Area, landmark (optional)" : "Apt, suite (optional)"} aria-label="Address line 2" autoComplete="shipping address-line2" value={a.line2} onChange={set("line2")} />
      <div className="grid grid-cols-2 gap-2.5">
        <input className={input} placeholder="City" aria-label="City" autoComplete="shipping address-level2" value={a.city} onChange={set("city")} aria-invalid={invalid("city")} required />
        <input
          className={input}
          placeholder={country === "IN" ? "PIN code" : "ZIP code"}
          aria-label={country === "IN" ? "PIN code" : "ZIP code"}
          inputMode="numeric"
          autoComplete="shipping postal-code"
          value={a.postalCode}
          onChange={set("postalCode")}
          aria-invalid={invalid("postalCode")}
          required
        />
      </div>
      <select className={input} aria-label="State" autoComplete="shipping address-level1" value={a.state} onChange={set("state")} aria-invalid={invalid("state")} required>
        <option value="">State</option>
        {states.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 h-11 rounded-xl border border-border font-medium">
            Cancel
          </button>
        )}
        <button type="submit" disabled={create.isPending} className="flex-1 h-11 rounded-xl bg-foreground text-background font-semibold disabled:opacity-60">
          {create.isPending ? "Saving…" : "Save address"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Stored encrypted. Only shared with a store when you choose to for an order.</p>
    </form>
  );
}
