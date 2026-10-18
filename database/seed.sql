-- ============================================
-- DONNÉES INITIALES (SEED)
-- ============================================

-- Client standard (obligatoire, non supprimable)
INSERT OR IGNORE INTO clients (id, nom, est_defaut)
VALUES (1, 'Client standard', 1);

-- Paramètres par défaut
INSERT OR IGNORE INTO parametres (
    id,
    nom_commerce,
    devise,
    symbole_devise,
    symbole_position
) VALUES (
    1,
    'Mon Dépôt',
    'XOF',
    'FCFA',
    'after'
);

-- ============================================
-- DONNÉES DE TEST (supprimer en production)
-- ============================================

-- Clients de test
INSERT OR IGNORE INTO clients (nom, telephone, adresse) VALUES
    ('Restaurant Le Phare',    '+229 97 00 00 01', 'Cotonou Centre'),
    ('Bar Central',            '+229 97 00 00 02', 'Akpakpa'),
    ('Épicerie du Coin',       '+229 97 00 00 03', 'Godomey'),
    ('Hôtel Marina',           '+229 97 00 00 04', 'Marina'),
    ('Supermarché Prix Bas',   '+229 97 00 00 05', 'Calavi');

-- Produits de test
INSERT OR IGNORE INTO produits (nom) VALUES
    ('Coca-Cola'),
    ('Fanta Orange'),
    ('Sprite'),
    ('Eau minérale'),
    ('Jus d''orange');

-- Formats de test
INSERT OR IGNORE INTO formats (produit_id, volume, unite, prix, stock, seuil_alerte) VALUES
    (1, 0.33, 'L', 500,  45, 20),
    (1, 0.50, 'L', 650,  30, 15),
    (1, 1.00, 'L', 900,  20, 10),
    (2, 0.33, 'L', 500,  15,  20),
    (2, 0.50, 'L', 650,  25, 15),
    (3, 0.33, 'L', 500,  89, 20),
    (4, 0.50, 'L', 400,   8, 25),
    (4, 1.00, 'L', 600,  12, 20),
    (4, 1.50, 'L', 800,  18, 15),
    (5, 1.00, 'L', 1200, 34, 10);