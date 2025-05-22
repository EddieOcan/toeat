-- Funzione per verificare l'esistenza di una colonna in una tabella
-- Questa funzione può essere chiamata come "supabase.rpc('get_column_info', { table_name: 'my_table', column_name: 'my_column' })"
CREATE OR REPLACE FUNCTION get_column_info(table_name text, column_name text)
RETURNS TABLE(
    column_exists boolean,
    data_type text,
    column_default text
) LANGUAGE sql SECURITY definer AS $$
    SELECT 
        EXISTS(SELECT 1 
              FROM information_schema.columns 
              WHERE table_name = $1 
              AND column_name = $2) as column_exists,
        data_type,
        column_default
    FROM information_schema.columns 
    WHERE table_name = $1 
    AND column_name = $2;
$$; 