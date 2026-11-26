import { ArrowLeft, CheckCircle2, CreditCard, Laptop, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import type { DesktopPreferences } from "../lib/types";

type Copy = {
  eyebrow: string; title: string; lead: string; feeLabel: string; recurring: string;
  billingNote: string; securityTitle: string; securityBody: string;
  confirm: string; cancel: string; busy: string; device: string; monthly: string;
};
const COPY: Record<DesktopPreferences["language"], Copy> = {
  en: {
    eyebrow: "NEW DEVICE · OWNER APPROVAL", title: "Add this desktop to your shop?",
    lead: "BeBoss detected a new desktop installation for your registered shop. The owner must approve the recurring device add-on before this computer can join the device fleet.",
    feeLabel: "Additional device add-on", recurring: "Recurring monthly subscription",
    billingNote: "This is FRw 2,000 every month while this additional device remains active. It is not a one-time purchase. This confirmation registers the device and updates the shop's subscription usage; it does not collect a payment now.",
    securityTitle: "Owner-authorized device registration",
    securityBody: "The registration is bound to your verified owner account and this installation's persistent device identity. You can later review or deactivate it in Devices.",
    confirm: "Confirm fee & register desktop", cancel: "Cancel and return to sign in",
    busy: "Registering this desktop…", device: "This installation", monthly: "per month"
  },
  rw: {
    eyebrow: "IGIKORESHO GISHYA · UBUHAGARARYE BW'NYIR'IDUKA", title: "Ongeraho iyi mudasobwa ku iduka ryawe?",
    lead: "BeBoss yabonye mudasobwa nshya igerageza kwinjira mu iduka ryawe ryanditse. Nyir'iduka agomba kwemeza amafaranga y'igikoresho yishyurwa buri kwezi mbere y'uko iyi mudasobwa yinjira mu bikoresho by'iduka.",
    feeLabel: "Amafaranga y'igikoresho cy'inyongera", recurring: "Amafaranga y'inyongera ya buri kwezi",
    billingNote: "Ni FRw 2,000 buri kwezi igihe iki gikoresho cy'inyongera kigikora. Si ubwishyu bw'inshuro imwe. Uku kwemeza kwandikisha igikoresho kandi kuvugurura ibikoresho bibarwa ku ifatabuguzi; nta mafaranga ahita akurwa ubu.",
    securityTitle: "Kwiyandikisha byemejwe na nyir'iduka",
    securityBody: "Iki gikoresho gihuzwa na konti ya nyir'iduka yemejwe n'indangamuntu idahinduka y'iyi mudasobwa. Ushobora kukigenzura cyangwa kugihagarika muri Devices.",
    confirm: "Emeza amafaranga wandikishe mudasobwa", cancel: "Hagarika usubire kwinjira",
    busy: "Mudasobwa irimo kwandikwa…", device: "Iki gikoresho", monthly: "buri kwezi"
  },
  fr: {
    eyebrow: "NOUVEL APPAREIL · APPROBATION DU PROPRIÉTAIRE", title: "Ajouter cet ordinateur à votre boutique ?",
    lead: "BeBoss a détecté une nouvelle installation de bureau pour votre boutique enregistrée. Le propriétaire doit approuver le supplément récurrent avant l'ajout de cet ordinateur au parc d'appareils.",
    feeLabel: "Supplément pour appareil supplémentaire", recurring: "Abonnement mensuel récurrent",
    billingNote: "Le coût est de 2 000 FRw chaque mois tant que cet appareil supplémentaire reste actif. Il ne s'agit pas d'un achat unique. Cette confirmation enregistre l'appareil et actualise l'utilisation de l'abonnement ; aucun paiement n'est prélevé maintenant.",
    securityTitle: "Enregistrement autorisé par le propriétaire",
    securityBody: "L'enregistrement est lié à votre compte propriétaire vérifié et à l'identité persistante de cette installation. Vous pourrez le consulter ou le désactiver dans Appareils.",
    confirm: "Confirmer le supplément et enregistrer", cancel: "Annuler et revenir à la connexion",
    busy: "Enregistrement de cet ordinateur…", device: "Cette installation", monthly: "par mois"
  },
  sw: {
    eyebrow: "KIFAA KIPYA · IDHINI YA MMILIKI", title: "Ongeza kompyuta hii kwenye duka lako?",
    lead: "BeBoss imegundua kompyuta mpya inayojaribu kujiunga na duka lako lililosajiliwa. Mmiliki lazima athibitishe ada ya ziada ya kifaa ya kila mwezi kabla kompyuta hii haijaongezwa kwenye orodha ya vifaa.",
    feeLabel: "Ada ya ziada ya kifaa", recurring: "Usajili wa kila mwezi unaojirudia",
    billingNote: "Ni FRw 2,000 kila mwezi wakati kifaa hiki cha ziada kinaendelea kufanya kazi. Si malipo ya mara moja. Uthibitisho huu husajili kifaa na kusasisha matumizi ya usajili wa duka; hakuna malipo yanayokusanywa sasa.",
    securityTitle: "Usajili wa kifaa ulioidhinishwa na mmiliki",
    securityBody: "Usajili umefungwa kwenye akaunti yako ya mmiliki iliyothibitishwa na utambulisho wa kudumu wa kompyuta hii. Baadaye unaweza kukagua au kukizima kwenye Vifaa.",
    confirm: "Thibitisha ada na usajili kompyuta", cancel: "Ghairi na urudi kuingia",
    busy: "Kompyuta inasajiliwa…", device: "Kifaa hiki", monthly: "kwa mwezi"
  }
};

export function DeviceRegistrationPrompt({
  monthlyFeeRwf, platform, theme, language, busy, error, onConfirm, onCancel
}: {
  monthlyFeeRwf: number;
  platform: string;
  theme: DesktopPreferences["theme"];
  language: DesktopPreferences["language"];
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = COPY[language];
  const fee = Math.max(0, Math.round(Number(monthlyFeeRwf) || 2_000));
  return (
    <main className="device-registration-shell" data-theme={theme} aria-label={t.title}>
      <section className="device-registration-card" role="dialog" aria-modal="true" aria-labelledby="device-registration-title">
        <div className="device-registration-visual">
          <img src="/Friendly%20Modern%20Store%20Checkout.png" alt="" />
          <div className="device-registration-visual-overlay" />
          <div className="device-registration-brand">
            <img src="/beboss-app-icon.png" alt="BeBoss" />
            <span><strong>BeBoss</strong><small>RETAIL OPERATIONS</small></span>
          </div>
          <div className="device-registration-visual-foot">
            <span><Wifi size={14} /> CLOUD CONNECTED</span>
            <span><ShieldCheck size={14} /> OWNER VERIFIED</span>
          </div>
          <span className="device-registration-orbit device-registration-orbit-one" />
          <span className="device-registration-orbit device-registration-orbit-two" />
        </div>
        <div className="device-registration-content">
          <p className="device-registration-eyebrow"><span />{t.eyebrow}</p>
          <h1 id="device-registration-title">{t.title}</h1>
          <p className="device-registration-lead">{t.lead}</p>
          <div className="device-registration-device">
            <span className="device-registration-device-icon"><Laptop size={23} /></span>
            <span><strong>{t.device}</strong><small>BeBoss Desktop · {platform}</small></span>
            <span className="device-registration-verified"><CheckCircle2 size={15} /> Verified</span>
          </div>
          <div className="device-registration-fee">
            <div className="device-registration-fee-top">
              <span><CreditCard size={16} />{t.feeLabel}</span>
              <span className="device-registration-recurring">{t.recurring}</span>
            </div>
            <div className="device-registration-fee-amount">
              <strong>{fee.toLocaleString("en-US")} <small>FRw</small></strong>
              <span>{t.monthly}</span>
            </div>
            <p>{t.billingNote}</p>
          </div>
          <div className="device-registration-security">
            <ShieldCheck size={19} />
            <span><strong>{t.securityTitle}</strong><small>{t.securityBody}</small></span>
          </div>
          {error ? <p className="device-registration-error" role="alert">{error}</p> : null}
          <div className="device-registration-actions">
            <button type="button" className="device-registration-confirm" onClick={onConfirm} disabled={busy}>
              {busy ? <><span className="device-registration-spinner" />{t.busy}</> : <>{t.confirm}<ArrowLeft className="device-registration-arrow" size={17} /></>}
            </button>
            <button type="button" className="device-registration-cancel" onClick={onCancel} disabled={busy}>{t.cancel}</button>
          </div>
          <p className="device-registration-no-charge">This step records your device authorization and recurring add-on consent. Payment settlement is handled separately by your configured subscription provider.</p>
        </div>
      </section>
    </main>
  );
}
