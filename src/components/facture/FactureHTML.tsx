import { type CSSProperties } from "react";
import { type FactureData } from "./FacturePDF";
import { emballagesFacture, groupesFacture, modePaiement, sommeEnLettres } from "./texteFacture";
import { telephoneFr } from "@/lib/format";

// Même palette que le PDF : encre, vert du dépôt, gris doux
const C = { encre: "#0f1f33", vert: "#0f9f6e", texte: "#1f2937", gris: "#6b7280", trait: "#e5e7eb", fond: "#f7f8fa", orange: "#9a3412" };

function fmt(valeur: number, devise: FactureData["devise"]): string {
  if (devise.position === "after") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur).replace(/[  ]/g, " ") + " " + devise.symbole;
  }
  return devise.symbole + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valeur);
}
const nb = (n: number) => n.toLocaleString("fr-FR");

const etiquette: CSSProperties = { fontSize: 7, fontWeight: 700, color: C.gris, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3 };
const ligne: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" };

/** apercu : vente pas encore enregistrée (rien n'est « acquitté » ni « réglé » à ce stade). */
export function FactureHTML({ data, apercu = false }: { data: FactureData; apercu?: boolean }) {
  const { numero_facture, date, client, total, montant_recu, monnaie_rendue, commerce, devise, compte } = data;
  const enLivraison = !!data.livraison?.ouverte;
  const acquittee = !enLivraison && (!compte?.argent || compte.argent.nouveau <= 0);
  const telClient = telephoneFr(client.telephone) ?? "";
  const groupes = groupesFacture(data);
  const emb = emballagesFacture(data);
  const vide: CSSProperties = { flex: 1, borderBottom: `1px dotted ${C.texte}`, marginLeft: 8, height: 14 };
  const statut = apercu ? { texte: "Aperçu, non enregistrée", fond: "#fef3c7", couleur: "#92400e" }
    : enLivraison ? { texte: "À encaisser à la livraison", fond: "#e0ecff", couleur: C.encre }
    : acquittee ? { texte: "Acquittée", fond: "#dcfce7", couleur: "#166534" }
    : { texte: "Reste à payer", fond: "#ffedd5", couleur: C.orange };
  const a = compte?.argent;

  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", fontSize: 10, color: C.texte, background: "#fff", padding: "24px 24px 18px", lineHeight: 1.45 }}>

      {/* EN-TÊTE : le dépôt à gauche, la facture à droite */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.encre, letterSpacing: "0.01em", textTransform: "uppercase" }}>{commerce.nom}</div>
          <div style={{ fontSize: 8.5, color: C.gris, marginTop: 4, lineHeight: 1.6 }}>
            {[commerce.adresse, telephoneFr(commerce.telephone), commerce.email].filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.vert, letterSpacing: "0.3em", textTransform: "uppercase" }}>Facture</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.encre, marginTop: 3 }}>{numero_facture}</div>
          <div style={{ fontSize: 8.5, color: C.gris, marginTop: 2 }}>{date}</div>
          <div style={{ display: "inline-block", marginTop: 6, padding: "2px 9px", borderRadius: 20, background: statut.fond, color: statut.couleur, fontSize: 7.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {statut.texte}
          </div>
        </div>
      </div>
      <div style={{ height: 2, background: C.encre, margin: "14px 0 12px" }} />

      {/* CLIENT, PAIEMENT, VENDEUR */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1.4 }}>
          <div style={etiquette}>Client</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.encre }}>{client.nom}</div>
          {[telClient, client.adresse].filter(Boolean).map((l, i) => <div key={i} style={{ fontSize: 8.5, color: C.gris }}>{l}</div>)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={etiquette}>Paiement</div>
          <div style={{ fontWeight: 700 }}>{modePaiement(data)}</div>
        </div>
        <div style={{ flex: 1, textAlign: "right" }}>
          {data.vendeur && <><div style={etiquette}>Vendeur</div><div style={{ fontWeight: 600 }}>{data.vendeur}</div></>}
          {data.livraison && <><div style={{ ...etiquette, marginTop: 6 }}>{data.livraison.livreurs.length > 1 ? "Livreurs" : "Livreur"}</div>
            <div style={{ fontWeight: 600 }}>{data.livraison.livreurs.join(", ")}</div></>}
        </div>
      </div>

      {/* ARTICLES rangés par format */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
        <thead>
          <tr style={{ color: C.gris, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            <th style={{ textAlign: "left", padding: "0 8px 6px", fontWeight: 700 }}>Désignation</th>
            <th style={{ textAlign: "center", padding: "0 0 6px", fontWeight: 700, width: 46 }}>Qté</th>
            <th style={{ textAlign: "right", padding: "0 0 6px", fontWeight: 700, width: 78 }}>Prix unit.</th>
            <th style={{ textAlign: "right", padding: "0 8px 6px 0", fontWeight: 700, width: 86 }}>Montant</th>
          </tr>
        </thead>
        <tbody>
          {groupes.map(g => [
            <tr key={g.cle}>
              <td colSpan={4} style={{ padding: "9px 8px 5px", background: C.fond, borderTop: `1px solid ${C.trait}`, fontSize: 8, fontWeight: 800, color: C.encre, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {g.titre}{!g.consigne && <span style={{ color: C.gris, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}> · emballage non consigné</span>}
              </td>
            </tr>,
            ...g.items.map((it, i) => (
              <tr key={`${g.cle}-${i}`}>
                <td style={{ padding: "6px 8px", borderTop: `1px solid ${C.trait}` }}>
                  <span style={{ fontWeight: 600 }}>{it.nom_produit}</span>
                  {!g.consigne && it.volume && <span style={{ color: C.gris, fontSize: 8.5 }}> · {it.volume}</span>}
                </td>
                <td style={{ padding: "6px 0", borderTop: `1px solid ${C.trait}`, textAlign: "center" }}>{nb(it.quantite)}</td>
                <td style={{ padding: "6px 0", borderTop: `1px solid ${C.trait}`, textAlign: "right", color: C.gris }}>{fmt(it.prix_unitaire, devise)}</td>
                <td style={{ padding: "6px 8px 6px 0", borderTop: `1px solid ${C.trait}`, textAlign: "right", fontWeight: 700 }}>{fmt(it.sous_total, devise)}</td>
              </tr>
            )),
            groupes.length > 1 && (
              <tr key={`${g.cle}-st`} style={{ color: C.gris, fontSize: 8.5 }}>
                <td style={{ padding: "4px 8px 8px", textAlign: "right" }}>Sous-total {g.titre}</td>
                <td style={{ padding: "4px 0 8px", textAlign: "center", fontWeight: 700, color: C.texte }}>{nb(g.quantite)}</td>
                <td />
                <td style={{ padding: "4px 8px 8px 0", textAlign: "right", fontWeight: 700, color: C.texte }}>{fmt(g.montant, devise)}</td>
              </tr>
            ),
          ])}
        </tbody>
      </table>

      {/* TOTAUX EN BAS : emballages à gauche, argent à droite */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14, borderTop: `2px solid ${C.encre}`, paddingTop: 12 }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={etiquette}>Emballages</div>
          <div style={ligne}><span>Casiers consignés livrés</span><strong>{nb(emb.consignes)}</strong></div>
          {emb.nonConsignes > 0 && <div style={{ ...ligne, color: C.gris }}><span>Packs et cartons (non consignés)</span><span>{nb(emb.nonConsignes)}</span></div>}
          {compte && compte.casiers.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, fontSize: 8.5 }}>
              <thead>
                <tr style={{ color: C.gris, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <th style={{ textAlign: "left", fontWeight: 700, paddingBottom: 3 }}>Casiers à rendre</th>
                  {(enLivraison ? ["Avant", "Livrés", "Total"] : ["Avant", "Livrés", "Rendus", "Après"]).map(h => (
                    <th key={h} style={{ textAlign: "right", fontWeight: 700, paddingBottom: 3 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compte.casiers.map((c, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.trait}` }}>
                    <td style={{ padding: "3px 0" }}>{c.nom}</td>
                    <td style={{ textAlign: "right" }}>{nb(c.avant)}</td>
                    <td style={{ textAlign: "right" }}>+{nb(c.livres)}</td>
                    {!enLivraison && <td style={{ textAlign: "right" }}>−{nb(c.rendus)}</td>}
                    <td style={{ textAlign: "right", fontWeight: 800, color: c.apres > 0 ? C.orange : C.texte }}>{nb(c.apres)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ flex: "0 1 230px", minWidth: 200 }}>
          {a && a.ancien !== 0 && <div style={ligne}><span style={{ color: C.gris }}>Ancien solde dû</span><span>{fmt(a.ancien, devise)}</span></div>}
          <div style={ligne}><span style={{ color: C.gris }}>Achat de ce jour</span><strong>{fmt(total, devise)}</strong></div>
          {a && !enLivraison && <>
            {a.ancien !== 0 && <div style={ligne}><span style={{ color: C.gris }}>Total à payer</span><span>{fmt(a.total_general, devise)}</span></div>}
            <div style={ligne}><span style={{ color: C.gris }}>Payé</span><span>{fmt(a.paye, devise)}</span></div>
            {(a.regle_apres ?? 0) > 0 && <div style={ligne}><span style={{ color: C.gris }}>Réglé depuis</span><span>{fmt(a.regle_apres ?? 0, devise)}</span></div>}
          </>}
          {montant_recu !== null && <div style={ligne}><span style={{ color: C.gris }}>Montant reçu</span><span>{fmt(montant_recu, devise)}</span></div>}
          {monnaie_rendue !== null && monnaie_rendue > 0 && <div style={ligne}><span style={{ color: C.gris }}>Monnaie rendue</span><span>{fmt(monnaie_rendue, devise)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6, padding: "9px 12px", background: C.encre, borderRadius: 6 }}>
            <span style={{ color: "#fff", fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {enLivraison ? "À encaisser" : a ? (a.nouveau > 0 ? "Reste dû" : a.nouveau < 0 ? "Avoir du client" : "Compte soldé") : "Total"}
            </span>
            <span style={{ color: "#34d399", fontSize: 15, fontWeight: 800 }}>
              {fmt(enLivraison ? a?.total_general ?? total : a ? Math.abs(a.nouveau) : total, devise)}
            </span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 8.5, color: C.texte, marginTop: 10, fontStyle: "italic" }}>{sommeEnLettres(total, devise.symbole)}</div>

      {/* À REMPLIR PAR LE LIVREUR : ce que le client remet, signé sur place */}
      {enLivraison && (
        <div style={{ border: `1.5px solid ${C.encre}`, borderRadius: 7, padding: "10px 12px", marginTop: 12 }}>
          <div style={{ ...etiquette, color: C.encre }}>À remplir à la livraison</div>
          <div style={{ display: "flex", alignItems: "flex-end", marginTop: 8 }}>
            <strong>Montant reçu</strong><span style={vide} /><span style={{ marginLeft: 4 }}>{devise.symbole}</span>
          </div>
          {(compte?.casiers ?? []).map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-end", marginTop: 10 }}>
              <span>Casiers vides rendus · {c.nom}</span><span style={vide} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 20, marginTop: 18 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}><span>Signature du client</span><span style={vide} /></div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}><span>Signature du livreur</span><span style={vide} /></div>
          </div>
        </div>
      )}

      {/* PIED */}
      <div style={{ marginTop: 16, paddingTop: 10, borderTop: `1px solid ${C.trait}`, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.encre }}>Merci pour votre confiance</div>
        <div style={{ fontSize: 7.5, color: C.gris, marginTop: 4, lineHeight: 1.6 }}>
          {enLivraison
            ? `À encaisser à la livraison : ${fmt(a?.total_general ?? total, devise)}. Le livreur note ici l'argent et les casiers reçus.`
            : apercu ? "Aperçu : la facture sera numérotée à la validation de la vente."
            : acquittee ? `Facture acquittée le ${date.split(" à")[0]}.` : `Reste dû par le client : ${fmt(a?.nouveau ?? 0, devise)}.`}
          {" "}Les casiers consignés restent la propriété du dépôt jusqu'à leur retour. Packs et cartons ne sont pas repris.
          <br />Aucun échange ni remboursement après validation · {commerce.nom} · {numero_facture}
        </div>
      </div>
    </div>
  );
}
