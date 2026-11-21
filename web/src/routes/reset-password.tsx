import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
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
      { title: "Reset password — BeBoss Admin" },
      { name: "description", content: "Choose a new password for your BeBoss admin account." },
      { property: "og:title", content: "Reset your BeBoss admin password" },
      { property: "og:description", content: "Choose a new password for your BeBoss admin account." },
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
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    navigate({ to: "/admin" });
  };
  return (
    <div className="reset-page-shell grid min-h-screen place-items-center bg-ember px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo suffix="Admin" />
        </div>
        <form onSubmit={submit} className="reset-page-card space-y-4 rounded-3xl border border-border bg-card p-7">
          <h1 className="text-xl font-bold">Choose a new password</h1>
          {!ready ? <p className="text-sm text-muted-foreground">Open this page from the reset link in your email.</p> : null}
          <div className="space-y-2">
            <Label htmlFor="np">New password</Label>
            <Input id="np" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required disabled={!ready} />
          </div>
          <Button type="submit" variant="hero" className="w-full" disabled={!ready || busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}
