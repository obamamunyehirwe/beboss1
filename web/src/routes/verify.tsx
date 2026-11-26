import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import { formatMinor, receiptToText, verifyReceiptQr, type Receipt } from "@/lib/receipt-crypto";

export const Route = createFileRoute("/verify")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "BeBoss receipt verification — offline, on your device" },
      {
        name: "description",
        content:
          "Verify a BeBoss receipt's cryptographic signature on your own device, fully offline. No account or internet connection required.",
      },
      { property: "og:title", content: "BeBoss receipt verification" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: VerifyPage,
});

type Outcome =
  | { kind: "idle" }
  | { kind: "ok"; receipt: Receipt }
  | { kind: "bad-signature" }
  | { kind: "bad-format" }
  | { kind: "unsupported" };

const copy = {
  en: {
    eyebrow: "Trust, offline",
    title: "Verify a receipt",
    sub: "Paste the receipt QR contents or open a scanned receipt link. Verification runs entirely on your device against the bundled BeBoss public key — no internet, account or server is contacted.",
    label: "Receipt QR payload or link",
    placeholder: "BEBOSS|RCPT1|…  (or a https://…/verify?q=… link)",
    verify: "Verify signature",
    verified: "Signature valid",
    verifiedBody: "This receipt was signed by the BeBoss platform and has not been altered.",
    badSignature: "Signature does not match",
    badSignatureBody:
      "The receipt data was changed after it was issued, or the signature is not valid. Do not treat this receipt as authentic.",
    badFormat: "Unrecognised receipt",
    badFormatBody:
      "This does not look like a BeBoss receipt QR payload. Scan the QR printed on the receipt or paste its full contents.",
    unsupported: "Unsupported receipt version",
    unsupportedBody: "This receipt uses a newer format than this verifier understands.",
    fields: {
      tin: "Merchant TIN",
      shop: "Shop",
      branch: "Branch",
      receiptNo: "Receipt number",
      issuedAt: "Issued",
      cashier: "Cashier",
      buyer: "Buyer",
      total: "Total",
      tax: "Included tax",
      issuer: "Signed by",
    },
    clear: "Clear",
  },
  fr: {
    eyebrow: "Confiance, hors ligne",
    title: "Vérifier un reçu",
    sub: "Collez le contenu du QR du reçu ou ouvrez un lien de reçu scanné. La vérification s’exécute entièrement sur votre appareil avec la clé publique BeBoss intégrée — aucune connexion, aucun compte, aucun serveur.",
    label: "Contenu du QR ou lien du reçu",
    placeholder: "BEBOSS|RCPT1|…  (ou un lien https://…/verify?q=…)",
    verify: "Vérifier la signature",
    verified: "Signature valide",
    verifiedBody: "Ce reçu a été signé par la plateforme BeBoss et n’a pas été modifié.",
    badSignature: "La signature ne correspond pas",
    badSignatureBody:
      "Les données du reçu ont été modifiées après l’émission, ou la signature est invalide. Ne considérez pas ce reçu comme authentique.",
    badFormat: "Reçu non reconnu",
    badFormatBody:
      "Ceci ne ressemble pas à un QR de reçu BeBoss. Scannez le QR imprimé ou collez son contenu complet.",
    unsupported: "Version de reçu non prise en charge",
    unsupportedBody: "Ce reçu utilise un format plus récent que ce vérificateur.",
    fields: {
      tin: "NIF du marchand",
      shop: "Boutique",
      branch: "Branche",
      receiptNo: "N° de reçu",
      issuedAt: "Émis le",
      cashier: "Caissier",
      buyer: "Acheteur",
      total: "Total",
      tax: "Taxe incluse",
      issuer: "Signé par",
    },
    clear: "Effacer",
  },
  rw: {
    eyebrow: "Icyizere, nta murandasi",
    title: "Genzura inyemezabuguzi",
    sub: "Shyira ibiri kuri QR y’inyemezabuguzi cyangwa ufungure link y’inyemezabuguzi. Kugenzura bikorwa ku kudetere kuri gikoresho cye, hakoreshejwe urufunguzo rwa BeBoss — nta murandasi, nta konti, nta seriveri.",
    label: "Ibiri kuri QR cyangwa link",
    placeholder: "BEBOSS|RCPT1|…  (cyangwa link https://…/verify?q=…)",
    verify: "Genzura umukono",
    verified: "Umukono wemewe",
    verifiedBody: "Iyi nyemezabuguzi yasinywe na BeBoss kandi ntiyavuguruwe.",
    badSignature: "Umukono ntuhuye",
    badSignatureBody:
      "Amakuru y’inyemezabuguzi yahindutse nyuma yo gutangwa, cyangwa umukono si mwiza. Ntureba iyi nyemezabuguzi nk’inyakuri.",
    badFormat: "Inyemezabuguzi itazwi",
    badFormatBody:
      "Iyi si QR y’inyemezabuguzi ya BeBoss. Skena QR yanditse cyangwa shyira ibiri byose.",
    unsupported: "Verisiyo itashyigikiwe",
    unsupportedBody: "Iyi nyemezabuguzi ikoresha uburyo bushya kurushaho uyu mugenzuzi.",
    fields: {
      tin: "TIN y’umucuruzi",
      shop: "Iduka",
      branch: "Shami",
      receiptNo: "Nimero",
      issuedAt: "Itangwa",
      cashier: "Umutunzi",
      buyer: "Umuguzi",
      total: "Igiteranyo",
      tax: "Imisoro",
      issuer: "Yasinywe na",
    },
    clear: "Siba",
  },
  sw: {
    eyebrow: "Uaminifu, nje ya mtandao",
    title: "Thibitisha risiti",
    sub: "Bandika maudhui ya QR ya risiti au fungua kiungo cha risiti kilichochanganuliwa. Uthibitisho unafanyika kabisa kwenye kifaa chako kwa ufunguo wa umma wa BeBoss — hakuna mtandao, akaunti wala seva.",
    label: "Maudhui ya QR au kiungo cha risiti",
    placeholder: "BEBOSS|RCPT1|…  (au kiungo https://…/verify?q=…)",
    verify: "Thibitisha saini",
    verified: "Saini ni halali",
    verifiedBody: "Risiti hii ilisainiwa na BeBoss na haijabadilishwa.",
    badSignature: "Saini hailingani",
    badSignatureBody:
      "Data ya risiti ilibadilishwa baada ya kutolewa, au saini si halali. Usichukue risiti hii kuwa halisi.",
    badFormat: "Risiti isiyotambulika",
    badFormatBody:
      "Hii si QR ya risiti ya BeBoss. Changanua QR iliyochapishwa au bandika maudhui yake yote.",
    unsupported: "Toleo lisilosaidiwa",
    unsupportedBody: "Risiti hii inatumia muundo mpya kuliko kithibitishi hiki.",
    fields: {
      tin: "TIN ya mfanyabiashara",
      shop: "Duka",
      branch: "Tawi",
      receiptNo: "Nambari ya risiti",
      issuedAt: "Ilitolewa",
      cashier: "Mhudumu",
      buyer: "Mnunuzi",
      total: "Jumla",
      tax: "Kodi",
      issuer: "Imesainiwa na",
    },
    clear: "Futa",
  },
} as const;

function VerifyPage() {
  const { lang } = useI18n();
  const c = copy[lang];
  const search = Route.useSearch();
  const [value, setValue] = useState(search.q ?? "");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  async function verify(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const result = await verifyReceiptQr(trimmed);
      if (result.ok) setOutcome({ kind: "ok", receipt: result.receipt });
      else setOutcome({ kind: result.reason });
    } catch {
      setOutcome({ kind: "bad-format" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout>
      <PageHero eyebrow={c.eyebrow} title={c.title} sub={c.sub} />
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <form
          className="rounded-3xl border border-border bg-card p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(value);
          }}
        >
          <label className="grid gap-2 text-sm font-medium">
            {c.label}
            <textarea
              className="min-h-28 rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setOutcome({ kind: "idle" });
              }}
              placeholder={c.placeholder}
              spellCheck={false}
            />
          </label>
          <div className="mt-4 flex items-center gap-3">
            <button className="action-primary" disabled={busy || !value.trim()}>
              {busy ? "…" : c.verify}
            </button>
            {value && (
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline"
                onClick={() => {
                  setValue("");
                  setOutcome({ kind: "idle" });
                }}
              >
                {c.clear}
              </button>
            )}
          </div>
        </form>

        <div aria-live="polite" className="mt-6">
          {outcome.kind === "ok" && (
            <div className="rounded-3xl border border-success/40 bg-success/10 p-6">
              <div className="flex items-center gap-2 text-success">
                <BadgeCheck className="size-6" />
                <h2 className="text-lg font-semibold">{c.verified}</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{c.verifiedBody}</p>
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {(
                  [
                    ["shop", outcome.receipt.shop],
                    ["tin", outcome.receipt.tin],
                    ["branch", outcome.receipt.branch],
                    ["receiptNo", outcome.receipt.receiptNo],
                    ["issuedAt", outcome.receipt.issuedAt],
                    ["cashier", outcome.receipt.cashier],
                    ["buyer", outcome.receipt.buyer],
                    ["total", formatMinor(outcome.receipt.totalMinor, outcome.receipt.currency)],
                    ["tax", formatMinor(outcome.receipt.taxMinor, outcome.receipt.currency)],
                    ["issuer", outcome.receipt.issuer],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div
                      key={k}
                      className="flex justify-between gap-4 border-b border-border/50 py-1"
                    >
                      <dt className="text-muted-foreground">{c.fields[k]}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
              </dl>
              <pre className="mt-4 overflow-x-auto rounded-xl bg-background p-3 text-xs">
                {receiptToText(outcome.receipt)}
              </pre>
            </div>
          )}

          {(outcome.kind === "bad-signature" ||
            outcome.kind === "bad-format" ||
            outcome.kind === "unsupported") && (
            <div className="rounded-3xl border border-warning/40 bg-warning/10 p-6">
              <div className="flex items-center gap-2 text-warning">
                {outcome.kind === "bad-signature" ? (
                  <ShieldAlert className="size-6" />
                ) : (
                  <ShieldQuestion className="size-6" />
                )}
                <h2 className="text-lg font-semibold">
                  {outcome.kind === "bad-signature"
                    ? c.badSignature
                    : outcome.kind === "bad-format"
                      ? c.badFormat
                      : c.unsupported}
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {outcome.kind === "bad-signature"
                  ? c.badSignatureBody
                  : outcome.kind === "bad-format"
                    ? c.badFormatBody
                    : c.unsupportedBody}
              </p>
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
