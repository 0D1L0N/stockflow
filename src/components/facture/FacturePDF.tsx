import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import { emballagesFacture, groupesFacture, modePaiement, sommeEnLettres } from "./texteFacture";
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

// Même palette que l'aperçu à l'écran : encre, vert du dépôt, gris doux
const C = { encre: "#0f1f33", vert: "#0f9f6e", vertClair: "#34d399", texte: "#1f2937", gris: "#6b7280", trait: "#e5e7eb", fond: "#f7f8fa", orange: "#9a3412" };
const gras = { fontFamily: "Inter", fontWeight: 700 } as const;

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: C.texte, paddingTop: 36, paddingBottom: 40, paddingHorizontal: 40, lineHeight: 1.4 },
  // En-tête
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  depot: { ...gras, fontSize: 15, color: C.encre, textTransform: "uppercase", letterSpacing: 0.3 },
  depotInfos: { fontSize: 8, color: C.gris, marginTop: 4, lineHeight: 1.6 },
  motFacture: { ...gras, fontSize: 9, color: C.vert, letterSpacing: 3, textTransform: "uppercase", textAlign: "right" },
  numero: { ...gras, fontSize: 12, color: C.encre, marginTop: 3, textAlign: "right" },
  date: { fontSize: 8.5, color: C.gris, marginTop: 2, textAlign: "right" },
  pastille: { marginTop: 6, paddingVertical: 2, paddingHorizontal: 9, borderRadius: 10, alignSelf: "flex-end" },
  pastilleTexte: { ...gras, fontSize: 7, textTransform: "uppercase", letterSpacing: 0.5 },
  filet: { height: 2, backgroundColor: C.encre, marginTop: 14, marginBottom: 12 },
  // Bloc client
  infos: { flexDirection: "row", gap: 16, marginBottom: 16 },
  etiquette: { ...gras, fontSize: 6.5, color: C.gris, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 3 },
  client: { ...gras, fontSize: 12, color: C.encre },
  // Articles
  enteteTable: { flexDirection: "row", paddingHorizontal: 8, paddingBottom: 6 },
  enteteCol: { ...gras, fontSize: 6.5, color: C.gris, textTransform: "uppercase", letterSpacing: 1 },
  groupe: { flexDirection: "row", backgroundColor: C.fond, borderTopWidth: 1, borderTopColor: C.trait, paddingVertical: 5, paddingHorizontal: 8, marginTop: 4 },
  groupeTitre: { ...gras, fontSize: 7.5, color: C.encre, textTransform: "uppercase", letterSpacing: 0.8 },
  rangee: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.trait, paddingVertical: 5, paddingHorizontal: 8 },
  sousTotal: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 8, color: C.gris, fontSize: 8 },
  colNom: { flex: 1 },
  colQte: { width: 46, textAlign: "center" },
  colPrix: { width: 78, textAlign: "right" },
  colMontant: { width: 86, textAlign: "right" },
  // Totaux en bas
  bas: { flexDirection: "row", gap: 16, marginTop: 14, borderTopWidth: 2, borderTopColor: C.encre, paddingTop: 12 },
  ligne: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  bandeau: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.encre, borderRadius: 5 },
  bandeauLibelle: { ...gras, fontSize: 7.5, color: "#fff", textTransform: "uppercase", letterSpacing: 1 },
  bandeauMontant: { ...gras, fontSize: 14, color: C.vertClair },
  // Pied
  pied: { marginTop: "auto", paddingTop: 10, borderTopWidth: 1, borderTopColor: C.trait, alignItems: "center" },
  merci: { ...gras, fontSize: 11, color: C.encre },
  mentions: { fontSize: 7, color: C.gris, marginTop: 4, lineHeight: 1.6, textAlign: "center" },
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
  const statut = enLivraison ? { texte: "À encaisser à la livraison", fond: "#e0ecff", couleur: C.encre }
    : acquittee ? { texte: "Acquittée", fond: "#dcfce7", couleur: "#166534" }
    : { texte: "Reste à payer", fond: "#ffedd5", couleur: C.orange };
  const ligneVide = { borderBottomWidth: 1, borderBottomColor: C.texte, borderStyle: "dotted" as const, flex: 1, marginLeft: 8, height: 14 };
  const Ligne = ({ libelle, valeur, fort = false }: { libelle: string; valeur: string; fort?: boolean }) => (
    <View style={s.ligne}>
      <Text style={{ color: C.gris }}>{libelle}</Text>
      <Text style={fort ? gras : {}}>{valeur}</Text>
    </View>
  );

  return (
    <Document title={numero_facture} author={commerce.nom}>
      <Page size="A4" style={s.page}>

        {/* EN-TÊTE : le dépôt à gauche, la facture à droite */}
        <View style={s.entete}>
          <View>
            <Text style={s.depot}>{commerce.nom}</Text>
            <Text style={s.depotInfos}>{[commerce.adresse, telephoneFr(commerce.telephone), commerce.email].filter(Boolean).join("\n")}</Text>
          </View>
          <View>
            <Text style={s.motFacture}>Facture</Text>
            <Text style={s.numero}>{numero_facture}</Text>
            <Text style={s.date}>{date}</Text>
            <View style={[s.pastille, { backgroundColor: statut.fond }]}>
              <Text style={[s.pastilleTexte, { color: statut.couleur }]}>{statut.texte}</Text>
            </View>
          </View>
        </View>
        <View style={s.filet} />

        {/* CLIENT, PAIEMENT, VENDEUR */}
        <View style={s.infos}>
          <View style={{ flex: 1.4 }}>
            <Text style={s.etiquette}>Client</Text>
            <Text style={s.client}>{client.nom}</Text>
            {[telClient, client.adresse].filter(Boolean).map((l, i) => <Text key={i} style={{ fontSize: 8, color: C.gris }}>{l}</Text>)}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.etiquette}>Paiement</Text>
            <Text style={gras}>{modePaiement(data)}</Text>
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            {data.vendeur ? <><Text style={s.etiquette}>Vendeur</Text><Text>{data.vendeur}</Text></> : null}
            {data.livraison ? <><Text style={[s.etiquette, { marginTop: 6 }]}>{data.livraison.livreurs.length > 1 ? "Livreurs" : "Livreur"}</Text>
              <Text>{data.livraison.livreurs.join(", ")}</Text></> : null}
          </View>
        </View>

        {/* ARTICLES rangés par format */}
        <View style={s.enteteTable}>
          <Text style={[s.enteteCol, s.colNom]}>Désignation</Text>
          <Text style={[s.enteteCol, s.colQte]}>Qté</Text>
          <Text style={[s.enteteCol, s.colPrix]}>Prix unit.</Text>
          <Text style={[s.enteteCol, s.colMontant]}>Montant</Text>
        </View>
        {groupes.map(g => (
          <View key={g.cle}>
            <View style={s.groupe} wrap={false}>
              <Text style={s.groupeTitre}>{g.titre}</Text>
              {!g.consigne ? <Text style={{ fontSize: 7.5, color: C.gris }}> · emballage non consigné</Text> : null}
            </View>
            {g.items.map((it, i) => (
              <View key={i} style={s.rangee} wrap={false}>
                <Text style={s.colNom}>
                  <Text style={gras}>{it.nom_produit}</Text>
                  {!g.consigne && it.volume ? <Text style={{ color: C.gris, fontSize: 8 }}> · {it.volume}</Text> : null}
                </Text>
                <Text style={s.colQte}>{nb(it.quantite)}</Text>
                <Text style={[s.colPrix, { color: C.gris }]}>{fmt(it.prix_unitaire)}</Text>
                <Text style={[s.colMontant, gras]}>{fmt(it.sous_total)}</Text>
              </View>
            ))}
            {groupes.length > 1 && (
              <View style={s.sousTotal} wrap={false}>
                <Text style={[s.colNom, { textAlign: "right" }]}>Sous-total {g.titre}</Text>
                <Text style={[s.colQte, gras, { color: C.texte }]}>{nb(g.quantite)}</Text>
                <Text style={s.colPrix} />
                <Text style={[s.colMontant, gras, { color: C.texte }]}>{fmt(g.montant)}</Text>
              </View>
            )}
          </View>
        ))}

        {/* TOTAUX EN BAS : emballages à gauche, argent à droite */}
        <View style={s.bas} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={s.etiquette}>Emballages</Text>
            <View style={s.ligne}><Text>Casiers consignés livrés</Text><Text style={gras}>{nb(emb.consignes)}</Text></View>
            {emb.nonConsignes > 0 && <View style={s.ligne}><Text style={{ color: C.gris }}>Packs et cartons (non consignés)</Text><Text style={{ color: C.gris }}>{nb(emb.nonConsignes)}</Text></View>}
            {compte && compte.casiers.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <View style={{ flexDirection: "row", paddingBottom: 3 }}>
                  {(enLivraison ? ["Casiers à rendre", "Avant", "Livrés", "Total"] : ["Casiers à rendre", "Avant", "Livrés", "Rendus", "Après"]).map((h, i) => (
                    <Text key={h} style={[s.enteteCol, i === 0 ? { flex: 1 } : { width: 40, textAlign: "right" }]}>{h}</Text>
                  ))}
                </View>
                {compte.casiers.map((c, i) => (
                  <View key={i} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.trait, paddingVertical: 2.5, fontSize: 8 }}>
                    <Text style={{ flex: 1 }}>{c.nom}</Text>
                    <Text style={{ width: 40, textAlign: "right" }}>{nb(c.avant)}</Text>
                    <Text style={{ width: 40, textAlign: "right" }}>+{nb(c.livres)}</Text>
                    {!enLivraison ? <Text style={{ width: 40, textAlign: "right" }}>−{nb(c.rendus)}</Text> : null}
                    <Text style={[gras, { width: 40, textAlign: "right", color: c.apres > 0 ? C.orange : C.texte }]}>{nb(c.apres)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={{ width: 210 }}>
            {a && a.ancien !== 0 ? <Ligne libelle="Ancien solde dû" valeur={fmt(a.ancien)} /> : null}
            <Ligne libelle="Achat de ce jour" valeur={fmt(total)} fort />
            {a && !enLivraison ? <>
              {a.ancien !== 0 ? <Ligne libelle="Total à payer" valeur={fmt(a.total_general)} /> : null}
              <Ligne libelle="Payé" valeur={fmt(a.paye)} />
              {(a.regle_apres ?? 0) > 0 ? <Ligne libelle="Réglé depuis" valeur={fmt(a.regle_apres ?? 0)} /> : null}
            </> : null}
            {montant_recu !== null ? <Ligne libelle="Montant reçu" valeur={fmt(montant_recu)} /> : null}
            {monnaie_rendue !== null && monnaie_rendue > 0 ? <Ligne libelle="Monnaie rendue" valeur={fmt(monnaie_rendue)} /> : null}
            <View style={s.bandeau}>
              <Text style={s.bandeauLibelle}>
                {enLivraison ? "À encaisser" : a ? (a.nouveau > 0 ? "Reste dû" : a.nouveau < 0 ? "Avoir du client" : "Compte soldé") : "Total"}
              </Text>
              <Text style={s.bandeauMontant}>{fmt(enLivraison ? a?.total_general ?? total : a ? Math.abs(a.nouveau) : total)}</Text>
            </View>
          </View>
        </View>

        <Text style={{ fontSize: 8, marginTop: 10, color: C.gris }}>{sommeEnLettres(total, devise.symbole)}</Text>

        {/* À REMPLIR PAR LE LIVREUR : ce que le client remet, signé sur place */}
        {enLivraison && (
          <View wrap={false} style={{ borderWidth: 1.5, borderColor: C.encre, borderRadius: 6, padding: 10, marginTop: 12 }}>
            <Text style={[s.etiquette, { color: C.encre }]}>À remplir à la livraison</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 8 }}>
              <Text style={gras}>Montant reçu</Text><View style={ligneVide} /><Text style={{ marginLeft: 4 }}>{devise.symbole}</Text>
            </View>
            {(compte?.casiers ?? []).map((c, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 10 }}>
                <Text>Casiers vides rendus · {c.nom}</Text><View style={ligneVide} />
              </View>
            ))}
            <View style={{ flexDirection: "row", marginTop: 18, gap: 20 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end" }}><Text>Signature du client</Text><View style={ligneVide} /></View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end" }}><Text>Signature du livreur</Text><View style={ligneVide} /></View>
            </View>
          </View>
        )}

        {/* PIED */}
        <View style={s.pied} wrap={false}>
          <Text style={s.merci}>Merci pour votre confiance</Text>
          <Text style={s.mentions}>
            {enLivraison
              ? `À encaisser à la livraison : ${fmt(a?.total_general ?? total)}. Le livreur note ici l'argent et les casiers reçus.`
              : acquittee ? `Facture acquittée le ${date.split(" à")[0]}.` : `Reste dû par le client : ${fmt(a?.nouveau ?? 0)}.`}
            {" "}Les casiers consignés restent la propriété du dépôt jusqu'à leur retour. Packs et cartons ne sont pas repris.{"\n"}
            Aucun échange ni remboursement après validation · {commerce.nom} · {numero_facture}
          </Text>
        </View>

        {/* Numéro de page en bas de chaque page, à l'écart du contenu */}
        <Text style={{ position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center", fontSize: 7, color: C.gris }}
          render={({ pageNumber, totalPages }) => totalPages > 1 ? `Page ${pageNumber} / ${totalPages}` : ""} fixed />
      </Page>
    </Document>
  );
}
