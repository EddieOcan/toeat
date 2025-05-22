-- Migrazione per aggiungere la colonna quantity alla tabella photo_analysis_ingredients
ALTER TABLE photo_analysis_ingredients
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- Aggiorna eventuali righe esistenti che sono NULL
UPDATE photo_analysis_ingredients
SET quantity = 1
WHERE quantity IS NULL;

-- Aggiungi commento alla colonna per documentazione
COMMENT ON COLUMN photo_analysis_ingredients.quantity IS 'Quantità dell''ingrediente (per esempio, 2 per indicare 2 kiwi)'; 