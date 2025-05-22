import { supabase } from "../lib/supabase"
import { analyzeProductWithGemini, type GeminiAnalysisResult, type EstimatedIngredient } from "./gemini"
import { analyzeImageWithGeminiVision } from './gemini'
import * as FileSystem from 'expo-file-system'; // Assicurati che sia importato
// import { decode } from 'base64-js'

// Utility per convertire base64 in ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = global.atob(base64); // Usa global.atob per chiarezza in RN, anche se atob è globale
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Interfaccia per i dati grezzi da OpenFoodFacts o input manuale per l'analisi visiva
export interface RawProductData {
  code: string; // Barcode
  product_name?: string;
  image_url?: string; 
  brands?: string;
  ingredients_text?: string;
  ingredients_text_with_allergens?: string; 
  quantity?: string; 
  serving_size?: string; 
  allergens_tags?: string[]; 
  traces?: string; 
  additives_tags?: string[]; 
  nova_group?: number | string; 
  countries?: string; 

  nutrition_grades?: string; 
  ecoscore_grade?: string;   
  ecoscore_score?: number;   
  ecoscore_data?: any;       
  
  packaging?: string; 
  packaging_tags?: string[]; 
  environmental_impact_level_tags?: string[]; 

  categories?: string;
  labels?: string;

  data_quality_warnings_tags?: string[]; 
  states_tags?: string[]; 


  nutriments?: { 
    energy_100g?: number;
    energy_kcal_100g?: number; 
    fat_100g?: number;
    saturated_fat_100g?: number;
    trans_fat_100g?: number; 
    cholesterol_100g?: number; 
    carbohydrates_100g?: number;
    sugars_100g?: number;
    fiber_100g?: number;
    proteins_100g?: number;
    salt_100g?: number;
    sodium_100g?: number; 
  };
}

// Interfaccia che rappresenta un record nella tabella 'products' del DB
export interface ProductRecord {
  id: string; // UUID della riga in 'products'
  user_id: string;
  barcode: string;
  product_name?: string;       // Da RawProductData o analisi visiva
  product_image?: string;      // Path nello storage Supabase
  brand?: string;              // Da RawProductData o analisi visiva
  ingredients?: string;        // Da RawProductData o analisi visiva
  nutrition_grade?: string;    // Da RawProductData (es. Nutri-Score)
  
  // Campi Eco-Score da OpenFoodFacts
  ecoscore_grade?: string;
  ecoscore_score?: number;
  // ecoscore_data?: any; // Considera se salvare l'intero oggetto JSON o solo i campi principali

  // Campi per l'analisi AI (GeminiAnalysisResult)
  health_score?: number;
  sustainability_score?: number;
  health_analysis?: string;
  health_pros?: Array<{title: string, detail: string}>;
  health_cons?: Array<{title: string, detail: string}>;
  health_recommendations?: string[];
  sustainability_analysis?: string;
  sustainability_pros?: Array<{title: string, detail: string}>;
  sustainability_cons?: Array<{title: string, detail: string}>;
  sustainability_recommendations?: string[];
  suggested_portion_grams?: number;
  nutri_score_explanation?: string; // AGGIUNTO
  nova_explanation?: string;        // AGGIUNTO
  eco_score_explanation?: string;   // AGGIUNTO
  calories_estimate?: string;       // AGGIUNTO: Stima calorie per analisi foto
  
  // --- NUOVI CAMPI DA AGGIUNGERE/VERIFICARE ---
  calorie_estimation_type?: 'breakdown' | 'per_100g' | 'per_serving_packaged'; // Tipo specifico
  ingredients_breakdown?: string | EstimatedIngredient[]; // Stringa JSON o array di oggetti nel DB (JSONB)
  // Se il DB memorizza come stringa JSON, usa string. Se è JSONB che può essere letto come array, usa EstimatedIngredient[]
  // Per ora, usiamo 'string' perché lo stringifichiamo prima di salvarlo in saveProductAndManageHistory.
  // Sarà responsabilità di chi legge (es. loadProductData in ProductDetailScreen) parsarlo.
  // Quindi, per coerenza con l'implementazione di salvataggio attuale:
  // ingredients_breakdown?: string; 
  // MODIFICA: Per consentire flessibilità e rispecchiare meglio l'uso, usiamo un tipo unione.
  // La logica di salvataggio stringifica, la logica di caricamento potrebbe parsare.
  
  // Campi nutrizionali specifici (da RawProductData.nutriments)
  energy_100g?: number;
  energy_kcal_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;
  proteins_100g?: number;
  salt_100g?: number;
  sugars_100g?: number;
  fiber_100g?: number;
  saturated_fat_100g?: number;
  
  is_visually_analyzed?: boolean; // True se il prodotto è stato aggiunto tramite analisi di immagine senza barcode
  created_at: string;
  updated_at: string;
}


// Interfaccia per l'oggetto restituito da handleBarcodeScan
export interface ProcessedProductInfo {
  productData: RawProductData | null; // Dati da OFF o equivalenti se da DB
  aiAnalysis: GeminiAnalysisResult | null; // Analisi AI
  dbProduct: ProductRecord | null; // Record come salvato/recuperato dal DB
  source: 'database' | 'new_scan' | 'error' | 'not_found_off' | 'database_no_ai' | 'new_scan_off_only';
  errorMessage?: string;
}

// Rivediamo ScannedProduct, potrebbe diventare un tipo per la visualizzazione della cronologia
// che include anche 'scanned_at' dalla tabella user_scan_history.
export interface DisplayableHistoryProduct extends ProductRecord {
  history_id: string; // id dalla tabella user_scan_history
  user_scan_time: string; // scanned_at dalla tabella user_scan_history
}

/**
 * Carica un'immagine del prodotto su Supabase Storage.
 * Il path sarà userId/imageId.ext
 * Restituisce il path pubblico o null in caso di errore.
 */
export const uploadProductImage = async (
  userId: string,
  localImageUri: string,
): Promise<string | null> => {
  try {
    console.log(`[STORAGE UPLOAD] Inizio caricamento immagine per utente ${userId} da URI locale ${localImageUri}`);

    const fileName = `product_image_${userId}_${Date.now()}.${localImageUri.split('.').pop() || 'jpg'}`;
    let mimeType = 'image/jpeg'; // Default
    if (localImageUri.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (localImageUri.endsWith('.webp')) {
      mimeType = 'image/webp';
    }
    console.log(`[STORAGE UPLOAD] Nome file: ${fileName}, MimeType inferito: ${mimeType}`);

    // Leggi il file come stringa base64
    const base64Data = await FileSystem.readAsStringAsync(localImageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log(`[STORAGE UPLOAD] Dati immagine letti come base64 (lunghezza: ${base64Data.length})`);

    // Converti la stringa base64 in ArrayBuffer
    const arrayBuffer = base64ToArrayBuffer(base64Data);
    console.log(`[STORAGE UPLOAD] Base64 convertita in ArrayBuffer (dimensione: ${arrayBuffer.byteLength} bytes)`);

    if (arrayBuffer.byteLength === 0) {
        console.error("[STORAGE UPLOAD ERROR] ArrayBuffer ha dimensione 0, upload annullato.");
        return null;
    }

    const { data, error } = await supabase.storage
      .from("product-images") 
      .upload(fileName, arrayBuffer, { // Carica l'ArrayBuffer
        contentType: mimeType,
        upsert: true, 
      });

    if (error) {
      console.error("[STORAGE ERROR] Errore durante il caricamento dell'ArrayBuffer immagine:", error);
      throw error;
    }

    if (!data || !data.path) {
      console.error("[STORAGE ERROR] Nessun path restituito dopo il caricamento dell'immagine (ArrayBuffer).");
      return null;
    }
    
    const { data: publicUrlData } = supabase.storage.from("product-images").getPublicUrl(data.path);

    console.log(`[STORAGE SUCCESS] Immagine (da ArrayBuffer) caricata con successo: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;

  } catch (error) {
    console.error("[STORAGE ERROR] Eccezione durante il caricamento dell'immagine (ArrayBuffer approach):", error);
    return null;
  }
};


/**
 * Salva un nuovo prodotto scansionato/analizzato nel database,
 * lo aggiunge alla cronologia dell'utente e gestisce il limite di 10 elementi nella cronologia.
 */
export const saveProductAndManageHistory = async (
  userId: string,
  barcode: string,
  rawProductData: RawProductData, // Dati da OFF o per analisi visiva
  aiAnalysis?: GeminiAnalysisResult | null, // Questo sarà FORNITO per le scansioni visive, null per nuovi barcode
  uploadedImagePublicUrl?: string, // URL pubblico dell'immagine già caricata
  isVisualScan: boolean = false,
): Promise<ProductRecord | null> => {
  console.log(`[API SAVE UPSERT] Inizio upsert prodotto (AI ${aiAnalysis ? 'presente' : 'assente/da generare'}) e gestione cronologia per utente ${userId}, barcode ${barcode}`);
  try {
    // Costruisci il payload per l'upsert.
    // Iniziamo con i campi base.
    const productUpsertPayload: Partial<ProductRecord> & { user_id: string; barcode: string } = {
      user_id: userId,
      barcode: barcode,
      product_name: rawProductData.product_name,
      product_image: uploadedImagePublicUrl, // Può essere l'image_url da OFF o l'URL caricato per scansione visiva
      brand: rawProductData.brands, // Per scansione visiva, rawProductData.brands sarà impostato da productNameFromVision
      ingredients: rawProductData.ingredients_text,
      nutrition_grade: rawProductData.nutrition_grades,
      // Aggiungiamo i campi Eco-Score
      ecoscore_grade: rawProductData.ecoscore_grade,
      ecoscore_score: rawProductData.ecoscore_score,
      // ecoscore_data: rawProductData.ecoscore_data, // Se decidi di salvarlo
      
      energy_100g: rawProductData.nutriments?.energy_100g,
      energy_kcal_100g: rawProductData.nutriments?.energy_kcal_100g,
      fat_100g: rawProductData.nutriments?.fat_100g,
      carbohydrates_100g: rawProductData.nutriments?.carbohydrates_100g,
      proteins_100g: rawProductData.nutriments?.proteins_100g,
      salt_100g: rawProductData.nutriments?.salt_100g,
      sugars_100g: rawProductData.nutriments?.sugars_100g,
      fiber_100g: rawProductData.nutriments?.fiber_100g,
      saturated_fat_100g: rawProductData.nutriments?.saturated_fat_100g,
      
      is_visually_analyzed: isVisualScan,
      // updated_at sarà gestito automaticamente da Supabase sull'update del conflitto
    };

    // Aggiungi i campi dell'analisi AI al payload SE aiAnalysis è fornito.
    // Questo è cruciale per le scansioni visive dove l'AI è già stata fatta.
    // Per le scansioni barcode, aiAnalysis sarà null qui, e questi campi non verranno sovrascritti
    // (o verranno impostati se è la prima volta e il DB permette null).
    // L'aggiornamento AI per i barcode avviene dopo, con fetchOrGenerateAiAnalysisAndUpdateProduct.
    if (aiAnalysis) {
      console.log(`[API SAVE UPSERT] aiAnalysis fornito. Inclusione dei campi AI nel payload per ${barcode}.`);
      productUpsertPayload.health_score = aiAnalysis.healthScore;
      productUpsertPayload.sustainability_score = aiAnalysis.sustainabilityScore;
      productUpsertPayload.health_analysis = aiAnalysis.analysis;
      productUpsertPayload.health_pros = aiAnalysis.pros;
      productUpsertPayload.health_cons = aiAnalysis.cons;
      productUpsertPayload.health_recommendations = aiAnalysis.recommendations;
      productUpsertPayload.sustainability_analysis = aiAnalysis.sustainabilityAnalysis;
      productUpsertPayload.sustainability_pros = aiAnalysis.sustainabilityPros;
      productUpsertPayload.sustainability_cons = aiAnalysis.sustainabilityCons;
      productUpsertPayload.sustainability_recommendations = aiAnalysis.sustainabilityRecommendations;
      productUpsertPayload.suggested_portion_grams = aiAnalysis.suggestedPortionGrams;
      productUpsertPayload.nutri_score_explanation = aiAnalysis.nutriScoreExplanation;
      productUpsertPayload.nova_explanation = aiAnalysis.novaExplanation;
      productUpsertPayload.eco_score_explanation = aiAnalysis.ecoScoreExplanation;
      productUpsertPayload.calories_estimate = aiAnalysis.calories_estimate;
      
      // --- NUOVE AGGIUNTE CRUCIALI ---
      productUpsertPayload.calorie_estimation_type = aiAnalysis.calorie_estimation_type; 
      productUpsertPayload.ingredients_breakdown = aiAnalysis.ingredients_breakdown 
        ? JSON.stringify(aiAnalysis.ingredients_breakdown) 
        : undefined;
      console.log(`[API SAVE UPSERT] Aggiunto calorie_estimation_type: ${aiAnalysis.calorie_estimation_type}`);
      console.log(`[API SAVE UPSERT] Aggiunto ingredients_breakdown (stringified): ${productUpsertPayload.ingredients_breakdown !== undefined}`);
      // --- FINE NUOVE AGGIUNTE ---
    }

    const { data: upsertedProduct, error: upsertError } = await supabase
      .from("products")
      .upsert(productUpsertPayload, { onConflict: "user_id, barcode", ignoreDuplicates: false })
      .select()
      .single();

    if (upsertError) {
      console.error("[DB ERROR] Errore durante l'upsert del prodotto:", upsertError);
      throw upsertError;
    }

    if (!upsertedProduct) {
      console.error("[DB ERROR] Nessun prodotto restituito dopo l'upsert.");
      return null;
    }
    
    console.log(`[DB SUCCESS] Prodotto UPSERTED (ID: ${upsertedProduct.id}) in 'products'.`);
    console.log(`[DB SUCCESS] Dettagli salvati: EcoScore Grade: ${upsertedProduct.ecoscore_grade}, AI Health Score: ${upsertedProduct.health_score}, Visually Analyzed: ${upsertedProduct.is_visually_analyzed}`);
    if (upsertedProduct.calorie_estimation_type) {
        console.log(`[DB SUCCESS] calorie_estimation_type salvato: ${upsertedProduct.calorie_estimation_type}`);
    }
    // Assumendo che ProductRecord ora possa avere ingredients_breakdown come stringa o EstimatedIngredient[]
    // Per il log, verifichiamo solo se è presente.
    if ((upsertedProduct as any).ingredients_breakdown) { 
        console.log(`[DB SUCCESS] ingredients_breakdown salvato nel prodotto principale.`);
    }

    // --- NUOVA AGGIUNTA: Salva gli ingredienti iniziali in photo_analysis_ingredients ---
    if (isVisualScan && aiAnalysis && aiAnalysis.ingredients_breakdown && aiAnalysis.ingredients_breakdown.length > 0) {
      console.log(`[API SAVE UPSERT] Tentativo di salvare gli ingredienti iniziali in photo_analysis_ingredients per il prodotto ${upsertedProduct.id}`);
      try {
        const ingredientsSaved = await savePhotoAnalysisIngredients(
          upsertedProduct.id,
          userId,
          aiAnalysis.ingredients_breakdown // Passa l'array di oggetti direttamente
        );
        if (ingredientsSaved) {
          console.log(`[API SAVE UPSERT] Ingredienti iniziali salvati con successo in photo_analysis_ingredients per ${upsertedProduct.id}.`);
        } else {
          console.warn(`[API SAVE UPSERT WARN] Fallito il salvataggio degli ingredienti iniziali in photo_analysis_ingredients per ${upsertedProduct.id}.`);
        }
      } catch (ingredientSaveError) {
        console.error(`[API SAVE UPSERT ERROR] Errore durante il salvataggio degli ingredienti iniziali in photo_analysis_ingredients per ${upsertedProduct.id}:`, ingredientSaveError);
      }
    }
    // --- FINE NUOVA AGGIUNTA ---

    // 2. Aggiungi/Aggiorna il prodotto nella cronologia dell'utente
    const { error: historyUpsertError } = await supabase
      .from("user_scan_history")
      .upsert({
        user_id: userId,
        product_id: upsertedProduct.id, // FK alla tabella products
        scanned_at: new Date().toISOString() // Aggiorna sempre l'ora della scansione
      },
      { onConflict: 'user_id, product_id' } // Upsert basato sulla coppia user_id, product_id
    );

    if (historyUpsertError) {
      console.error("[DB ERROR] Errore durante l'upsert nella cronologia (post product upsert):", historyUpsertError);
      // Non bloccare l'operazione principale per questo, ma logga l'errore.
    } else {
      console.log(`[DB SUCCESS] Cronologia aggiornata per prodotto ${upsertedProduct.id}.`);
    }

    return upsertedProduct; // Restituisce il record completo (con o senza AI, a seconda di cosa c'era prima nel DB)

  } catch (error) {
    console.error(`[API ERROR] Errore in saveProductAndManageHistory (UPSERT) per utente ${userId}, barcode ${barcode}:`, error);
    return null; // Restituisce null in caso di errore critico
  }
};


/**
 * Aggiunge un prodotto (un record specifico dalla tabella 'products') ai preferiti dell'utente.
 */
export const addProductToFavorites = async (userId: string, productRecordId: string): Promise<boolean> => {
  try {
    console.log(`[API FAVORITES] Utente ${userId} aggiunge prodotto ${productRecordId} ai preferiti.`);
    const { error } = await supabase
      .from("user_favorites")
      .insert({
      user_id: userId,
        product_id: productRecordId,
        // favorited_at è gestito automaticamente da Supabase (o created_at se così chiamata)
      })
      // .onConflict(['user_id', 'product_id']) // Opzionale: per ignorare se già esiste
      // .ignore(); // se usi onConflict

    if (error) {
      // Se il vincolo UNIQUE (user_id, product_id) è attivo, un tentativo di duplicato darà errore 23505
      if (error.code === '23505') { // Codice per unique_violation in PostgreSQL
        console.log(`[DB INFO] Prodotto ${productRecordId} già nei preferiti per utente ${userId}.`);
        return true; // Consideralo un successo se era già lì
      }
      console.error("[DB ERROR] Errore durante l'aggiunta ai preferiti:", error);
      throw error;
    }
    console.log(`[DB SUCCESS] Prodotto ${productRecordId} aggiunto ai preferiti per utente ${userId}.`);
    return true;
  } catch (error) {
    console.error(`[API ERROR] Errore in addProductToFavorites per utente ${userId}, prodotto ${productRecordId}:`, error);
    return false;
  }
};


/**
 * Rimuove un prodotto dai preferiti dell'utente.
 */
export const removeProductFromFavorites = async (userId: string, productRecordId: string): Promise<boolean> => {
  try {
    console.log(`[API FAVORITES] Utente ${userId} rimuove prodotto ${productRecordId} dai preferiti.`);
    const { error } = await supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("product_id", productRecordId);

    if (error) {
      console.error("[DB ERROR] Errore durante la rimozione dai preferiti:", error);
      throw error;
    }
    console.log(`[DB SUCCESS] Prodotto ${productRecordId} rimosso dai preferiti per utente ${userId}.`);
    return true;
  } catch (error) {
    console.error(`[API ERROR] Errore in removeProductFromFavorites per utente ${userId}, prodotto ${productRecordId}:`, error);
    return false;
  }
};


/**
 * Recupera la cronologia delle scansioni dell'utente (ultimi 10 prodotti).
 * Ogni elemento include i dati completi del prodotto dalla tabella 'products'.
 */
export const getScanHistory = async (userId: string): Promise<DisplayableHistoryProduct[]> => {
  try {
    console.log(`[API FETCH] Recupero cronologia scansioni per utente ${userId}.`);
    const { data: historyEntries, error } = await supabase
      .from("user_scan_history")
      .select(`
        id,
        scanned_at,
        products (
          *,
          user_id 
        )
      `)
      .eq("user_id", userId)
      .order("scanned_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("[DB ERROR] Errore nel recupero della cronologia:", error);
      throw error;
    }

    if (!historyEntries) {
      return [];
    }
    
    // Trasforma i dati per l'UI
    const displayableHistory: DisplayableHistoryProduct[] = historyEntries.map((entry: any) => {
      // La join di Supabase mette l'oggetto 'products' come una proprietà
      // Se 'products' fosse null (non dovrebbe succedere con FK corretta), gestiscilo
      const productData = entry.products as ProductRecord; 
      return {
        ...productData,
        history_id: entry.id, // ID della riga in user_scan_history
        user_scan_time: entry.scanned_at, // scanned_at da user_scan_history
      };
    }).filter(item => item.id !== undefined); // Assicura che il prodotto esista

    console.log(`[DB SUCCESS] Recuperati ${displayableHistory.length} elementi per la cronologia utente ${userId}.`);
    return displayableHistory;

  } catch (error) {
    console.error(`[API ERROR] Errore in getScanHistory per utente ${userId}:`, error);
    return [];
  }
};

/**
 * Recupera i prodotti preferiti dell'utente.
 * Ogni elemento include i dati completi del prodotto dalla tabella 'products'.
 */
export const getFavoriteProducts = async (userId: string): Promise<ProductRecord[]> => {
  try {
    console.log(`[API FETCH] Recupero prodotti preferiti per utente ${userId}.`);
    const { data: favoriteEntries, error } = await supabase
      .from("user_favorites")
      .select(`
        id, 
        created_at, 
        products (
          *
        )
      `) // created_at qui è di user_favorites, non di products
      .eq("user_id", userId)
      .order("created_at", { ascending: false }); // O il nome della colonna timestamp in user_favorites

    if (error) {
      console.error("[DB ERROR] Errore nel recupero dei preferiti:", error);
      throw error;
    }

    if (!favoriteEntries) {
      return [];
    }

    // Estrai e restituisci solo i dati dei prodotti
    const favoriteProducts: ProductRecord[] = favoriteEntries.map((entry: any) => entry.products as ProductRecord).filter(p => p !== null);
    
    console.log(`[DB SUCCESS] Recuperati ${favoriteProducts.length} prodotti preferiti per utente ${userId}.`);
    return favoriteProducts;

  } catch (error) {
    console.error(`[API ERROR] Errore in getFavoriteProducts per utente ${userId}:`, error);
    return [];
  }
};

// Funzione per generare un barcode sintetico per prodotti senza codice
// Questa funzione potrebbe essere ancora utile
export const generateVisualScanBarcode = (): string => {
  const timestamp = new Date().getTime();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const syntheticBarcode = `VISUAL_${timestamp}_${randomSuffix}`;
  console.log(`[UTIL] Generato barcode sintetico per scansione visiva: ${syntheticBarcode}`);
  return syntheticBarcode;
};


export const fetchProductFromOpenFoodFacts = async (barcode: string): Promise<RawProductData | null> => {
  try {
    console.log(`[API FETCH] Recupero dati per il prodotto ${barcode} da OpenFoodFacts`);
    console.time(`[API TIMING] Recupero dati OpenFoodFacts per ${barcode}`);

    // Verifica se il barcode è uno sintetico per scansioni visive
    if (barcode.startsWith("VISUAL_")) {
      console.log(`[API INFO] Il barcode ${barcode} è sintetico (scansione visiva), skip OpenFoodFacts.`);
      // Per i barcode sintetici, non ci sono dati da OFF.
      // Restituiamo un oggetto RawProductData minimo, che verrà poi popolato dall'analisi AI e dall'immagine.
      return {
        code: barcode, // Manteniamo il barcode sintetico
        product_name: "Prodotto da analisi visiva", // Placeholder
        // Altri campi possono essere omessi o impostati a default se necessario
      };
    }

    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();

    console.timeEnd(`[API TIMING] Recupero dati OpenFoodFacts per ${barcode}`);

    if (data.status === 0) {
      console.warn(`[API WARN] Prodotto ${barcode} non trovato su OpenFoodFacts.`);
      // Non lanciare errore qui, l'analisi AI potrebbe comunque funzionare con l'immagine
      return null; 
    }

    const offProduct = data.product; // Riferimento più corto a data.product

    const product: RawProductData = {
      code: data.code, 
      product_name: offProduct.product_name || undefined,
      image_url: offProduct.image_url || undefined,
      brands: offProduct.brands || undefined,
      ingredients_text: offProduct.ingredients_text || undefined,
      ingredients_text_with_allergens: offProduct.ingredients_text_with_allergens || offProduct.ingredients_text || undefined,
      quantity: offProduct.quantity || undefined,
      serving_size: offProduct.serving_size || undefined,
      allergens_tags: offProduct.allergens_tags || [], 
      traces: offProduct.traces || undefined, 
      additives_tags: offProduct.additives_tags || [], 
      nova_group: offProduct.nova_group || undefined, 
      countries: offProduct.countries || undefined,

      nutrition_grades: offProduct.nutrition_grades || undefined,
      ecoscore_grade: offProduct.ecoscore_grade || undefined, 
      ecoscore_score: offProduct.ecoscore_score || undefined, 
      ecoscore_data: offProduct.ecoscore_data || undefined, 
      
      packaging: offProduct.packaging || undefined, 
      packaging_tags: offProduct.packaging_tags || [], 
      environmental_impact_level_tags: offProduct.environmental_impact_level_tags || [], 

      categories: offProduct.categories || undefined,
      labels: offProduct.labels || undefined,

      data_quality_warnings_tags: offProduct.data_quality_warnings_tags || [],
      states_tags: offProduct.states_tags || [],

      nutriments: {
        energy_100g: offProduct.nutriments?.energy_100g,
        energy_kcal_100g: offProduct.nutriments?.['energy-kcal_100g'] || offProduct.nutriments?.energy_value,
        fat_100g: offProduct.nutriments?.fat_100g,
        saturated_fat_100g: offProduct.nutriments?.saturated_fat_100g,
        trans_fat_100g: offProduct.nutriments?.trans_fat_100g,
        cholesterol_100g: offProduct.nutriments?.cholesterol_100g,
        carbohydrates_100g: offProduct.nutriments?.carbohydrates_100g,
        sugars_100g: offProduct.nutriments?.sugars_100g,
        fiber_100g: offProduct.nutriments?.fiber_100g,
        proteins_100g: offProduct.nutriments?.proteins_100g,
        salt_100g: offProduct.nutriments?.salt_100g,
        sodium_100g: offProduct.nutriments?.sodium_100g,
      },
    };

    console.log(`[API SUCCESS] Dati per il prodotto ${barcode} recuperati da OpenFoodFacts.`);
    return product;
  } catch (error) {
    console.error(`[API ERROR] Errore nel recupero dei dati del prodotto ${barcode} da OpenFoodFacts:`, error);
    // In caso di errore di rete o altro, restituisci null per permettere fallback a scansione visiva se applicabile
    return null;
  }
};

/**
 * Funzione di utility per eliminare un'immagine dallo storage di Supabase.
 * Usata internamente quando un prodotto viene rimosso dalla tabella 'products'.
 */
const deleteImageFromStorage = async (imagePath: string): Promise<void> => {
  if (!imagePath) return;

  // L'imagePath potrebbe essere un URL pubblico. Dobbiamo estrarre il path relativo al bucket.
  // Esempio URL: https://<idprogetto>.supabase.co/storage/v1/object/public/product_images/userId/image.jpg
  // Path da usare con API: userId/image.jpg
  let relativePath = imagePath;
  try {
    const url = new URL(imagePath);
    // Il path nel bucket inizia dopo "/public/" o "/object/" e il nome del bucket
    const pathParts = url.pathname.split('/');
    const bucketNameIndex = pathParts.indexOf('product-images'); // Modificato da product_images
    if (bucketNameIndex !== -1 && bucketNameIndex + 1 < pathParts.length) {
      relativePath = pathParts.slice(bucketNameIndex + 1).join('/');
    } else {
      console.warn(`[STORAGE DELETE WARN] Impossibile estrarre il path relativo per l'eliminazione da: ${imagePath}`);
      // Potrebbe essere già un path relativo, proviamo comunque
  }
  } catch (e) {
    // Non è un URL valido, potrebbe essere già un path relativo
    console.log(`[STORAGE DELETE INFO] ${imagePath} non è un URL, lo tratto come path relativo.`);
  }
  
  if (!relativePath) {
      console.warn(`[STORAGE DELETE WARN] Path relativo vuoto per l'immagine: ${imagePath}, eliminazione saltata.`);
      return;
  }

  console.log(`[STORAGE DELETE] Tentativo di eliminazione immagine: ${relativePath}`);
  const { error: deleteError } = await supabase.storage
    .from("product-images")
    .remove([relativePath]);

  if (deleteError) {
    console.error(`[STORAGE ERROR] Errore durante l'eliminazione dell'immagine ${relativePath}:`, deleteError);
  } else {
    console.log(`[STORAGE SUCCESS] Immagine ${relativePath} eliminata con successo.`);
  }
};

// Le funzioni originali per l'analisi Gemini (analyzeProductWithGemini, analyzeImageWithGeminiVision)
// rimangono in ./gemini.ts e verranno chiamate dal codice dell'UI prima di invocare
// saveProductAndManageHistory.

/**
 * Recupera un singolo record di prodotto dalla tabella 'products' usando il suo ID.
 */
export const getProductRecordById = async (productRecordId: string): Promise<ProductRecord | null> => {
  try {
    console.log(`[API FETCH] Recupero ProductRecord con ID: ${productRecordId}`);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productRecordId)
      .maybeSingle();

    if (error) {
      console.error(`[DB ERROR] Errore nel recupero del ProductRecord ${productRecordId}:`, error);
      throw error;
    }

    if (!data) {
      console.log(`[DB INFO] Nessun ProductRecord trovato con ID: ${productRecordId}`);
      return null;
    }
    
    console.log(`[DB SUCCESS] ProductRecord ${productRecordId} recuperato.`);
    // Assicurati che i campi array siano effettivamente array se Supabase li restituisce come stringhe
    // Questo dipende dalla configurazione di Supabase e da come gestisce i tipi array in select("*")
    // Per ora, assumiamo che Supabase li restituisca correttamente o che il tipo ProductRecord gestisca stringhe.
    return data as ProductRecord;
  } catch (error) {
    console.error(`[API ERROR] Errore in getProductRecordById per ID ${productRecordId}:`, error);
    return null;
  }
};

/**
 * Verifica se un prodotto (identificato dal suo productRecordId) è nei preferiti dell'utente.
 */
export const isProductInFavorites = async (userId: string, productRecordId: string): Promise<boolean> => {
  try {
    console.log(`[API CHECK FAVORITE] Controllo se ${productRecordId} è nei preferiti di ${userId}`);
    const { data, error, count } = await supabase
      .from("user_favorites")
      .select("id", { count: "exact" }) // Seleziona solo l'ID e chiedi il conteggio
      .eq("user_id", userId)
      .eq("product_id", productRecordId);

    if (error) {
      console.error("[DB ERROR] Errore nel controllo dei preferiti:", error);
      // Non lanciare errore, considera come "non nei preferiti" in caso di dubbio o errore DB
      return false;
    }
    
    const isSaved = count !== null && count > 0;
    console.log(`[DB RESULT] Prodotto ${productRecordId} ${isSaved ? "TROVATO" : "NON TROVATO"} nei preferiti di ${userId}. Conteggio: ${count}`);
    return isSaved;

  } catch (error) {
    console.error(`[API ERROR] Errore in isProductInFavorites per utente ${userId}, prodotto ${productRecordId}:`, error);
    return false;
  }
};

export const handleBarcodeScan = async (
  barcode: string,
  userId: string,
): Promise<ProcessedProductInfo> => {
  console.log(`[PROCESS BARCODE] Avvio processo per barcode: ${barcode}, utente: ${userId}`);

  try {
    // 1. Controlla se il prodotto esiste già nel DB per questo utente
    // Questo controllo è ancora utile per decidere rapidamente se andare a OFF o meno,
    // e per recuperare l'AI se già presente. L'upsert in saveProductAndManageHistory
    // gestirà la concorrenza a livello di scrittura dei dati base.
    const { data: existingProductRecord, error: fetchExistingError } = await supabase
      .from('products')
      .select('*') 
      .eq('barcode', barcode)
      .eq('user_id', userId)
      .eq('is_visually_analyzed', false) 
      .maybeSingle(); 

    if (fetchExistingError && fetchExistingError.code !== 'PGRST116') { // PGRST116: "Searched item not found"
      console.error('[DB ERROR] Errore nel cercare prodotto esistente:', fetchExistingError);
      return {
        productData: null, aiAnalysis: null, dbProduct: null, 
        source: 'error', errorMessage: "Errore nel recupero dati dal database." 
      };
    }

    if (existingProductRecord) {
      console.log(`[PROCESS BARCODE] Prodotto ${barcode} trovato nel database per utente ${userId}. ID: ${existingProductRecord.id}`);

      // Aggiorna la cronologia (upsert per scanned_at)
      const { error: historyUpsertError } = await supabase
        .from('user_scan_history')
        .upsert(
          { user_id: userId, product_id: existingProductRecord.id, scanned_at: new Date().toISOString() },
          { onConflict: 'user_id, product_id' } 
        );

      if (historyUpsertError) {
        console.warn('[DB WARN] Mancato aggiornamento scanned_at nella cronologia per prodotto esistente:', historyUpsertError);
      } else {
         console.log(`[DB INFO] Cronologia aggiornata per prodotto esistente ${existingProductRecord.id}`);
      }
      
      const productDataFromDb: RawProductData = {
        code: existingProductRecord.barcode,
        product_name: existingProductRecord.product_name,
        image_url: existingProductRecord.product_image, 
        brands: existingProductRecord.brand,
        ingredients_text: existingProductRecord.ingredients,
        nutrition_grades: existingProductRecord.nutrition_grade,
        // Aggiungiamo i campi Eco-Score anche qui per coerenza
        ecoscore_grade: existingProductRecord.ecoscore_grade,
        ecoscore_score: existingProductRecord.ecoscore_score,
        // ecoscore_data: existingProductRecord.ecoscore_data, // Se salvato
        nutriments: {
          energy_100g: existingProductRecord.energy_100g,
          energy_kcal_100g: existingProductRecord.energy_kcal_100g,
          fat_100g: existingProductRecord.fat_100g,
          saturated_fat_100g: existingProductRecord.saturated_fat_100g,
        }
      };

      // Controlla se l'analisi AI è presente
      const aiPresent = existingProductRecord.health_score !== undefined && existingProductRecord.health_score !== null;
      let aiAnalysisFromDb: GeminiAnalysisResult | null = null;
      if (aiPresent) {
        aiAnalysisFromDb = {
          healthScore: existingProductRecord.health_score ?? 0,
          sustainabilityScore: existingProductRecord.sustainability_score ?? 0,
          analysis: existingProductRecord.health_analysis ?? '',
          pros: existingProductRecord.health_pros ?? [],
          cons: existingProductRecord.health_cons ?? [],
          recommendations: existingProductRecord.health_recommendations ?? [],
          sustainabilityAnalysis: existingProductRecord.sustainability_analysis ?? '',
          sustainabilityPros: existingProductRecord.sustainability_pros ?? [],
          sustainabilityCons: existingProductRecord.sustainability_cons ?? [],
          sustainabilityRecommendations: existingProductRecord.sustainability_recommendations ?? [],
          suggestedPortionGrams: existingProductRecord.suggested_portion_grams,
          nutriScoreExplanation: existingProductRecord.nutri_score_explanation ?? undefined,
          novaExplanation: existingProductRecord.nova_explanation ?? undefined,
          ecoScoreExplanation: existingProductRecord.eco_score_explanation ?? undefined
        };
      }
      
      console.log(`[PROCESS BARCODE] Dati per ${barcode} recuperati dal DB. AI ${aiPresent ? 'presente' : 'assente'}.`);
      return {
        productData: productDataFromDb,
        aiAnalysis: aiAnalysisFromDb, // Sarà null se AI non presente
        dbProduct: existingProductRecord,
        source: aiPresent ? 'database' : 'database_no_ai', // Nuova source per UI
      };
    }

    console.log(`[PROCESS BARCODE] Prodotto ${barcode} non trovato nel DB. Avvio recupero da OpenFoodFacts.`);
    const rawProductDataFromOFF = await fetchProductFromOpenFoodFacts(barcode);

    if (!rawProductDataFromOFF || !rawProductDataFromOFF.product_name) { 
      console.warn(`[API WARN] Nessun dato trovato su OpenFoodFacts per il barcode: ${barcode} o prodotto senza nome.`);
      return { 
        productData: null, aiAnalysis: null, dbProduct: null, 
        source: 'not_found_off', errorMessage: `Prodotto con barcode ${barcode} non trovato su OpenFoodFacts o dati incompleti.` 
      };
    }
    console.log(`[PROCESS BARCODE] Dati da OFF per ${barcode} recuperati. Salvataggio dati base e cronologia.`);

    // Salva i dati base da OFF, senza AI. uploadedImagePublicUrl sarà l'image_url da OFF.
    // La funzione saveProductAndManageHistory gestirà l'insert/update e la cronologia.
    const savedProductAfterOFF = await saveProductAndManageHistory(
      userId,
      barcode,
      rawProductDataFromOFF,
      null, // AI ANALYSIS è NULL INIZIALMENTE
      rawProductDataFromOFF.image_url, 
      false 
    );

    if (!savedProductAfterOFF) {
        console.error(`[API ERROR] Salvataggio (upsert) del prodotto ${barcode} da OFF (senza AI) fallito.`);
        // Se saveProductAndManageHistory restituisce null, significa che c'è stato un errore nell'upsert.
        return {
            productData: rawProductDataFromOFF, 
            aiAnalysis: null, 
            dbProduct: null, 
            source: 'error', errorMessage: `Salvataggio del prodotto ${barcode} nel database fallito dopo recupero da OFF.`
        };
    }
    console.log(`[PROCESS BARCODE] Prodotto ${barcode} salvato/aggiornato (senza AI specifica in questa fase) con ID: ${savedProductAfterOFF.id}.`);

    // Ora l'UI navigherà e ProductDetailScreen si occuperà di chiamare per l'AI.
    // savedProductAfterOFF contiene lo stato del prodotto dopo l'upsert (potrebbe avere vecchia AI se esisteva)
    return {
      productData: rawProductDataFromOFF, // Dati freschi da OFF
      aiAnalysis: null, // AI non ancora generata/recuperata in questo flusso specifico
      dbProduct: savedProductAfterOFF, // Record del DB dopo l'upsert dei dati base
      source: 'new_scan_off_only', 
    };

  } catch (error) {
    console.error(`[API ERROR] Errore critico in handleBarcodeScan per barcode ${barcode}:`, error);
    return { 
        productData: null, aiAnalysis: null, dbProduct: null, 
        source: 'error', errorMessage: `Errore durante la processazione del barcode ${barcode}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

/**
 * Nuova funzione per ottenere/generare l'analisi AI e aggiornare il prodotto.
 */
export const fetchOrGenerateAiAnalysisAndUpdateProduct = async (
  productRecordId: string,
  userId: string, // Aggiunto userId per coerenza e potenziali controlli futuri
  rawProductDataSource: RawProductData // Dati base del prodotto (da OFF o DB senza AI)
): Promise<GeminiAnalysisResult | null> => {
  console.log(`[API AI FETCH/GEN] Richiesta analisi AI per productRecordId: ${productRecordId}`);
  try {
    // 1. Controlla se l'analisi AI esiste già nel record del prodotto
    const { data: existingProduct, error: selectError } = await supabase
      .from("products")
      .select(
        `
        health_score, 
        sustainability_score, 
        health_analysis, 
        health_pros, 
        health_cons, 
        health_recommendations, 
        sustainability_analysis, 
        sustainability_pros, 
        sustainability_cons, 
        sustainability_recommendations,
        suggested_portion_grams,
        nutri_score_explanation, 
        nova_explanation, 
        eco_score_explanation 
      `
      ) // AGGIUNTO: Campi spiegazione score
      .eq("id", productRecordId)
      .maybeSingle<Pick<
        ProductRecord,
        | "health_score"
        | "sustainability_score"
        | "health_analysis"
        | "health_pros"
        | "health_cons"
        | "health_recommendations"
        | "sustainability_analysis"
        | "sustainability_pros"
        | "sustainability_cons"
        | "sustainability_recommendations"
        | "suggested_portion_grams"
        | "nutri_score_explanation" // AGGIUNTO: Tipo spiegazione score
        | "nova_explanation"        // AGGIUNTO: Tipo spiegazione score
        | "eco_score_explanation"   // AGGIUNTO: Tipo spiegazione score
      >>();

    if (selectError) {
      console.error(`[API AI FETCH/GEN] Errore nel leggere il prodotto ${productRecordId}:`, selectError);
      return null;
    }

    // 2. Se l'analisi esiste ed è completa (es. health_score presente), restituiscila
    if (existingProduct && existingProduct.health_score) {
      console.log(`[API AI FETCH/GEN] Analisi AI trovata nel DB per ${productRecordId}. Restituzione.`);
      // Mappa i campi del DB al formato GeminiAnalysisResult
      return {
        healthScore: existingProduct.health_score,
        sustainabilityScore: existingProduct.sustainability_score ?? 50, // Fallback se non presente
        analysis: existingProduct.health_analysis ?? "",
        pros: existingProduct.health_pros ?? [],
        cons: existingProduct.health_cons ?? [],
        recommendations: existingProduct.health_recommendations ?? [],
        sustainabilityAnalysis: existingProduct.sustainability_analysis ?? "",
        sustainabilityPros: existingProduct.sustainability_pros ?? [],
        sustainabilityCons: existingProduct.sustainability_cons ?? [],
        sustainabilityRecommendations: existingProduct.sustainability_recommendations ?? [],
        suggestedPortionGrams: existingProduct.suggested_portion_grams,
        nutriScoreExplanation: existingProduct.nutri_score_explanation ?? undefined,
        novaExplanation: existingProduct.nova_explanation ?? undefined,
        ecoScoreExplanation: existingProduct.eco_score_explanation ?? undefined
      };
    }

    // 3. Se l'analisi non esiste o è incompleta, genera una nuova analisi
    console.log(`[API AI FETCH/GEN] Analisi AI non trovata o incompleta per ${productRecordId}. Avvio generazione con Gemini.`);
    const aiAnalysis = await analyzeProductWithGemini(rawProductDataSource);

    if (!aiAnalysis) {
      console.error(`[API AI FETCH/GEN] Generazione analisi AI fallita per ${productRecordId}.`);
      return null; // Non c'è analisi da aggiornare
    }

    console.log(`[API AI FETCH/GEN] Analisi AI generata per ${productRecordId}. Aggiornamento DB.`);

    // 4. Aggiorna il record del prodotto nel DB con la nuova analisi
    const { data: updatedProduct, error: updateError } = await supabase
      .from("products")
      .update({
        health_score: aiAnalysis.healthScore,
        sustainability_score: aiAnalysis.sustainabilityScore,
        health_analysis: aiAnalysis.analysis,
        health_pros: aiAnalysis.pros,
        health_cons: aiAnalysis.cons,
        health_recommendations: aiAnalysis.recommendations,
        sustainability_analysis: aiAnalysis.sustainabilityAnalysis,
        sustainability_pros: aiAnalysis.sustainabilityPros,
        sustainability_cons: aiAnalysis.sustainabilityCons,
        sustainability_recommendations: aiAnalysis.sustainabilityRecommendations,
        suggested_portion_grams: aiAnalysis.suggestedPortionGrams,
        nutri_score_explanation: aiAnalysis.nutriScoreExplanation,
        nova_explanation: aiAnalysis.novaExplanation,
        eco_score_explanation: aiAnalysis.ecoScoreExplanation
      })
      .eq("id", productRecordId)
      .select('id')
      .single();

    if (updateError) {
      console.error(`[API AI FETCH/GEN] Errore nell'aggiornare il prodotto ${productRecordId} con l'analisi AI:`, updateError);
      // Considera se restituire comunque l'analisi generata anche se l'update fallisce
      return aiAnalysis; 
    }

    console.log(`[API AI FETCH/GEN] Prodotto ${productRecordId} aggiornato con successo con analisi AI.`);
    return aiAnalysis;

  } catch (error) {
    console.error(`[API AI FETCH/GEN] Eccezione in fetchOrGenerateAiAnalysisAndUpdateProduct per ${productRecordId}:`, error);
    return null;
  }
};

/**
 * Salva gli ingredienti personalizzati di un'analisi foto nel database
 * @param productRecordId L'ID del record del prodotto
 * @param userId L'ID dell'utente
 * @param ingredients Array di ingredienti stimati (modificati dall'utente)
 * @returns Promise<boolean> Success status
 */
export const savePhotoAnalysisIngredients = async (
  productRecordId: string,
  userId: string,
  ingredients: EstimatedIngredient[]
): Promise<boolean> => {
  try {
    if (!supabase) {
      console.error("[SUPABASE ERROR] Client non inizializzato in savePhotoAnalysisIngredients");
      return false;
    }

    // Verifichiamo prima se la colonna quantity esiste nella tabella
    let hasQuantityColumn = true;
    try {
      // Eseguiamo una query di verifica sulla struttura della tabella
      const { data: columnInfo, error: columnError } = await supabase.rpc('get_column_info', {
        table_name: 'photo_analysis_ingredients',
        column_name: 'quantity'
      });
      
      if (columnError || !columnInfo || columnInfo.length === 0) {
        console.log("[SUPABASE INFO] La colonna 'quantity' potrebbe non esistere o non essere visibile:", columnError);
        hasQuantityColumn = false;
      } else {
        console.log("[SUPABASE INFO] La colonna 'quantity' è presente nella tabella");
      }
    } catch (e) {
      // Se la funzione RPC non esiste, assumiamo che non possiamo verificare
      console.log("[SUPABASE INFO] Non è stato possibile verificare l'esistenza della colonna 'quantity':", e);
    }

    // Prima rimuoviamo gli ingredienti esistenti (se ce ne sono)
    const { error: deleteError } = await supabase
      .from('photo_analysis_ingredients')
      .delete()
      .eq('product_record_id', productRecordId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error("[SUPABASE ERROR] Errore durante l'eliminazione degli ingredienti esistenti:", deleteError);
      return false;
    }

    // Se non ci sono ingredienti da salvare, terminiamo
    if (!ingredients || ingredients.length === 0) {
      console.log("[SUPABASE INFO] Nessun ingrediente da salvare per productId:", productRecordId);
      return true;
    }

    // Prepariamo i dati per l'inserimento
    const ingredientsToInsert = ingredients.map(ingredient => {
      // Creiamo prima un oggetto base senza quantity
      const baseIngredient = {
      product_record_id: productRecordId,
      user_id: userId,
      original_ai_ingredient_id: ingredient.id.startsWith('user_') ? null : ingredient.id,
      ingredient_name: ingredient.name,
      user_defined_weight_g: ingredient.estimated_weight_g,
      user_defined_calories_kcal: ingredient.estimated_calories_kcal
      };
      
      // Proviamo prima ad aggiungere senza quantity per verificare se la colonna esiste nel DB
      try {
        // Se la proprietà quantity è definita, proviamo ad aggiungerla all'oggetto
        if (ingredient.quantity !== undefined) {
          return {
            ...baseIngredient,
            quantity: ingredient.quantity || 1
          };
        }
        return baseIngredient;
      } catch (e) {
        console.log("[SUPABASE WORKAROUND] Non è stato possibile includere quantity, uso solo i campi base");
        return baseIngredient;
      }
    });

    // Se la colonna non è disponibile, filtriamo la proprietà quantity
    let finalIngredientsToInsert = ingredientsToInsert;
    if (!hasQuantityColumn) {
      console.log("[SUPABASE WORKAROUND] Rimuovo il campo quantity da tutti gli ingredienti prima dell'inserimento");
      finalIngredientsToInsert = ingredientsToInsert.map(ing => {
        // Creiamo una copia senza quantity
        const { quantity, ...restOfIngredient } = ing as any;
        return restOfIngredient;
      });
    }

    // Inseriamo i nuovi ingredienti
    const { error: insertError } = await supabase
      .from('photo_analysis_ingredients')
      .insert(finalIngredientsToInsert);

    if (insertError) {
      console.error("[SUPABASE ERROR] Errore durante l'inserimento dei nuovi ingredienti:", insertError);
      
      // Se l'errore contiene "quantity" nel messaggio, tentiamo di nuovo senza quantity
      if (insertError.message?.includes('quantity') && hasQuantityColumn) {
        console.log("[SUPABASE RETRY] Riprovo senza il campo quantity per errore specifico sulla colonna");
        
        // Rimuoviamo quantity da tutti gli ingredienti
        const ingredientsWithoutQuantity = ingredientsToInsert.map(ing => {
          const { quantity, ...restOfIngredient } = ing as any;
          return restOfIngredient;
        });
        
        // Proviamo di nuovo l'inserimento
        const { error: retryError } = await supabase
          .from('photo_analysis_ingredients')
          .insert(ingredientsWithoutQuantity);
          
        if (retryError) {
          console.error("[SUPABASE ERROR] Errore anche nel secondo tentativo:", retryError);
          return false;
        } else {
          console.log("[SUPABASE SUCCESS] Inserimento riuscito al secondo tentativo (senza quantity)");
          return true;
        }
      }
      
      return false;
    }

    console.log(`[SUPABASE SUCCESS] Salvati ${ingredients.length} ingredienti personalizzati per productId: ${productRecordId}`);
    return true;
  } catch (error) {
    console.error("[SUPABASE ERROR] Errore in savePhotoAnalysisIngredients:", error);
    return false;
  }
};

/**
 * Carica gli ingredienti personalizzati di un'analisi foto dal database
 * @param productRecordId L'ID del record del prodotto
 * @param userId L'ID dell'utente
 * @returns Promise<EstimatedIngredient[] | null> Array di ingredienti o null se non trovati
 */
export const loadPhotoAnalysisIngredients = async (
  productRecordId: string,
  userId: string
): Promise<EstimatedIngredient[] | null> => {
  try {
    if (!supabase) {
      console.error("[SUPABASE ERROR] Client non inizializzato in loadPhotoAnalysisIngredients");
      return null;
    }

    // Carichiamo gli ingredienti personalizzati
    const { data, error } = await supabase
      .from('photo_analysis_ingredients')
      .select('*')
      .eq('product_record_id', productRecordId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("[SUPABASE ERROR] Errore durante il caricamento degli ingredienti personalizzati:", error);
      return null;
    }

    if (!data || data.length === 0) {
      console.log("[SUPABASE INFO] Nessun ingrediente personalizzato trovato per productId:", productRecordId);
      return null;
    }

    // Convertiamo i dati dal formato del DB al formato EstimatedIngredient
    const ingredients: EstimatedIngredient[] = data.map(item => ({
      id: item.original_ai_ingredient_id || `user_${item.id}`, // Usa l'ID originale dell'AI se disponibile, altrimenti crea un ID utente
      name: item.ingredient_name,
      estimated_weight_g: item.user_defined_weight_g,
      estimated_calories_kcal: item.user_defined_calories_kcal,
      quantity: item.quantity || 1 // Aggiungiamo la quantità dal DB, o 1 come valore predefinito
    }));

    console.log(`[SUPABASE SUCCESS] Caricati ${ingredients.length} ingredienti personalizzati per productId: ${productRecordId}`);
    return ingredients;
  } catch (error) {
    console.error("[SUPABASE ERROR] Errore in loadPhotoAnalysisIngredients:", error);
    return null;
  }
};

// Aggiorniamo la funzione saveProductToDatabase per gestire anche il salvataggio degli ingredienti 
// personalizzati quando si salva un'analisi foto
// Estende il `saveProductToDatabase` esistente per gestire anche gli ingredienti personalizzati
export const saveProductWithIngredients = async (productData: RawProductData, userId: string, analysisResult: GeminiAnalysisResult | null, isPhotoAnalysis: boolean = false, editableIngredients: EstimatedIngredient[] | null = null): Promise<string | null> => {
  try {
    if (!supabase) {
      console.error("[SUPABASE ERROR] Client non inizializzato")
      return null
    }

    // Prima salviamo il prodotto
    // Assumiamo che qui venga chiamata una funzione che salva il prodotto nel database e restituisce l'ID
    // Nota: dal codice precedente, questa funzione potrebbe essere handleBarcodeScan o saveProductAndManageHistory
    let productId: string | null = null;
    
    // Se è un'analisi foto con barcode temporaneo, dobbiamo usare un approccio diverso
    if (isPhotoAnalysis && productData.code === 'temp_visual_scan') {
      // Ottieni un barcode temporaneo unico ma consistente
      const tempBarcode = generateVisualScanBarcode();
      
      // Salva il prodotto con il barcode temporaneo
      const savedProduct = await saveProductAndManageHistory(
        userId, 
        tempBarcode, 
        productData, 
        analysisResult, 
        productData.image_url, 
        true // isVisualScan = true
      );
      
      if (savedProduct) {
        productId = savedProduct.id;
      }
    } else {
      // Per prodotti normali o prodotti già nel db
      // handleBarcodeScan restituisce ProcessedProductInfo, non direttamente ProductRecord
      const productInfo = await handleBarcodeScan(productData.code, userId);
      if (productInfo && productInfo.dbProduct) {
        productId = productInfo.dbProduct.id;
      }
    }
    
    // Se il salvataggio del prodotto è riuscito e abbiamo ingredienti personalizzati, li salviamo
    if (isPhotoAnalysis && productId && editableIngredients && editableIngredients.length > 0) {
      console.log("[SUPABASE INFO] Salvataggio ingredienti personalizzati per analisi foto");
      await savePhotoAnalysisIngredients(productId, userId, editableIngredients);
    }
    
    return productId
  } catch (error) {
    console.error("[SUPABASE ERROR] Errore in saveProductWithIngredients:", error)
    return null
  }
}

/**
 * Verifica se il codice del prodotto è generato da una scansione visiva
 */
export const isProductFromVisualScan = (barcode: string): boolean => {
  return barcode.startsWith('VISUAL_');
};

/**
 * Salva un prodotto nel database, includendo l'analisi AI se fornita
 */
export const saveProductToDatabase = async (
  product: RawProductData,
  userId: string,
  aiAnalysis: GeminiAnalysisResult | null
): Promise<string | null> => {
  try {
    if (!supabase) {
      console.error("[SUPABASE ERROR] Client non inizializzato")
      return null
    }

    // Base del payload (dati essenziali e generali)
    const basePayload: Record<string, any> = {
      barcode: product.code,
      product_name: product.product_name || "Prodotto senza nome",
      brands: product.brands || null,
      is_visually_analyzed: isProductFromVisualScan(product.code),
      user_id: userId, // Necessario per relazioni e permissioni
      last_scanned_at: new Date().toISOString(),
    }

    // Se l'analisi AI è fornita, incorporala nel payload
    if (aiAnalysis) {
      console.log("[API SAVE UPSERT] aiAnalysis fornito. Inclusione dei campi AI nel payload per", product.code)
      
      // Aggiungiamo campi salute/sostenibilità
      Object.assign(basePayload, {
        health_score: aiAnalysis.healthScore,
        health_analysis: aiAnalysis.analysis,
        sustainability_score: aiAnalysis.sustainabilityScore || null,
        sustainability_analysis: aiAnalysis.sustainabilityAnalysis || "",
        
        // Converti array in stringhe JSON per il DB
        health_pros: Array.isArray(aiAnalysis.pros) ? aiAnalysis.pros.map(p => JSON.stringify(p)) : [],
        health_cons: Array.isArray(aiAnalysis.cons) ? aiAnalysis.cons.map(c => JSON.stringify(c)) : [],
        health_recommendations: aiAnalysis.recommendations || [],
        
        // Sostenibilità (opzionale, potrebbe non essere presente per alcuni tipi di analisi)
        sustainability_pros: Array.isArray(aiAnalysis.sustainabilityPros) ? aiAnalysis.sustainabilityPros.map(p => JSON.stringify(p)) : [],
        sustainability_cons: Array.isArray(aiAnalysis.sustainabilityCons) ? aiAnalysis.sustainabilityCons.map(c => JSON.stringify(c)) : [],
        sustainability_recommendations: aiAnalysis.sustainabilityRecommendations || [],
        
        // Spiegazioni score
        nutri_score_explanation: aiAnalysis.nutriScoreExplanation || null,
        nova_explanation: aiAnalysis.novaExplanation || null,
        eco_score_explanation: aiAnalysis.ecoScoreExplanation || null,
        
        // Metri specifici
        suggested_portion_grams: aiAnalysis.suggestedPortionGrams || null,
        
        // Valori determinati dalla visione
        product_name_from_vision: aiAnalysis.productNameFromVision || null,
        brand_from_vision: aiAnalysis.brandFromVision || null,
        
        // Campi specifici per analisi calorie in foto
        calories_estimate: aiAnalysis.calories_estimate || null,
        calorie_estimation_type: aiAnalysis.calorie_estimation_type || null, 
        ingredients_breakdown: aiAnalysis.ingredients_breakdown ? JSON.stringify(aiAnalysis.ingredients_breakdown) : null
      })
      
      console.log("[DB SAVE INFO] Saving calorie_estimation_type:", aiAnalysis.calorie_estimation_type)
      console.log("[DB SAVE INFO] Saving ingredients_breakdown:", aiAnalysis.ingredients_breakdown ? JSON.stringify(aiAnalysis.ingredients_breakdown).substring(0, 50) + "..." : "null")
    }

    // Esegui l'upsert del prodotto
    const { data: productData, error: productError } = await supabase
      .from('products')
      .upsert(basePayload)
      .select('id')
      .single();

    if (productError) {
      console.error("[DB ERROR] Errore nell'upsert del prodotto:", productError);
      return null;
    }

    console.log(`[DB SUCCESS] Prodotto UPSERTED (ID: ${productData.id}) in 'products'.`);
    console.log(`[DB SUCCESS] Dettagli salvati: EcoScore Grade: ${basePayload.ecoscore_grade || ''}, AI Health Score: ${basePayload.health_score}, Visually Analyzed: ${basePayload.is_visually_analyzed}`);

    // Aggiorna la cronologia dell'utente
    const { error: historyError } = await supabase
      .from('user_scan_history')
      .upsert({
        user_id: userId,
        product_id: productData.id,
        scanned_at: new Date().toISOString()
      });

    if (historyError) {
      console.error("[DB ERROR] Errore nell'aggiornamento della cronologia:", historyError);
      // Non fallire completamente se solo la cronologia non può essere aggiornata
    } else {
      console.log(`[DB SUCCESS] Cronologia aggiornata per prodotto ${productData.id}.`);
    }

    return productData.id;
  } catch (error) {
    console.error("[DB ERROR] Eccezione nella funzione saveProductToDatabase:", error);
    return null;
  }
}

/**
 * Aggiorna gli ingredienti di un prodotto nel database e salva la stima delle calorie e valori nutrizionali
 * @param productId ID del prodotto da aggiornare
 * @param ingredients Array di ingredienti stimati
 * @param caloriesEstimate Stringa con stima delle calorie (es. "Totale: ~550 kcal")
 * @returns true se l'aggiornamento è riuscito, false altrimenti
 */
export const updateProductIngredientsInDb = async (
  productId: string,
  ingredients: EstimatedIngredient[],
  caloriesEstimate: string
): Promise<boolean> => {
  if (!productId || !ingredients || ingredients.length === 0) {
    console.error('[updateProductIngredientsInDb] Dati mancanti per aggiornamento:', { productId, ingredients });
    return false;
  }
  
  try {
    // Calcola i totali dei valori nutrizionali
    const totalProteins = ingredients.reduce((acc, ing) => acc + ((ing.estimated_proteins_g || 0) * (ing.quantity || 1)), 0);
    const totalCarbs = ingredients.reduce((acc, ing) => acc + ((ing.estimated_carbs_g || 0) * (ing.quantity || 1)), 0);
    const totalFats = ingredients.reduce((acc, ing) => acc + ((ing.estimated_fats_g || 0) * (ing.quantity || 1)), 0);
    
    // Arrotonda a 1 decimale
    const roundedProteins = Number(totalProteins.toFixed(1));
    const roundedCarbs = Number(totalCarbs.toFixed(1));
    const roundedFats = Number(totalFats.toFixed(1));
    
    console.log(`[updateProductIngredientsInDb] Valori nutrizionali calcolati: Proteine=${roundedProteins}g, Carb=${roundedCarbs}g, Grassi=${roundedFats}g`);

    const { data, error } = await supabase
      .from('products')
      .update({
        ingredients_breakdown: JSON.stringify(ingredients),
        calories_estimate: caloriesEstimate,
        calorie_estimation_type: 'breakdown',
        // Aggiungiamo i valori nutrizionali stimati dall'AI
        proteins_100g: roundedProteins,
        carbohydrates_100g: roundedCarbs,
        fat_100g: roundedFats,
        // Flag per indicare che i valori nutrizionali sono stimati dall'AI
        has_estimated_nutrition: true
      })
      .eq('id', productId);

    if (error) {
      console.error('[updateProductIngredientsInDb] Errore update Supabase:', error);
      return false;
    }
    
    console.log('[updateProductIngredientsInDb] Aggiornamento riuscito per productId:', productId);
    return true;
  } catch (error) {
    console.error('[updateProductIngredientsInDb] Errore:', error);
    return false;
  }
};

// Funzione di utilità per log lato server (placeholder, implementare se necessario)
const logServer = (message: string) => {
  // console.log(`SERVER LOG: ${message}`);
};
