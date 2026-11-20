import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Save, Smartphone, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock, PageHeader, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { saveAppConfig, setSigningSecret } from "@/lib/admin.functions";
import { configQuery } from "@/lib/admin-queries";
import { getDatashareKeyStatus, setDatashareKey } from "@/lib/insights.functions";
import { DOWNLOAD_PATH } from "@/lib/queries";
import { buildAirtelUssd, buildMtnUssd } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

type Cfg = {
  admin_whatsapp_number: string;
  mtn_momo_code: string;
  mtn_momo_phone: string;
  mtn_recipient_name: string;
  airtel_money_phone: string;
  airtel_recipient_name: string;
  per_device_fee_rwf: number;
  apk_download_url: string;
  apk_version: string;
  support_email: string;
};

function SettingsPage() {
  const ctx = useAdminCtx();
  const isAdmin = !!ctx.data?.isAdmin;
  const { data, isLoading } = useQuery(configQuery);
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const save = useAdminAction(useServerFn(saveAppConfig), { success: "Saved — every app picks this up on its next sync", invalidate: [["admin", "config"], ["public-site"]] });
  const setKey = useAdminAction(useServerFn(setSigningSecret), { success: "Signing key saved", invalidate: [["admin", "ctx"]] });
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (data) {
      const { id: _id, updated_at: _u, ...rest } = data;
      setCfg(rest);
    }
  }, [data]);

  if (isLoading || !cfg) return <LoadingBlock />;
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg({ ...cfg, [k]: v });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" sub="Live configuration shared by the website and every BeBoss app." />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(cfg);
        }}
        className="grid gap-5 rounded-2xl border border-border bg-card p-5 lg:grid-cols-2"
      >
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Wallet className="size-4 text-primary" /> Mobile money & support
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="MTN MoMo merchant code" v={cfg.mtn_momo_code} on={(v) => set("mtn_momo_code", v)} hint="Leave empty to use phone transfer" />
            <F label="MTN MoMo phone" v={cfg.mtn_momo_phone} on={(v) => set("mtn_momo_phone", v)} />
            <F label="MTN recipient name" v={cfg.mtn_recipient_name} on={(v) => set("mtn_recipient_name", v)} />
            <F label="Airtel Money phone" v={cfg.airtel_money_phone} on={(v) => set("airtel_money_phone", v)} />
            <F label="Airtel recipient name" v={cfg.airtel_recipient_name} on={(v) => set("airtel_recipient_name", v)} />
            <div className="space-y-1.5">
              <Label>Extra device fee (FRw / month)</Label>
              <Input type="number" min={0} value={cfg.per_device_fee_rwf} onChange={(e) => set("per_device_fee_rwf", Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <F label="Admin WhatsApp (with country code)" v={cfg.admin_whatsapp_number} on={(v) => set("admin_whatsapp_number", v)} hint="e.g. 250788123456" />
            <F label="Support email" v={cfg.support_email} on={(v) => set("support_email", v)} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Smartphone className="size-4 text-primary" /> App update channel
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Latest app version" v={cfg.apk_version} on={(v) => set("apk_version", v)} />
            <F label="APK download link" v={cfg.apk_download_url} on={(v) => set("apk_download_url", v)} hint="Set automatically when you publish a release" />
          </div>
          <div className="rounded-xl bg-muted/50 p-4 text-sm">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Preview for 5,000 FRw</p>
            <p className="mt-2 font-mono text-primary">{buildMtnUssd(5000, cfg)}</p>
            <p className="font-mono text-primary">{buildAirtelUssd(5000, cfg)}</p>
          </div>
          {isAdmin ? (
            <Button type="submit" variant="hero" className="mt-auto" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save configuration
            </Button>
          ) : null}
        </div>
      </form>

      {isAdmin ? (
        <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 lg:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="size-4 text-primary" /> Unlock signing key
              {ctx.data?.signingKeyConfigured ? <Badge variant="success">Configured</Badge> : <Badge variant="warning">Missing</Badge>}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Must be exactly the value built into your Android app as <span className="font-mono">BEBOSS_UNLOCK_SIGNING_SECRET</span>. Codes signed with a different key are rejected by the app. The key is stored server-side and never shown again.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setKey.mutate({ value: secret }, { onSuccess: () => { setSecret(""); qc.invalidateQueries({ queryKey: ["admin", "ctx"] }); } });
            }}
            className="flex flex-col gap-3"
          >
            <div className="relative">
              <Input type={show ? "text" : "password"} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={ctx.data?.signingKeyConfigured ? "Enter a new key to replace it" : "Paste the app's signing key"} minLength={8} required autoComplete="off" className="pr-10" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShow(!show)} aria-label="Toggle visibility">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button type="submit" variant="soft" disabled={setKey.isPending}>
              {setKey.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save signing key
            </Button>
          </form>
        </section>
      ) : null}

      {isAdmin ? <DatashareKeyPanel /> : null}

      {isAdmin ? <ConnectionPanel origin={origin} /> : null}
    </div>
  );
}

function ConnectionPanel({ origin }: { origin: string }) {
  const url = import.meta.env["VITE_SUPABASE_URL"] as string;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  const lines = [
    ["SUPABASE_URL", url],
    ["SUPABASE_ANON_KEY", key],
    ["SUPABASE_ADMIN_EMAIL", "reponsekdz@gmail.com"],
  ] as const;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Smartphone className="size-4 text-primary" /> Connect the Android app
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Put these values in the app's <span className="font-mono">.env</span> file and rebuild the APK. Existing app code works unchanged — shops, payments, codes, devices, staff and branch sync all flow into this admin center. These are public app values, not secrets.
      </p>
      <div className="mt-4 space-y-2">
        {lines.map(([k, v]) => (
          <CopyRow key={k} k={k} v={v} />
        ))}
        <CopyRow k="Stable APK link" v={`${origin}${DOWNLOAD_PATH}`} />
      </div>
    </section>
  );
}

function CopyRow({ k, v }: { k: string; v: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 px-4 py-2.5">
      <div className="min-w-0">
        <p className="font-mono text-[11px] text-muted-foreground">{k}</p>
        <p className="truncate font-mono text-sm">{v}</p>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Copy ${k}`}
        onClick={async () => {
          await navigator.clipboard.writeText(v);
          setDone(true);
          toast.success("Copied");
        }}
      >
        {done ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}

function F({ label, v, on, hint }: { label: string; v: string; on: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DatashareKeyPanel() {
  const status = useServerFn(getDatashareKeyStatus);
  const q = useQuery({ queryKey: ["admin", "datashare-key"], queryFn: () => status() });
  const save = useAdminAction(useServerFn(setDatashareKey), { success: "Snapshot key saved", invalidate: [["admin", "datashare-key"], ["admin", "insights"]] });
  const [value, setValue] = useState("");
  return (
    <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 lg:grid-cols-2">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-primary" /> Snapshot verification key
          {q.data?.configured ? <Badge variant="success">Configured</Badge> : <Badge variant="muted">Optional</Badge>}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The value built into the app as <span className="font-mono">BEBOSS_DATASHARE_HMAC_SECRET</span>. With it, every shop's Retail insights tab confirms the phone's branch data was not altered on the way. Insights still work without it.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ value }, { onSuccess: () => setValue("") });
        }}
        className="flex flex-col gap-3"
      >
        <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={q.data?.configured ? "Enter a new key to replace it" : "Paste the app's data-share key"} minLength={8} required autoComplete="off" />
        <Button type="submit" variant="soft" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save snapshot key
        </Button>
      </form>
    </section>
  );
}
