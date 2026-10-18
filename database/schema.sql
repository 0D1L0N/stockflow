-- ============================================
-- STOCKFLOW - SCHÉMA COMPLET DE LA BASE DE DONNÉES
-- Version : 1.0.0
-- ============================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- ============================================
-- TABLE : produits
-- ============================================
CREATE TABLE IF NOT EXISTS produits (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nom            TEXT    NOT NULL COLLATE NOCASE,
    date_creation  DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_produits_nom ON produits(nom);

-- ============================================
-- TABLE : formats
-- ============================================
CREATE TABLE IF NOT EXISTS formats (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    produit_id    INTEGER NOT NULL,
    volume        REAL    NOT NULL CHECK (volume > 0),
    unite         TEXT    NOT NULL DEFAULT 'L',
    prix          REAL    NOT NULL CHECK (prix > 0),
    stock         INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    seuil_alerte  INTEGER NOT NULL DEFAULT 5 CHECK (seuil_alerte >= 0),
    FOREIGN KEY (produit_id) REFERENCES produits(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_formats_produit ON formats(produit_id);
CREATE INDEX IF NOT EXISTS idx_formats_stock   ON formats(stock);

-- ============================================
-- TABLE : clients
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT    NOT NULL COLLATE NOCASE,
    telephone     TEXT,
    adresse       TEXT,
    est_defaut    INTEGER NOT NULL DEFAULT 0 CHECK (est_defaut IN (0,1)),
    date_creation DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients(nom);

-- ============================================
-- TABLE : prix_clients
-- Prix spécifique d'un format pour un client
-- (à défaut, le prix de base du format s'applique)
-- ============================================
CREATE TABLE IF NOT EXISTS prix_clients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id  INTEGER NOT NULL,
    format_id  INTEGER NOT NULL,
    prix       REAL    NOT NULL CHECK (prix > 0),
    date_maj   DATETIME DEFAULT (datetime('now', 'localtime')),
    UNIQUE (client_id, format_id),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (format_id) REFERENCES formats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prix_clients_client ON prix_clients(client_id);

-- ============================================
-- TABLE : ventes
-- ============================================
CREATE TABLE IF NOT EXISTS ventes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_facture  TEXT    NOT NULL UNIQUE,
    date            DATETIME DEFAULT (datetime('now', 'localtime')),
    client_id       INTEGER NOT NULL,
    total           REAL    NOT NULL CHECK (total >= 0),
    montant_recu    REAL,
    monnaie_rendue  REAL,
    statut          TEXT    NOT NULL DEFAULT 'validée'
                            CHECK (statut IN ('validée','annulée')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ventes_date          ON ventes(date);
CREATE INDEX IF NOT EXISTS idx_ventes_client        ON ventes(client_id);
CREATE INDEX IF NOT EXISTS idx_ventes_numero        ON ventes(numero_facture);
CREATE INDEX IF NOT EXISTS idx_ventes_statut        ON ventes(statut);

-- ============================================
-- TABLE : details_vente
-- ============================================
CREATE TABLE IF NOT EXISTS details_vente (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    vente_id     INTEGER NOT NULL,
    format_id    INTEGER NOT NULL,
    quantite     INTEGER NOT NULL CHECK (quantite > 0),
    prix_utilise REAL    NOT NULL CHECK (prix_utilise >= 0),
    FOREIGN KEY (vente_id)  REFERENCES ventes(id)  ON DELETE CASCADE,
    FOREIGN KEY (format_id) REFERENCES formats(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_details_vente  ON details_vente(vente_id);
CREATE INDEX IF NOT EXISTS idx_details_format ON details_vente(format_id);

-- ============================================
-- TABLE : mouvements_stock
-- ============================================
CREATE TABLE IF NOT EXISTS mouvements_stock (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    format_id    INTEGER NOT NULL,
    type         TEXT    NOT NULL CHECK (type IN ('entrée','sortie','ajustement')),
    quantite     INTEGER NOT NULL,
    stock_avant  INTEGER NOT NULL,
    stock_apres  INTEGER NOT NULL,
    source       TEXT    NOT NULL
                         CHECK (source IN ('vente','réapprovisionnement','inventaire')),
    reference_id INTEGER,
    commentaire  TEXT,
    date         DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (format_id) REFERENCES formats(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_mouvements_format ON mouvements_stock(format_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_date   ON mouvements_stock(date);
CREATE INDEX IF NOT EXISTS idx_mouvements_type   ON mouvements_stock(type);

-- ============================================
-- TABLE : parametres
-- ============================================
CREATE TABLE IF NOT EXISTS parametres (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_commerce      TEXT    NOT NULL DEFAULT 'Mon Dépôt',
    adresse_commerce  TEXT,
    telephone_commerce TEXT,
    email_commerce    TEXT,
    devise            TEXT    NOT NULL DEFAULT 'XOF',
    symbole_devise    TEXT    NOT NULL DEFAULT 'FCFA',
    symbole_position  TEXT    NOT NULL DEFAULT 'after'
                              CHECK (symbole_position IN ('before','after')),
    notifications_son INTEGER NOT NULL DEFAULT 1 CHECK (notifications_son IN (0,1)),
    mode_sombre       INTEGER NOT NULL DEFAULT 0 CHECK (mode_sombre IN (0,1)),
    langue            TEXT    NOT NULL DEFAULT 'fr'
);

-- ============================================
-- VUE : formats_avec_alertes
-- ============================================
CREATE VIEW IF NOT EXISTS formats_avec_alertes AS
SELECT
    f.id,
    f.produit_id,
    p.nom          AS produit_nom,
    f.volume,
    f.unite,
    f.prix,
    f.stock,
    f.seuil_alerte,
    CASE WHEN f.stock <= f.seuil_alerte THEN 1 ELSE 0 END AS en_alerte,
    MAX(0, f.seuil_alerte - f.stock)                       AS quantite_manquante
FROM formats f
JOIN produits p ON p.id = f.produit_id;

-- ============================================
-- VUE : statistiques_ventes
-- ============================================
CREATE VIEW IF NOT EXISTS statistiques_ventes AS
SELECT
    date(v.date)                          AS jour,
    COUNT(v.id)                           AS nombre_ventes,
    SUM(v.total)                          AS chiffre_affaires,
    AVG(v.total)                          AS panier_moyen
FROM ventes v
WHERE v.statut = 'validée'
GROUP BY date(v.date);