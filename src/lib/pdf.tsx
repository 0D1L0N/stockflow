import React from "react";
import { type FactureData, type FactureItem, type FactureCompte } from "@/components/facture/FacturePDF";
import type { BonCommandeData } from "@/components/stock/BonCommandePDF";
import { volumeFr } from "@/lib/format";

// ─── Types des données brutes DB ────────────────────────────────────────────

export interface VenteRaw {
  id: string; numero_facture: string; date: string | null;
  client_id: string; client_nom: string | null;
  total: number; montant_recu: number | null; monnaie_rendue: number | null; statut: string;
  montant_paye?: number; reste_du?: number;
  emballages_livres?: Record<string, number>; emballages_rendus?: Record<string, number>;
  solde_avant?: { argent: number; emballages: Record<string, number> } | null;
}

export interface DetailRaw {
  id: string; vente_id: string; format_id: string;
  produit_nom: string | null; volume: number | null; unite: string | null;
  quantite: number; prix_utilise: number;
}

export interface ClientRaw {
  id: string; nom: string; telephone: string | null; adresse?: string | null;
}

export interface ParametresRaw {
  nom_commerce: string; adresse_commerce: string | null;
  telephone_commerce: string | null; email_commerce: string | null;
  devise: string; symbole_devise: string; symbole_position: string;
}

// ─── Transformation des données brutes ──────────────────────────────────────

export function prepareVenteData(
  vente: VenteRaw,
  details: DetailRaw[],
  client: ClientRaw | null,
  commerce: ParametresRaw,
  devise: { symbole: string; position: string },
  nomEmballage: (id: string) => string = () => "Casier",
): FactureData {
  const dateFormatted = vente.date
    ? new Date(vente.date).toLocaleString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : new Date().toLocaleString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });

  const items: FactureItem[] = details.map(d => ({
    nom_produit: d.produit_nom ?? "—",
    volume: volumeFr(d.volume, d.unite),
    quantite: d.quantite,
    prix_unitaire: d.prix_utilise,
    sous_total: d.quantite * d.prix_utilise,
  }));

  return {
    numero_facture: vente.numero_facture,
    date: dateFormatted,
    client: {
      nom: client?.nom ?? vente.client_nom ?? "Client",
      telephone: client?.telephone ?? "",
      adresse: client?.adresse ?? "",
    },
    items,
    total: vente.total,
    montant_recu: vente.montant_recu,
    monnaie_rendue: vente.monnaie_rendue,
    commerce: {
      nom: commerce.nom_commerce,
      adresse: commerce.adresse_commerce ?? "",
      telephone: commerce.telephone_commerce ?? "",
      email: commerce.email_commerce ?? "",
    },
    devise,
    // Réimpression : la vente garde les soldes du client tels qu'ils étaient avant elle
    compte: construireCompte({
      total: vente.total, montant_paye: vente.montant_paye ?? vente.total,
      emballages_livres: vente.emballages_livres ?? {}, emballages_rendus: vente.emballages_rendus ?? {},
      solde_avant: vente.solde_avant ?? null,
    }, nomEmballage),
  };
}

// ─── Génération du blob PDF ──────────────────────────────────────────────────

export async function generatePDFBlob(venteData: FactureData): Promise<Blob> {
  const [{ pdf }, { FacturePDF }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/facture/FacturePDF"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(FacturePDF, { data: venteData }) as any;
  const blob = await pdf(element).toBlob();
  return blob;
}

// ─── Téléchargement ──────────────────────────────────────────────────────────

const nomFichier = (venteData: FactureData) => `${venteData.numero_facture}.pdf`;

/** Enregistre un PDF sur l'appareil (dossier Téléchargements). */
export function telechargerBlob(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadFacture(venteData: FactureData): Promise<void> {
  telechargerBlob(await generatePDFBlob(venteData), nomFichier(venteData));
}

// ─── Partage (WhatsApp, e-mail… via la feuille de partage du téléphone) ─────

/** Le navigateur sait-il partager un fichier PDF ? (Android, iPhone, certains PC) */
export function partageDisponible(): boolean {
  try {
    const test = new File([""], "test.pdf", { type: "application/pdf" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [test] });
  } catch { return false; }
}

/** Ouvre la feuille de partage du téléphone avec un PDF. */
export async function partagerBlob(blob: Blob, nom: string, titre: string): Promise<void> {
  const fichier = new File([blob], nom, { type: "application/pdf" });
  try {
    await navigator.share({ files: [fichier], title: titre });
  } catch (e) {
    // Fermer la feuille de partage n'est pas une erreur
    if ((e as Error)?.name !== "AbortError") throw e;
  }
}

export async function partagerFacture(venteData: FactureData): Promise<void> {
  await partagerBlob(await generatePDFBlob(venteData), nomFichier(venteData), `Facture ${venteData.numero_facture}`);
}

// ─── Impression ──────────────────────────────────────────────────────────────

export async function printFacture(venteData: FactureData): Promise<void> {
  const blob = await generatePDFBlob(venteData);
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  iframe.src = url;
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => {
        try { iframe.contentWindow!.focus(); iframe.contentWindow!.print(); resolve(); }
        catch (e) { reject(e); }
      };
      setTimeout(() => reject(new Error("timeout")), 10_000);
    });
  } catch {
    // Les navigateurs mobiles n'impriment pas un PDF intégré : on le télécharge
    // pour l'ouvrir et l'imprimer depuis la visionneuse du téléphone.
    await downloadFacture(venteData);
  } finally {
    setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60_000);
  }
}

// ─── Compte client sur la facture ────────────────────────────────────────────

/**
 * Bloc « compte client » : ancien solde + achat du jour − payé = nouveau solde,
 * pour l'argent et pour chaque type de casier. Renvoie null quand il n'y a rien
 * à signaler (achat payé comptant, sans casier ni dette).
 */
export function construireCompte(
  v: {
    total: number; montant_paye: number;
    emballages_livres: Record<string, number>; emballages_rendus: Record<string, number>;
    solde_avant?: { argent: number; emballages: Record<string, number> } | null;
  },
  nomEmballage: (id: string) => string,
): FactureCompte | null {
  const ancien = v.solde_avant?.argent ?? 0;
  const argent = ancien !== 0 || v.montant_paye !== v.total
    ? { ancien, achat: v.total, total_general: ancien + v.total, paye: v.montant_paye, nouveau: ancien + v.total - v.montant_paye }
    : null;

  const avant = v.solde_avant?.emballages ?? {};
  const types = [...new Set([
    ...Object.keys(v.emballages_livres), ...Object.keys(v.emballages_rendus),
    ...Object.keys(avant).filter(e => avant[e] !== 0),
  ])];
  const casiers = types.map(e => {
    const a = avant[e] ?? 0, l = v.emballages_livres[e] ?? 0, r = v.emballages_rendus[e] ?? 0;
    // Au comptoir (pas de solde) on ne garde pas de casiers « en trop »
    return { nom: nomEmballage(e), avant: a, livres: l, rendus: r, apres: v.solde_avant ? a + l - r : Math.max(0, l - r) };
  });

  if (!argent && casiers.length === 0) return null;
  return { argent, casiers };
}

// ─── Bon de commande fournisseur ─────────────────────────────────────────────

export async function genererBonCommandePDF(data: BonCommandeData): Promise<Blob> {
  const [{ pdf }, { BonCommandePDF }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/stock/BonCommandePDF"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pdf(React.createElement(BonCommandePDF, { data }) as any).toBlob();
}

/** Texte prêt à envoyer par WhatsApp (gras avec *…*, comme dans WhatsApp). */
export function texteBonCommande(data: BonCommandeData): string {
  const total = data.lignes.reduce((t, l) => t + l.quantite, 0);
  return [
    `*Bon de commande — ${data.commerce.nom}*`,
    `N° ${data.numero} · ${data.date}`,
    data.fournisseur ? `Fournisseur : ${data.fournisseur}` : null,
    "",
    ...data.lignes.map(l => `• ${l.produit} ${l.format} : *${l.quantite}* casier${l.quantite > 1 ? "s" : ""}`),
    "",
    `*Total : ${total} casier${total > 1 ? "s" : ""}*`,
    data.note ? `\n${data.note}` : null,
  ].filter(l => l !== null).join("\n");
}
