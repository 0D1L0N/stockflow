/** Compréhension des commandes dictées. Lancer : npx vitest run tests/dictee.test.ts */
import { describe, expect, it } from "vitest";
import { comprendre, normaliser, type ProduitDictee } from "@/lib/dictee";

const f = (id: string, volume: number, emballage: string | null, unite = "L") => ({ id, volume, unite, emballage_id: emballage });
const PRODUITS: ProduitDictee[] = [
  { id: "castel", nom: "Castel", formats: [f("castel12", 0.5, "casier-12"), f("castel20", 0.5, "casier-20")] },
  { id: "beni", nom: "La Béninoise", formats: [f("beni24", 0.33, "casier-24"), f("beni12", 0.66, "casier-12")] },
  { id: "pilsb", nom: "Pils Bénin", formats: [f("pilsb24", 0.33, "casier-24")] },
  { id: "pilst", nom: "Pils Togo", formats: [f("pilst24", 0.33, "casier-24"), f("pilst12", 0.66, "casier-12")] },
  { id: "coca", nom: "Coca-Cola", formats: [f("coca-can", 24, null, "canette")] },
  { id: "doppel", nom: "Doppel noir", formats: [f("dop12", 0.5, "casier-12"), f("dop20", 0.5, "casier-20")] },
  { id: "vide", nom: "Sprite", formats: [] },
];
const CLIENTS = [{ id: "c1", nom: "BAR LE TRIOMPHE" }, { id: "c2", nom: "CHEZ CECILE" }];
const resume = (t: string) => comprendre(t, PRODUITS, CLIENTS).lignes.map(l => `${l.quantite} ${l.produit?.id ?? "?"} ${l.formats.map(x => x.id).join("/")}`);

describe("nombres dits en lettres", () => {
  it("convertit les nombres et les virgules", () => {
    expect(normaliser("Trois Castel douze")).toBe("3 castel 12");
    expect(normaliser("vingt-quatre")).toBe("24");
    expect(normaliser("zéro virgule cinq")).toBe("0.5");
    expect(normaliser("0,33")).toBe("0.33");
  });
});

describe("articles", () => {
  it("quantité, produit et casier", () => {
    expect(resume("3 Castel 12")).toEqual(["3 castel castel12"]);
    expect(resume("cinq castel casier de vingt")).toEqual(["5 castel castel20"]);
  });

  it("plusieurs articles séparés par « et », des virgules ou rien", () => {
    expect(resume("3 Castel 12, 2 Béninoise petite et 5 Pils Togo 24")).toEqual(["3 castel castel12", "2 beni beni24", "5 pilst pilst24"]);
    expect(resume("3 castel 12 2 beninoise 24")).toEqual(["3 castel castel12", "2 beni beni24"]);
  });

  it("taille dite en clair : petite, grande, 33, 66", () => {
    expect(resume("2 beninoise grande")).toEqual(["2 beni beni12"]);
    expect(resume("4 pils togo 66")).toEqual(["4 pilst pilst12"]);
  });

  it("sans format précisé : les formats possibles restent à choisir", () => {
    expect(resume("2 castel")).toEqual(["2 castel castel12/castel20"]);
  });

  it("sans accent ni article, petite faute de reconnaissance", () => {
    expect(resume("une beninois 33")).toEqual(["1 beni beni24"]);
    expect(resume("deux dopel noir 20")).toEqual(["2 doppel dop20"]);
  });

  it("nom ambigu : propose les autres produits", () => {
    const l = comprendre("3 pils 24", PRODUITS).lignes[0];
    expect(l.produit && ["pilsb", "pilst"].includes(l.produit.id)).toBe(true);
    expect(l.autresProduits.length).toBe(1);
    // Les formats des autres produits suivent aussi les indices (24 → casier de 24 seulement)
    expect(l.autres.every(a => a.formats.every(x => x.emballage_id === "casier-24"))).toBe(true);
  });

  it("canettes, et produit inconnu signalé", () => {
    expect(resume("1 carton de coca")).toEqual(["1 coca coca-can"]);
    expect(resume("2 whisky")).toEqual(["2 ? "]);
  });

  it("un produit sans format n'est pas proposé", () => {
    expect(resume("1 sprite")).toEqual(["1 ? "]);
  });
});

describe("client", () => {
  it("« pour <client> » choisit le client et ne pollue pas la commande", () => {
    const r = comprendre("3 castel 12 pour le bar le triomphe", PRODUITS, CLIENTS);
    expect(r.client?.id).toBe("c1");
    expect(r.lignes.map(l => l.produit?.id)).toEqual(["castel"]);
  });

  it("client inconnu : la commande est quand même comprise", () => {
    const r = comprendre("2 castel 20 pour monsieur personne", PRODUITS, CLIENTS);
    expect(r.client).toBeNull();
    expect(r.lignes[0].produit?.id).toBe("castel");
  });
});
