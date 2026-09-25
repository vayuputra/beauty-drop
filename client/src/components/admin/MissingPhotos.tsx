import { useState } from "react";
import { Link } from "wouter";
import { ImageOff, Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/ProductImage";
import { useToast } from "@/hooks/use-toast";
import { useAdminPhotos, useFindPhoto, useSetProductPhoto, type PhotoIssue } from "@/hooks/use-admin";

function PhotoRow({ item, canFind }: { item: PhotoIssue; canFind: boolean }) {
  const find = useFindPhoto();
  const setPhoto = useSetProductPhoto();
  const { toast } = useToast();
  const [pasting, setPasting] = useState(false);
  const [url, setUrl] = useState("");

  const onFind = async () => {
    try {
      const r = await find.mutateAsync(item.id);
      toast({ title: r.found ? "Photo found" : "No matching photo on Google Shopping", description: item.name });
    } catch (e) {
      toast({ title: "Couldn't search", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setPhoto.mutateAsync({ id: item.id, imageUrl: url.trim() });
      toast({ title: "Photo saved", description: item.name });
      setPasting(false);
      setUrl("");
    } catch (err) {
      toast({ title: "Photo not saved", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Link href={`/product/${item.id}`} className="flex-shrink-0">
          <ProductImage fallbackLabels={false} product={item} className="h-12 w-12 rounded-xl bg-secondary" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{item.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {item.brand} · {item.country}
          </p>
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{item.problem}</p>
        </div>
      </div>
      {pasting ? (
        <form onSubmit={onSave} className="flex gap-2">
          <Input
            autoFocus
            type="url"
            placeholder="https://… link to the product photo"
            aria-label={`Photo link for ${item.name}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="submit" size="sm" className="h-9" disabled={!url || setPhoto.isPending}>
            {setPhoto.isPending ? "Checking…" : "Save"}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setPasting(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex gap-2">
          {canFind && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onFind} disabled={find.isPending}>
              <Search size={14} /> {find.isPending ? "Searching…" : "Find photo"}
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPasting(true)}>
            <Link2 size={14} /> Paste link
          </Button>
        </div>
      )}
    </div>
  );
}

/** Products still showing the illustration instead of a real photo, with ways to fix each one. */
export function MissingPhotos() {
  const { data, isLoading } = useAdminPhotos();
  const [showAll, setShowAll] = useState(false);
  const items = data?.items ?? [];
  const shown = showAll ? items : items.slice(0, 8);

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Missing photos</h2>
        {data && (
          <p className="text-xs text-muted-foreground mt-1">
            {data.counts.needsPhoto} of {data.counts.total} products need a photo
            {data.counts.unchecked > 0 && ` · ${data.counts.unchecked} not checked yet (run Photo checks)`}
          </p>
        )}
      </div>
      <div className="bg-card rounded-2xl border border-border/60 divide-y divide-border/60">
        {isLoading ? (
          <p className="p-6 text-sm text-center text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-center text-muted-foreground flex flex-col items-center gap-2">
            <ImageOff size={20} className="text-muted-foreground/60" />
            Every product has a working photo.
          </p>
        ) : (
          <>
            {shown.map((item) => (
              <PhotoRow key={item.id} item={item} canFind={!!data?.canFind} />
            ))}
            {items.length > shown.length && (
              <button onClick={() => setShowAll(true)} className="w-full p-3 text-sm font-semibold text-accent">
                Show all {items.length}
              </button>
            )}
          </>
        )}
      </div>
      {data && !data.canFind && items.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">Set SERPAPI_KEY to find photos automatically from Google Shopping.</p>
      )}
    </section>
  );
}
