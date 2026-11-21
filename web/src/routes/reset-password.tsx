import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set or reset password — BeBoss Admin" },
      { name: "description", content: "Set a secure password for your invited BeBoss admin account or reset an existing password." },
      { property: "og:title", content: "BeBoss Admin password setup" },
      { property: "og:description", content: "Set or reset your secure BeBoss admin password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isInvitation, setIsInvitation] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const hash = window.location.hash;
    const inviteMode = hash.includes("type=invite") || new URLSearchParams(window.location.search).get("invite") === "1";
    const recoveryMode = hash.includes("type=recovery");
    setIsInvitation(inviteMode);

    const restoreVerifiedSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) toast.error(error.message);
        if (data.session && (inviteMode || recoveryMode)) setReady(true);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Could not verify this password link.");
      }
    };
    void restoreVerifiedSession();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !session) return;
      if (event === "PASSWORD_RECOVERY" || (inviteMode && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))) {
        setReady(true);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    if (pw.length < 10) {
      toast.error("Use at least 10 characters for your password.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(isInvitation ? "Your admin password is set. Welcome to BeBoss." : "Password updated.");
      navigate({ to: "/admin" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reset-page-shell grid min-h-screen place-items-center bg-ember px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center"><Logo suffix="Admin" /></div>
        <form onSubmit={submit} className="reset-page-card space-y-4 rounded-3xl border border-border bg-card p-7">
          <div className="grid size-11 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <ShieldCheck size={21} />
          </div>
          <h1 className="text-xl font-bold">{isInvitation ? "Set your admin password" : "Choose a new password"}</h1>
          {!ready ? (
            <p className="text-sm text-muted-foreground">
              Open the secure invitation or password-reset link from your email to continue.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isInvitation ? "Create a password for your invited BeBoss admin account." : "Choose a new password for your BeBoss admin account."}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="np">New password</Label>
            <Input id="np" type="password" value={pw} onChange={(event) => setPw(event.target.value)} minLength={10} required autoComplete="new-password" disabled={!ready || busy} />
          </div>
          <Button type="submit" variant="hero" className="w-full" disabled={!ready || busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {isInvitation ? "Set password and continue" : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
