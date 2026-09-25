import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, MapPin, Plus, Trash2 } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useAddresses, useDeleteAddress } from "@/hooks/use-checkout";
import { useToast } from "@/hooks/use-toast";
import { AddressForm } from "@/components/AddressForm";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";

export default function AddressesPage() {
  const { data: user } = useUser();
  const { data: addresses, isLoading, error } = useAddresses(!!user);
  const remove = useDeleteAddress();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const country = user?.country === "IN" ? "IN" : "US";

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border/40" style={{ paddingTop: "var(--safe-area-top)" }}>
        <div className="max-w-md mx-auto px-5 pt-5 pb-3 flex items-center gap-3">
          <Link href="/settings" className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center" aria-label="Back">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold">Addresses</h1>
            <p className="text-xs text-muted-foreground">Used to fill in checkout when you say so</p>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 mt-6 space-y-4">
        {isLoading ? (
          <Loader />
        ) : error ? (
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        ) : (
          <>
            {(addresses ?? []).map((a) => (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-4 flex gap-3">
                <MapPin size={18} className="mt-0.5 text-accent flex-shrink-0" />
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-semibold">
                    {a.label} {a.isDefault && <span className="ml-1 text-xs font-medium text-accent">Default</span>}
                  </p>
                  <p className="text-muted-foreground">{a.address.fullName}</p>
                  <p className="text-muted-foreground">
                    {a.address.line1}
                    {a.address.line2 ? `, ${a.address.line2}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {a.address.city}, {a.address.state} {a.address.postalCode}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await remove.mutateAsync(a.id);
                    toast({ title: "Address deleted" });
                  }}
                  className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"
                  aria-label={`Delete ${a.label} address`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {adding ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <AddressForm country={country} onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="w-full rounded-2xl border border-dashed border-border p-4 flex items-center justify-center gap-2 text-sm font-semibold text-accent">
                <Plus size={16} /> Add an address
              </button>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
