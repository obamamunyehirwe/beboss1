import type React from "react";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, LoaderCircle, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";
import { isPreviewCloudMode, type OwnerCredentials, requestOwnerOtp, toOwnerPhoneE164, verifyOwnerOtp } from "../lib/cloud";
import type { DesktopPreferences } from "../lib/types";
import { errorText } from "../lib/format";

type AuthLang = "EN" | "RW" | "FR" | "SW";

const AUTH_COPY: Record<AuthLang, {
  marketing: string; headline: string; headlineEm: string; headlineSub: string;
  showcaseTitle: string; cloudConnected: string; showcaseFoot: string[];
  pillEncrypted: string; pillSync: string; pillPlatforms: string; foot: string;
  formEyebrow: string; formTitle: string; formSubtitle: string;
  usernameLabel: string; phoneLabel: string; codeLabel: string;
  usernamePlaceholder: string; phonePlaceholder: string; codePlaceholder: string;
  sendBtn: string; verifyBtn: string; busy: string; changeOwner: string;
  secureNote: string; sentNotice: string; language: string; backToHome: string;
}> = {
  EN: {
    marketing: "RETAIL OPERATIONS PLATFORM", headline: "Run your business.",
    headlineEm: "From one command centre.",
    headlineSub: "Sales, inventory, customers, branches and staff — in sync with your BeBoss shop.",
    showcaseTitle: "SHOP PERFORMANCE", cloudConnected: "CLOUD CONNECTED",
    showcaseFoot: ["Sales intelligence", "Inventory control", "Multi-branch sync"],
    pillEncrypted: "Encrypted", pillSync: "Real-time sync", pillPlatforms: "Mobile + Desktop",
    foot: "SECURE OWNER ACCESS · ENGLISH · IKINYARWANDA · FRANÇAIS · KISWAHILI",
    formEyebrow: "OWNER SIGN IN", formTitle: "Welcome to BeBoss",
    formSubtitle: "Verify the mobile number already registered to your shop. Desktop access is granted only to an active, verified shop owner.",
    usernameLabel: "Shop owner username", phoneLabel: "Registered mobile number", codeLabel: "SMS verification code",
    usernamePlaceholder: "your-shop-username", phonePlaceholder: "+250 7XX XXX XXX", codePlaceholder: "Enter the code received by SMS",
    sendBtn: "Send secure verification code", verifyBtn: "Verify owner and open desktop", busy: "Please wait…",
    changeOwner: "Change owner details", secureNote: "Your session is encrypted by the operating-system keyring.",
    sentNotice: "If the details match a registered shop owner, an SMS verification code has been sent to the registered phone.",
    language: "Language", backToHome: "Back to welcome"
  },
  RW: {
    marketing: "URUBURO RWUBUTUNGA", headline: "Kora ubucuruzi bwawe.",
    headlineEm: "Kuva ku kigo kimwe cy'ubuyobozi.",
    headlineSub: "Gurisha, ibikoresho, abakiriya, amashami n'abakozi — bihuza n'ubucuruzi bwawe bwa BeBoss.",
    showcaseTitle: "IMIRINGA Y'IDUKA", cloudConnected: "IFIYE KU RUBUGIRIZA",
    showcaseFoot: ["Ubwenge bw'kugurisha", "Kugenzura ibikoresho", "Guhuza amashami"],
    pillEncrypted: "Byarinzwe", pillSync: "Igihe nyacyo", pillPlatforms: "Telefone + Mudasobwa",
    foot: "KWINJIRA KU MUKURU BYARINZWE · IGIKINYARWANDA · IGIFARANSA · IGISWAHILI · ICYONGEREZA",
    formEyebrow: "KWINJIRA KU MUKURU", formTitle: "Murakaza neza kuri BeBoss",
    formSubtitle: "Emeza numero ya telefone isanzwe yanditse ku iduka ryawe. Kwinjira kuri mudasobwa bikemerewe gusa ku mukuru nyobozi wemejwe.",
    usernameLabel: "Izina ry'umukuru w'iduka", phoneLabel: "Numero ya telefone yanditse", codeLabel: "Kode yo kwemeza kuri SMS",
    usernamePlaceholder: "izina-ry-iduka-ryawe", phonePlaceholder: "+250 7XX XXX XXX", codePlaceholder: "Andika kode yakiriwe kuri SMS",
    sendBtn: "Ohereza kode yo kwemeza", verifyBtn: "Emeza umukuru ufungure mudasobwa", busy: "Tegereza…",
    changeOwner: "Hindura amakuru y'umukuru", secureNote: "Igihe cyawe kirinzwe n'ububiko bw'umutekano wa sisitemu.",
    sentNotice: "Niba amakuru ahuza n'umukuru w'iduka wanditse, kode yo kwemeza yohererejwe kuri telefone yanditse.",
    language: "Ururimi", backToHome: "Subira ku rupapuro rw’ibanze"
  },
  FR: {
    marketing: "PLATEFORME D'EXPLOITATION COMMERCIALE", headline: "Gérez votre commerce.",
    headlineEm: "Depuis un poste de commandement unique.",
    headlineSub: "Ventes, stock, clients, succursales et personnel — synchronisés avec votre boutique BeBoss.",
    showcaseTitle: "PERFORMANCE DE LA BOUTIQUE", cloudConnected: "CONNECTE AU CLOUD",
    showcaseFoot: ["Analyse des ventes", "Gestion du stock", "Synchro multi-succursales"],
    pillEncrypted: "Chiffré", pillSync: "Temps réel", pillPlatforms: "Mobile + Bureau",
    foot: "ACCÈS PROPRIÉTAIRE SÉCURISÉ · FRANÇAIS · IKINYARWANDA · KISWAHILI · ANGLAIS",
    formEyebrow: "CONNEXION PROPRIÉTAIRE", formTitle: "Bienvenue sur BeBoss",
    formSubtitle: "Vérifiez le numéro de mobile déjà enregistré pour votre boutique. L'accès bureau est réservé à un propriétaire actif et vérifié.",
    usernameLabel: "Nom d'utilisateur du propriétaire", phoneLabel: "Numéro de mobile enregistré", codeLabel: "Code de vérification SMS",
    usernamePlaceholder: "nom-de-votre-boutique", phonePlaceholder: "+250 7XX XXX XXX", codePlaceholder: "Saisissez le code reçu par SMS",
    sendBtn: "Envoyer le code de vérification", verifyBtn: "Vérifier et ouvrir le bureau", busy: "Veuillez patienter…",
    changeOwner: "Modifier les coordonnées", secureNote: "Votre session est chiffrée par le coffre-fort du système.",
    sentNotice: "Si les informations correspondent à un propriétaire enregistré, un code de vérification a été envoyé par SMS au numéro enregistré.",
    language: "Langue", backToHome: "Retour à l’accueil"
  },
  SW: {
    marketing: "JUKWAA LA UENDESHAJI WA BIASHARA", headline: "Endesha biashara yako.",
    headlineEm: "Kutoka kituo kimoja cha udhibiti.",
    headlineSub: "Mauzo, bidhaa, wateja, matawi na wafanyakazi — vimeunganishwa na duka lako la BeBoss.",
    showcaseTitle: "UTENDAJI WA DUKA", cloudConnected: "UMEUNGANISHWA NA WINGU",
    showcaseFoot: ["Akili ya mauzo", "Udhibiti wa bidhaa", "Uunganishaji wa matawi"],
    pillEncrypted: "Imelindwa", pillSync: "Muda halisi", pillPlatforms: "Simu + Kompyuta",
    foot: "UFIKIAJI SALAMA WA MMILIKI · KISWAHILI · IKINYARWANDA · KIFARANSA · KIINGEREZA",
    formEyebrow: "KUINGIA KWA MMILIKI", formTitle: "Karibu kwenye BeBoss",
    formSubtitle: "Thibitisha namba ya simu iliyosajiliwa kwa duka lako. Kuingia kwenye kompyuta kunaruhusiwa kwa mmiliki hai na aliyethibitishwa tu.",
    usernameLabel: "Jina la mtumiaji wa mmiliki", phoneLabel: "Namba ya simu iliyosajiliwa", codeLabel: "Namba ya uthibitisho ya SMS",
    usernamePlaceholder: "jina-la-duka-lako", phonePlaceholder: "+250 7XX XXX XXX", codePlaceholder: "Weka namba uliyopokea kwa SMS",
    sendBtn: "Tuma namba ya uthibitisho", verifyBtn: "Thibitisha na ufungue kompyuta", busy: "Tafadhali subiri…",
    changeOwner: "Badilisha maelezo ya mmiliki", secureNote: "Kikao chako kimehifadhiwa kwa usalama na hifadhi ya mfumo.",
    sentNotice: "Ikiwa maelezo yanalingana na mmiliki aliyesajiliwa, namba ya uthibitisho imetumwa kwa namba iliyosajiliwa.",
    language: "Lugha", backToHome: "Rudi kwenye ukurasa wa mwanzo"
  }
};

export function AuthScreen({ onAuthenticated, onBack, theme }: { onAuthenticated: (owner: OwnerCredentials) => Promise<void>; onBack: () => void; theme: DesktopPreferences["theme"] }) {
  const [lang, setLang] = useState<AuthLang>("EN");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const t = AUTH_COPY[lang];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const storedLang = await window.beBossDesktop.secureStore.get("ui-language");
        if (alive && storedLang && storedLang in AUTH_COPY) setLang(storedLang as AuthLang);
        const identity = await window.beBossDesktop.secureStore.get("owner-identity");
        if (alive && identity) {
          const parsed = JSON.parse(identity) as OwnerCredentials;
          if (parsed.username) setUsername(parsed.username);
          if (parsed.phone) setPhone(parsed.phone);
        }
      } catch { /* prefill is best-effort */ }
    })();
    return () => { alive = false; };
  }, []);

  function chooseLang(next: AuthLang) {
    setLang(next);
    void window.beBossDesktop.secureStore.set("ui-language", next).catch(() => undefined);
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const normalized = toOwnerPhoneE164(phone);
      await requestOwnerOtp({ username: username.trim().toLowerCase(), phone: normalized });
      setPhone(normalized);
      setSent(true);
      setNotice(t.sentNotice);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const normalized = toOwnerPhoneE164(phone);
      await verifyOwnerOtp(normalized, code);
      await window.beBossDesktop.secureStore.set("owner-identity", JSON.stringify({ username: username.trim().toLowerCase(), phone: normalized }));
      await onAuthenticated({ username: username.trim().toLowerCase(), phone: normalized });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function enterPreviewWorkspace() {
    setBusy(true); setError("");
    try {
      const demoUser = username.trim().toLowerCase() || "jean_kigali";
      const demoPhone = phone.trim() ? toOwnerPhoneE164(phone) : "+250788421095";
      await verifyOwnerOtp(demoPhone, "123456");
      await window.beBossDesktop.secureStore.set("owner-identity", JSON.stringify({ username: demoUser, phone: demoPhone }));
      await onAuthenticated({ username: demoUser, phone: demoPhone });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  const step = sent ? 2 : 1;
  const digits = Array.from({ length: 6 }, (_, i) => code[i] ?? "");

  return <div className="ax-shell" data-theme={theme}>
    <section className="ax-visual">
      <img className="ax-photo" src="/Friendly Modern Store Checkout.png" alt="Shop owner at a BeBoss checkout counter" />
      <div className="ax-shade" />
      <div className="ax-visual-top">
        <span className="ax-brand"><img src="/beboss-app-icon.png" alt="" /><strong>BeBoss</strong><small>DESKTOP</small></span>
        <div className="ax-lang" role="group" aria-label={t.language}>
          {(["EN", "RW", "FR", "SW"] as AuthLang[]).map((c) => <button key={c} type="button" className={lang === c ? "active" : ""} onClick={() => chooseLang(c)} aria-pressed={lang === c}>{c}</button>)}
        </div>
      </div>
      <div className="ax-float k1"><Zap size={15} /><div><small>{t.pillSync}</small><strong>Synced 2s ago</strong></div></div>
      <div className="ax-float k2"><ShieldCheck size={15} /><div><small>{t.pillEncrypted}</small><strong>AES-256 vault</strong></div></div>
      <div className="ax-visual-copy">
        <span className="ax-eyebrow"><Sparkles size={13} /> {t.marketing}</span>
        <h1>{t.headline} <em>{t.headlineEm}</em></h1>
        <p>{t.headlineSub}</p>
        <div className="ax-pills">{t.showcaseFoot.map((label) => <span key={label}>{label}</span>)}<span><Smartphone size={12} /> {t.pillPlatforms}</span></div>
      </div>
    </section>

    <section className="ax-panel">
      <div className="ax-card">
        <div className="ax-card-top">
          <button type="button" className="ax-back" onClick={onBack}><ArrowLeft size={14} />{t.backToHome}</button>
          <div className="ax-steps" aria-label="Sign-in progress">
            <span className={step >= 1 ? "on" : ""}>1</span><i className={step >= 2 ? "on" : ""} /><span className={step >= 2 ? "on" : ""}>2</span>
          </div>
        </div>
        <div className="ax-icon">{sent ? <Smartphone size={22} /> : <ShieldCheck size={22} />}</div>
        <span className="ax-eyebrow muted">{t.formEyebrow}</span>
        <h2>{sent ? t.codeLabel : t.formTitle}</h2>
        <p className="ax-sub">{sent ? t.sentNotice : t.formSubtitle}</p>

        <form onSubmit={sent ? verifyCode : sendCode} className="ax-form">
          {!sent && <>
            <label className="ax-field"><span>{t.usernameLabel}</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={2} maxLength={80} autoComplete="username" required placeholder={t.usernamePlaceholder} />
            </label>
            <label className="ax-field"><span>{t.phoneLabel}</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" required placeholder={t.phonePlaceholder} />
            </label>
          </>}
          {sent && <>
            <div className="ax-identity"><span>{username.slice(0, 1).toUpperCase()}</span><div><strong>@{username}</strong><small>{phone}</small></div><button type="button" onClick={() => { setSent(false); setCode(""); setNotice(""); }}>{t.changeOwner}</button></div>
            <label className="ax-otp" aria-label={t.codeLabel}>
              <input className="ax-otp-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" minLength={4} maxLength={6} required autoFocus />
              <div className="ax-otp-boxes" aria-hidden="true">{digits.map((d, i) => <span key={i} className={(d ? "filled " : "") + (i === code.length ? "caret" : "")}>{d}</span>)}</div>
            </label>
          </>}
          {error && <div className="ax-alert error"><AlertTriangle size={16} />{error}</div>}
          {notice && !sent && <div className="ax-alert info"><ShieldCheck size={16} />{notice}</div>}
          <button className="ax-primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : sent ? <ShieldCheck size={18} /> : <Smartphone size={18} />}
            {busy ? t.busy : sent ? t.verifyBtn : t.sendBtn}
          </button>
          {isPreviewCloudMode && <>
            <div className="ax-divider"><span>or</span></div>
            <button type="button" className="ax-ghost" disabled={busy} onClick={() => void enterPreviewWorkspace()}><Zap size={16} /> Open interactive demo shop</button>
          </>}
        </form>
        <div className="ax-secure"><ShieldCheck size={14} /> {t.secureNote}</div>
      </div>
      <div className="ax-foot">{t.foot}</div>
    </section>
  </div>;
}
