import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
export async function computeReceiptSeal(
  tin: string,
  receiptNo: string,
  isoTimestamp: string,
  total: number,
) {
  const payload = `${tin.trim()}|${receiptNo.trim()}|${isoTimestamp.trim()}|${Math.round(total)}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return `BB-${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 10)
    .toUpperCase()}`;
}
const copy = {
  en: [
    "Receipt checksum",
    "Compare the printed checksum with the receipt fields. A match does not authenticate the issuer or prove payment.",
    "Receipt number",
    "Timestamp (ISO 8601)",
    "Total (FRw)",
    "Printed checksum",
    "Compare",
    "Checksums match",
    "Checksums do not match",
    "Comparison unavailable",
  ],
  fr: [
    "Empreinte du reçu",
    "Comparez les champs du reçu avec son empreinte imprimée. Une correspondance ne prouve ni l’identité de l’émetteur ni le paiement.",
    "Numéro du reçu",
    "Horodatage (ISO 8601)",
    "Total (FRw)",
    "Empreinte imprimée",
    "Comparer",
    "Empreintes identiques",
    "Empreintes différentes",
    "Comparaison indisponible",
  ],
  rw: [
    "Kugenzura inyemezabuguzi",
    "Gereranya kode yanditse n’amakuru ari ku nyemezabuguzi. Guhuza ntibihamya uwatanze inyemezabuguzi cyangwa ubwishyu.",
    "Nimero y’inyemezabuguzi",
    "Igihe (ISO 8601)",
    "Igiteranyo (FRw)",
    "Kode yanditse",
    "Gereranya",
    "Kode zirahuza",
    "Kode ntizihuza",
    "Ntibishoboka kugereranya",
  ],
  sw: [
    "Hakiki risiti",
    "Linganisha taarifa za risiti na msimbo uliochapishwa. Kufanana hakuthibitishi mtoaji wala malipo.",
    "Nambari ya risiti",
    "Muda (ISO 8601)",
    "Jumla (FRw)",
    "Msimbo uliochapishwa",
    "Linganisha",
    "Misimbo inafanana",
    "Misimbo inatofautiana",
    "Ulinganisho haupatikani",
  ],
} as const;
export function ReceiptVerifier() {
  const { lang } = useI18n();
  const c = copy[lang];
  const [result, setResult] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const seal = await computeReceiptSeal(
        String(d.get("tin")),
        String(d.get("receipt")),
        String(d.get("time")),
        Number(d.get("total")),
      );
      setResult(seal === String(d.get("seal")).trim().toUpperCase() ? 7 : 8);
    } catch {
      setResult(9);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <ShieldCheck className="mb-4 text-primary" />
      <h3 className="text-2xl font-bold">{c[0]}</h3>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{c[1]}</p>
      <form
        onSubmit={verify}
        onChange={() => setResult(null)}
        className="mt-6 grid gap-4 sm:grid-cols-2"
      >
        {(["tin", "receipt", "time", "total", "seal"] as const).map((key, i) => (
          <label className="grid gap-2 text-sm font-medium" key={key}>
            {i === 0 ? "TIN" : c[i + 1]}
            <input
              className="rounded-lg border border-input bg-background px-3 py-2"
              name={key}
              required
              maxLength={120}
              type={key === "total" ? "number" : "text"}
              min={key === "total" ? 0 : undefined}
              pattern={key === "seal" ? "[Bb][Bb]-[0-9a-fA-F]{10}" : undefined}
            />
          </label>
        ))}
        <div className="flex items-end">
          <button className="action-primary" disabled={busy}>
            {c[6]}
          </button>
        </div>
      </form>
      <output aria-live="polite" className="mt-3 block font-semibold">
        {result !== null ? c[result] : ""}
      </output>
    </section>
  );
}
