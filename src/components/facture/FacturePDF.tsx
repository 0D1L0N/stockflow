import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";

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
  /** Paiement partiel, casiers et soldes du client (absent pour un client de comptoir) */
  compte?: FactureCompte | null;
}

/** L'addition du compte client : ce qu'il devait + cette facture − ce qu'il a réglé = ce qu'il doit. */
export interface FactureCompte {
  /** null quand il n'y a rien à signaler (achat payé comptant, aucune dette) */
  argent: { ancien: number; achat: number; total_general: number; paye: number; nouveau: number } | null;
  casiers: { nom: string; avant: number; livres: number; rendus: number; apres: number }[];
}

function formatMontant(valeur: number, devise: FactureData["devise"]): string {
  if (devise.position === "after") {
    return (
      new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur).replace(/[  ]/g, " ") +
      " " + devise.symbole
    );
  }
  return (
    devise.symbole +
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valeur)
  );
}

function initials(nom: string): string {
  return nom.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "SF";
}

const C = {
  primary: "#1e3a5f",
  green: "#10b981",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  bgAlt: "#f9fafb",
  bgTotal: "#f3f4f6",
};

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10, color: C.text, paddingTop: 35, paddingBottom: 30, paddingHorizontal: 40 },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  logoBox: { width: 44, height: 44, backgroundColor: C.primary, borderRadius: 8, justifyContent: "center", alignItems: "center", marginBottom: 6 },
  logoText: { color: "#fff", fontSize: 17, fontFamily: "Inter", fontWeight: 700 },
  companyName: { fontSize: 12, fontFamily: "Inter", fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1.3 },
  companyMeta: { fontSize: 8, color: C.muted, marginTop: 4, lineHeight: 1.7 },
  titleBlock: { alignItems: "flex-end" },
  factureTitle: { fontSize: 28, fontFamily: "Inter", fontWeight: 700, color: C.primary, letterSpacing: -0.5, marginBottom: 6 },
  invoiceMeta: { fontSize: 8.5, color: C.muted, textAlign: "right", lineHeight: 1.9 },
  invoiceMetaBold: { fontFamily: "Inter", fontWeight: 700, color: C.text, fontSize: 9 },
  badge: { backgroundColor: "#d1fae5", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, marginTop: 5, alignSelf: "flex-end" },
  badgeText: { color: "#065f46", fontSize: 7.5, fontFamily: "Inter", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
  // Divider
  divider: { flexDirection: "row", height: 3, borderRadius: 2, marginBottom: 14 },
  // Client block
  clientBlock: { flexDirection: "row", borderWidth: 1, borderColor: C.border, borderRadius: 7, padding: 10, marginBottom: 14, backgroundColor: "#fafafa" },
  clientLabel: { fontSize: 7, fontFamily: "Inter", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  clientName: { fontSize: 12, fontFamily: "Inter", fontWeight: 700, color: C.primary, marginBottom: 2 },
  clientDetail: { fontSize: 8.5, color: C.muted, lineHeight: 1.7 },
  infoRight: { marginLeft: "auto", alignItems: "flex-end" },
  // Table
  tableHeader: { flexDirection: "row", backgroundColor: C.primary, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 5 },
  tableHeaderText: { color: "#fff", fontSize: 7.5, fontFamily: "Inter", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  tableCellText: { fontSize: 9.5, color: C.text },
  prodName: { fontSize: 10, fontFamily: "Inter", fontWeight: 700, color: C.text },
  prodDetail: { fontSize: 8, color: C.muted, marginTop: 1 },
  colNum: { width: 22, textAlign: "center", color: C.muted, fontSize: 9 },
  colDesig: { flex: 1 },
  colQty: { width: 40, textAlign: "center" },
  colPrice: { width: 80, textAlign: "right" },
  colTotal: { width: 90, textAlign: "right", fontFamily: "Inter", fontWeight: 700 },
  // Totals
  totalsSection: { alignItems: "flex-end", marginTop: 8, marginBottom: 10 },
  totalsBox: { width: 220, borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: "hidden" },
  totalsVal: { fontFamily: "Inter", fontWeight: 700, color: C.text, fontSize: 10 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, paddingHorizontal: 14, backgroundColor: C.primary },
  grandLabel: { color: "#fff", fontFamily: "Inter", fontWeight: 700, fontSize: 12 },
  grandVal: { color: C.green, fontFamily: "Inter", fontWeight: 700, fontSize: 14 },
  // Payment
  paySection: { flexDirection: "row", gap: 10, marginBottom: 14 },
  payCard: { flex: 1, borderWidth: 1, borderRadius: 7, padding: 10 },
  payCardBlue: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" },
  payCardGreen: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
  payLabel: { fontSize: 7.5, fontFamily: "Inter", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  payLabelBlue: { color: "#3b82f6" },
  payLabelGreen: { color: "#16a34a" },
  payAmount: { fontSize: 13, fontFamily: "Inter", fontWeight: 700 },
  payAmountBlue: { color: C.primary },
  payAmountGreen: { color: C.green },
  // Footer
  footer: { marginTop: "auto", paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, borderTopStyle: "dashed" },
  thankYou: { textAlign: "center", fontSize: 12, fontFamily: "Inter", fontWeight: 700, color: C.primary, marginBottom: 10, letterSpacing: 0.3 },
  footerGrid: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  legalTitle: { fontSize: 7.5, fontFamily: "Inter", fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  legalText: { fontSize: 7, color: C.muted, lineHeight: 1.7 },
  pageNum: { fontSize: 7, color: C.muted, textAlign: "center", marginTop: 10 },
});

export function FacturePDF({ data }: { data: FactureData }) {
  const { numero_facture, date, client, items, total, montant_recu, monnaie_rendue, commerce, devise, compte } = data;
  const acquittee = !compte?.argent || compte.argent.nouveau <= 0;
  const logoInitials = initials(commerce.nom);

  return (
    <Document title={numero_facture} author={commerce.nom}>
      <Page size="A4" style={s.page}>

        {/* HEADER */}
        <View style={s.header}>
          <View>
            <View style={s.logoBox}>
              <Text style={s.logoText}>{logoInitials}</Text>
            </View>
            <Text style={s.companyName}>{commerce.nom}</Text>
            <Text style={s.companyMeta}>
              {[commerce.adresse, commerce.telephone, commerce.email].filter(Boolean).join("\n")}
            </Text>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.factureTitle}>FACTURE</Text>
            <Text style={s.invoiceMeta}>
              <Text style={s.invoiceMetaBold}>N° {numero_facture}</Text>{"\n"}
              Date : <Text style={s.invoiceMetaBold}>{date}</Text>
            </Text>
            <View style={acquittee ? s.badge : [s.badge, { backgroundColor: "#ffedd5" }]}>
              <Text style={acquittee ? s.badgeText : [s.badgeText, { color: "#9a3412" }]}>● {acquittee ? "Facture acquittée" : "Reste à payer"}</Text>
            </View>
          </View>
        </View>

        {/* DIVIDER */}
        <View style={s.divider}>
          <View style={{ flex: 1, backgroundColor: C.green }} />
          <View style={{ flex: 1, backgroundColor: C.primary }} />
        </View>

        {/* CLIENT BLOCK */}
        <View style={s.clientBlock}>
          <View style={{ flex: 1 }}>
            <Text style={s.clientLabel}>Facturer à :</Text>
            <Text style={s.clientName}>{client.nom}</Text>
            <Text style={s.clientDetail}>
              {[client.telephone, client.adresse].filter(Boolean).join("\n") || "—"}
            </Text>
          </View>
          <View style={s.infoRight}>
            <Text style={s.clientLabel}>Mode de paiement</Text>
            <Text style={{ fontSize: 9, fontFamily: "Inter", fontWeight: 700, color: C.text, marginBottom: 6 }}>Espèces</Text>
            <Text style={s.clientLabel}>Référence</Text>
            <Text style={{ fontSize: 8.5, fontFamily: "Inter", fontWeight: 700, color: C.text }}>{numero_facture}</Text>
          </View>
        </View>

        {/* TABLE HEADER */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colNum]}>N°</Text>
          <Text style={[s.tableHeaderText, s.colDesig]}>Désignation</Text>
          <Text style={[s.tableHeaderText, s.colQty]}>Qté</Text>
          <Text style={[s.tableHeaderText, s.colPrice]}>Prix unit.</Text>
          <Text style={[s.tableHeaderText, s.colTotal]}>Total</Text>
        </View>

        {/* TABLE ROWS */}
        {items.map((item, i) => (
          <View key={i} style={[s.tableRow, { backgroundColor: i % 2 === 0 ? "#fff" : C.bgAlt }]}>
            <Text style={[s.tableCellText, s.colNum]}>{i + 1}</Text>
            <View style={s.colDesig}>
              <Text style={s.prodName}>{item.nom_produit}</Text>
              {item.volume ? <Text style={s.prodDetail}>{item.volume}</Text> : null}
            </View>
            <Text style={[s.tableCellText, s.colQty]}>{item.quantite}</Text>
            <Text style={[s.tableCellText, s.colPrice]}>{formatMontant(item.prix_unitaire, devise)}</Text>
            <Text style={[s.tableCellText, s.colTotal]}>{formatMontant(item.sous_total, devise)}</Text>
          </View>
        ))}

        {/* TOTALS */}
        <View style={s.totalsSection}>
          <View style={s.totalsBox}>
            <View style={s.grandRow}>
              <Text style={s.grandLabel}>TOTAL</Text>
              <Text style={s.grandVal}>{formatMontant(total, devise)}</Text>
            </View>
          </View>
        </View>

        {/* PAYMENT CARDS */}
        {(montant_recu !== null || monnaie_rendue !== null) && (
          <View style={s.paySection}>
            {montant_recu !== null && (
              <View style={[s.payCard, s.payCardBlue]}>
                <Text style={[s.payLabel, s.payLabelBlue]}>Montant reçu</Text>
                <Text style={[s.payAmount, s.payAmountBlue]}>{formatMontant(montant_recu, devise)}</Text>
              </View>
            )}
            {monnaie_rendue !== null && monnaie_rendue > 0 && (
              <View style={[s.payCard, s.payCardGreen]}>
                <Text style={[s.payLabel, s.payLabelGreen]}>Monnaie rendue</Text>
                <Text style={[s.payAmount, s.payAmountGreen]}>{formatMontant(monnaie_rendue, devise)}</Text>
              </View>
            )}
          </View>
        )}

        {/* COMPTE CLIENT : ancien solde + cette facture − réglé = nouveau solde */}
        {compte && (
          <View style={{ borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 7, padding: 10, marginBottom: 14 }}>
            <Text style={[s.clientLabel, { color: "#9a3412" }]}>Compte client</Text>
            {compte.argent && (
              <View style={{ marginBottom: compte.casiers.length ? 8 : 0 }}>
                {[
                  ["Ancien solde dû", compte.argent.ancien],
                  ["Achat de ce jour", compte.argent.achat],
                  ["Total à payer", compte.argent.total_general],
                  ["Payé", compte.argent.paye],
                ].map(([libelle, val]) => (
                  <View key={libelle as string} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                    <Text style={s.tableCellText}>{libelle}</Text>
                    <Text style={s.tableCellText}>{formatMontant(val as number, devise)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#fed7aa" }}>
                  <Text style={[s.totalsVal, { color: "#9a3412" }]}>{compte.argent.nouveau >= 0 ? "Reste dû" : "Avoir du client"}</Text>
                  <Text style={[s.totalsVal, { color: "#9a3412" }]}>{formatMontant(Math.abs(compte.argent.nouveau), devise)}</Text>
                </View>
              </View>
            )}
            {compte.casiers.length > 0 && (
              <View>
                <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#fed7aa", paddingBottom: 3 }}>
                  {["Emballage", "Dû avant", "Livrés", "Rendus", "Dû après"].map((h, i) => (
                    <Text key={h} style={[s.clientLabel, { color: "#9a3412", marginBottom: 0 }, i === 0 ? { flex: 1 } : { width: 55, textAlign: "right" }]}>{h}</Text>
                  ))}
                </View>
                {compte.casiers.map((c, i) => (
                  <View key={i} style={{ flexDirection: "row", marginTop: 3 }}>
                    <Text style={[s.tableCellText, { flex: 1 }]}>{c.nom}</Text>
                    <Text style={[s.tableCellText, { width: 55, textAlign: "right" }]}>{c.avant}</Text>
                    <Text style={[s.tableCellText, { width: 55, textAlign: "right" }]}>+{c.livres}</Text>
                    <Text style={[s.tableCellText, { width: 55, textAlign: "right" }]}>−{c.rendus}</Text>
                    <Text style={[s.totalsVal, { width: 55, textAlign: "right", color: c.apres > 0 ? "#9a3412" : C.text }]}>{c.apres}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* FOOTER */}
        <View style={s.footer}>
          <Text style={s.thankYou}>✦ Merci pour votre confiance ! ✦</Text>
          <View style={s.footerGrid}>
            <View style={{ flex: 1 }}>
              <Text style={s.legalTitle}>Conditions & mentions légales</Text>
              <Text style={s.legalText}>
                {acquittee
                  ? `Facture acquittée — réglée en espèces le ${date.split(" à")[0]}.`
                  : `Reste dû par le client : ${formatMontant(compte!.argent!.nouveau, devise)}.`}{"\n"}
                Aucun échange ni remboursement après validation de la vente.{"\n"}
                Tout litige doit être signalé dans les 24h suivant la livraison.{"\n"}
                Document généré par StockFlow · {commerce.nom}
              </Text>
            </View>
          </View>
          <Text style={s.pageNum}>Page 1 / 1 · {numero_facture} · {commerce.nom}</Text>
        </View>

      </Page>
    </Document>
  );
}
