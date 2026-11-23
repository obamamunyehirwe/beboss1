import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminText } from "@/lib/admin-copy";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { LanguageSwitcher } from "@/components/site/LanguageSwitcher";
import { liveConfigured } from "@/lib/live-config";
import { useI18n } from "@/lib/i18n";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Admin sign in — BeBoss" },
      { name: "description", content: "Sign in to the protected BeBoss Admin workspace." },
      { property: "og:title", content: "BeBoss Admin sign-in" },
      { property: "og:description", content: "Restricted access for the approved BeBoss admin team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function safeRedirect(value?: string) {
  return value && value.startsWith("/admin") && !value.startsWith("//") ? value : "/admin";
}

function AuthPage() {
  const { t } = useI18n();
  const a = useAdminText();
  const { redirect } = Route.useSearch();
  const target = safeRedirect(redirect);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!liveConfigured) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) toast.error(error.message);
        else if (data.session) router.history.push(target);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : a("Could not restore your BeBoss session."));
      } finally {
        if (active) setCheckingSession(false);
      }
    };
    void restoreSession();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) router.history.push(target);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [router, target, a]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!liveConfigured || busy || checkingSession) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const invalidCredentials = error.code === "invalid_credentials" ||
          error.message.toLowerCase().includes("invalid login credentials");
        toast.error(invalidCredentials
          ? a("The email or password is incorrect. Check your credentials and try again.")
          : error.message);
        return;
      }
      toast.success(a("Credentials accepted. Verifying your BeBoss access…"));
      router.history.push(target);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a("Unable to sign in. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-atmosphere" aria-hidden="true" />
      <header className="admin-auth-header">
        <Logo suffix={t("navAdmin")} />
        <div className="admin-auth-header-tools"><LanguageSwitcher /><ThemeToggle /></div>
      </header>
      <main className="admin-auth-layout">
        <section className="admin-auth-story" aria-labelledby="admin-auth-story-title">
          <div className="admin-auth-eyebrow"><span className="admin-auth-eyebrow-dot" /><ShieldCheck size={15} />{a("RESTRICTED ADMIN WORKSPACE")}</div>
          <h1 id="admin-auth-story-title">{a("One secure command center.")} <em>{a("Every shop in view.")}</em></h1>
          <p className="admin-auth-story-copy">{a("Review payment requests, monitor connected devices, manage releases and keep every BeBoss operation under control from one protected workspace.")}</p>
          <div className="admin-auth-visual">
            <img src="/Friendly%20Modern%20Store%20Checkout.png" alt="BeBoss retail point-of-sale checkout experience" loading="eager" decoding="async" width={1600} height={1100} />
            <div className="admin-auth-visual-shade" aria-hidden="true" />
            <div className="admin-auth-visual-brand">
              <img src="/beboss-app-icon.png" alt="" width={42} height={42} />
              <span><strong>BeBoss POS</strong><small>{a("BUSINESS · SALES · INVENTORY")}</small></span>
            </div>
            <div className="admin-auth-visual-stamp"><LockKeyhole size={15} />{a("Role-verified access")}</div>
          </div>
          <div className="admin-auth-proof">
            <span><ShieldCheck size={15} /> {a("Permission checked")}</span>
            <span><KeyRound size={15} /> {a("Password protected")}</span>
            <span><LockKeyhole size={15} /> {a("Secure admin session")}</span>
          </div>
        </section>
        <section className="admin-auth-form-wrap" aria-labelledby="admin-auth-form-title">
          <div className="auth-page-card admin-auth-form-card">
            <div className="admin-auth-form-icon"><LockKeyhole size={22} /></div>
            <p className="admin-auth-form-kicker">{a("BE BOSS · ADMIN ACCESS")}</p>
            <h2 id="admin-auth-form-title">{a("Sign in to BeBoss Admin")}</h2>
            <p className="admin-auth-form-intro">{a("Enter your BeBoss administrator credentials to continue.")}</p>
            {!liveConfigured ? (
              <div role="status" className="admin-auth-config-warning">
                <strong>{a("Admin sign-in is not configured in this deployment.")}</strong>
                <span>{a("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the web deployment. Keep SUPABASE_SERVICE_ROLE_KEY server-only.")}</span>
              </div>
            ) : null}
            <form onSubmit={signIn} className="admin-auth-form">
              <div className="space-y-2">
                <Label htmlFor="admin-email">{a("Email")}</Label>
                <Input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="admin@yourbusiness.com" disabled={!liveConfigured || busy || checkingSession} />
              </div>
              <div className="space-y-2">
                <div className="admin-auth-password-label">
                  <Label htmlFor="admin-password">{a("Password")}</Label>
                </div>
                <div className="admin-auth-password-wrap">
                  <Input id="admin-password" type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" disabled={!liveConfigured || busy || checkingSession} />
                  <button className="admin-auth-password-toggle" type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? a("Hide password") : a("Show password")} aria-pressed={passwordVisible}>
                    {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <Button type="submit" variant="hero" className="admin-auth-submit" disabled={!liveConfigured || busy || checkingSession}>
                {busy || checkingSession ? <Loader2 className="animate-spin" /> : <LockKeyhole size={17} />}
                {checkingSession ? a("Checking session…") : busy ? a("Signing in…") : a("Sign in securely")}
              </Button>
            </form>
          </div>
        </section>
      </main>
      <footer className="admin-auth-footer"><span>© {new Date().getFullYear()} BeBoss POS</span><span>{a("Authorized access only")}</span></footer>
    </div>
  );
}
