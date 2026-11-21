import { createFileRoute, useRouter } from "@tanstack/react-router";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminText } from '@/lib/admin-copy';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';
import { liveConfigured } from '@/lib/live-config';
import { retailCopy } from '@/lib/i18n-dict';
import { useI18n } from '@/lib/i18n';
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — BeBoss Admin Center" },
      { name: "description", content: "Secure sign-in for the BeBoss admin team." },
      { property: "og:title", content: "BeBoss Admin sign-in" },
      { property: "og:description", content: "Secure sign-in for the BeBoss admin team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function safeRedirect(r?: string) {
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/admin";
}

function GoogleG() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

function AuthPage() {
  const {lang,t}=useI18n();const a=useAdminText();
  const { redirect } = Route.useSearch();
  const target = safeRedirect(redirect);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("signin");

  useEffect(() => {
    if (!liveConfigured) return;
    const go = () => {
      const stored = sessionStorage.getItem("beboss.postAuth");
      sessionStorage.removeItem("beboss.postAuth");
      router.history.push(redirect ? target : safeRedirect(stored ?? undefined));
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) go();
    });
    return () => data.subscription.unsubscribe();
  }, [router, target, redirect]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/admin`, data: { full_name: name } },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) toast.success("Check your email to confirm your account, then sign in.");
  };

  const forgot = async () => {
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent to your email.");
  };

  const oauth = async (provider: "google" | "lovable") => {
    sessionStorage.setItem("beboss.postAuth", target);
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (result.error) toast.error(result.error.message ?? "Sign-in failed");
  };

  return (
    <div className="auth-page-shell relative grid min-h-screen place-items-center px-4 py-10">
      <div className="auth-page-backdrop absolute inset-0 bg-cover bg-center" style={{backgroundImage:'linear-gradient(100deg,#102017bb,#181b16aa),url(/hero-shop.jpg)'}} aria-hidden="true"/>
      <div className="auth-page-inner relative w-full max-w-md">
        <div className="auth-page-card rounded-2xl border border-border bg-card p-7 shadow-soft">
          <div className="auth-page-brandrow mb-6 flex items-center justify-between border-b border-border pb-5"><Logo suffix={t('navAdmin')} /><div className="flex items-center"><LanguageSwitcher/><ThemeToggle/></div></div>
          {!liveConfigured && <p role="status" className="mb-5 rounded-lg bg-muted p-3 text-sm">{retailCopy[lang].unavailable}</p>}
          <fieldset disabled={!liveConfigured} className="min-w-0 disabled:opacity-65">
          <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-success" />
            {a("Restricted to the BeBoss admin team")}
          </div>
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="h-10 w-full" onClick={() => oauth("google")}>
              <GoogleG />
              {a("Continue with Google")}
            </Button>
            <Button type="button" variant="outline" className="h-10 w-full" onClick={() => oauth("lovable")}>
              <LovableMark className="size-[18px]" />
              {a("Continue with Lovable")}
            </Button>
          </div>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {a("or with email")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{a("Sign in")}</TabsTrigger>
              <TabsTrigger value="signup">{a("Create account")}</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={signIn} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="e1">{a("Email")}</Label>
                  <Input id="e1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="p1">{a("Password")}</Label>
                    <button type="button" className="text-xs text-primary hover:underline" onClick={forgot}>
                      {a("Forgot password?")}
                    </button>
                  </div>
                  <Input id="p1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                </div>
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {a('Sign in')}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="n2">{a("Full name")}</Label>
                  <Input id="n2" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e2">{a("Email")}</Label>
                  <Input id="e2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p2">{a("Password")}</Label>
                  <Input id="p2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
                </div>
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {a('Create account')}
                </Button>
                <p className="text-xs text-muted-foreground">{a("Admin access is granted by the master admin. New accounts see the admin center only after approval.")}</p>
              </form>
            </TabsContent>
          </Tabs>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
