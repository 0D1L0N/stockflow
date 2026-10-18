import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import "@/components/facture/FacturePDF"; // enregistre la police Inter

export interface LigneBonCommande { produit: string; format: string; emballage: string | null; quantite: number; }

export interface BonCommandeData {
  numero: string;
  date: string;
  commerce: { nom: string; adresse: string; telephone: string };
  fournisseur: string;
  lignes: LigneBonCommande[];
  note: string;
}

const C = { primary: "#1e3a5f", green: "#10b981", text: "#1f2937", muted: "#6b7280", border: "#e5e7eb", bgAlt: "#f9fafb" };

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10, color: C.text, padding: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  commerce: { fontSize: 13, fontWeight: 700, color: C.primary, textTransform: "uppercase" },
  meta: { fontSize: 8.5, color: C.muted, marginTop: 3, lineHeight: 1.6 },
  titre: { fontSize: 22, fontWeight: 700, color: C.primary, textAlign: "right" },
  bloc: { borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, marginBottom: 14, backgroundColor: "#fafafa" },
  label: { fontSize: 7, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  tete: { flexDirection: "row", backgroundColor: C.primary, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 5 },
  teteTxt: { color: "#fff", fontSize: 7.5, fontWeight: 700, textTransform: "uppercase" },
  ligne: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  colN: { width: 22, color: C.muted },
  colProduit: { flex: 1 },
  colEmb: { width: 150, color: C.muted },
  colQte: { width: 70, textAlign: "right", fontWeight: 700 },
  total: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  totalBox: { backgroundColor: C.primary, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 14, flexDirection: "row", gap: 20 },
  totalTxt: { color: "#fff", fontWeight: 700, fontSize: 11 },
  note: { marginTop: 16, fontSize: 9, color: C.text, lineHeight: 1.6 },
  pied: { marginTop: "auto", paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, borderTopStyle: "dashed", fontSize: 7.5, color: C.muted, textAlign: "center" },
});

export function BonCommandePDF({ data }: { data: BonCommandeData }) {
  const total = data.lignes.reduce((t, l) => t + l.quantite, 0);
  return (
    <Document title={data.numero} author={data.commerce.nom}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.commerce}>{data.commerce.nom}</Text>
            <Text style={s.meta}>{[data.commerce.adresse, data.commerce.telephone].filter(Boolean).join("\n")}</Text>
          </View>
          <View>
            <Text style={s.titre}>BON DE COMMANDE</Text>
            <Text style={[s.meta, { textAlign: "right" }]}>N° {data.numero}{"\n"}Date : {data.date}</Text>
          </View>
        </View>

        <View style={s.bloc}>
          <Text style={s.label}>Fournisseur</Text>
          <Text style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>{data.fournisseur || "—"}</Text>
        </View>

        <View style={s.tete}>
          <Text style={[s.teteTxt, s.colN]}>N°</Text>
          <Text style={[s.teteTxt, s.colProduit]}>Produit</Text>
          <Text style={[s.teteTxt, s.colEmb]}>Emballage</Text>
          <Text style={[s.teteTxt, s.colQte]}>Casiers</Text>
        </View>
        {data.lignes.map((l, i) => (
          <View key={i} style={[s.ligne, { backgroundColor: i % 2 ? C.bgAlt : "#fff" }]}>
            <Text style={s.colN}>{i + 1}</Text>
            <Text style={[s.colProduit, { fontWeight: 700 }]}>{l.produit} <Text style={{ fontWeight: 400, color: C.muted }}>{l.format}</Text></Text>
            <Text style={s.colEmb}>{l.emballage ?? "—"}</Text>
            <Text style={s.colQte}>{l.quantite}</Text>
          </View>
        ))}

        <View style={s.total}>
          <View style={s.totalBox}>
            <Text style={s.totalTxt}>TOTAL</Text>
            <Text style={[s.totalTxt, { color: C.green }]}>{total} casier{total > 1 ? "s" : ""}</Text>
          </View>
        </View>

        {data.note ? <Text style={s.note}>{data.note}</Text> : null}

        <Text style={s.pied}>Bon de commande généré par StockFlow · {data.commerce.nom}</Text>
      </Page>
    </Document>
  );
}
