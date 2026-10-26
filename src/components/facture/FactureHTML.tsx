import { type CSSProperties } from "react";
import { type FactureData } from "./FacturePDF";
import { detailArticle, emballagesFacture, groupesFacture, modePaiement, sommeEnLettres } from "./texteFacture";
import { telephoneFr } from "@/lib/format";

// Même palette que le PDF : bleu nuit du dépôt, vert, gris doux
const C = {
  nuit: "#1e3a5f", nuitFonce: "#152a45", vert: "#10b981", vertFonce: "#047857", vertPale: "#ecfdf5",
  texte: "#1f2937", gris: "#6b7280", trait: "#e5e7eb", fond: "#f8fafc", zebre: "#fbfcfd",
  orange: "#c2410c", orangePale: "#fff7ed", orangeTrait: "#fed7aa",
};

function fmt(valeur: number, devise: FactureData["devise"]): string {
  if (devise.position === "after") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur).replace(/[  ]/g, " ") + " " + devise.symbole;
  }
  return devise.symbole + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valeur);
}
const nb = (n: number) => n.toLocaleString("fr-FR");
const initiales = (nom: string) => nom.split(/\s+/).slice(0, 2).map(m => m[0] ?? "").join("").toUpperCase() || "SF";

const petitTitre: CSSProperties = { fontSize: 7.5, fontWeight: 800, color: C.gris, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 };
const carte: CSSProperties = { border: `1px solid ${C.trait}`, borderRadius: 10, padding: "12px 14px", background: "#fff" };
const ligne: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" };
const cellule: CSSProperties = { padding: "7px 10px", borderBottom: `1px solid ${C.trait}` };

/** apercu : vente pas encore enregistrée (rien n'est « acquitté » ni « réglé » à ce stade). */
export function FactureHTML({ data, apercu = false }: { data: FactureData; apercu?: boolean }) {
  const { numero_facture, date, client, total, montant_recu, monnaie_rendue, commerce, devise, compte } = data;
  const enLivraison = !!data.livraison?.ouverte;
  const acquittee = !enLivraison && (!compte?.argent || compte.argent.nouveau <= 0);
  const telClient = telephoneFr(client.telephone) ?? "";
  const groupes = groupesFacture(data);
  const emb = emballagesFacture(data);
  const a = compte?.argent;
  const vide: CSSProperties = { flex: 1, borderBottom: `1.5px dotted ${C.texte}`, marginLeft: 10, height: 16 };
  const statut = apercu ? { texte: "Aperçu · non enregistrée", fond: "#fef3c7", couleur: "#92400e" }
    : enLivraison ? { texte: "À encaisser à la livraison", fond: "#dbeafe", couleur: C.nuit }
    : acquittee ? { texte: "Facture acquittée", fond: "#d1fae5", couleur: "#065f46" }
    : { texte: "Reste à payer", fond: "#ffedd5", couleur: C.orange };
  const libelleFinal = enLivraison ? "Total à encaisser" : a ? (a.nouveau > 0 ? "Reste dû" : a.nouveau < 0 ? "Avoir du client" : "Compte soldé") : "Total à payer";
  const montantFinal = enLivraison ? a?.total_general ?? total : a ? Math.abs(a.nouveau) : total;

  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", fontSize: 10.5, color: C.texte, background: "#fff", padding: "26px 26px 20px", lineHeight: 1.45 }}>

      {/* EN-TÊTE */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: C.nuit, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 16, letterSpacing: "0.02em" }}>{initiales(commerce.nom)}</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.nuit, textTransform: "uppercase", letterSpacing: "0.02em" }}>{commerce.nom}</div>
            <div style={{ fontSize: 8.5, color: C.gris, marginTop: 2, lineHeight: 1.55 }}>
              {[commerce.adresse, telephoneFr(commerce.telephone), commerce.email].filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.nuit, letterSpacing: "-0.02em", lineHeight: 1 }}>FACTURE</div>
          <div style={{ fontSize: 9, color: C.gris, marginTop: 6 }}>N° <strong style={{ color: C.texte }}>{numero_facture}</strong></div>
          <div style={{ fontSize: 9, color: C.gris, marginTop: 1 }}>{date}</div>
          <div style={{ display: "inline-block", marginTop: 7, padding: "3px 10px", borderRadius: 20, background: statut.fond, color: statut.couleur, fontSize: 7.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {statut.texte}
          </div>
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: `linear-gradient(90deg, ${C.vert}, ${C.nuit})`, margin: "16px 0 14px" }} />

      {/* CLIENT ET VENTE */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ ...carte, flex: 1.5, background: C.fond }}>
          <div style={petitTitre}>Facturé à</div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: C.nuit }}>{client.nom}</div>
          {[telClient, client.adresse].filter(Boolean).map((l, i) => <div key={i} style={{ fontSize: 9, color: C.gris, marginTop: 1 }}>{l}</div>)}
        </div>
        <div style={{ ...carte, flex: 1, background: C.fond }}>
          <div style={petitTitre}>Paiement</div>
          <div style={{ fontWeight: 700 }}>{modePaiement(data)}</div>
          {data.vendeur && <><div style={{ ...petitTitre, marginTop: 8 }}>Vendeur</div><div style={{ fontWeight: 600 }}>{data.vendeur}</div></>}
          {data.livraison && <><div style={{ ...petitTitre, marginTop: 8 }}>{data.livraison.livreurs.length > 1 ? "Livreurs" : "Livreur"}</div>
            <div style={{ fontWeight: 600 }}>{data.livraison.livreurs.join(", ")}</div></>}
        </div>
      </div>

      {/* ARTICLES, rangés par casier */}
      <div style={{ border: `1px solid ${C.trait}`, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: C.nuit, color: "#fff", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700 }}>Désignation</th>
              <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 700, width: 50 }}>Qté</th>
              <th style={{ textAlign: "right", padding: "8px 4px", fontWeight: 700, width: 84 }}>Prix unit.</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 700, width: 92 }}>Montant</th>
            </tr>
          </thead>
          <tbody>
            {groupes.map(g => [
              <tr key={g.cle}>
                <td colSpan={4} style={{ padding: "7px 10px", background: g.consigne ? C.vertPale : C.fond, borderBottom: `1px solid ${C.trait}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: g.consigne ? C.vertFonce : C.gris, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {g.titre}{!g.consigne && <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}> · emballage non consigné</span>}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: g.consigne ? C.vertFonce : C.gris }}>{nb(g.quantite)} {g.consigne ? "casier" : "unité"}{g.quantite > 1 ? "s" : ""}{groupes.length > 1 && <span style={{ color: C.nuit }}>  ·  {fmt(g.montant, devise)}</span>}</span>
                  </div>
                </td>
              </tr>,
              ...g.items.map((it, i) => (
                <tr key={`${g.cle}-${i}`} style={{ background: i % 2 ? C.zebre : "#fff" }}>
                  <td style={cellule}>
                    <span style={{ fontWeight: 700 }}>{it.nom_produit}</span>
                    {detailArticle(it, g.consigne) && <span style={{ color: C.gris, fontSize: 9 }}>  {detailArticle(it, g.consigne)}</span>}
                  </td>
                  <td style={{ ...cellule, textAlign: "center", fontWeight: 600 }}>{nb(it.quantite)}</td>
                  <td style={{ ...cellule, textAlign: "right", color: C.gris }}>{fmt(it.prix_unitaire, devise)}</td>
                  <td style={{ ...cellule, textAlign: "right", fontWeight: 800 }}>{fmt(it.sous_total, devise)}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>

      {/* TOTAUX EN BAS : emballages à gauche, récapitulatif à droite */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        <div style={{ ...carte, flex: "1 1 220px" }}>
          <div style={petitTitre}>Emballages</div>
          <div style={ligne}><span>Casiers consignés livrés</span><strong style={{ color: C.nuit }}>{nb(emb.consignes)}</strong></div>
          {emb.nonConsignes > 0 && <div style={{ ...ligne, color: C.gris }}><span>Packs et cartons (non repris)</span><span>{nb(emb.nonConsignes)}</span></div>}
          {compte && compte.casiers.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 9 }}>
              <thead>
                <tr style={{ color: C.gris, fontSize: 7.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <th style={{ textAlign: "left", fontWeight: 700, padding: "4px 0", borderBottom: `1px solid ${C.trait}` }}>Casiers dus</th>
                  {(enLivraison ? ["Avant", "Livrés", "Total"] : ["Avant", "Livrés", "Rendus", "Après"]).map(h => (
                    <th key={h} style={{ textAlign: "right", fontWeight: 700, padding: "4px 0", borderBottom: `1px solid ${C.trait}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compte.casiers.map((c, i) => (
                  <tr key={i}>
                    <td style={{ padding: "4px 0" }}>{c.nom}</td>
                    <td style={{ textAlign: "right" }}>{nb(c.avant)}</td>
                    <td style={{ textAlign: "right" }}>+{nb(c.livres)}</td>
                    {!enLivraison && <td style={{ textAlign: "right" }}>−{nb(c.rendus)}</td>}
                    <td style={{ textAlign: "right", fontWeight: 800, color: c.apres > 0 ? C.orange : C.vertFonce }}>{nb(c.apres)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ ...carte, flex: "0 1 250px", minWidth: 210, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px 6px" }}>
            <div style={petitTitre}>Récapitulatif</div>
            <div style={ligne}><span style={{ color: C.gris }}>Achat de ce jour</span><strong>{fmt(total, devise)}</strong></div>
            {a && a.ancien !== 0 && <div style={ligne}><span style={{ color: C.gris }}>Ancien solde dû</span><span>{fmt(a.ancien, devise)}</span></div>}
            {a && !enLivraison && <>
              {a.ancien !== 0 && <div style={{ ...ligne, borderTop: `1px solid ${C.trait}`, marginTop: 2 }}><span style={{ color: C.gris }}>Total à payer</span><strong>{fmt(a.total_general, devise)}</strong></div>}
              <div style={ligne}><span style={{ color: C.gris }}>Payé</span><span style={{ color: C.vertFonce, fontWeight: 700 }}>{fmt(a.paye, devise)}</span></div>
              {(a.regle_apres ?? 0) > 0 && <div style={ligne}><span style={{ color: C.gris }}>Réglé depuis</span><span style={{ color: C.vertFonce, fontWeight: 700 }}>{fmt(a.regle_apres ?? 0, devise)}</span></div>}
            </>}
            {montant_recu !== null && <div style={ligne}><span style={{ color: C.gris }}>Montant reçu</span><span>{fmt(montant_recu, devise)}</span></div>}
            {monnaie_rendue !== null && monnaie_rendue > 0 && <div style={ligne}><span style={{ color: C.gris }}>Monnaie rendue</span><span>{fmt(monnaie_rendue, devise)}</span></div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", background: C.nuit }}>
            <span style={{ color: "#fff", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>{libelleFinal}</span>
            <span style={{ color: C.vert, fontSize: 17, fontWeight: 900 }}>{fmt(montantFinal, devise)}</span>
          </div>
        </div>
      </div>


      {/* À REMPLIR PAR LE LIVREUR : ce que le client remet, signé sur place */}
      {enLivraison && (
        <div style={{ border: `1.5px solid ${C.nuit}`, borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
          <div style={{ ...petitTitre, color: C.nuit }}>À remplir à la livraison</div>
          <div style={{ display: "flex", alignItems: "flex-end", marginTop: 8 }}>
            <strong>Montant reçu</strong><span style={vide} /><span style={{ marginLeft: 4 }}>{devise.symbole}</span>
          </div>
          {(compte?.casiers ?? []).map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-end", marginTop: 12 }}>
              <span>Casiers vides rendus · {c.nom}</span><span style={vide} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 24, marginTop: 22 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}><span>Signature du client</span><span style={vide} /></div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}><span>Signature du livreur</span><span style={vide} /></div>
          </div>
        </div>
      )}

      {/* PIED */}
      <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px dashed ${C.trait}`, textAlign: "center" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.nuit }}>Merci pour votre confiance !</div>
        <div style={{ fontSize: 8, color: C.gris, marginTop: 5, lineHeight: 1.65 }}>
          <span style={{ color: C.texte, fontSize: 8.5 }}>{sommeEnLettres(total, devise.symbole)}</span>
          {enLivraison ? " Le livreur note ici l'argent et les casiers reçus." : apercu ? " Aperçu : la facture sera numérotée à la validation." : ""}
          <br />Les casiers consignés restent la propriété du dépôt jusqu'à leur retour · packs et cartons non repris.
          <br />Aucun échange ni remboursement après validation · {commerce.nom} · {numero_facture}
        </div>
      </div>
    </div>
  );
}
