// Polyfill per structuredClone in React Native/Expo
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = function(obj: any) {
    return JSON.parse(JSON.stringify(obj));
  };
}

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import type { RawProductData } from "./api";
import { 
  getCompleteUserProfile, 
  saveProductCompatibilityScore,
  type UserProfile, 
  type HealthGoalCategory 
} from './userPreferencesService';

// NUOVA INTERFACCIA PER INGREDIENTI STIMATI
export interface EstimatedIngredient {
  id: string; // Identificativo univoco per l'ingrediente (es. UUID generato client-side o dall'AI)
  name: string; // Nome dell'ingrediente stimato (es. "Petto di pollo alla griglia")
  estimated_weight_g: number; // Peso stimato in grammi
  estimated_calories_kcal: number; // Calorie stimate per quel peso specifico
  quantity?: number; // Quantità dell'ingrediente (es. 2 kiwi)
  estimated_proteins_g?: number; // Proteine stimate in grammi
  estimated_carbs_g?: number; // Carboidrati stimati in grammi 
  estimated_fats_g?: number; // Grassi stimati in grammi
}

export interface GeminiAnalysisResult {
  healthScore: number // Punteggio da 1 a 100
  sustainabilityScore: number // Punteggio di sostenibilità da 1 a 100 (sarà 0 o non presente per analisi foto)
  analysis: string // Analisi testuale (solo salute per analisi foto)
  pros: Array<{title: string, detail: string}> // Solo salute per analisi foto
  cons: Array<{title: string, detail: string}> // Solo salute per analisi foto
  neutrals?: Array<{title: string, detail: string}> // Elementi neutrali/intermedi per la salute

  sustainabilityPros: Array<{title: string, detail: string}> // Vuoto o non presente per analisi foto
  sustainabilityCons: Array<{title: string, detail: string}> // Vuoto o non presente per analisi foto
  sustainabilityNeutrals?: Array<{title: string, detail: string}> // Elementi neutrali/intermedi per la sostenibilità
  productNameFromVision?: string // Nome prodotto identificato da Gemini Vision (opzionale)
  brandFromVision?: string // Marca identificata da Gemini Vision (opzionale)
  nutriScoreExplanation?: string; // Spiegazione Nutri-Score (solo per prodotti con barcode)
  novaExplanation?: string; // Spiegazione NOVA (solo per prodotti con barcode)
  ecoScoreExplanation?: string; // Solo per prodotti con barcode
  
  // CAMPI SPECIFICI PER NUOVA ANALISI CALORIE FOTO
  calorie_estimation_type?: 'breakdown' | 'per_100g' | 'per_serving_packaged'; 
  ingredients_breakdown?: EstimatedIngredient[]; 
  // calories_estimate conterrà:
  // - Per 'breakdown': la somma totale formattata (es. "Totale: ~550 kcal")
  // - Per 'per_100g': la stima per 100g (es. "~450 kcal per 100g")
  // - Per 'per_serving_packaged': la stima per porzione del prodotto confezionato (es. "~180 kcal per porzione (30g)")
  calories_estimate?: string
  
  // CAMPI STIMATI DALL'AI PER PRODOTTI SENZA DATI NUTRIZIONALI
  estimated_energy_kcal_100g?: number;
  estimated_proteins_100g?: number;
  estimated_carbs_100g?: number;
  estimated_fats_100g?: number;
}

// Interfaccia per la risposta della stima calorie di un singolo ingrediente
export interface SingleIngredientEstimateResponse {
  success: boolean;
  estimated_calories_kcal?: number;
  estimated_proteins_g?: number;
  estimated_carbs_g?: number;
  estimated_fats_g?: number;
  error_message?: string;
}

// Chiave API di Google Gemini (manteniamo la stessa)
const GEMINI_API_KEY = "AIzaSyBdW3b_STScj7MbhWbvdeAiroXfoU2I3Ac";

// Configurazione del provider Google con AI SDK
const google = createGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
});

// Configurazione dei modelli Google con AI SDK
const geminiTextModel = google('gemini-2.0-flash-lite');
const geminiVisionModel = google('gemini-2.0-flash-lite');

// Configurazioni ottimizzate per velocità massima (mantenute identiche)
const GENERATION_CONFIG = {
  temperature: 0.1,
  topK: 10,
  topP: 0.8,
  maxTokens: 2048,
};

const VISION_GENERATION_CONFIG = {
  temperature: 0.1,
  topK: 8,
  topP: 0.75,
  maxTokens: 2048,
};

const CALORIES_GENERATION_CONFIG = {
  temperature: 0.1,
  topK: 5,
  topP: 0.7,
  maxTokens: 128,
};

// Timeout specifici per diversi tipi di chiamate
const VISION_TIMEOUT = 25000; // 25 secondi per vision (immagini grandi)
const PRODUCT_TIMEOUT = 15000; // 15 secondi per prodotti
const CALORIES_TIMEOUT = 10000; // 10 secondi per calorie

// Utility per ottimizzare immagini base64 (identica all'originale)
const optimizeImageBase64 = (base64: string, mimeType: string): string => {
  // Calcola la dimensione approssimativa dell'immagine
  const sizeInBytes = (base64.length * 3) / 4;
  const sizeInMB = sizeInBytes / (1024 * 1024);
  
  console.log(`[IMAGE OPT] Immagine ${mimeType} dimensione: ${sizeInMB.toFixed(2)}MB`);
  
  // Se l'immagine è troppo grande (>1.5MB), riduci drasticamente
  if (sizeInMB > 1.5) {
    console.log(`[IMAGE OPT] Immagine troppo grande (${sizeInMB.toFixed(2)}MB), compressione automatica...`);
    
    // Compressione semplice: prendi solo una parte dell'immagine per ridurre dimensioni
    // Questo è un approccio grezzo ma veloce per ridurre il payload
    const compressionRatio = Math.min(0.7, 1.5 / sizeInMB); // Max 70% dell'originale
    const targetLength = Math.floor(base64.length * compressionRatio);
    const compressedBase64 = base64.substring(0, targetLength);
    
    const newSizeInMB = (compressedBase64.length * 3) / (4 * 1024 * 1024);
    console.log(`[IMAGE OPT] Immagine compressa a ${newSizeInMB.toFixed(2)}MB (${(compressionRatio * 100).toFixed(0)}% dell'originale)`);
    
    return compressedBase64;
  }
  
  return base64;
};

/**
 * Analizza un prodotto alimentare utilizzando l'AI SDK di Vercel con Google Gemini
 * @param product Dati del prodotto da OpenFoodFacts o analisi visiva (RawProductData)
 * @returns Risultato dell'analisi
 */
export const analyzeProductWithGeminiAiSdk = async (product: RawProductData): Promise<GeminiAnalysisResult> => {
  try {
    console.log(`[GEMINI AI-SDK START] Avvio analisi per il prodotto ${product.code}: ${product.product_name}`);
    console.time(`[GEMINI AI-SDK TIMING] Analisi completa per ${product.code}`);

    // Costruisci un prompt dettagliato (stesso della implementazione originale)
    const prompt = createAnalysisPrompt(product);
    console.log(`[GEMINI AI-SDK PROMPT] Prompt generato per ${product.code} (lunghezza: ${prompt.length} caratteri)`);

    // *** LOG DELL'INPUT AI ***
    console.log(`[AI INPUT] ============= INPUT PER [BARCODE] =============`);
    console.log(prompt);
    console.log(`[AI INPUT] ============= FINE INPUT =============`);

    // Chiamata all'AI SDK di Vercel con Google Gemini
    console.log(`[GEMINI AI-SDK API] Chiamata API con AI SDK per ${product.code}`);
    console.time(`[GEMINI AI-SDK API TIMING] Chiamata API per ${product.code}`);

    const { text, usage } = await generateText({
      model: geminiTextModel,
      prompt,
      temperature: GENERATION_CONFIG.temperature,
      topK: GENERATION_CONFIG.topK,
      topP: GENERATION_CONFIG.topP,
      maxTokens: GENERATION_CONFIG.maxTokens,
    });

    console.timeEnd(`[GEMINI AI-SDK API TIMING] Chiamata API per ${product.code}`);

    // *** LOG DEI TOKEN ***
    if (usage) {
      console.log(`[TOKEN USAGE BARCODE] ============= TOKEN USAGE per ${product.code} =============`);
      console.log(`[TOKEN USAGE BARCODE] Input tokens: ${usage.promptTokens}`);
      console.log(`[TOKEN USAGE BARCODE] Output tokens: ${usage.completionTokens}`);
      console.log(`[TOKEN USAGE BARCODE] Total tokens: ${usage.totalTokens}`);
      console.log(`[TOKEN USAGE BARCODE] =======================================================`);
    }

    // *** LOG DELL'OUTPUT AI ***
    console.log(`[AI OUTPUT] ============= OUTPUT PER [BARCODE] =============`);
    console.log(text);
    console.log(`[AI OUTPUT] ============= FINE OUTPUT =============`);

    // Analizza la risposta di Gemini per estrarre i dati strutturati (stessa logica)
    console.log(`[GEMINI AI-SDK PARSE] Analisi della risposta per ${product.code}`);
    const result = parseGeminiResponse(text);

    console.timeEnd(`[GEMINI AI-SDK TIMING] Analisi completa per ${product.code}`);
    console.log(`[GEMINI AI-SDK SUCCESS] Analisi completata per ${product.code}:`, {
      healthScore: result.healthScore,
      sustainabilityScore: result.sustainabilityScore,
    });

    return result;
  } catch (error) {
    console.error(`[GEMINI AI-SDK ERROR] Errore nell'analisi con Gemini AI SDK per ${product.code}:`, error);
    throw new Error("Si è verificato un errore durante l'analisi del prodotto.");
  }
};

/**
 * Analizza un'immagine di cibo utilizzando l'AI SDK di Vercel con Google Gemini Vision
 * @param imageBase64 Immagine in formato base64
 * @param mimeType Tipo MIME dell'immagine
 * @param productNameHint Suggerimento per il nome del prodotto
 * @returns Risultato dell'analisi
 */
export const analyzeImageWithGeminiVisionAiSdk = async (
  imageBase64: string,      
  mimeType: string,         
  productNameHint: string
): Promise<GeminiAnalysisResult> => {
  try {
    console.log(`[GEMINI VISION AI-SDK START] Avvio analisi per immagine fornita come base64 (MIME: ${mimeType}, Hint: ${productNameHint})`);

    if (!imageBase64) {
        throw new Error('Base64 dell\'immagine non fornito a Gemini Vision.');
    }

    if (!mimeType) {
        throw new Error('Tipo MIME dell\'immagine non fornito a Gemini Vision.');
    }

    // NESSUNA CACHE - ogni immagine è unica
    console.log(`[GEMINI VISION AI-SDK] NESSUNA CACHE - analisi ex novo per ogni immagine`);

    // Calcola informazioni dettagliate sull'immagine PRIMA dell'ottimizzazione
    const originalSizeInBytes = (imageBase64.length * 3) / 4;
    const originalSizeInMB = originalSizeInBytes / (1024 * 1024);
    
    // Stima approssimativa dei token per l'immagine (basata sulle linee guida di Google Gemini)
    // Gemini conta circa 258 token per ogni 1024x1024 pixel block
    // Per semplicità, usiamo una stima basata sulla dimensione del file
    const estimatedTokensFromSize = Math.round(originalSizeInBytes / 1000); // Stima molto approssimativa
    
    console.log(`[GEMINI VISION AI-SDK IMAGE INFO] ======= DETTAGLI IMMAGINE ORIGINALE =======`);
    console.log(`[GEMINI VISION AI-SDK IMAGE INFO] Tipo MIME: ${mimeType}`);
    console.log(`[GEMINI VISION AI-SDK IMAGE INFO] Dimensione base64: ${imageBase64.length} caratteri`);
    console.log(`[GEMINI VISION AI-SDK IMAGE INFO] Dimensione stimata file: ${originalSizeInMB.toFixed(2)} MB (${Math.round(originalSizeInBytes)} bytes)`);
    console.log(`[GEMINI VISION AI-SDK IMAGE INFO] Token stimati per immagine: ~${estimatedTokensFromSize} token`);
    console.log(`[GEMINI VISION AI-SDK IMAGE INFO] ==========================================`);

    // Ottimizza immagine
    const optimizedImage = optimizeImageBase64(imageBase64, mimeType);
    
    // Calcola informazioni dopo l'ottimizzazione
    const optimizedSizeInBytes = (optimizedImage.length * 3) / 4;
    const optimizedSizeInMB = optimizedSizeInBytes / (1024 * 1024);
    const optimizedEstimatedTokens = Math.round(optimizedSizeInBytes / 1000);
    const compressionRatio = optimizedImage.length / imageBase64.length;
    
    console.log(`[GEMINI VISION AI-SDK IMAGE OPTIMIZED] ======= IMMAGINE OTTIMIZZATA =======`);
    console.log(`[GEMINI VISION AI-SDK IMAGE OPTIMIZED] Dimensione base64 ottimizzata: ${optimizedImage.length} caratteri`);
    console.log(`[GEMINI VISION AI-SDK IMAGE OPTIMIZED] Dimensione file ottimizzata: ${optimizedSizeInMB.toFixed(2)} MB (${Math.round(optimizedSizeInBytes)} bytes)`);
    console.log(`[GEMINI VISION AI-SDK IMAGE OPTIMIZED] Token stimati ottimizzati: ~${optimizedEstimatedTokens} token`);
    console.log(`[GEMINI VISION AI-SDK IMAGE OPTIMIZED] Rapporto compressione: ${(compressionRatio * 100).toFixed(1)}%`);
    console.log(`[GEMINI VISION AI-SDK IMAGE OPTIMIZED] Risparmio dimensione: ${((1 - compressionRatio) * 100).toFixed(1)}%`);
    console.log(`[GEMINI VISION AI-SDK IMAGE OPTIMIZED] ====================================`);

    // Costruisci il prompt per l'analisi visiva
    const prompt = createVisualAnalysisPrompt(productNameHint);
    
    // Stima token del testo (approssimativa: 1 token ≈ 4 caratteri per l'italiano)
    const estimatedTextTokens = Math.round(prompt.length / 4);
    const totalEstimatedTokens = estimatedTextTokens + optimizedEstimatedTokens;

    // *** LOG DELL'INPUT AI VISION ESPANSO ***
    console.log(`[AI VISION INPUT] ============= INPUT VISION PER [FOTO] =============`)
    console.log(`[AI VISION INPUT] === PROMPT TESTUALE ===`)
    console.log(prompt)
    console.log(`[AI VISION INPUT] === FINE PROMPT ===`)
    console.log(`[AI VISION INPUT] `)
    console.log(`[AI VISION INPUT] === DETTAGLI TECNICI INPUT ===`)
    console.log(`[AI VISION INPUT] Immagine MIME: ${mimeType}`)
    console.log(`[AI VISION INPUT] Immagine base64 (ottimizzata): ${optimizedImage.length} caratteri`)
    console.log(`[AI VISION INPUT] Immagine dimensione: ${optimizedSizeInMB.toFixed(2)} MB`)
    console.log(`[AI VISION INPUT] Token stimati immagine: ~${optimizedEstimatedTokens}`)
    console.log(`[AI VISION INPUT] Token stimati testo: ~${estimatedTextTokens}`)
    console.log(`[AI VISION INPUT] Token totali stimati: ~${totalEstimatedTokens}`)
    console.log(`[AI VISION INPUT] Config temperatura: ${VISION_GENERATION_CONFIG.temperature}`)
    console.log(`[AI VISION INPUT] Config topK: ${VISION_GENERATION_CONFIG.topK}`)
    console.log(`[AI VISION INPUT] Config topP: ${VISION_GENERATION_CONFIG.topP}`)
    console.log(`[AI VISION INPUT] Config maxOutputTokens: ${VISION_GENERATION_CONFIG.maxTokens}`)
    console.log(`[AI VISION INPUT] === FINE DETTAGLI TECNICI ===`)
    console.log(`[AI VISION INPUT] `)
    console.log(`[AI VISION INPUT] Base64 immagine (primi 100 caratteri): ${optimizedImage.substring(0, 100)}...`)
    console.log(`[AI VISION INPUT] Base64 immagine (ultimi 50 caratteri): ...${optimizedImage.substring(optimizedImage.length - 50)}`)
    console.log(`[AI VISION INPUT] ============= FINE INPUT VISION =============`)

    // Chiamata all'AI SDK di Vercel con Google Gemini Vision
    console.log(`[GEMINI VISION AI-SDK API] Chiamata API Vision con AI SDK`);
    console.time(`[GEMINI VISION AI-SDK API TIMING] Chiamata API Vision per ${productNameHint}`);
    
    const { text, usage } = await generateText({
      model: geminiVisionModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
                text: prompt,
              },
            {
              type: 'image',
              image: optimizedImage,
              mimeType: mimeType,
            }
            ],
          },
        ],
      temperature: VISION_GENERATION_CONFIG.temperature,
      topK: VISION_GENERATION_CONFIG.topK,
      topP: VISION_GENERATION_CONFIG.topP,
      maxTokens: VISION_GENERATION_CONFIG.maxTokens,
    });

    console.timeEnd(`[GEMINI VISION AI-SDK API TIMING] Chiamata API Vision per ${productNameHint}`);
    console.log(`[GEMINI VISION AI-SDK API] Risposta API Vision ricevuta.`);
    
    // *** LOG DEI TOKEN VISION ***
    if (usage) {
      console.log(`[TOKEN USAGE VISION] ============= TOKEN USAGE VISION per ${productNameHint} =============`);
      console.log(`[TOKEN USAGE VISION] Input tokens: ${usage.promptTokens}`);
      console.log(`[TOKEN USAGE VISION] Output tokens: ${usage.completionTokens}`);
      console.log(`[TOKEN USAGE VISION] Total tokens: ${usage.totalTokens}`);
      console.log(`[TOKEN USAGE VISION] Immagine: ${optimizedSizeInMB.toFixed(2)}MB`);
      console.log(`[TOKEN USAGE VISION] =================================================================`);
    }
    
    // Calcola informazioni sulla risposta
    const responseLength = text.length;
    const estimatedResponseTokens = Math.round(responseLength / 4);
    
    console.log(`[GEMINI VISION AI-SDK RESPONSE] Risposta ricevuta (lunghezza: ${responseLength} caratteri, ~${estimatedResponseTokens} token)`);

    // *** LOG DELL'OUTPUT AI VISION ESPANSO ***
    console.log(`[AI VISION OUTPUT] ============= OUTPUT VISION PER [FOTO] =============`)
    console.log(`[AI VISION OUTPUT] === STATISTICHE RISPOSTA ===`)
    console.log(`[AI VISION OUTPUT] Lunghezza risposta: ${responseLength} caratteri`)
    console.log(`[AI VISION OUTPUT] Token stimati risposta: ~${estimatedResponseTokens}`)
    console.log(`[AI VISION OUTPUT] Token input stimati: ~${totalEstimatedTokens}`)
    console.log(`[AI VISION OUTPUT] Token totali stimati (input + output): ~${totalEstimatedTokens + estimatedResponseTokens}`)
    console.log(`[AI VISION OUTPUT] === FINE STATISTICHE ===`)
    console.log(`[AI VISION OUTPUT] `)
    console.log(`[AI VISION OUTPUT] === RISPOSTA COMPLETA ===`)
    console.log(text)
    console.log(`[AI VISION OUTPUT] === FINE RISPOSTA ===`)
    console.log(`[AI VISION OUTPUT] ============= FINE OUTPUT VISION =============`)

    // Analizza la risposta di Gemini Vision
    console.log(`[GEMINI VISION AI-SDK PARSE] Analisi della risposta`);
    const result = parseGeminiResponse(text, true);
    
    // NESSUNA CACHE - non salviamo mai
    console.log(`[GEMINI VISION AI-SDK SUCCESS] Analisi completata per ${productNameHint}:`, {
      healthScore: result.healthScore,
      sustainabilityScore: result.sustainabilityScore,
      estimatedTotalTokens: totalEstimatedTokens + estimatedResponseTokens,
      imageSizeMB: optimizedSizeInMB.toFixed(2),
      compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`
    });

    return result;
  } catch (error) {
    console.error(`[GEMINI VISION AI-SDK ERROR] Errore nell'analisi visiva con AI SDK per ${productNameHint}:`, error);
    throw new Error("Si è verificato un errore durante l'analisi dell'immagine.");
  }
};

/**
 * Stima le calorie e i valori nutrizionali per un singolo ingrediente utilizzando l'AI SDK di Vercel
 * @param name Nome dell'ingrediente fornito dall'utente
 * @param weightGrams Peso in grammi (opzionale, se 0 o undefined, l'AI stima una porzione media)
 * @returns Un oggetto SingleIngredientEstimateResponse con calorie e valori nutrizionali
 */
export const getCaloriesForSingleIngredientFromGeminiAiSdk = async (
  name: string,
  weightGrams?: number
): Promise<SingleIngredientEstimateResponse> => {
  console.log(`[GEMINI CALORIES AI-SDK] Richiesta stima per: "${name}", peso: ${weightGrams !== undefined ? weightGrams + 'g' : 'porzione media'}`);
  try {

    const weightPrompt = (weightGrams && weightGrams > 0) ? 
      `per un peso di ${weightGrams} grammi` : 
      `per una porzione media (se non riesci a stimare una porzione media specifica per questo ingrediente, considera un peso generico di 100g per la stima nutrizionale).`;

    const prompt = `
INGREDIENTE: "${name}"
PESO: ${weightPrompt}

CORREGGI NOME + STIMA NUTRIZIONALE:

JSON:
{
  "corrected_name": "[nome corretto]",
  "estimated_calories_kcal": [numero o null],
  "estimated_proteins_g": [numero o null],
  "estimated_carbs_g": [numero o null],
  "estimated_fats_g": [numero o null],
  "error_message": "[vuoto se OK]"
}`;

    // Stima token del prompt (approssimativa: 1 token ≈ 4 caratteri per l'italiano)
    const estimatedInputTokens = Math.round(prompt.length / 4);

    // *** LOG DELL'INPUT AI CALORIES ***
    console.log(`[AI CALORIES INPUT] ============= INPUT CALORIES PER "${name}" =============`)
    console.log(`[AI CALORIES INPUT] === PARAMETRI ===`)
    console.log(`[AI CALORIES INPUT] Ingrediente: "${name}"`)
    console.log(`[AI CALORIES INPUT] Peso: ${weightGrams !== undefined ? weightGrams + 'g' : 'porzione media'}`)
    console.log(`[AI CALORIES INPUT] === PROMPT ===`)
    console.log(prompt)
    console.log(`[AI CALORIES INPUT] === DETTAGLI TECNICI ===`)
    console.log(`[AI CALORIES INPUT] Token stimati input: ~${estimatedInputTokens}`)
    console.log(`[AI CALORIES INPUT] Config temperatura: ${CALORIES_GENERATION_CONFIG.temperature}`)
    console.log(`[AI CALORIES INPUT] Config topK: ${CALORIES_GENERATION_CONFIG.topK}`)
    console.log(`[AI CALORIES INPUT] Config topP: ${CALORIES_GENERATION_CONFIG.topP}`)
    console.log(`[AI CALORIES INPUT] Config maxOutputTokens: ${CALORIES_GENERATION_CONFIG.maxTokens}`)
    console.log(`[AI CALORIES INPUT] Timeout: ${CALORIES_TIMEOUT}ms`)
    console.log(`[AI CALORIES INPUT] ============= FINE INPUT CALORIES =============`)

    console.log("[GEMINI CALORIES AI-SDK] Chiamata API con AI SDK per stima calorie");
    console.time(`[GEMINI CALORIES AI-SDK TIMING] API call per "${name}"`);

    const { text, usage } = await generateText({
      model: geminiTextModel,
      prompt,
      temperature: CALORIES_GENERATION_CONFIG.temperature,
      topK: CALORIES_GENERATION_CONFIG.topK,
      topP: CALORIES_GENERATION_CONFIG.topP,
      maxTokens: CALORIES_GENERATION_CONFIG.maxTokens,
    });

    console.timeEnd(`[GEMINI CALORIES AI-SDK TIMING] API call per "${name}"`);

    // *** LOG DEI TOKEN CALORIES ***
    if (usage) {
      console.log(`[TOKEN USAGE CALORIES] ============= TOKEN USAGE CALORIES per "${name}" =============`);
      console.log(`[TOKEN USAGE CALORIES] Input tokens: ${usage.promptTokens}`);
      console.log(`[TOKEN USAGE CALORIES] Output tokens: ${usage.completionTokens}`);
      console.log(`[TOKEN USAGE CALORIES] Total tokens: ${usage.totalTokens}`);
      console.log(`[TOKEN USAGE CALORIES] ================================================================`);
    }

    // Calcola informazioni sulla risposta
    const responseLength = text.length;
    const estimatedOutputTokens = Math.round(responseLength / 4);
    const totalEstimatedTokens = estimatedInputTokens + estimatedOutputTokens;

    // *** LOG DELL'OUTPUT AI CALORIES ***
    console.log(`[AI CALORIES OUTPUT] ============= OUTPUT CALORIES PER "${name}" =============`)
    console.log(`[AI CALORIES OUTPUT] === STATISTICHE ===`)
    console.log(`[AI CALORIES OUTPUT] Lunghezza risposta: ${responseLength} caratteri`)
    console.log(`[AI CALORIES OUTPUT] Token stimati output: ~${estimatedOutputTokens}`)
    console.log(`[AI CALORIES OUTPUT] Token totali stimati: ~${totalEstimatedTokens}`)
    console.log(`[AI CALORIES OUTPUT] === RISPOSTA COMPLETA ===`)
    console.log(text)
    console.log(`[AI CALORIES OUTPUT] ============= FINE OUTPUT CALORIES =============`)

    // Parse manuale del JSON dalla risposta text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Risposta AI non contiene JSON valido");
    }

    const parsedData = JSON.parse(jsonMatch[0]);
    
    const result = {
      calories: typeof parsedData.estimated_calories_kcal === 'number' ? Math.max(0, Math.round(parsedData.estimated_calories_kcal)) : null,
      correctedName: parsedData.corrected_name || name,
      error: !!parsedData.error_message || parsedData.estimated_calories_kcal === null,
      errorMessage: parsedData.error_message || undefined,
      proteins: typeof parsedData.estimated_proteins_g === 'number' ? Math.max(0, Number(parsedData.estimated_proteins_g.toFixed(1))) : null,
      carbs: typeof parsedData.estimated_carbs_g === 'number' ? Math.max(0, Number(parsedData.estimated_carbs_g.toFixed(1))) : null,
      fats: typeof parsedData.estimated_fats_g === 'number' ? Math.max(0, Number(parsedData.estimated_fats_g.toFixed(1))) : null
    };

    console.log(`[GEMINI CALORIES AI-SDK SUCCESS] Stima completata per "${name}":`, {
      calories: result.calories,
      correctedName: result.correctedName,
      error: result.error,
      totalTokens: totalEstimatedTokens
    });

    return {
      success: !result.error,
      estimated_calories_kcal: result.calories || undefined,
      estimated_proteins_g: result.proteins || undefined,
      estimated_carbs_g: result.carbs || undefined,
      estimated_fats_g: result.fats || undefined,
      error_message: result.error ? result.errorMessage : undefined
    };

  } catch (error) {
    console.error("[GEMINI CALORIES AI-SDK UNEXPECTED ERROR]", error);
    return {
      success: false,
      estimated_calories_kcal: undefined,
      estimated_proteins_g: undefined,
      estimated_carbs_g: undefined,
      estimated_fats_g: undefined,
      error_message: error instanceof Error ? error.message : "Errore inatteso durante la stima delle calorie."
    };
  }
};

/**
 * Crea un prompt dettagliato per l'analisi del prodotto con criteri scientifici come Yuka
 */
const createAnalysisPrompt = (product: RawProductData): string => {
  const formatField = (value: string | string[] | number | null | undefined, defaultValue: string = "N/A") => {
    if (Array.isArray(value) && value.length > 0) return value.join(', ');
    if (value === null || value === undefined) return defaultValue;
    return value.toString();
  };

  const formatNutriment = (value: number | undefined | null, unit: string = "g", defaultValue: string = "N/A") => {
    return (value !== undefined && value !== null) ? `${value}${unit}` : defaultValue;
  };

  const missingNutritionalInfo = !product.nutriments?.energy_kcal_100g && 
                                !product.nutriments?.proteins_100g && 
                                !product.nutriments?.carbohydrates_100g && 
                                !product.nutriments?.fat_100g;
  
  const estimateNutritionPrompt = missingNutritionalInfo ? `
  STIMA VALORI/100g:
  - "estimated_energy_kcal_100g": [numero]
  - "estimated_proteins_100g": [numero]
  - "estimated_carbs_100g": [numero]  
  - "estimated_fats_100g": [numero]` : '';

  // Determina se c'è Nutri-Score per le istruzioni specifiche
  const hasNutriScore = product.nutrition_grades && product.nutrition_grades.toLowerCase() !== 'unknown';
  const hasEcoScore = product.ecoscore_grade && product.ecoscore_grade.toLowerCase() !== 'unknown';
  
  return `
PRODOTTO: ${formatField(product.product_name)} | ${formatField(product.brands)}
INGREDIENTI: ${formatField(product.ingredients_text)}
VALORI/100g: ${formatNutriment(product.nutriments?.energy_kcal_100g, "kcal")} | Grassi:${formatNutriment(product.nutriments?.fat_100g)}g | Carbo:${formatNutriment(product.nutriments?.carbohydrates_100g)}g | Proteine:${formatNutriment(product.nutriments?.proteins_100g)}g | Sale:${formatNutriment(product.nutriments?.salt_100g)}g
SCORE ESISTENTI: Nutri:${formatField(product.nutrition_grades?.toUpperCase())} | Nova:${formatField(product.nova_group)} | Eco:${formatField(product.ecoscore_grade?.toUpperCase())}
${estimateNutritionPrompt}

ANALISI NUTRIZIONALE SCIENTIFICA STILE YUKA:

HEALTH SCORE (1-100): Basato SOLO su impatto nutrizionale e sanitario
${hasNutriScore ? `Nutri-Score: A=85-98, B=68-84, C=42-67, D=18-41, E=1-17` : `Riferimenti: Naturali non processati=80-95, Processati=30-60, Ultra-processati=5-25`}
NOVA: Gruppo 1=+0, 2=-5, 3=-15, 4=-25 punti

SOSTENIBILITÀ: ${hasEcoScore ? `Eco-Score: A=84-97, B=63-83, C=39-62, D=16-38, E=1-15` : `0 - Ecoscore non disponibile`}

COSA VALUTARE (SOLO ASPETTI NUTRIZIONALI/SANITARI e INFORMAZIONI/CURIOSITÀ SCIENTIFICHE SCIENTIFICHE VALIDE):

⚠️ IMPORTANTE: NON creare PRO/CONTRO/NEUTRI per Nutri-Score, NOVA o Eco-Score! 
L'app gestisce automaticamente questi score con le tue spiegazioni.
Fornisci SOLO le spiegazioni nei campi dedicati (nutriScoreExplanation, novaExplanation, ecoScoreExplanation).

PRO - Identifica SOLO se presenti (ESCLUSI Nutri-Score, NOVA, Eco-Score):
✅ Vitamine/minerali in quantità significative (>15% RDA)
✅ Fibre alimentari (>3g/100g)
✅ Proteine complete di qualità
✅ Acidi grassi essenziali (omega-3, omega-6)
✅ Antiossidanti naturali quantificabili
✅ Basso contenuto di sodio (<0.3g/100g)
✅ Assenza di zuccheri aggiunti
✅ Assenza di additivi problematici
✅ Informazioni/curiosità scentifiche interessanti però SCIENTIFICHE che prendi da linee guida internazionali

CONTRO - Identifica SOLO se presenti (ESCLUSI Nutri-Score, NOVA, Eco-Score):
❌ Eccesso di zuccheri (>15g/100g o >22.5g/porzione)
❌ Eccesso di grassi saturi (>5g/100g)
❌ Eccesso di sodio (>1.5g/100g)
❌ Additivi controversi (E250, E621, coloranti artificiali)
❌ Grassi trans (>0.2g/100g)
❌ Alto indice glicemico con zuccheri semplici
❌ Ultra-processamento (NOVA 4)
❌ Informazioni/curiosità scentifiche interessanti però SCIENTIFICHE che prendi da linee guida internazionali

NEUTRI - Usa per aspetti non rilevanti o bilanciati (ESCLUSI Nutri-Score, NOVA, Eco-Score):
➖ Nutrienti presenti ma in quantità normali
➖ Aspetti che non impattano significativamente la salute
➖ Caratteristiche standard per la categoria

FORMATO TITOLI OBBLIGATORIO QUANDO PARLI DI VALORI NUTRIZIONALI:
PRO: "[Nutriente]: [numero]mg/g/% (Stima AI)" o "[Nutriente]: [numero]mg/g/% ([fonte dati])"
CONTRO: "[Problema]: [numero]g/mg (Stima AI)" o "[Problema]: [numero]g/mg ([fonte dati])"  
NEUTRO: "[Aspetto]: [numero]g/kcal (valore standard)"

REGOLE FERREE:
❌ MAI dire "0g di X" come CONTRO (è neutro o positivo!)
❌ MAI valutare effetti psicologici (concentrazione, energia mentale)
❌ MAI commentare sapore, texture, appetibilità
❌ MAI giustificare con frasi tipo "normale per la categoria"
❌ MAI inventare problemi inesistenti
❌ MAI usare "stimata/stimati/stimato" - USA "(Stima AI)" dopo il numero


✅ SOLO valutazioni nutrizionali oggettive con soglie scientifiche
✅ SOLO quantità misurabili con riferimenti OMS/EFSA
✅ USA neutri per aspetti non significativi
✅ TITOLI con NUMERI PRECISI e fonte dati
✅ Sii conciso e ottimizzato per velocità

ESEMPI CORRETTI TITOLI:
PRO: "Vitamina C: 89mg/100g (99% RDA)"
PRO: "Fibre: 8.2g/100g (Stima AI)"
CONTRO: "Zuccheri: 25g/100g (125% limite OMS)"
CONTRO: "Sodio: 1.8g/100g (Stima AI)"
NEUTRO: "Proteine: 2.1g/100g (valore standard)"
NEUTRO: "Calorie: 245kcal/100g (densità normale)"

JSON OTTIMIZZATO:
{
  "healthScore": [numero 1-100],
  "sustainabilityScore": [${hasEcoScore ? 'numero 1-100' : '0'}],
  "analysis": "[max 2 frasi: composizione + impatto nutrizionale]",
  "pros": [{"title":"[Nutriente]: [numero][unità] ([fonte])","detail":"[significato sanitario + riferimento scientifico]"}],
  "cons": [{"title":"[Problema]: [numero][unità] ([fonte])","detail":"[rischio sanitario + soglia limite]"}],
  "neutrals": [{"title":"[Aspetto]: [numero][unità] (valore standard)","detail":"[descrizione neutra]"}],


  "sustainabilityPros": [${hasEcoScore ? '{"title":"[aspetto]","detail":"[dato]"}' : ''}],
  "sustainabilityCons": [${hasEcoScore ? '{"title":"[problema]","detail":"[impatto]"}' : ''}],
  "sustainabilityNeutrals": [],

  "nutriScoreExplanation": "[1 frase metodologia]",
  "novaExplanation": "[1 frase processamento]",
  "ecoScoreExplanation": "${hasEcoScore ? '[1 frase calcolo]' : 'Non disponibile'}"
  ${missingNutritionalInfo ? `,"estimated_energy_kcal_100g":[numero],"estimated_proteins_100g":[numero],"estimated_carbs_100g":[numero],"estimated_fats_100g":[numero]` : ''}
}`;
};

/**
 * Crea un prompt dettagliato per l'analisi visiva del prodotto con criteri scientifici come Yuka
 */
const createVisualAnalysisPrompt = (productNameHint: string): string => {
    return `
ANALISI VISIVA CIBO: ${productNameHint}

ANALISI NUTRIZIONALE SCIENTIFICA STILE YUKA:

HEALTH SCORE (1-100): Basato SOLO su composizione nutrizionale identificata
Riferimenti:
- Alimenti naturali integrali: 85-95
- Minimamente processati: 70-84  
- Processati: 40-69
- Ultra-processati: 10-39
- Ad alto rischio: 1-15

SOSTENIBILITÀ: 0 - "Ecoscore non disponibile per analisi foto"

METODOLOGIA:
1. Identifica precisamente il cibo
2. Stima composizione nutrizionale da database scientifici
3. Valuta processamento visibile
4. Calcola score nutrizionale
5. Identifica pro/contro/neutri oggettivi

COSA VALUTARE (SOLO ASPETTI NUTRIZIONALI/SANITARI):

PRO - Identifica SOLO se stimabili:
✅ Vitamine/minerali significativi (>15% RDA)
✅ Fibre (>3g/100g)
✅ Proteine di qualità visibili
✅ Grassi buoni identificabili
✅ Antiossidanti naturali stimabili
✅ Basso sodio (<0.3g/100g)
✅ Nessun zucchero aggiunto visibile

CONTRO - Identifica SOLO se stimabili:
❌ Zuccheri eccessivi (>15g/100g)
❌ Grassi saturi eccessivi (>5g/100g)
❌ Sodio eccessivo (>1.5g/100g)
❌ Frittura/cottura ad alte temperature visibile
❌ Processamento industriale evidente
❌ Additivi/conservanti visibili

NEUTRI - Per aspetti standard:
➖ Nutrienti in quantità normali per la categoria
➖ Aspetti che non impattano significativamente
➖ Caratteristiche bilanciate

FORMATO TITOLI OBBLIGATORIO:
PRO: "[Nutriente]: [numero]mg/g/% (Stima AI)" 
CONTRO: "[Problema]: [numero]g/mg (Stima AI)"
NEUTRO: "[Aspetto]: [numero]g/kcal (densità normale)"

REGOLE FERREE:
❌ MAI dire "0g di X" come CONTRO
❌ MAI valutare effetti psicologici/energetici
❌ MAI commentare aspetto estetico
❌ MAI inventare problemi inesistenti
❌ MAI frasi vaghe o non quantificate
❌ MAI usare "stimata/stimati/stimato" - USA "(Stima AI)"

✅ SOLO stime nutrizionali concrete con NUMERI
✅ SOLO impatti sanitari misurabili
✅ USA neutri per aspetti non rilevanti
✅ TITOLI SCIENTIFICI con VALORI PRECISI
✅ Massima concisione per velocità

ESEMPI CORRETTI TITOLI:
PRO: "Vitamina C: 65mg/100g (Stima AI)"
PRO: "Fibre: 3.1g/100g (Stima AI)"
CONTRO: "Zuccheri: 18g/100g (Stima AI)"
CONTRO: "Sodio: 1.2g/100g (Stima AI)"
NEUTRO: "Calorie: 52kcal/100g (densità normale)"
NEUTRO: "Proteine: 1.8g/100g (valore standard)"

REGOLE NOME E DESCRIZIONE:
❌ MAI nomi come "Pane (tipologia non definita, probabilmente...)" → USA "Pane"
❌ MAI frasi generiche come "importante per la salute"
✅ Nome max 3 parole (es: "Pane integrale", "Pizza margherita")
✅ Analisi DIRETTA sui valori nutrizionali

TIPOLOGIA PRODOTTO - DETERMINA CORRETTAMENTE:

🍽️ PASTO (breakdown): SOLO per cibo CUCINATO, piatti FATTI IN CASA, pasti PREPARATI dal vivo
- Esempi: pasta al pomodoro, pizza fatta in casa, insalata, risotto, carne grigliata, verdure cotte
- Usa "calorie_estimation_type": "breakdown" 
- Includi "ingredients_breakdown" con ingredienti stimati
- "calories_estimate": "Totale: ~[numero] kcal"

📦 PRODOTTO CONFEZIONATO (per_100g): TUTTO ciò che è INDUSTRIALE, con CONFEZIONE, MARCA, ETICHETTA
- Esempi OBBLIGATORI: biscotti, crackers, snack, merendine, cioccolato, caramelle, chips, cereali, yogurt confezionato, succhi, bevande
- ANCHE SE VEDI INGREDIENTI SEPARATI: se c'è una MARCA o CONFEZIONE = prodotto confezionato!
- Tarallucci, Oreo, Nutella, Pringles, Kinder = SEMPRE prodotto confezionato!
- Usa "calorie_estimation_type": "per_100g"
- NON includere "ingredients_breakdown" 
- Includi "estimated_energy_kcal_100g", "estimated_proteins_100g", "estimated_carbs_100g", "estimated_fats_100g"
- "calories_estimate": "~[numero] kcal per 100g"

REGOLA FERREA: Se vedi MARCA/BRAND = prodotto confezionato, NON pasto!

JSON OTTIMIZZATO:

PER PASTI (solo piatti cucinati/fatti in casa):
{
  "productNameFromVision": "Pasta Pomodoro",
  "brandFromVision": null,
  "healthScore": [numero 1-100],
  "analysis": "[analisi valori nutrizionali]",
  "pros": [{"title":"[Nutriente]: [numero][unità] (Stima AI)","detail":"[dettaglio]"}],
  "cons": [{"title":"[Problema]: [numero][unità] (Stima AI)","detail":"[dettaglio]"}],
  "neutrals": [{"title":"[Aspetto]: [numero][unità] (valore standard)","detail":"[dettaglio]"}],
  "calorie_estimation_type": "breakdown",
  "ingredients_breakdown": [{"id":1,"name":"Pasta","estimated_weight_g":100,"estimated_calories_kcal":350,"estimated_proteins_g":12,"estimated_carbs_g":70,"estimated_fats_g":2}],
  "calories_estimate": "Totale: ~500 kcal",
  "sustainabilityScore": 0,
  "sustainabilityPros": [],
  "sustainabilityCons": [],
  "sustainabilityNeutrals": []
}

PER PRODOTTI CONFEZIONATI (biscotti, snack, merendine con marca):
{
  "productNameFromVision": "Tarallucci",
  "brandFromVision": "Mulino Bianco",
  "healthScore": 45,
  "analysis": "[analisi valori nutrizionali]",
  "pros": [{"title":"[Nutriente]: [numero][unità] (Stima AI)","detail":"[dettaglio]"}],
  "cons": [{"title":"[Problema]: [numero][unità] (Stima AI)","detail":"[dettaglio]"}],
  "neutrals": [{"title":"[Aspetto]: [numero][unità] (valore standard)","detail":"[dettaglio]"}],
  "calorie_estimation_type": "per_100g",
  "estimated_energy_kcal_100g": 450,
  "estimated_proteins_100g": 8,
  "estimated_carbs_100g": 65,
  "estimated_fats_100g": 15,
  "calories_estimate": "~450 kcal per 100g",
  "sustainabilityScore": 0,
  "sustainabilityPros": [],
  "sustainabilityCons": [],
  "sustainabilityNeutrals": []
}`;
};

/**
 * Analizza la risposta di Gemini per estrarre i dati strutturati (identica all'originale)
 */
const parseGeminiResponse = (response: string, isPhotoAnalysis: boolean = false): GeminiAnalysisResult => {
  try {
    console.log(`[GEMINI AI-SDK PARSE] Inizio parsing della risposta (lunghezza: ${response.length} caratteri). Foto: ${isPhotoAnalysis}`);

    // Cerca il JSON nella risposta con regex più robusta
    let jsonStr = '';
    let jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
      console.log(`[GEMINI AI-SDK PARSE] JSON trovato nella risposta (lunghezza: ${jsonStr.length} caratteri)`);
      
      // Verifica che il JSON sia bilanciato (stesso numero di { e })
      const openBraces = (jsonStr.match(/\{/g) || []).length;
      const closeBraces = (jsonStr.match(/\}/g) || []).length;
      
      if (openBraces !== closeBraces) {
        console.warn(`[GEMINI AI-SDK PARSE WARN] JSON non bilanciato: ${openBraces} aperture, ${closeBraces} chiusure`);
        
        // Prova a trovare l'ultimo } valido
        let lastValidIndex = -1;
        let braceCount = 0;
        
        for (let i = 0; i < jsonStr.length; i++) {
          if (jsonStr[i] === '{') braceCount++;
          else if (jsonStr[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              lastValidIndex = i;
              break;
            }
          }
        }
        
        if (lastValidIndex > 0) {
          jsonStr = jsonStr.substring(0, lastValidIndex + 1);
          console.log(`[GEMINI AI-SDK PARSE] JSON riparato, nuova lunghezza: ${jsonStr.length} caratteri`);
        }
      }
    }
    
    if (jsonStr) {
      let result: GeminiAnalysisResult;
      
      try {
        result = JSON.parse(jsonStr) as GeminiAnalysisResult;
      } catch (parseError) {
        console.error(`[GEMINI AI-SDK PARSE ERROR] Errore parsing JSON:`, parseError);
        console.log(`[GEMINI AI-SDK PARSE DEBUG] JSON problematico:`, jsonStr.substring(0, 500) + '...');
        throw parseError;
      }

      // Validazione campi principali (sempre richiesti)
      const coreHealthFieldsPresent = 
        typeof result.healthScore === "number" &&
        typeof result.analysis === "string" &&
        Array.isArray(result.pros) &&
        Array.isArray(result.cons);

      // Assicurati che i campi neutrals esistano (anche vuoti se non forniti dall'AI)
      if (!Array.isArray(result.neutrals)) {
        result.neutrals = [];
      }
      
      if (!Array.isArray(result.sustainabilityNeutrals)) {
        result.sustainabilityNeutrals = [];
      }

      if (!coreHealthFieldsPresent) {
        console.error(`[GEMINI AI-SDK PARSE ERROR] Campi core mancanti nel JSON`);
        throw new Error("Analisi AI incompleta: mancano campi essenziali");
      }

      // Validazione porzione suggerita come numero


      // Validazione ingredients_breakdown per correggere array invece di numeri
      if (result.ingredients_breakdown && Array.isArray(result.ingredients_breakdown)) {
        result.ingredients_breakdown = result.ingredients_breakdown.map((ingredient: any) => {
          const fixed: any = { ...ingredient };
          
          // Correggi se i valori numerici sono array invece di numeri
          if (Array.isArray(fixed.estimated_weight_g) && fixed.estimated_weight_g.length > 0) {
            fixed.estimated_weight_g = fixed.estimated_weight_g[0];
          }
          if (Array.isArray(fixed.estimated_calories_kcal) && fixed.estimated_calories_kcal.length > 0) {
            fixed.estimated_calories_kcal = fixed.estimated_calories_kcal[0];
          }
          if (Array.isArray(fixed.estimated_proteins_g) && fixed.estimated_proteins_g.length > 0) {
            fixed.estimated_proteins_g = fixed.estimated_proteins_g[0];
          }
          if (Array.isArray(fixed.estimated_carbs_g) && fixed.estimated_carbs_g.length > 0) {
            fixed.estimated_carbs_g = fixed.estimated_carbs_g[0];
          }
          if (Array.isArray(fixed.estimated_fats_g) && fixed.estimated_fats_g.length > 0) {
            fixed.estimated_fats_g = fixed.estimated_fats_g[0];
          }
          
          return fixed;
        });
        console.log('[GEMINI AI-SDK PARSE FIX] ingredients_breakdown corretto se necessario');
      }

      console.log(`[GEMINI AI-SDK PARSE SUCCESS] Parsing completato con successo per risposta di ${response.length} caratteri`);
      return result;
      } else {
      console.error(`[GEMINI AI-SDK PARSE ERROR] Nessun JSON valido trovato nella risposta`);
      throw new Error("Formato risposta AI non valido");
    }
  } catch (error) {
    console.error(`[GEMINI AI-SDK PARSE ERROR] Errore durante il parsing:`, error);
    
    // Ritorna un risultato di fallback
    return createFallbackResult(response);
  }
};

/**
 * Crea un risultato di fallback quando il parsing fallisce
 */
const createFallbackResult = (response: string): GeminiAnalysisResult => {
  console.log(`[GEMINI AI-SDK FALLBACK] Creazione risultato di fallback`);
  
  return {
    healthScore: 50,
    sustainabilityScore: 50,
    analysis: "Analisi non disponibile a causa di un errore di parsing.",
    pros: [],
    cons: [],
    neutrals: [],

    sustainabilityPros: [],
    sustainabilityCons: [],
    sustainabilityNeutrals: []
  };
};

/**
 * Analizza un prodotto alimentare utilizzando le preferenze utente per personalizzare i risultati
 * @param product Dati del prodotto da OpenFoodFacts o analisi visiva 
 * @param userId ID dell'utente per recuperare le preferenze
 * @returns Risultato dell'analisi personalizzato
 */
export const analyzeProductWithUserPreferences = async (
  product: RawProductData, 
  userId: string
): Promise<GeminiAnalysisResult> => {
  try {
    console.log(`[GEMINI PERSONALIZED START] Avvio analisi personalizzata per ${product.code} (utente: ${userId})`);
    console.time(`[GEMINI PERSONALIZED TIMING] Analisi personalizzata per ${product.code}`);

    // Recupera il profilo completo dell'utente
    console.log(`[GEMINI PERSONALIZED] Recupero profilo utente ${userId}`);
    const userProfile = await getCompleteUserProfile(userId);
    
    if (!userProfile.profile) {
      console.log(`[GEMINI PERSONALIZED] Nessun profilo trovato per ${userId}, uso analisi standard`);
      return await analyzeProductWithGeminiAiSdk(product);
    }

    // Costruisci un prompt personalizzato
    const personalizedPrompt = createPersonalizedAnalysisPrompt(product, userProfile);
    console.log(`[GEMINI PERSONALIZED PROMPT] Prompt personalizzato generato per ${product.code} (lunghezza: ${personalizedPrompt.length} caratteri)`);

    // *** LOG DELL'INPUT AI PERSONALIZZATO ***
    console.log(`[AI INPUT PERSONALIZED] ============= INPUT PERSONALIZZATO =============`);
    console.log(personalizedPrompt);
    console.log(`[AI INPUT PERSONALIZED] ============= FINE INPUT =============`);

    // Chiamata all'AI SDK con prompt personalizzato
    console.log(`[GEMINI PERSONALIZED API] Chiamata API personalizzata per ${product.code}`);
    console.time(`[GEMINI PERSONALIZED API TIMING] Chiamata API personalizzata per ${product.code}`);

    const { text, usage } = await generateText({
      model: geminiTextModel,
      prompt: personalizedPrompt,
      temperature: GENERATION_CONFIG.temperature,
      topK: GENERATION_CONFIG.topK,
      topP: GENERATION_CONFIG.topP,
      maxTokens: GENERATION_CONFIG.maxTokens,
    });

    console.timeEnd(`[GEMINI PERSONALIZED API TIMING] Chiamata API personalizzata per ${product.code}`);

    // *** LOG DEI TOKEN PERSONALIZZATI ***
    if (usage) {
      console.log(`[TOKEN USAGE PERSONALIZED] ============= TOKEN USAGE PERSONALIZZATO =============`);
      console.log(`[TOKEN USAGE PERSONALIZED] Input tokens: ${usage.promptTokens}`);
      console.log(`[TOKEN USAGE PERSONALIZED] Output tokens: ${usage.completionTokens}`);
      console.log(`[TOKEN USAGE PERSONALIZED] Total tokens: ${usage.totalTokens}`);
      console.log(`[TOKEN USAGE PERSONALIZED] =======================================================`);
    }

    // *** LOG DELL'OUTPUT AI PERSONALIZZATO ***
    console.log(`[AI OUTPUT PERSONALIZED] ============= OUTPUT PERSONALIZZATO =============`);
    console.log(text);
    console.log(`[AI OUTPUT PERSONALIZED] ============= FINE OUTPUT =============`);

    // Analizza la risposta personalizzata
    const result = parseGeminiResponse(text);

    // Salva il punteggio di compatibilità nel database
    try {
      await saveProductCompatibilityScore(userId, product.code || 'unknown', {
        compatibilityPercentage: result.healthScore,
        explanation: result.analysis,
        userProfileSnapshot: userProfile.profile,
        userGoalsSnapshot: userProfile.goals,
      });
      console.log(`[GEMINI PERSONALIZED] Punteggio compatibilità salvato per ${product.code}`);
    } catch (saveError) {
      console.error(`[GEMINI PERSONALIZED] Errore nel salvataggio compatibilità:`, saveError);
      // Non bloccare l'analisi se il salvataggio fallisce
    }

    console.timeEnd(`[GEMINI PERSONALIZED TIMING] Analisi personalizzata per ${product.code}`);
    console.log(`[GEMINI PERSONALIZED SUCCESS] Analisi personalizzata completata per ${product.code}:`, {
      healthScore: result.healthScore,
      sustainabilityScore: result.sustainabilityScore,
      userGoals: userProfile.goals.length,
    });

    return result;
  } catch (error) {
    console.error(`[GEMINI PERSONALIZED ERROR] Errore nell'analisi personalizzata per ${product.code}:`, error);
    // Fallback all'analisi standard se quella personalizzata fallisce
    console.log(`[GEMINI PERSONALIZED] Fallback all'analisi standard per ${product.code}`);
    return await analyzeProductWithGeminiAiSdk(product);
  }
};

/**
 * Crea un prompt personalizzato per l'analisi di un prodotto basato sulle preferenze utente
 */
const createPersonalizedAnalysisPrompt = (product: RawProductData, userProfile: any): string => {
  const formatField = (value: string | string[] | number | null | undefined, defaultValue: string = "N/A") => {
    if (value === null || value === undefined || value === "") return defaultValue;
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  };

  const formatNutriment = (value: number | undefined | null, unit: string = "g", defaultValue: string = "N/A") => {
    if (value === null || value === undefined || isNaN(value)) return defaultValue;
    return `${value}${unit}`;
  };

  // Informazioni profilo utente
  const profile = userProfile.profile;
  const goals = userProfile.goals;

  let userInfo = "PROFILO UTENTE:\n";
  
  if (profile) {
    userInfo += `- ID Utente: ${profile.user_id}\n`;
  } else {
    userInfo += `- Profilo base non configurato\n`;
  }

  if (goals && goals.length > 0) {
    userInfo += "\nOBIETTIVI DI SALUTE:\n";
    goals.forEach((goal: any, index: number) => {
      userInfo += `${index + 1}. ${goal.name}: ${goal.description}\n`;
    });
            } else {
    userInfo += "\nNessun obiettivo di salute specifico impostato.\n";
  }

  return `
Sei un esperto nutrizionista e biologo nutrizionale. Analizza questo prodotto considerando SPECIFICAMENTE il profilo e gli obiettivi dell'utente.

${userInfo}

PRODOTTO DA ANALIZZARE:
Nome: ${formatField(product.product_name)}
Marca: ${formatField(product.brands)}
Codice a barre: ${formatField(product.code)}
Ingredienti: ${formatField(product.ingredients_text)}
Categoria: ${formatField(product.categories)}

INFORMAZIONI NUTRIZIONALI (per 100g):
- Energia: ${formatNutriment(product.nutriments?.energy_kcal_100g, " kcal")}
- Grassi: ${formatNutriment(product.nutriments?.fat_100g)}
- Grassi saturi: ${formatNutriment(product.nutriments?.saturated_fat_100g)}
- Carboidrati: ${formatNutriment(product.nutriments?.carbohydrates_100g)}
- Zuccheri: ${formatNutriment(product.nutriments?.sugars_100g)}
- Fibre: ${formatNutriment(product.nutriments?.fiber_100g)}
- Proteine: ${formatNutriment(product.nutriments?.proteins_100g)}
- Sale: ${formatNutriment(product.nutriments?.salt_100g)}

PUNTEGGI ESISTENTI:
- Nutri-Score: ${formatField(product.nutrition_grades)}
- Nova Score: ${formatField(product.nova_group)}
- Eco-Score: ${formatField(product.ecoscore_grade)}

⚠️ IMPORTANTE: NON creare PRO/CONTRO/NEUTRI per Nutri-Score, NOVA o Eco-Score! 
L'app gestisce automaticamente questi score con le tue spiegazioni.
Fornisci SOLO le spiegazioni nei campi dedicati (nutriScoreExplanation, novaExplanation, ecoScoreExplanation).

ISTRUZIONI SCIENTIFICHE AVANZATE:
1. PERSONALIZZA IL PUNTEGGIO in base al profilo e obiettivi dell'utente
2. Per ogni PRO/CONTRO deve GIUSTIFICARE come si collega agli obiettivi di salute
3. Includi considerazioni scientifiche OLTRE ai valori nutrizionali di base:
   - Biodisponibilità dei nutrienti
   - Interazioni tra composti bioattivi
   - Impatti sui pathways metabolici
   - Effetti sulla microbiota intestinale
   - Cronobiologia nutrizionale
   - Sinergie nutrizionali

MAPPATURA OBIETTIVI SCIENTIFICI:
• "Supportare salute ossea" → Calcio biodisponibile, vitamina D, vitamina K2, rapporto Ca/Mg
• "Ridurre infiammazione" → Omega-3, polifenoli, curcumina, flavonoidi, rapporto omega-6/omega-3
• "Migliorare concentrazione" → Colina, omega-3 DHA, antiossidanti neurotropi, stabilità glicemica
• "Mantenere peso forma" → Indice glicemico, sazietà proteica, termogenesi, cronoritmità metabolica
• "Migliorare digestione" → Fibre prebiotiche, enzimi digestivi, pH gastrico, diversità microbiotica
• "Supportare sistema immunitario" → Vitamina C, zinco, selenio, beta-glucani, immunomodulatori
• "Aumentare energia e vitalità" → Complesso B, ferro eme/non-eme, coenzima Q10, stabilità insulinica
• "Migliorare qualità del sonno" → Melatonina precursori, magnesio, evitare caffeina, timing carboidrati
• "Migliorare salute cardiovascolare" → Nitrati, steroli vegetali, omega-3, flavonoidi vasculoprotettivi
• "Aumentare massa muscolare" → Leucina, timing proteico, aminoacidi essenziali, finestra anabolica

REGOLE AVANZATE:
1. Se l'utente ha obiettivo "peso forma" → penalizza densità calorica e zuccheri aggiunti
2. Se l'utente vuole "massa muscolare" → premia proteine complete e timing post-workout
3. Se l'utente vuole "sonno migliore" → penalizza caffeina, premia magnesio e triptofano
4. Se l'utente vuole "salute cardiovascolare" → premia omega-3, fibra solubile, steroli vegetali
5. Se l'utente vuole "ridurre infiammazione" → premia antiossidanti, penalizza omega-6 eccessivi

ESEMPI TITOLI SCIENTIFICI CORRETTI:
PRO: "Omega-3 EPA: 250mg/100g (anti-infiammatorio per i tuoi obiettivi)"
PRO: "Leucina: 2.1g/100g (ottimale per sintesi proteica muscolare)"
PRO: "Polifenoli: 180mg GAE/100g (neuroprotezione e concentrazione)"
CONTRO: "Acido arachidonico: elevato (pro-infiammatorio vs tuo obiettivo)"
CONTRO: "Indice glicemico: 75 (destabilizza energia vs tuoi obiettivi)"
NEUTRO: "Calcio: 120mg/100g (contributo moderato salute ossea)"

Rispondi SOLO con un JSON valido nel seguente formato:
{
  "healthScore": [numero da 1 a 100, PESATO per obiettivi utente],
  "sustainabilityScore": [numero da 1 a 100],
  "analysis": "[2-3 frasi: identificazione + profilo nutrizionale PERSONALIZZATO per obiettivi]",
  "pros": [
    {"title": "[Composto/Nutriente]: [valore] (beneficio per [obiettivo specifico])", "detail": "[meccanismo scientifico + rilevanza per obiettivi utente]"}
  ],
  "cons": [
    {"title": "[Problema]: [valore] (contrasta [obiettivo specifico])", "detail": "[meccanismo + perché problematico per obiettivi utente]"}
  ],
  "neutrals": [
    {"title": "[Aspetto]: [valore] (rilevanza moderata)", "detail": "[valutazione neutra contestualizzata]"}
  ],
  "sustainabilityPros": [{"title": "[titolo]", "detail": "[dettaglio]"}],
  "sustainabilityCons": [{"title": "[titolo]", "detail": "[dettaglio]"}],
  "sustainabilityNeutrals": [{"title": "[titolo]", "detail": "[dettaglio]"}],
  "nutriScoreExplanation": "[spiegazione Nutri-Score personalizzata per obiettivi]",
  "novaExplanation": "[spiegazione NOVA personalizzata per obiettivi]",
  "ecoScoreExplanation": "[spiegazione Eco-Score]"
}
  `;
};

/**
 * Analizza un'immagine di cibo utilizzando le preferenze utente per personalizzare i risultati
 * @param imageBase64 Immagine in formato base64 (senza prefisso data:)
 * @param mimeType Tipo MIME dell'immagine 
 * @param productNameHint Suggerimento sul nome del prodotto
 * @param userId ID dell'utente per recuperare le preferenze
 * @returns Risultato dell'analisi personalizzato
 */
export const analyzeImageWithUserPreferences = async (
    imageBase64: string,      
    mimeType: string,         
  productNameHint: string,
  userId: string
): Promise<GeminiAnalysisResult> => {
  try {
    console.log(`[GEMINI VISION PERSONALIZED START] Avvio analisi visiva personalizzata per ${productNameHint} (utente: ${userId})`);
    console.time(`[GEMINI VISION PERSONALIZED TIMING] Analisi visiva personalizzata per ${productNameHint}`);

    // Recupera il profilo completo dell'utente
    console.log(`[GEMINI VISION PERSONALIZED] Recupero profilo utente ${userId}`);
    const userProfile = await getCompleteUserProfile(userId);
    
    if (!userProfile.profile) {
      console.log(`[GEMINI VISION PERSONALIZED] Nessun profilo trovato per ${userId}, uso analisi standard`);
      return await analyzeImageWithGeminiVisionAiSdk(imageBase64, mimeType, productNameHint);
    }

    // Costruisci un prompt personalizzato per l'analisi visiva
    const personalizedVisualPrompt = createPersonalizedVisualAnalysisPrompt(productNameHint, userProfile);
    console.log(`[GEMINI VISION PERSONALIZED PROMPT] Prompt personalizzato generato per ${productNameHint} (lunghezza: ${personalizedVisualPrompt.length} caratteri)`);

    // Ottimizzazione dell'immagine
    const optimizedBase64 = optimizeImageBase64(imageBase64, mimeType);
    const imageSizeMB = (optimizedBase64.length * 0.75 / 1024 / 1024).toFixed(2);

    // *** LOG DELL'INPUT AI PERSONALIZZATO VISIVO ***
    console.log(`[AI VISION INPUT PERSONALIZED] ============= INPUT VISION PERSONALIZZATO =============`);
    console.log(personalizedVisualPrompt);
    console.log(`[AI VISION INPUT PERSONALIZED] Immagine dimensione: ${imageSizeMB} MB`);
    console.log(`[AI VISION INPUT PERSONALIZED] ============= FINE INPUT =============`);

    // Chiamata all'AI SDK con prompt personalizzato per la visione
    console.log(`[GEMINI VISION PERSONALIZED API] Chiamata API Vision personalizzata per ${productNameHint}`);
    console.time(`[GEMINI VISION PERSONALIZED API TIMING] Chiamata API Vision personalizzata per ${productNameHint}`);

    const { text, usage } = await generateText({
      model: geminiVisionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: personalizedVisualPrompt },
            {
              type: 'image',
              image: optimizedBase64,
              mimeType,
            },
          ],
        },
      ],
      temperature: GENERATION_CONFIG.temperature,
      topK: GENERATION_CONFIG.topK,
      topP: GENERATION_CONFIG.topP,
      maxTokens: GENERATION_CONFIG.maxTokens,
    });

    console.timeEnd(`[GEMINI VISION PERSONALIZED API TIMING] Chiamata API Vision personalizzata per ${productNameHint}`);

    // *** LOG DEI TOKEN PERSONALIZZATI VISION ***
    if (usage) {
      console.log(`[TOKEN USAGE VISION PERSONALIZED] ============= TOKEN USAGE VISION PERSONALIZZATO =============`);
      console.log(`[TOKEN USAGE VISION PERSONALIZED] Input tokens: ${usage.promptTokens}`);
      console.log(`[TOKEN USAGE VISION PERSONALIZED] Output tokens: ${usage.completionTokens}`);
      console.log(`[TOKEN USAGE VISION PERSONALIZED] Total tokens: ${usage.totalTokens}`);
      console.log(`[TOKEN USAGE VISION PERSONALIZED] Immagine: ${imageSizeMB}MB`);
      console.log(`[TOKEN USAGE VISION PERSONALIZED] =================================================================`);
    }

    // *** LOG DELL'OUTPUT AI PERSONALIZZATO VISION ***
    console.log(`[AI VISION OUTPUT PERSONALIZED] ============= OUTPUT VISION PERSONALIZZATO =============`);
    console.log(text);
    console.log(`[AI VISION OUTPUT PERSONALIZED] ============= FINE OUTPUT =============`);

    // Analizza la risposta personalizzata
    const result = parseGeminiResponse(text, true);

    // Salva il punteggio di compatibilità nel database
    try {
      await saveProductCompatibilityScore(userId, result.productNameFromVision || productNameHint, {
        compatibilityPercentage: result.healthScore,
        explanation: result.analysis,
        userProfileSnapshot: userProfile.profile,
        userGoalsSnapshot: userProfile.goals,
      });
      console.log(`[GEMINI VISION PERSONALIZED] Punteggio compatibilità salvato per ${productNameHint}`);
    } catch (saveError) {
      console.error(`[GEMINI VISION PERSONALIZED] Errore nel salvataggio compatibilità:`, saveError);
      // Non bloccare l'analisi se il salvataggio fallisce
    }

    console.timeEnd(`[GEMINI VISION PERSONALIZED TIMING] Analisi visiva personalizzata per ${productNameHint}`);
    console.log(`[GEMINI VISION PERSONALIZED SUCCESS] Analisi visiva personalizzata completata per ${productNameHint}:`, {
      healthScore: result.healthScore, 
      sustainabilityScore: result.sustainabilityScore,
      userGoals: userProfile.goals.length,
      imageSizeMB: imageSizeMB,
    });
    
    return result;
  } catch (error) {
    console.error(`[GEMINI VISION PERSONALIZED ERROR] Errore nell'analisi visiva personalizzata per ${productNameHint}:`, error);
    // Fallback all'analisi standard se quella personalizzata fallisce
    console.log(`[GEMINI VISION PERSONALIZED] Fallback all'analisi visiva standard per ${productNameHint}`);
    return await analyzeImageWithGeminiVisionAiSdk(imageBase64, mimeType, productNameHint);
  }
};

/**
 * Crea un prompt personalizzato per l'analisi visiva di un prodotto basato sulle preferenze utente
 */
const createPersonalizedVisualAnalysisPrompt = (productNameHint: string, userProfile: any): string => {
  // Informazioni profilo utente
  const profile = userProfile.profile;
  const goals = userProfile.goals;

  let userInfo = "PROFILO UTENTE:\n";
  
  if (profile) {
    userInfo += `- ID Utente: ${profile.user_id}\n`;
  } else {
    userInfo += `- Profilo base non configurato\n`;
  }

  if (goals && goals.length > 0) {
    userInfo += "\nOBIETTIVI DI SALUTE:\n";
    goals.forEach((goal: any, index: number) => {
      userInfo += `${index + 1}. ${goal.name}: ${goal.description}\n`;
    });
  } else {
    userInfo += "\nNessun obiettivo di salute specifico impostato.\n";
  }

  return `
Sei un esperto nutrizionista e biologo nutrizionale. Analizza questo cibo nell'immagine considerando SPECIFICAMENTE il profilo e gli obiettivi dell'utente.

${userInfo}

CIBO DA ANALIZZARE: ${productNameHint}

ISTRUZIONI SCIENTIFICHE AVANZATE:
1. PERSONALIZZA IL PUNTEGGIO in base al profilo e obiettivi dell'utente
2. Per ogni PRO/CONTRO deve GIUSTIFICARE come si collega agli obiettivi di salute
3. Includi considerazioni scientifiche OLTRE ai valori nutrizionali di base:
   - Biodisponibilità dei nutrienti visibili
   - Metodi di cottura e impatto nutrizionale
   - Interazioni tra ingredienti identificati
   - Effetti sulla microbiota intestinale
   - Cronobiologia nutrizionale del timing

MAPPATURA OBIETTIVI SCIENTIFICI:
• "Supportare salute ossea" → Calcio biodisponibile, vitamina D, vitamina K2, rapporto Ca/Mg
• "Ridurre infiammazione" → Omega-3, polifenoli, curcumina, flavonoidi, rapporto omega-6/omega-3  
• "Migliorare concentrazione" → Colina, omega-3 DHA, antiossidanti neurotropi, stabilità glicemica
• "Mantenere peso forma" → Indice glicemico, sazietà proteica, termogenesi, cronoritmità metabolica
• "Migliorare digestione" → Fibre prebiotiche, enzimi digestivi, pH gastrico, diversità microbiotica
• "Supportare sistema immunitario" → Vitamina C, zinco, selenio, beta-glucani, immunomodulatori
• "Aumentare energia e vitalità" → Complesso B, ferro eme/non-eme, coenzima Q10, stabilità insulinica
• "Migliorare qualità del sonno" → Melatonina precursori, magnesio, evitare caffeina, timing carboidrati
• "Migliorare salute cardiovascolare" → Nitrati, steroli vegetali, omega-3, flavonoidi vasculoprotettivi
• "Aumentare massa muscolare" → Leucina, timing proteico, aminoacidi essenziali, finestra anabolica

REGOLE AVANZATE:
1. Se l'utente ha obiettivo "peso forma" → penalizza densità calorica e zuccheri aggiunti
2. Se l'utente vuole "massa muscolare" → premia proteine complete e timing post-workout
3. Se l'utente vuole "sonno migliore" → penalizza caffeina, premia magnesio e triptofano
4. Se l'utente vuole "salute cardiovascolare" → premia omega-3, fibra solubile, steroli vegetali
5. Se l'utente vuole "ridurre infiammazione" → premia antiossidanti, penalizza omega-6 eccessivi

REGOLE NOME E DESCRIZIONE:
❌ MAI nomi come "Pane (tipologia non definita, probabilmente...)" → USA "Pane"
❌ MAI frasi generiche come "l'analisi si concentra sui tuoi obiettivi"
❌ MAI dire ovvietà tipo "importante per la salute"
❌ MAI meta-descrizioni tipo "L'analisi si concentra sui valori nutrizionali per 100g"
✅ Nome max 3 parole (es: "Pane integrale", "Pizza margherita", "Insalata")
✅ Campo "analysis" deve essere DESCRITTIVO del prodotto (es: "Biscotti ricchi di zuccheri e grassi saturi, con farina di frumento e burro. Elevata densità calorica e moderato contenuto proteico.")
✅ Descrivi COSA È il prodotto e le sue caratteristiche nutrizionali principali

REGOLE PRO/CONTRO/NEUTRALI:
❌ NON usare valori numerici precisi nei titoli per prodotti fotografati (es: "Grassi saturi: 15g")
✅ USA descrizioni qualitative per prodotti fotografati (es: "Grassi saturi: elevati")
✅ Valori numerici SOLO se hai dati nutrizionali precisi da barcode
✅ Sempre collegare al profilo utente nella spiegazione (detail)

ESEMPI TITOLI SCIENTIFICI CORRETTI:

PER PRODOTTI CON BARCODE (dati nutrizionali precisi):
PRO: "Omega-3 EPA: 250mg (anti-infiammatorio per i tuoi obiettivi)"
PRO: "Leucina: 2.1g (ottimale per sintesi proteica muscolare)"
PRO: "Polifenoli: 180mg GAE (neuroprotezione e concentrazione)"
CONTRO: "Acidi grassi trans: presenti (pro-infiammatori vs tuo obiettivo)"
CONTRO: "Indice glicemico alto: 75 (destabilizza energia vs tuoi obiettivi)"
NEUTRO: "Calcio: 120mg (contributo moderato salute ossea)"

PER PRODOTTI FOTOGRAFATI (stime visive):
PRO: "Carboidrati complessi: energia sostenuta"
PRO: "Fibre visibili: supporto digestivo"
CONTRO: "Zuccheri aggiunti: elevati (destabilizza glicemia)"
CONTRO: "Grassi saturi: presenti (infiammazione vs tuoi obiettivi)"
CONTRO: "Densità calorica: alta (contrasta peso forma)"
NEUTRO: "Sale: presente (moderare consumo)"

ESEMPI CAMPO "analysis" CORRETTI:
✅ "Biscotti da forno con farina di frumento, burro e miele. Elevato contenuto di carboidrati (60g/100g) e grassi saturi (23g/100g). Densità calorica alta con 480 kcal per 100g."
✅ "Snack confezionato ricco di zuccheri semplici e oli vegetali. Moderato apporto proteico (6g/100g) e presenza di conservanti. Prodotto ultra-processato categoria NOVA 4."
✅ "Cereali integrali con frutta secca e semi. Buona fonte di fibre (8g/100g) e proteine vegetali (12g/100g). Presenza di vitamine del gruppo B e minerali."

ESEMPI CAMPO "analysis" SBAGLIATI:
❌ "Gli Alveari Mulino Bianco, con burro salato e miele, sono un prodotto da forno confezionato. L'analisi si concentra sui valori nutrizionali per 100g, considerando gli obiettivi dell'utente."
❌ "Questo prodotto viene analizzato in base ai tuoi obiettivi di salute specifici."
❌ "L'analisi nutrizionale tiene conto delle tue preferenze alimentari."

🚨 REGOLA FERREA CLASSIFICAZIONE PRODOTTI 🚨
PRIMA di qualsiasi analisi, devi determinare il tipo di prodotto:

1. Se vedi MARCA/BRAND (Mulino Bianco, Barilla, Ferrero, etc.) = SEMPRE "per_100g"
2. Se vedi CONFEZIONE con etichetta = SEMPRE "per_100g"  
3. Se vedi LOGO aziendale = SEMPRE "per_100g"

ESEMPI CHIARI:
- Tarallucci Mulino Bianco = "per_100g" (NON breakdown!)
- Biscotti Oro Saiwa = "per_100g" (NON breakdown!)
- Nutella Ferrero = "per_100g" (NON breakdown!)
- Oreo Nabisco = "per_100g" (NON breakdown!)
- Pane fatto in casa = "breakdown" (ingredienti visibili)
- Insalata = "breakdown" (ingredienti visibili)

ANCHE SE vedi ingredienti separati, MA c'è un BRAND = "per_100g"!

Rispondi SOLO con un JSON valido nel seguente formato:

PER PRODOTTI CONFEZIONATI CON BRAND ("per_100g"):
{
  "productNameFromVision": "[nome prodotto]",
  "brandFromVision": "[marca identificata]",
  "healthScore": [numero da 1 a 100],
  "analysis": "[analisi nutrizionale]",
  "pros": [{"title": "[beneficio]", "detail": "[dettaglio]"}],
  "cons": [{"title": "[problema]", "detail": "[dettaglio]"}],
  "neutrals": [{"title": "[neutro]", "detail": "[dettaglio]"}],
  "sustainabilityPros": [],
  "sustainabilityCons": [],
  "sustainabilityNeutrals": [],
  "calorie_estimation_type": "per_100g",
  "estimated_energy_kcal_100g": [numero],
  "estimated_proteins_100g": [numero],
  "estimated_carbs_100g": [numero], 
  "estimated_fats_100g": [numero],
  "calories_estimate": "~[numero] kcal per 100g",
  "sustainabilityScore": 0
}

PER PASTI CASALINGHI ("breakdown"):
{
  "productNameFromVision": "[nome pasto]",
  "brandFromVision": null,
  "healthScore": [numero da 1 a 100],
  "analysis": "[analisi nutrizionale]",
  "pros": [{"title": "[beneficio]", "detail": "[dettaglio]"}],
  "cons": [{"title": "[problema]", "detail": "[dettaglio]"}],
  "neutrals": [{"title": "[neutro]", "detail": "[dettaglio]"}],
  "sustainabilityPros": [],
  "sustainabilityCons": [],
  "sustainabilityNeutrals": [],
  "calorie_estimation_type": "breakdown",
  "ingredients_breakdown": [{"id":1,"name":"[ingrediente]","estimated_weight_g":50,"estimated_calories_kcal":100,"estimated_proteins_g":5,"estimated_carbs_g":15,"estimated_fats_g":2}],
  "calories_estimate": "Totale: ~[numero] kcal",
  "sustainabilityScore": 0
}
  `;
};