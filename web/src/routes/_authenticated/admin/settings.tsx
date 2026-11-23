import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Save, Smartphone, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock, PageHeader, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { getBb3SigningStatus, saveAppConfig, setSigningSecret } from "@/lib/admin.functions";
import { configQuery } from "@/lib/admin-queries";
import { getDatashareKeyStatus, setDatashareKey } from "@/lib/insights.functions";
import { DOWNLOAD_PATH } from "@/lib/queries";
import { useAdminText } from "@/lib/admin-copy";
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
  min_app_version: string;
  support_email: string;
};

function SettingsPage() {
  const ctx = useAdminCtx();
  const a = useAdminText();
  const isAdmin = !!ctx.data?.isAdmin;
  const { data, isLoading } = useQuery(configQuery);
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const save = useAdminAction(useServerFn(saveAppConfig), { success: "Saved — every app picks this up on its next sync", invalidate: [["admin", "config"], ["public-site"]] });
  const signingStatusFn = useServerFn(getBb3SigningStatus);
  const signingStatus = useQuery({ queryKey: ["admin", "bb3-signing-status"], queryFn: () => signingStatusFn(), enabled: isAdmin, refetchOnWindowFocus: true });
  const keyIsReady = signingStatus.data?.configured ?? !!ctx.data?.signingKeyConfigured;
  const setKey = useAdminAction(useServerFn(setSigningSecret), { success: "BB3 signing key verified and saved", invalidate: [["admin", "ctx"], ["admin", "bb3-signing-status"]] });
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [previewAmount, setPreviewAmount] = useState(5000);

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
      <PageHeader title={a("Settings")} sub="Live configuration shared by the website and every BeBoss app." />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(cfg);
        }}
        className="grid gap-5 rounded-2xl border border-border bg-card p-5 lg:grid-cols-2"
      >
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Wallet className="size-4 text-primary" /> {a("Mobile money & support")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label={a("MTN MoMo merchant / pay code")} v={cfg.mtn_momo_code} on={(v) => set("mtn_momo_code", v)} inputMode="numeric" hint={a("Used in *182*8*1*CODE*AMOUNT#. Leave empty to use the fallback phone.")} />
            <F label={a("MTN MoMo fallback phone")} v={cfg.mtn_momo_phone} on={(v) => set("mtn_momo_phone", v)} inputMode="tel" hint={a("Used in *182*1*1*PHONE*AMOUNT# only when the merchant code is empty.")} />
            <F label={a("MTN recipient name")} v={cfg.mtn_recipient_name} on={(v) => set("mtn_recipient_name", v)} />
            <F label={a("Airtel Money receiving phone")} v={cfg.airtel_money_phone} on={(v) => set("airtel_money_phone", v)} inputMode="tel" hint={a("Used in *500*1*1*PHONE*AMOUNT#.")} />
            <F label="Airtel recipient name" v={cfg.airtel_recipient_name} on={(v) => set("airtel_recipient_name", v)} />
            <div className="space-y-1.5">
              <Label>{a("Extra POS terminal fee (FRw / month)")}</Label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-semibold">
                {a("2,000 FRw per additional paired device")}
              </div>
              <p className="text-xs text-muted-foreground">{a("The primary owner terminal is included. Every additional active POS device is billed at a fixed 2,000 FRw each month.")}</p>
            </div>
            <F label="Admin WhatsApp (with country code)" v={cfg.admin_whatsapp_number} on={(v) => set("admin_whatsapp_number", v)} inputMode="tel" hint="e.g. 250788123456" />
            <F label="Support email" v={cfg.support_email} on={(v) => set("support_email", v)} inputMode="email" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Smartphone className="size-4 text-primary" /> {a("App update channel")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label={a("Latest app version")} v={cfg.apk_version} on={(v) => set("apk_version", v)} />
            <F label={a("Minimum required version")} v={cfg.min_app_version} on={(v) => set("min_app_version", v)} hint={a("Older app versions can be blocked from cloud access when a critical update is required.")} />
            <F label={a("APK download link")} v={cfg.apk_download_url} on={(v) => set("apk_download_url", v)} hint={a("Set automatically when you publish a release")} />
          </div>
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{a("Live USSD payment preview")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{a("Updates instantly as you edit the merchant code or receiving phone.")}</p>
              </div>
              <div className="w-36 space-y-1">
                <Label htmlFor="ussd-preview-amount">{a("Test amount (FRw)")}</Label>
                <Input
                  id="ussd-preview-amount"
                  type="number"
                  min={1}
                  max={10000000}
                  step={1}
                  value={previewAmount}
                  onChange={(e) => setPreviewAmount(Math.min(10000000, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[5000, 10000, 20000, 50000].map((amount) => (
                <Button key={amount} type="button" size="sm" variant={previewAmount === amount ? "soft" : "ghost"} onClick={() => setPreviewAmount(amount)}>
                  {amount.toLocaleString("en-RW")} FRw
                </Button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <UssdPreview label="MTN MoMo · *182#" value={buildMtnUssd(previewAmount, cfg)} />
              <UssdPreview label="Airtel Money · *500#" value={buildAirtelUssd(previewAmount, cfg)} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{a("These are dial strings only. BeBoss records payment claims; an admin must still verify the transaction with the mobile-money provider before approving it.")}</p>
          </div>
          {isAdmin ? (
            <Button type="submit" variant="hero" className="mt-auto" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {a("Save configuration")}
            </Button>
          ) : null}
        </div>
      </form>

      {isAdmin ? (
        <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 lg:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="size-4 text-primary" /> {a("BB3 signing private key")}
              {signingStatus.isLoading ? <Badge variant="muted">{a("Checking key…")}</Badge> : keyIsReady ? <Badge variant="success">{a("Configured · Android key matched")}</Badge> : <Badge variant="warning">{a("Missing or not matched")}</Badge>}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              New unlock codes are BB3 ECDSA P-256 signatures. The private key stays server-side in Supabase; Android contains only the matching public key. The saved private key must match the public key already pinned in your installed APK. Legacy BB2 codes are verified online against their original issued database record, so no BB2 shared HMAC key is needed. Never paste a private key into Android files, browser storage, or VITE_ variables.
            </p>
            <p className={keyIsReady ? "mt-3 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success" : "mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning"}>
              {signingStatus.data?.message ?? "Checking whether the current server key matches the Android app…"}
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
              <Input type={show ? "text" : "password"} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={ctx.data?.signingKeyConfigured ? "Paste a replacement matching PKCS#8 P-256 private key PEM" : "Paste the existing Android-matching PKCS#8 P-256 private key PEM"} minLength={120} required autoComplete="off" className="pr-10" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShow(!show)} aria-label={a("Toggle visibility")}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button type="submit" variant="soft" disabled={setKey.isPending}>
              {setKey.isPending ? <Loader2 className="animate-spin" /> : <Save />} {a("Verify & save BB3 key")}
            </Button>
          </form>
        </section>
      ) : null}

      {isAdmin ? <DatashareKeyPanel /> : null}

      {isAdmin ? <ConnectionPanel origin={origin} /> : null}
    </div>
  );
}

function UssdPreview({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const a = useAdminText();
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{a(label)}</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              toast.success(a(`${label} copied`));
            } catch {
              toast.error(a("Clipboard access is unavailable in this browser."));
            }
          }}
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {a("Copy")}
        </Button>
      </div>
      <p className="mt-2 break-all font-mono text-sm font-semibold text-primary">{value}</p>
    </div>
  );
}

function ConnectionPanel({ origin }: { origin: string }) {
  const a = useAdminText();
  const url = import.meta.env["VITE_SUPABASE_URL"] as string;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  const lines = [
    ["SUPABASE_URL", url],
    ["SUPABASE_ANON_KEY", key],
    ["SUPABASE_ADMIN_EMAIL", "obamamunyehirwe@gmail.com"],
  ] as const;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Smartphone className="size-4 text-primary" /> {a("Connect the Android app")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {a("Put these values in the app's")} <span className="font-mono">{a(".env")}</span> file and rebuild the APK. Existing app code works unchanged — shops, payments, codes, devices, staff and branch sync all flow into this admin center. These are public app values, not secrets.
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
  const a = useAdminText();
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
        aria-label={a("Copy")}
        onClick={async () => {
          await navigator.clipboard.writeText(v);
          setDone(true);
          toast.success(a("Copied"));
        }}
      >
        {done ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}

function F({ label, v, on, hint, inputMode = "text" }: { label: string; v: string; on: (v: string) => void; hint?: string; inputMode?: "text" | "numeric" | "tel" | "email" }) {
  const a = useAdminText();
  return (
    <div className="space-y-1.5">
      <Label>{a(label)}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} inputMode={inputMode} autoComplete="off" />
      {hint ? <p className="text-[11px] text-muted-foreground">{a(hint)}</p> : null}
    </div>
  );
}

function DatashareKeyPanel() {
  const a = useAdminText();
  const status = useServerFn(getDatashareKeyStatus);
  const q = useQuery({ queryKey: ["admin", "datashare-key"], queryFn: () => status() });
  const save = useAdminAction(useServerFn(setDatashareKey), { success: "Snapshot key saved", invalidate: [["admin", "datashare-key"], ["admin", "insights"]] });
  const [value, setValue] = useState("");
  return (
    <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 lg:grid-cols-2">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-primary" /> {a("Snapshot verification key")}
          {q.data?.configured ? <Badge variant="success">{a("Configured")}</Badge> : <Badge variant="muted">{a("Optional")}</Badge>}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {a("The value built into the app as")} <span className="font-mono">BEBOSS_DATASHARE_HMAC_SECRET</span>. With it, every shop's Retail insights tab confirms the phone's branch data was not altered on the way. Insights still work without it.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ value }, { onSuccess: () => setValue("") });
        }}
        className="flex flex-col gap-3"
      >
        <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={a(q.data?.configured ? "Enter a new key to replace it" : "Paste the app data-share key")} minLength={8} required autoComplete="off" />
        <Button type="submit" variant="soft" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {a("Save snapshot key")}
        </Button>
      </form>
    </section>
  );
}
