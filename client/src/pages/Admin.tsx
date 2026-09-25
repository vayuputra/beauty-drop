import { useState } from "react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Play, Plus, Store, RefreshCw, CircleCheck, CircleAlert, CircleDashed } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import {
  useAddBrandSource,
  useAddDefaultBrandSources,
  useBrandSources,
  useIngestionRuns,
  useRunJob,
  useToggleBrandSource,
} from "@/hooks/use-admin";

const JOBS = [
  { job: "launches", title: "New launches", detail: "Brand stores → new products, shades & official prices", env: null },
  { job: "prices", title: "Seller prices", detail: "Google Shopping → prices at other retailers", env: "SERPAPI_KEY" },
  { job: "content", title: "Creator videos", detail: "YouTube → review videos per product", env: "YOUTUBE_API_KEY" },
] as const;

function statsLine(stats: Record<string, number> | null | undefined): string {
  if (!stats) return "";
  if (stats.skippedNotConfigured) return "Skipped — not configured";
  return Object.entries(stats)
    .filter(([k, v]) => v > 0 && k !== "skippedNotConfigured")
    .map(([k, v]) => `${v} ${k.replace(/([A-Z])/g, " $1").toLowerCase()}`)
    .join(" · ") || "Nothing to do";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CircleCheck size={16} className="text-green-600" aria-label="Succeeded" />;
  if (status === "running") return <CircleDashed size={16} className="text-muted-foreground animate-spin" aria-label="Running" />;
  return <CircleAlert size={16} className={status === "partial" ? "text-amber-500" : "text-destructive"} aria-label={status} />;
}

export default function AdminPage() {
  const { data: user, isLoading: userLoading } = useUser();
  const { data: sources, isLoading: sourcesLoading } = useBrandSources();
  const { data: runsData } = useIngestionRuns();
  const runJob = useRunJob();
  const addSource = useAddBrandSource();
  const addDefaults = useAddDefaultBrandSources();
  const toggleSource = useToggleBrandSource();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", domain: "", country: "US" as "US" | "IN" });

  if (userLoading) return <div className="min-h-screen bg-background"><Loader /></div>;
  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center text-muted-foreground">
        This page is for Beauty Drop operators.
      </div>
    );
  }

  const run = async (job: (typeof JOBS)[number]["job"]) => {
    try {
      const result = await runJob.mutateAsync(job);
      toast({ title: `${JOBS.find((j) => j.job === job)!.title}: ${result.status}`, description: statsLine(result.stats) });
    } catch (e) {
      toast({ title: "Job failed to start", description: (e as Error).message, variant: "destructive" });
    }
  };

  const submitSource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addSource.mutateAsync(form);
      setForm({ name: "", domain: "", country: form.country });
      toast({ title: "Store added", description: "It will be checked on the next launches run." });
    } catch (err) {
      toast({ title: "Couldn't add store", description: (err as Error).message, variant: "destructive" });
    }
  };

  const configured = runsData?.configured;

  return (
    <div className="min-h-screen bg-secondary/30 pb-28">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md px-6 pt-12 pb-4 border-b border-border/40">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/settings" className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center" aria-label="Back">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold">Data &amp; ingestion</h1>
            <p className="text-xs text-muted-foreground">Where launches, prices and videos come from</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 mt-6 space-y-8">
        {/* Jobs */}
        <section>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Jobs</h2>
          <div className="bg-white rounded-2xl border border-border/60 divide-y divide-border/60">
            {JOBS.map(({ job, title, detail, env }) => {
              const ready = configured ? configured[job] : true;
              return (
                <div key={job} className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                    {!ready && env && (
                      <p className="text-xs text-amber-600 mt-1">Set {env} in Vercel to turn this on.</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={!ready || runJob.isPending}
                    onClick={() => run(job)}
                  >
                    {runJob.isPending && runJob.variables === job ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                    Run now
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Brand stores */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Brand stores watched for launches</h2>
            <Button size="sm" variant="ghost" onClick={() => addDefaults.mutate()} disabled={addDefaults.isPending}>
              Add suggested brands
            </Button>
          </div>

          <div className="bg-white rounded-2xl border border-border/60 divide-y divide-border/60">
            {sourcesLoading ? (
              <Loader />
            ) : sources && sources.length > 0 ? (
              sources.map((s) => (
                <div key={s.id} className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <Store size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {s.name} <span className="text-xs text-muted-foreground">· {s.country}</span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{s.domain}</p>
                    {s.lastError ? (
                      <p className="text-xs text-destructive truncate" title={s.lastError}>Last sync failed: {s.lastError}</p>
                    ) : s.lastSyncedAt ? (
                      <p className="text-xs text-muted-foreground">Synced {formatDistanceToNow(new Date(s.lastSyncedAt), { addSuffix: true })}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not synced yet</p>
                    )}
                  </div>
                  <Switch
                    checked={s.active}
                    onCheckedChange={(active) => toggleSource.mutate({ id: s.id, active })}
                    aria-label={`Watch ${s.name}`}
                  />
                </div>
              ))
            ) : (
              <p className="p-6 text-sm text-center text-muted-foreground">
                No stores yet. Add one below, or start with the suggested brands.
              </p>
            )}
          </div>

          <form onSubmit={submitSource} className="mt-3 bg-white rounded-2xl border border-border/60 p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2">
            <Input placeholder="Brand name" aria-label="Brand name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input placeholder="store domain, e.g. brand.com" aria-label="Store domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} required />
            <select
              aria-label="Market"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value as "US" | "IN" })}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="US">US</option>
              <option value="IN">India</option>
            </select>
            <Button type="submit" size="sm" className="gap-1 h-9" disabled={addSource.isPending}>
              <Plus size={14} /> Add
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Only Shopify-based stores are supported for now. A store that can&apos;t be read shows its error above.
          </p>
        </section>

        {/* Recent runs */}
        <section>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Recent runs</h2>
          <div className="bg-white rounded-2xl border border-border/60 divide-y divide-border/60">
            {runsData?.runs?.length ? (
              runsData.runs.map((r) => (
                <div key={r.id} className="p-3 flex items-start gap-3 text-sm">
                  <div className="mt-0.5"><StatusIcon status={r.status} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium capitalize">{r.job}</p>
                    <p className="text-xs text-muted-foreground">{r.error ?? statsLine(r.stats)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(r.startedAt), { addSuffix: true })}
                  </p>
                </div>
              ))
            ) : (
              <p className="p-6 text-sm text-center text-muted-foreground">No runs yet.</p>
            )}
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
