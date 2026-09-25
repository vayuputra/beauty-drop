import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ExternalLink, Lock, MapPin, Minus, Plus, ShieldCheck, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { AddressForm } from "@/components/AddressForm";
import {
  openCheckout,
  useAddresses,
  useCreateCheckoutJob,
  type CheckoutJob,
  type CheckoutStep,
} from "@/hooks/use-checkout";
import { formatPrice } from "@/lib/format";
import { haptic } from "@/lib/haptics";

export type CheckoutMode = "cart_permalink" | "amazon_cart" | "handoff";

export interface CheckoutOffer {
  id: number;
  price: number;
  currency: string;
  checkoutMode?: CheckoutMode;
  retailer: { name: string };
}

interface Variant {
  id: number;
  title: string;
  price: number | null;
  available: boolean | null;
}

const CONSENT_KEY = "bd:share-address";

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeConsent(v: boolean) {
  try {
    localStorage.setItem(CONSENT_KEY, v ? "1" : "0");
  } catch {
    // Remembering the choice is a convenience only.
  }
}

/** The agent's audit trail for one job, as a vertical checklist. */
export function JobSteps({ steps }: { steps: CheckoutStep[] }) {
  return (
    <ol className="space-y-3" aria-label="What the agent did">
      {steps.map((s, i) => (
        <motion.li
          key={s.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.12 }}
          className="flex gap-3"
        >
          <span
            className={`mt-0.5 h-6 w-6 flex-shrink-0 rounded-full flex items-center justify-center ${
              s.status === "ok" ? "bg-success/15 text-success" : s.status === "warning" ? "bg-amber-500/15 text-amber-600" : "bg-destructive/15 text-destructive"
            }`}
            aria-label={s.status === "ok" ? "Done" : s.status === "warning" ? "Heads up" : "Failed"}
          >
            {s.status === "ok" ? <Check size={14} strokeWidth={3} /> : s.status === "warning" ? <AlertTriangle size={13} /> : <X size={14} strokeWidth={3} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{s.step}</p>
            {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

export function priceChanged(job: CheckoutJob): boolean {
  return job.confirmedPrice != null && job.quotedPrice != null && Math.abs(job.confirmedPrice - job.quotedPrice) >= 0.01;
}

/**
 * "Add to cart": the agent prepares the seller's cart (exact shade, quantity
 * and, if you agree, your checkout details) and stops before payment.
 */
export function CheckoutSheet({
  open,
  onOpenChange,
  offer,
  variants,
  initialVariantId,
  country,
  productName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: CheckoutOffer | null;
  variants: Variant[];
  initialVariantId: number | null;
  country: "IN" | "US";
  productName: string;
}) {
  const queryClient = useQueryClient();
  const mode: CheckoutMode = offer?.checkoutMode ?? "handoff";
  const needsAddress = mode === "cart_permalink";
  const { data: addresses } = useAddresses(open && needsAddress);
  const createJob = useCreateCheckoutJob();

  const [variantId, setVariantId] = useState<number | null>(initialVariantId);
  const [quantity, setQuantity] = useState(1);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [share, setShare] = useState(readConsent);
  const [adding, setAdding] = useState(false);
  const [job, setJob] = useState<CheckoutJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fresh state each time the sheet opens for an offer.
  useEffect(() => {
    if (!open) return;
    setJob(null);
    setError(null);
    setQuantity(1);
    // Preselect when there's no real choice: one variant, or only one still in stock.
    const inStock = variants.filter((v) => v.available !== false);
    const chosen = variants.find((v) => v.id === initialVariantId && v.available !== false);
    setVariantId(chosen?.id ?? (variants.length === 1 ? variants[0].id : inStock.length === 1 ? inStock[0].id : null));
  }, [open, offer?.id, initialVariantId, variants]);

  useEffect(() => {
    if (addresses && addressId == null) setAddressId(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null);
  }, [addresses, addressId]);

  if (!offer) return null;

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const unitPrice = mode === "cart_permalink" && variant?.price != null ? variant.price : offer.price;
  const needsVariant = mode === "cart_permalink" && variants.length > 1 && !variant;
  const matchingAddresses = (addresses ?? []).filter((a) => a.country === country);

  const start = async () => {
    setError(null);
    haptic("medium");
    try {
      const created = await createJob.mutateAsync({
        offerId: offer.id,
        variantId: mode === "cart_permalink" ? variantId : null,
        quantity,
        addressId: needsAddress && share ? addressId : null,
        shareAddress: needsAddress && share,
      });
      setJob(created);
      if (created.status === "ready_for_payment") haptic("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't prepare the cart");
    }
  };

  const title = job ? (job.status === "failed" ? "Couldn't prepare the cart" : "Your cart is ready") : mode === "amazon_cart" ? "Add to your Amazon cart" : "Get it ready to buy";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl">{title}</DrawerTitle>
          <DrawerDescription>
            {offer.retailer.name} · {productName}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 overflow-y-auto space-y-5" style={{ paddingBottom: "calc(var(--safe-area-bottom) + 20px)" }}>
          <AnimatePresence mode="wait">
            {!job ? (
              <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                {mode === "cart_permalink" && variants.length > 1 && (
                  <section>
                    <p className="text-sm font-semibold mb-2">Shade / size</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a shade">
                      {variants.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => setVariantId(v.id)}
                          disabled={v.available === false}
                          aria-pressed={v.id === variantId}
                          className={`rounded-full border px-3.5 py-2 text-sm ${
                            v.id === variantId
                              ? "bg-foreground text-background border-foreground"
                              : v.available === false
                                ? "border-border text-muted-foreground/60 line-through"
                                : "border-border bg-card"
                          }`}
                        >
                          {v.title}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Quantity</p>
                    <p className="text-xs text-muted-foreground">{formatPrice(unitPrice * quantity, offer.currency)} at {offer.retailer.name}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-border p-1">
                    <button className="h-8 w-8 rounded-full flex items-center justify-center disabled:opacity-40" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1} aria-label="Fewer">
                      <Minus size={15} />
                    </button>
                    <span className="w-6 text-center font-semibold" aria-live="polite">{quantity}</span>
                    <button className="h-8 w-8 rounded-full flex items-center justify-center disabled:opacity-40" onClick={() => setQuantity(Math.min(10, quantity + 1))} disabled={quantity >= 10} aria-label="More">
                      <Plus size={15} />
                    </button>
                  </div>
                </section>

                {needsAddress && (
                  <section className="space-y-2.5">
                    <p className="text-sm font-semibold">Deliver to</p>
                    {adding || matchingAddresses.length === 0 ? (
                      <AddressForm
                        country={country}
                        onSaved={(a) => {
                          setAddressId(a.id);
                          setAdding(false);
                          setShare(true);
                          writeConsent(true);
                        }}
                        onCancel={matchingAddresses.length > 0 ? () => setAdding(false) : undefined}
                      />
                    ) : (
                      <>
                        <div className="space-y-2" role="radiogroup" aria-label="Saved addresses">
                          {matchingAddresses.map((a) => (
                            <button
                              key={a.id}
                              role="radio"
                              aria-checked={a.id === addressId}
                              onClick={() => setAddressId(a.id)}
                              className={`w-full text-left rounded-2xl border p-3 flex gap-3 ${a.id === addressId ? "border-foreground bg-secondary/50" : "border-border"}`}
                            >
                              <MapPin size={18} className="mt-0.5 flex-shrink-0 text-accent" />
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold">{a.label}</span>
                                <span className="block text-xs text-muted-foreground truncate">
                                  {a.address.fullName} · {a.address.line1}, {a.summary}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                        <button onClick={() => setAdding(true)} className="text-sm font-semibold text-accent">
                          + Add another address
                        </button>
                        <label className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-[hsl(var(--accent))]"
                            checked={share}
                            onChange={(e) => {
                              setShare(e.target.checked);
                              writeConsent(e.target.checked);
                            }}
                          />
                          <span className="text-sm">
                            Fill in my name, email and this address on {offer.retailer.name}&apos;s checkout
                            <span className="block text-xs text-muted-foreground">Shared only with {offer.retailer.name}, only for this order.</span>
                          </span>
                        </label>
                      </>
                    )}
                  </section>
                )}

                {mode === "amazon_cart" && (
                  <p className="text-sm text-muted-foreground rounded-2xl bg-secondary/60 p-3">
                    Amazon adds it to your own Amazon cart for you to review. Amazon uses the addresses saved in your Amazon account.
                  </p>
                )}

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <button
                  onClick={start}
                  disabled={createJob.isPending || needsVariant || (needsAddress && share && !addressId) || adding}
                  className="w-full h-13 py-3.5 rounded-2xl bg-foreground text-background font-semibold text-base disabled:opacity-50 active:scale-[0.99] transition-transform"
                >
                  {createJob.isPending ? "Preparing your cart…" : needsVariant ? "Pick a shade" : "Get my cart ready"}
                </button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Lock size={12} /> We stop before payment. You pay on {offer.retailer.name}&apos;s own checkout.
                </p>
              </motion.div>
            ) : (
              <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                <JobSteps steps={job.steps} />
                {priceChanged(job) && (
                  <p className="rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 flex gap-2">
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                    {offer.retailer.name}&apos;s price is now {formatPrice(job.confirmedPrice!, job.currency)} (we showed {formatPrice(job.quotedPrice!, job.currency)}).
                  </p>
                )}
                {job.status === "ready_for_payment" || job.status === "handed_off" ? (
                  <>
                    <button
                      onClick={() => {
                        haptic("medium");
                        openCheckout(job.id, queryClient);
                      }}
                      className="w-full py-3.5 rounded-2xl bg-accent text-accent-foreground font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
                    >
                      Continue to {job.retailerName} checkout <ExternalLink size={16} />
                    </button>
                    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheck size={13} /> Saved in your Bag. We never see or store your card.
                    </p>
                  </>
                ) : (
                  <button onClick={() => setJob(null)} className="w-full py-3.5 rounded-2xl border border-border font-semibold">
                    Try again
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
