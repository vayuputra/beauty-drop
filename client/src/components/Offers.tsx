import { useState } from "react";
import { Bell, BellRing, ChevronUp, ExternalLink, ShoppingBag } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { formatPrice, offerSourceLabel, sortOffers, timeAgoShort } from "@/lib/format";

/** What tapping a seller does: the agent prepares a cart, or we open the seller's page. */
export function offerAction(offer: OfferView): { label: string; agent: boolean } {
  if (offer.inStock === false) return { label: "View", agent: false };
  if (offer.checkoutMode === "cart_permalink" || offer.checkoutMode === "amazon_cart") return { label: "Add to cart", agent: true };
  return { label: "Buy", agent: false };
}

export interface OfferView {
  checkoutMode?: "cart_permalink" | "amazon_cart" | "handoff";
  id: number;
  price: number;
  currency: string;
  listPrice?: number | null;
  inStock?: boolean | null;
  source?: string | null;
  lastUpdated?: string | null;
  retailer: { id: number; name: string; logoUrl?: string | null; kind?: string | null };
}

function RetailerLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-10 h-10 flex-shrink-0 rounded-full bg-secondary flex items-center justify-center font-bold text-lg text-secondary-foreground overflow-hidden">
      {logoUrl && !failed ? (
        <img src={logoUrl} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{name.charAt(0)}</span>
      )}
    </div>
  );
}

function freshness(offer: OfferView): string {
  if (offer.source === "demo" || !offer.lastUpdated) return "Price not yet verified";
  return `Updated ${timeAgoShort(offer.lastUpdated)}`;
}

export function OfferRow({ offer, isBest, onBuy }: { offer: OfferView; isBest: boolean; onBuy: (o: OfferView) => void }) {
  const soldOut = offer.inStock === false;
  const action = offerAction(offer);
  const button = (
    <button
      onClick={() => onBuy(offer)}
      data-testid={`button-buy-${offer.id}`}
      className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
        action.agent ? "w-full bg-accent text-accent-foreground" : "bg-foreground text-background hover:bg-accent hover:text-accent-foreground"
      }`}
      aria-label={`${action.label} at ${offer.retailer.name}`}
    >
      {action.agent ? <ShoppingBag size={15} /> : null}
      {action.label}
      {action.agent ? null : <ExternalLink size={14} />}
    </button>
  );

  return (
    <div
      data-testid={`card-offer-${offer.id}`}
      className={`p-4 rounded-2xl border transition-colors space-y-3 ${isBest ? "border-accent/50 bg-accent/5" : "border-border bg-card"}`}
    >
      <div className="flex items-center gap-3">
        <RetailerLogo name={offer.retailer.name} logoUrl={offer.retailer.logoUrl} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{offer.retailer.name}</p>
          {soldOut ? (
            <p className="text-xs font-semibold text-destructive">Sold out</p>
          ) : (
            isBest && <p className="text-xs text-accent font-semibold">Best price</p>
          )}
          <p className="text-xs text-muted-foreground truncate">
            {[offerSourceLabel(offer.source, offer.retailer.kind), freshness(offer)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <span className={`block font-bold text-lg ${soldOut ? "text-muted-foreground" : "text-foreground"}`}>
            {formatPrice(Number(offer.price), offer.currency)}
          </span>
          {offer.listPrice != null && offer.listPrice > offer.price && (
            <span className="block text-xs text-muted-foreground line-through">{formatPrice(Number(offer.listPrice), offer.currency)}</span>
          )}
        </div>
        {!action.agent && button}
      </div>
      {action.agent && button}
    </div>
  );
}

export function OffersList({ offers, onBuy }: { offers: OfferView[]; onBuy: (o: OfferView) => void }) {
  const sorted = sortOffers(offers);
  const buyable = sorted.filter((o) => o.inStock !== false).length;
  if (sorted.length === 0) {
    return <p className="p-4 rounded-2xl bg-secondary/50 text-center text-muted-foreground text-sm">No sellers found yet.</p>;
  }
  return (
    <div className="space-y-2.5">
      {sorted.map((offer, i) => (
        <OfferRow key={offer.id} offer={offer} isBest={i === 0 && buyable > 1} onBuy={onBuy} />
      ))}
    </div>
  );
}

function AlertToggle({ tracking, onToggle, busy, className = "" }: { tracking: boolean; onToggle: () => void; busy?: boolean; className?: string }) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      aria-pressed={tracking}
      aria-label={tracking ? "Stop price-drop alerts" : "Alert me when the price drops"}
      className={`h-12 w-12 flex-shrink-0 rounded-2xl border flex items-center justify-center transition-colors disabled:opacity-60 ${
        tracking ? "bg-accent/10 border-accent/40 text-accent" : "border-border text-foreground hover:border-foreground/40"
      } ${className}`}
    >
      {tracking ? <BellRing size={20} /> : <Bell size={20} />}
    </button>
  );
}

interface PriceBarProps {
  offers: OfferView[];
  onBuy: (o: OfferView) => void;
  tracking: boolean;
  onToggleAlert: () => void;
  alertBusy?: boolean;
}

/**
 * Mobile: always-visible bar with the best price and the main action. Tapping
 * the price (or swiping it up) opens every seller in a bottom sheet.
 */
export function PriceBar({ offers, onBuy, tracking, onToggleAlert, alertBusy }: PriceBarProps) {
  const [open, setOpen] = useState(false);
  const sorted = sortOffers(offers);
  const best = sorted[0];
  const others = sorted.length - 1;
  const soldOut = !!best && best.inStock === false;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden bg-background/90 backdrop-blur-xl border-t border-border/70 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 10px)" }}
      >
        <div className="max-w-md mx-auto px-4 pt-3 flex items-center gap-3">
          <button
            className="flex-1 min-w-0 text-left"
            onClick={() => setOpen(true)}
            disabled={!best}
            aria-label={best ? `Compare ${sorted.length} sellers` : "No sellers yet"}
            onTouchStart={(e) => ((e.currentTarget as any)._y = e.touches[0].clientY)}
            onTouchEnd={(e) => {
              const startY = (e.currentTarget as any)._y as number | undefined;
              if (startY !== undefined && startY - e.changedTouches[0].clientY > 30) setOpen(true);
            }}
          >
            {best ? (
              <>
                <p className="text-xl font-bold text-foreground leading-tight">
                  {soldOut ? "Sold out" : formatPrice(best.price, best.currency)}
                  {!soldOut && best.listPrice != null && best.listPrice > best.price && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground line-through">{formatPrice(best.listPrice, best.currency)}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  {soldOut ? "everywhere we checked" : `at ${best.retailer.name}`}
                  {others > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-accent font-semibold">
                      · {others} more <ChevronUp size={13} />
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No sellers found yet</p>
            )}
          </button>
          <AlertToggle tracking={tracking} onToggle={onToggleAlert} busy={alertBusy} />
          {best && (() => {
            const action = offerAction(best);
            return (
              <button
                onClick={() => onBuy(best)}
                className={`h-12 px-5 rounded-2xl font-semibold flex items-center gap-2 whitespace-nowrap active:scale-[0.98] transition-transform ${
                  action.agent ? "bg-accent text-accent-foreground" : "bg-foreground text-background"
                }`}
              >
                {action.agent && <ShoppingBag size={17} />}
                {action.label}
                {!action.agent && <ExternalLink size={15} />}
              </button>
            );
          })()}
        </div>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-2xl">Where to buy</DrawerTitle>
            <DrawerDescription>{sorted.length} {sorted.length === 1 ? "seller" : "sellers"}, cheapest in stock first</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 overflow-y-auto" style={{ paddingBottom: "calc(var(--safe-area-bottom) + 24px)" }}>
            <OffersList
              offers={offers}
              onBuy={(o) => {
                // Close this sheet first so the checkout sheet doesn't stack on top of it.
                setOpen(false);
                setTimeout(() => onBuy(o), 250);
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Desktop: the same comparison as a side panel instead of a sheet. */
export function OffersPanel({ offers, onBuy, tracking, onToggleAlert, alertBusy }: PriceBarProps) {
  return (
    <section className="hidden lg:block space-y-3" aria-labelledby="where-to-buy">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="where-to-buy" className="font-display text-2xl font-bold">Where to buy</h2>
          <p className="text-sm text-muted-foreground">Cheapest in stock first</p>
        </div>
        <AlertToggle tracking={tracking} onToggle={onToggleAlert} busy={alertBusy} />
      </div>
      <OffersList offers={offers} onBuy={onBuy} />
    </section>
  );
}
