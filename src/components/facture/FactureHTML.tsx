import { type FactureData } from "./FacturePDF";
import { modePaiement, sommeEnLettres, totalCasiers } from "./texteFacture";
import { telephoneFr } from "@/lib/format";

function fmt(valeur: number, devise: FactureData["devise"]): string {
  if (devise.position === "after") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur).replace(/[  ]/g, " ") + " " + devise.symbole;
  }
  return devise.symbole + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valeur);
}

function initials(nom: string): string {
  return nom.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "SF";
}

/** apercu : vente pas encore enregistrée (rien n'est « acquitté » ni « réglé » à ce stade). */
export function FactureHTML({ data, apercu = false }: { data: FactureData; apercu?: boolean }) {
  const { numero_facture, date, client, items, total, montant_recu, monnaie_rendue, commerce, devise, compte } = data;
  const acquittee = !compte?.argent || compte.argent.nouveau <= 0;
  const telClient = telephoneFr(client.telephone) ?? "";

  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", fontSize: 11, color: "#1f2937", background: "#fff", padding: "20px 22px", lineHeight: 1.5 }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ width: 38, height: 38, background: "#1e3a5f", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>{initials(commerce.nom)}</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 12, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: "0.02em" }}>{commerce.nom}</div>
          <div style={{ fontSize: 8.5, color: "#6b7280", marginTop: 4, lineHeight: 1.7 }}>
            {[commerce.adresse, telephoneFr(commerce.telephone), commerce.email].filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#1e3a5f", letterSpacing: -1, lineHeight: 1 }}>FACTURE</div>
          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 6, lineHeight: 1.8 }}>
            <div><strong style={{ color: "#1f2937" }}>N° {numero_facture}</strong></div>
            <div>Date : <strong style={{ color: "#1f2937" }}>{date}</strong></div>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: apercu ? "#fef3c7" : acquittee ? "#d1fae5" : "#ffedd5", color: apercu ? "#92400e" : acquittee ? "#065f46" : "#9a3412", fontSize: 7.5, fontWeight: 800, padding: "2px 8px", borderRadius: 20, marginTop: 4, textTransform: "uppercase" }}>
            {apercu ? "Aperçu — non enregistrée" : acquittee ? "Facture acquittée" : "Reste à payer"}
          </div>
        </div>
      </div>

      {/* DIVIDER */}
      <div style={{ height: 3, background: "linear-gradient(90deg, #10b981, #1e3a5f)", borderRadius: 2, marginBottom: 12 }} />

      {/* CLIENT */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 7, padding: "9px 12px", marginBottom: 12, background: "#fafafa", display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 7.5, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Facturer à :</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e3a5f", marginBottom: 2 }}>{client.nom}</div>
          <div style={{ fontSize: 9, color: "#6b7280", lineHeight: 1.7 }}>
            {[telClient, client.adresse].filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 7.5, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Mode paiement</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#1f2937", marginBottom: 6 }}>{modePaiement(data)}</div>
          {data.vendeur && <>
            <div style={{ fontSize: 7.5, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Vendeur</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#1f2937" }}>{data.vendeur}</div>
          </>}
        </div>
      </div>

      {/* TABLE */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5, marginBottom: 10 }}>
        <thead>
          <tr style={{ background: "#1e3a5f" }}>
            <th style={{ color: "#fff", padding: "7px 8px", fontWeight: 700, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left", width: 24 }}>N°</th>
            <th style={{ color: "#fff", padding: "7px 8px", fontWeight: 700, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left" }}>Désignation</th>
            <th style={{ color: "#fff", padding: "7px 8px", fontWeight: 700, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", width: 44 }}>Qté</th>
            <th style={{ color: "#fff", padding: "7px 8px", fontWeight: 700, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right", width: 80 }}>Prix unit.</th>
            <th style={{ color: "#fff", padding: "7px 8px", fontWeight: 700, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right", width: 90 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
              <td style={{ padding: "7px 8px", borderTop: "1px solid #e5e7eb", textAlign: "center", color: "#6b7280", fontSize: 9 }}>{i + 1}</td>
              <td style={{ padding: "7px 8px", borderTop: "1px solid #e5e7eb" }}>
                <div style={{ fontWeight: 600, fontSize: 10, color: "#1f2937" }}>{item.nom_produit}</div>
                {item.volume && <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>{item.volume}</div>}
              </td>
              <td style={{ padding: "7px 8px", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>{item.quantite}</td>
              <td style={{ padding: "7px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>{fmt(item.prix_unitaire, devise)}</td>
              <td style={{ padding: "7px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 700 }}>{fmt(item.sous_total, devise)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} style={{ borderTop: "1px solid #e5e7eb" }} />
          </tr>
        </tbody>
      </table>

      {/* TOTALS */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <div style={{ minWidth: 220, borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 14px", fontSize: 9.5 }}>
            <span style={{ color: "#6b7280" }}>Nombre de casiers</span><strong>{totalCasiers(data)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", background: "#1e3a5f" }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 12 }}>TOTAL</span>
            <span style={{ color: "#10b981", fontWeight: 800, fontSize: 14 }}>{fmt(total, devise)}</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 9, color: "#1f2937", marginBottom: 12 }}>{sommeEnLettres(total, devise.symbole)}</div>

      {/* PAYMENT */}
      {(montant_recu !== null || (monnaie_rendue !== null && monnaie_rendue > 0)) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {montant_recu !== null && (
            <div style={{ flex: 1, border: "1px solid #bfdbfe", borderRadius: 7, padding: "9px 12px", background: "#eff6ff" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Montant reçu</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1e3a5f" }}>{fmt(montant_recu, devise)}</div>
            </div>
          )}
          {monnaie_rendue !== null && monnaie_rendue > 0 && (
            <div style={{ flex: 1, border: "1px solid #bbf7d0", borderRadius: 7, padding: "9px 12px", background: "#f0fdf4" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Monnaie rendue</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#10b981" }}>{fmt(monnaie_rendue, devise)}</div>
            </div>
          )}
        </div>
      )}

      {/* COMPTE CLIENT : ancien solde + cette facture − réglé = nouveau solde */}
      {compte && (
        <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 7, padding: "9px 12px", marginBottom: 12, fontSize: 10 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Compte client</div>
          {compte.argent && (
            <div style={{ marginBottom: compte.casiers.length ? 8 : 0 }}>
              {([
                ["Ancien solde dû", compte.argent.ancien],
                ["Achat de ce jour", compte.argent.achat],
                ["Total à payer", compte.argent.total_general],
                ["Payé", compte.argent.paye],
              ] as [string, number][]).map(([libelle, val]) => (
                <div key={libelle} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{libelle}</span><span>{fmt(val, devise)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, paddingTop: 4, borderTop: "1px solid #fed7aa", fontWeight: 700, color: "#9a3412" }}>
                <span>{compte.argent.nouveau >= 0 ? "Reste dû" : "Avoir du client"}</span>
                <span>{fmt(Math.abs(compte.argent.nouveau), devise)}</span>
              </div>
            </div>
          )}
          {compte.casiers.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#9a3412", fontSize: 8, textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", paddingBottom: 3, borderBottom: "1px solid #fed7aa" }}>Emballage</th>
                  {["Dû avant", "Livrés", "Rendus", "Dû après"].map(h => (
                    <th key={h} style={{ textAlign: "right", paddingBottom: 3, borderBottom: "1px solid #fed7aa" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compte.casiers.map((c, i) => (
                  <tr key={i}>
                    <td style={{ paddingTop: 3 }}>{c.nom}</td>
                    <td style={{ textAlign: "right" }}>{c.avant}</td>
                    <td style={{ textAlign: "right" }}>+{c.livres}</td>
                    <td style={{ textAlign: "right" }}>−{c.rendus}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: c.apres > 0 ? "#9a3412" : undefined }}>{c.apres}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* FOOTER */}
      <div style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 10, marginTop: 4 }}>
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#1e3a5f", marginBottom: 8, letterSpacing: "0.02em" }}>
          Merci pour votre confiance !
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 7.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Conditions & mentions légales</div>
            <div style={{ fontSize: 7.5, color: "#6b7280", lineHeight: 1.7 }}>
              {apercu
                ? (acquittee ? "Aperçu : à régler en entier à la validation de la vente." : `Aperçu : resterait dû par le client ${fmt(compte!.argent!.nouveau, devise)}.`)
                : acquittee
                ? `Facture acquittée, réglée en espèces le ${date.split(" à")[0]}.`
                : `Reste dû par le client : ${fmt(compte!.argent!.nouveau, devise)}.`}<br />
              Aucun échange ni remboursement après validation de la vente.<br />
              Tout litige doit être signalé dans les 24h suivant la livraison.<br />
              Document généré par StockFlow · {commerce.nom}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 7.5, color: "#6b7280", textAlign: "center", marginTop: 8 }}>
          {numero_facture} · {commerce.nom}
        </div>
      </div>
    </div>
  );
}
