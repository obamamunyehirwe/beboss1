import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { publicSiteQuery } from "@/lib/queries";
import { buildWhatsAppUrl } from "@/lib/pricing";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact BeBoss — sales, support and payments" },
      { name: "description", content: "Talk to the BeBoss team about pricing, setup, Mobile Money payments or partnerships. Reach us on WhatsApp or send a message." },
      { property: "og:title", content: "Contact the BeBoss team" },
      { property: "og:description", content: "Questions about BeBoss POS? We reply fast on WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQuery),
  component: ContactPage,
});

const schema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(200).email().or(z.literal("")),
  shop_name: z.string().trim().max(160),
  topic: z.enum(["GENERAL", "SALES", "SUPPORT", "PAYMENT", "PARTNERSHIP"]),
  message: z.string().trim().min(5).max(4000),
});

function ContactPage() {
  const { t, p } = useI18n();
  const { data } = useSuspenseQuery(publicSiteQuery);
  const [f, setF] = useState<z.infer<typeof schema>>({ full_name: "", phone: "", email: "", shop_name: "", topic: "GENERAL", message: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const wa = data.config?.admin_whatsapp_number;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(f);
    if (!parsed.success) {
      toast.error(p.contact.checkForm);
      return;
    }
    if (!parsed.data.phone && !parsed.data.email) {
      toast.error(p.contact.addContact);
      return;
    }
    setSending(true);
    const { error } = await supabase.from("contact_messages").insert(parsed.data);
    setSending(false);
    if (error) {
      toast.error(p.contact.sendFailed);
      return;
    }
    setDone(true);
  };

  return (
    <SiteLayout>
      <PageHero eyebrow={t("navContact")} title={t("contactTitle")} sub={t("contactSub")} />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.5fr]">
        <div className="space-y-4">
          {wa ? (
            <a href={buildWhatsAppUrl(wa, p.contact.waGreeting)} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-3xl border border-border bg-card p-6 transition-colors hover:border-success/50">
              <MessageCircle className="size-8 text-success" />
              <div>
                <p className="font-semibold">WhatsApp</p>
                <p className="text-sm text-muted-foreground">+{wa.replace(/\D/g, "")}</p>
              </div>
            </a>
          ) : null}
          {data.config?.support_email ? (
            <a href={`mailto:${data.config.support_email}`} className="flex items-center gap-4 rounded-3xl border border-border bg-card p-6 transition-colors hover:border-primary/50">
              <Mail className="size-8 text-primary" />
              <div>
                <p className="font-semibold">{p.contact.email}</p>
                <p className="text-sm text-muted-foreground">{data.config.support_email}</p>
              </div>
            </a>
          ) : null}
          <div className="rounded-3xl border border-border bg-surface-2 p-6 text-sm text-muted-foreground">
            {p.contact.paidAlready} <a className="text-primary underline" href="/my-shop?pay=1">{p.contact.proofForm}</a>.
          </div>
        </div>
        {done ? (
          <div className="grid place-items-center rounded-3xl border border-success/30 bg-card p-10 text-center">
            <CheckCircle2 className="size-12 text-success" />
            <p className="mt-4 text-lg font-semibold">{t("sent")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-border bg-card p-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("fullName")}</Label>
              <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label>{t("shopName")}</Label>
              <Input value={f.shop_name} onChange={(e) => setF({ ...f, shop_name: e.target.value })} maxLength={160} />
            </div>
            <div className="space-y-2">
              <Label>{t("phone")}</Label>
              <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" maxLength={30} />
            </div>
            <div className="space-y-2">
              <Label>{t("email")}</Label>
              <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={200} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("topic")}</Label>
              <Select value={f.topic} onValueChange={(v) => setF({ ...f, topic: v as typeof f.topic })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["GENERAL", "SALES", "SUPPORT", "PAYMENT", "PARTNERSHIP"] as const).map((x) => (
                    <SelectItem key={x} value={x}>
                      {p.contact.topics[x]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("message")}</Label>
              <Textarea rows={6} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required minLength={5} maxLength={4000} />
            </div>
            <Button type="submit" variant="hero" size="lg" className="sm:col-span-2" disabled={sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              {t("send")}
            </Button>
          </form>
        )}
      </div>
    </SiteLayout>
  );
}
