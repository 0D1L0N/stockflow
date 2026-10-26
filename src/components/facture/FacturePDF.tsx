import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import { detailArticle, emballagesFacture, groupesFacture, modePaiement, sommeEnLettres } from "./texteFacture";
import { telephoneFr } from "@/lib/format";

Font.register({
  family: "Inter",
  fonts: [
    { src: "/fonts/Inter-Regular.woff", fontWeight: 400 },
    { src: "/fonts/Inter-SemiBold.woff", fontWeight: 600 },
    { src: "/fonts/Inter-Bold.woff",    fontWeight: 700 },
  ],
});

export interface FactureItem {
  nom_produit: string;
  volume: string;
  quantite: number;
  prix_unitaire: number;
  sous_total: number;
  /** Format brut, pour ranger la facture par format (absent sur les très anciennes données) */
  unite?: string | null; litres?: number | null; casier?: number | null;
}

export interface FactureData {
  numero_facture: string;
  date: string;
  client: { nom: string; telephone: string; adresse: string };
  items: FactureItem[];
  total: number;
  montant_recu: number | null;
  monnaie_rendue: number | null;
  commerce: { nom: string; adresse: string; telephone: string; email: string };
  devise: { symbole: string; position: string };
  /** Nom de la personne qui a fait la vente */
  vendeur?: string;
  /** Paiement partiel, casiers et soldes du client (absent pour un client de comptoir) */
  compte?: FactureCompte | null;
  /** Vente livrée : ouverte = le livreur part avec la facture et note dessus ce que le client remet */
  livraison?: { livreurs: string[]; ouverte: boolean } | null;
}

/** L'addition du compte client : ce qu'il devait + cette facture − ce qu'il a réglé = ce qu'il doit. */
export interface FactureCompte {
  /** null quand il n'y a rien à signaler (achat payé comptant, aucune dette) */
  /** regle_apres : payé après la vente, sur cette facture (réimpression) */
  argent: { ancien: number; achat: number; total_general: number; paye: number; regle_apres?: number; nouveau: number } | null;
  casiers: { nom: string; avant: number; livres: number; rendus: number; apres: number }[];
}

function formatMontant(valeur: number, devise: FactureData["devise"]): string {
  if (devise.position === "after") {
    return (
      new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur).replace(/[  ]/g, " ") +
      " " + devise.symbole
    );
  }
  return (
    devise.symbole +
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valeur)
  );
}
const nb = (n: number) => n.toLocaleString("fr-FR");

const initiales = (nom: string) => nom.split(/\s+/).slice(0, 2).map(m => m[0] ?? "").join("").toUpperCase() || "SF";

// Même palette que l'aperçu à l'écran : bleu nuit du dépôt, vert, gris doux
const C = {
  nuit: "#1e3a5f", vert: "#10b981", vertFonce: "#047857", vertPale: "#ecfdf5",
  texte: "#1f2937", gris: "#6b7280", trait: "#e5e7eb", fond: "#f8fafc", zebre: "#fbfcfd", orange: "#c2410c",
};
// Seuls 400, 600 et 700 sont chargés (ni 800 ni italique : sinon le PDF échoue)
const gras = { fontFamily: "Inter", fontWeight: 700 } as const;
const demi = { fontFamily: "Inter", fontWeight: 600 } as const;

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.3, color: C.texte, paddingTop: 26, paddingBottom: 28, paddingHorizontal: 34, lineHeight: 1.35 },
  // En-tête
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 38, height: 38, borderRadius: 9, backgroundColor: C.nuit, justifyContent: "center", alignItems: "center", marginRight: 10 },
  logoTexte: { ...gras, color: "#fff", fontSize: 14 },
  depot: { ...gras, fontSize: 14, color: C.nuit, textTransform: "uppercase" },
  depotInfos: { fontSize: 7.5, color: C.gris, marginTop: 2, lineHeight: 1.5 },
  titre: { ...gras, fontSize: 22, color: C.nuit, textAlign: "right", letterSpacing: -0.5 },
  meta: { fontSize: 8, color: C.gris, textAlign: "right", marginTop: 3 },
  pastille: { marginTop: 6, paddingVertical: 2.5, paddingHorizontal: 9, borderRadius: 10, alignSelf: "flex-end" },
  pastilleTexte: { ...gras, fontSize: 6.8, textTransform: "uppercase", letterSpacing: 0.4 },
  barre: { flexDirection: "row", height: 4, borderRadius: 2, marginTop: 11, marginBottom: 10, overflow: "hidden" },
  // Cartes
  carte: { borderWidth: 1, borderColor: C.trait, borderRadius: 8, padding: 8 },
  petitTitre: { ...gras, fontSize: 6.5, color: C.gris, textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 3 },
  // Articles
  tableau: { borderWidth: 1, borderColor: C.trait, borderRadius: 8, overflow: "hidden", marginTop: 10 },
  enteteTable: { flexDirection: "row", backgroundColor: C.nuit, paddingVertical: 5.5, paddingHorizontal: 9 },
  enteteCol: { ...gras, fontSize: 7, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 },
  groupe: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: C.trait },
  groupeTexte: { ...gras, fontSize: 7.8, textTransform: "uppercase", letterSpacing: 0.6 },
  rangee: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: C.trait },
  colNom: { flex: 1 },
  colQte: { width: 46, textAlign: "center" },
  colPrix: { width: 80, textAlign: "right" },
  colMontant: { width: 88, textAlign: "right" },
  // Bas de facture
  ligne: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.2 },
  bandeau: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, paddingHorizontal: 12, backgroundColor: C.nuit },
  pied: { marginTop: 10, paddingTop: 7, borderTopWidth: 1, borderTopColor: C.trait, borderTopStyle: "dashed", alignItems: "center" },
  merci: { ...gras, fontSize: 10.5, color: C.nuit },
  mentions: { fontSize: 6.8, color: C.gris, marginTop: 3, lineHeight: 1.45, textAlign: "center" },
});

export function FacturePDF({ data }: { data: FactureData }) {
  const { numero_facture, date, client, total, montant_recu, monnaie_rendue, commerce, devise, compte } = data;
  const enLivraison = !!data.livraison?.ouverte;
  const acquittee = !enLivraison && (!compte?.argent || compte.argent.nouveau <= 0);
  const telClient = telephoneFr(client.telephone) ?? "";
  const groupes = groupesFacture(data);
  const emb = emballagesFacture(data);
  const a = compte?.argent;
  const fmt = (v: number) => formatMontant(v, devise);
  const statut = enLivraison ? { texte: "À encaisser à la livraison", fond: "#dbeafe", couleur: C.nuit }
    : acquittee ? { texte: "Facture acquittée", fond: "#d1fae5", couleur: "#065f46" }
    : { texte: "Reste à payer", fond: "#ffedd5", couleur: C.orange };
  const libelleFinal = enLivraison ? "Total à encaisser" : a ? (a.nouveau > 0 ? "Reste dû" : a.nouveau < 0 ? "Avoir du client" : "Compte soldé") : "Total à payer";
  const montantFinal = enLivraison ? a?.total_general ?? total : a ? Math.abs(a.nouveau) : total;
  const ligneVide = { borderBottomWidth: 1.2, borderBottomColor: C.texte, borderStyle: "dotted" as const, flex: 1, marginLeft: 8, height: 14 };
  const Ligne = ({ libelle, valeur, couleur, fort = false, filet = false }: { libelle: string; valeur: string; couleur?: string; fort?: boolean; filet?: boolean }) => (
    <View style={[s.ligne, filet ? { borderTopWidth: 1, borderTopColor: C.trait, marginTop: 2 } : {}]}>
      <Text style={{ color: C.gris }}>{libelle}</Text>
      <Text style={[fort ? gras : {}, couleur ? { color: couleur } : {}]}>{valeur}</Text>
    </View>
  );

  return (
    <Document title={numero_facture} author={commerce.nom}>
      <Page size="A4" style={s.page}>

        {/* EN-TÊTE */}
        <View style={s.entete}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={s.logo}><Text style={s.logoTexte}>{initiales(commerce.nom)}</Text></View>
            <View>
              <Text style={s.depot}>{commerce.nom}</Text>
              <Text style={s.depotInfos}>{[commerce.adresse, telephoneFr(commerce.telephone), commerce.email].filter(Boolean).join("\n")}</Text>
            </View>
          </View>
          <View>
            <Text style={s.titre}>FACTURE</Text>
            <Text style={s.meta}>N° <Text style={[gras, { color: C.texte }]}>{numero_facture}</Text></Text>
            <Text style={[s.meta, { marginTop: 1 }]}>{date}</Text>
            <View style={[s.pastille, { backgroundColor: statut.fond }]}>
              <Text style={[s.pastilleTexte, { color: statut.couleur }]}>{statut.texte}</Text>
            </View>
          </View>
        </View>
        <View style={s.barre}>
          <View style={{ flex: 1, backgroundColor: C.vert }} />
          <View style={{ flex: 2, backgroundColor: C.nuit }} />
        </View>

        {/* CLIENT ET VENTE */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={[s.carte, { flex: 1.5, backgroundColor: C.fond }]}>
            <Text style={s.petitTitre}>Facturé à</Text>
            <Text style={[gras, { fontSize: 12.5, color: C.nuit }]}>{client.nom}</Text>
            {[telClient, client.adresse].filter(Boolean).map((l, i) => <Text key={i} style={{ fontSize: 8, color: C.gris, marginTop: 1 }}>{l}</Text>)}
          </View>
          <View style={[s.carte, { flex: 1, backgroundColor: C.fond }]}>
            <Text style={s.petitTitre}>Paiement</Text>
            <Text style={gras}>{modePaiement(data)}</Text>
            {data.vendeur ? <><Text style={[s.petitTitre, { marginTop: 6 }]}>Vendeur</Text><Text style={demi}>{data.vendeur}</Text></> : null}
            {data.livraison ? <><Text style={[s.petitTitre, { marginTop: 6 }]}>{data.livraison.livreurs.length > 1 ? "Livreurs" : "Livreur"}</Text>
              <Text style={demi}>{data.livraison.livreurs.join(", ")}</Text></> : null}
          </View>
        </View>

        {/* ARTICLES, rangés par casier */}
        <View style={s.tableau}>
          <View style={s.enteteTable} fixed>
            <Text style={[s.enteteCol, s.colNom]}>Désignation</Text>
            <Text style={[s.enteteCol, s.colQte]}>Qté</Text>
            <Text style={[s.enteteCol, s.colPrix]}>Prix unit.</Text>
            <Text style={[s.enteteCol, s.colMontant]}>Montant</Text>
          </View>
          {groupes.map(g => (
            <View key={g.cle}>
              <View style={[s.groupe, { backgroundColor: g.consigne ? C.vertPale : C.fond }]} wrap={false}>
                <Text style={[s.groupeTexte, { color: g.consigne ? C.vertFonce : C.gris }]}>
                  {g.titre}{!g.consigne ? <Text style={[demi, { textTransform: "none", letterSpacing: 0 }]}> · emballage non consigné</Text> : null}
                </Text>
                <Text style={[gras, { fontSize: 7.8, color: g.consigne ? C.vertFonce : C.gris }]}>
                  {nb(g.quantite)} {g.consigne ? "casier" : "unité"}{g.quantite > 1 ? "s" : ""}{groupes.length > 1 ? `  ·  ${fmt(g.montant)}` : ""}
                </Text>
              </View>
              {g.items.map((it, i) => (
                <View key={i} style={[s.rangee, { backgroundColor: i % 2 ? C.zebre : "#fff" }]} wrap={false}>
                  <Text style={s.colNom}>
                    <Text style={gras}>{it.nom_produit}</Text>
                    {detailArticle(it, g.consigne) ? <Text style={{ color: C.gris, fontSize: 8 }}>  {detailArticle(it, g.consigne)}</Text> : null}
                  </Text>
                  <Text style={[s.colQte, demi]}>{nb(it.quantite)}</Text>
                  <Text style={[s.colPrix, { color: C.gris }]}>{fmt(it.prix_unitaire)}</Text>
                  <Text style={[s.colMontant, gras]}>{fmt(it.sous_total)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* TOTAUX EN BAS : emballages à gauche, récapitulatif à droite */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }} wrap={false}>
          <View style={[s.carte, { flex: 1 }]}>
            <Text style={s.petitTitre}>Emballages</Text>
            <View style={s.ligne}><Text>Casiers consignés livrés</Text><Text style={[gras, { color: C.nuit }]}>{nb(emb.consignes)}</Text></View>
            {emb.nonConsignes > 0 && <View style={s.ligne}><Text style={{ color: C.gris }}>Packs et cartons (non repris)</Text><Text style={{ color: C.gris }}>{nb(emb.nonConsignes)}</Text></View>}
            {compte && compte.casiers.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <View style={{ flexDirection: "row", paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: C.trait }}>
                  {(enLivraison ? ["Casiers dus", "Avant", "Livrés", "Total"] : ["Casiers dus", "Avant", "Livrés", "Rendus", "Après"]).map((h, i) => (
                    <Text key={h} style={[gras, { fontSize: 6.5, color: C.gris, textTransform: "uppercase" }, i === 0 ? { flex: 1 } : { width: 36, textAlign: "right" }]}>{h}</Text>
                  ))}
                </View>
                {compte.casiers.map((c, i) => (
                  <View key={i} style={{ flexDirection: "row", paddingVertical: 2, fontSize: 8 }}>
                    <Text style={{ flex: 1 }}>{c.nom}</Text>
                    <Text style={{ width: 36, textAlign: "right" }}>{nb(c.avant)}</Text>
                    <Text style={{ width: 36, textAlign: "right" }}>+{nb(c.livres)}</Text>
                    {!enLivraison ? <Text style={{ width: 36, textAlign: "right" }}>−{nb(c.rendus)}</Text> : null}
                    <Text style={[gras, { width: 36, textAlign: "right", color: c.apres > 0 ? C.orange : C.vertFonce }]}>{nb(c.apres)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={[s.carte, { width: 215, padding: 0, overflow: "hidden" }]}>
            <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 5 }}>
              <Text style={s.petitTitre}>Récapitulatif</Text>
              <Ligne libelle="Achat de ce jour" valeur={fmt(total)} fort />
              {a && a.ancien !== 0 ? <Ligne libelle="Ancien solde dû" valeur={fmt(a.ancien)} /> : null}
              {a && !enLivraison ? <>
                {a.ancien !== 0 ? <Ligne libelle="Total à payer" valeur={fmt(a.total_general)} fort filet /> : null}
                <Ligne libelle="Payé" valeur={fmt(a.paye)} couleur={C.vertFonce} fort />
                {(a.regle_apres ?? 0) > 0 ? <Ligne libelle="Réglé depuis" valeur={fmt(a.regle_apres ?? 0)} couleur={C.vertFonce} fort /> : null}
              </> : null}
              {montant_recu !== null ? <Ligne libelle="Montant reçu" valeur={fmt(montant_recu)} /> : null}
              {monnaie_rendue !== null && monnaie_rendue > 0 ? <Ligne libelle="Monnaie rendue" valeur={fmt(monnaie_rendue)} /> : null}
            </View>
            <View style={s.bandeau}>
              <Text style={[gras, { color: "#fff", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6 }]}>{libelleFinal}</Text>
              <Text style={[gras, { color: C.vert, fontSize: 15 }]}>{fmt(montantFinal)}</Text>
            </View>
          </View>
        </View>


        {/* À REMPLIR PAR LE LIVREUR : ce que le client remet, signé sur place */}
        {enLivraison && (
          <View wrap={false} style={{ borderWidth: 1.5, borderColor: C.nuit, borderRadius: 8, padding: 11, marginTop: 12 }}>
            <Text style={[s.petitTitre, { color: C.nuit }]}>À remplir à la livraison</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 8 }}>
              <Text style={gras}>Montant reçu</Text><View style={ligneVide} /><Text style={{ marginLeft: 4 }}>{devise.symbole}</Text>
            </View>
            {(compte?.casiers ?? []).map((c, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 11 }}>
                <Text>Casiers vides rendus · {c.nom}</Text><View style={ligneVide} />
              </View>
            ))}
            <View style={{ flexDirection: "row", marginTop: 20, gap: 22 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end" }}><Text>Signature du client</Text><View style={ligneVide} /></View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end" }}><Text>Signature du livreur</Text><View style={ligneVide} /></View>
            </View>
          </View>
        )}

        {/* PIED */}
        <View style={s.pied} wrap={false}>
          <Text style={s.merci}>Merci pour votre confiance !</Text>
          <Text style={s.mentions}>
            <Text style={{ color: C.texte, fontSize: 7.4 }}>{sommeEnLettres(total, devise.symbole)}</Text>
            {enLivraison ? " Le livreur note ici l'argent et les casiers reçus." : ""}
            {"\n"}Les casiers consignés restent la propriété du dépôt jusqu'à leur retour · packs et cartons non repris.
            {"\n"}Aucun échange ni remboursement après validation · {commerce.nom} · {numero_facture}
          </Text>
        </View>

        {/* Numéro de page en bas de chaque page, à l'écart du contenu */}
        <Text style={{ position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center", fontSize: 7, color: C.gris }}
          render={({ pageNumber, totalPages }) => totalPages > 1 ? `Page ${pageNumber} / ${totalPages}` : ""} fixed />
      </Page>
    </Document>
  );
}
