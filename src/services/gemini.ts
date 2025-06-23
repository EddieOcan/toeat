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
const geminiTextModel = google('gemini-2.5-flash-lite-preview-06-17');
const geminiVisionModel = google('gemini-2.5-flash-lite-preview-06-17');

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

// Timeout specifici per diversi tipi di chiamate - OTTIMIZZATI PER VELOCITÀ
const VISION_TIMEOUT = 15000; // 15 secondi per vision (ridotto da 25s)
const PRODUCT_TIMEOUT = 10000; // 10 secondi per prodotti (ridotto da 15s)
const CALORIES_TIMEOUT = 8000; // 8 secondi per calorie (ridotto da 10s)

// Utility per ottimizzare immagini base64 - MIGLIORATA PER VELOCITÀ
const optimizeImageBase64 = (base64: string, mimeType: string): string => {
  // Calcola la dimensione approssimativa dell'immagine
  const sizeInBytes = (base64.length * 3) / 4;
  const sizeInMB = sizeInBytes / (1024 * 1024);
  
  console.log(`[IMAGE OPT] Immagine ${mimeType} dimensione: ${sizeInMB.toFixed(2)}MB`);
  
  // OTTIMIZZAZIONE AGGRESSIVA: Se l'immagine è >1MB, compressione drastica
  if (sizeInMB > 1.0) { // Ridotto da 1.5MB a 1MB
    console.log(`[IMAGE OPT] Immagine troppo grande (${sizeInMB.toFixed(2)}MB), compressione AGGRESSIVA...`);
    
    // Compressione aggressiva per velocità massima
    const compressionRatio = Math.min(0.5, 1.0 / sizeInMB); // Max 50% dell'originale, più aggressiva
    const targetLength = Math.floor(base64.length * compressionRatio);
    const compressedBase64 = base64.substring(0, targetLength);
    
    const newSizeInMB = (compressedBase64.length * 3) / (4 * 1024 * 1024);
    console.log(`[IMAGE OPT] Immagine compressa a ${newSizeInMB.toFixed(2)}MB (${(compressionRatio * 100).toFixed(0)}% dell'originale)`);
    
    return compressedBase64;
  }
  
  // Anche per immagini <1MB, applica una leggera compressione per velocità
  if (sizeInMB > 0.5) {
    const lightCompressionRatio = 0.8; // 80% dell'originale
    const targetLength = Math.floor(base64.length * lightCompressionRatio);
    const compressedBase64 = base64.substring(0, targetLength);
    
    const newSizeInMB = (compressedBase64.length * 3) / (4 * 1024 * 1024);
    console.log(`[IMAGE OPT] Compressione leggera: ${newSizeInMB.toFixed(2)}MB (${(lightCompressionRatio * 100).toFixed(0)}% dell'originale)`);
    
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
      experimental_providerMetadata: {
        google: {
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }
      }
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
      experimental_providerMetadata: {
        google: {
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }
      }
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

🧠 METODOLOGIA RIGOROSA PER STIMA NUTRIZIONALE:

1. **IDENTIFICA CORRETTAMENTE**: Determina esattamente di che alimento si tratta
   - Correggi errori di battitura (es. "pomodoroo" → "pomodoro")
   - Specifica se crudo/cotto se rilevante (es. "pasta" → "pasta cotta" se nel contesto di un piatto)
   - Usa nomi standard e chiari

2. **STIMA PESO REALISTICA**: Se non specificato, usa porzioni REALI
   - Frutta media: 150-200g (mela, pera, arancia)
   - Verdure contorno: 80-120g 
   - Carne porzione: 100-150g
   - Pasta/riso cotti: 80-120g
   - Formaggio grattugiato: 10-20g
   - Olio condimento: 5-10g

3. **VALORI NUTRIZIONALI PRECISI**: Usa database nutrizionali ufficiali
   - Consulta valori USDA/CREA per l'alimento specifico
   - Distingui tra crudo e cotto (pasta cruda 350 kcal/100g, cotta 150 kcal/100g)
   - Arrotonda a 1 decimale per proteine/carbo/grassi
   - Arrotonda a numero intero per calorie

4. **CONTROLLO COERENZA**: Verifica che i valori siano sensati
   - Calorie = (proteine × 4) + (carbo × 4) + (grassi × 9)
   - Se i conti non tornano, ricontrolla i valori

⚠️ ERRORI COMUNI DA EVITARE:
❌ Confondere valori crudi con cotti
❌ Porzioni irrealistiche (500g di pasta!)
❌ Valori nutrizionali inventati
❌ Calcoli matematici sbagliati

CORREGGI NOME + STIMA NUTRIZIONALE PRECISA:

JSON:
{
  "corrected_name": "[nome corretto e specifico]",
  "estimated_calories_kcal": [numero intero o null],
  "estimated_proteins_g": [numero con 1 decimale o null],
  "estimated_carbs_g": [numero con 1 decimale o null],
  "estimated_fats_g": [numero con 1 decimale o null],
  "error_message": "[vuoto se OK, descrivi problema se presente]"
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
      experimental_providerMetadata: {
        google: {
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }
      }
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
 * Include condizionalmente le informazioni del profilo utente se fornite
 */
const createAnalysisPrompt = (product: RawProductData, userProfile?: any): string => {
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
  const hasEcoScore = product.ecoscore_grade && 
                      product.ecoscore_grade.toLowerCase() !== 'unknown' && 
                      product.ecoscore_grade.toLowerCase() !== 'not-applicable' &&
                      product.ecoscore_grade.toLowerCase() !== '' &&
                      product.ecoscore_grade.toLowerCase() !== 'null' &&
                      product.ecoscore_grade.toLowerCase() !== 'undefined';
  
  // Controlla se è acqua pura
  const isWater = product.product_name?.toLowerCase().includes('acqua') && 
                  !product.product_name?.toLowerCase().includes('aromatizzata') &&
                  !product.product_name?.toLowerCase().includes('gassata con') &&
                  !product.product_name?.toLowerCase().includes('vitaminizzata') &&
                  (product.nutriments?.energy_kcal_100g === 0 || !product.nutriments?.energy_kcal_100g);
  
  // Sezione profilo utente - aggiunta condizionalmente
  let userInfo = '';
  if (userProfile && (userProfile.profile || (userProfile.goals && userProfile.goals.length > 0))) {
    userInfo = "\n\nPROFILO UTENTE:\n";
    
    if (userProfile.profile) {
      userInfo += `- ID Utente: ${userProfile.profile.user_id}\n`;
    } else {
      userInfo += `- Profilo base non configurato\n`;
    }

    if (userProfile.goals && userProfile.goals.length > 0) {
      userInfo += "\nOBIETTIVI DI SALUTE:\n";
      userProfile.goals.forEach((goal: any, index: number) => {
        userInfo += `${index + 1}. ${goal.name}: ${goal.description}\n`;
      });
    } else {
      userInfo += "\nNessun obiettivo di salute specifico impostato.\n";
    }
  }
  
  return `${userInfo}
PRODOTTO: ${formatField(product.product_name)} | ${formatField(product.brands)}
INGREDIENTI: ${formatField(product.ingredients_text)}
ADDITIVI: ${formatField(product.additives_tags)}
VALORI/100g: ${formatNutriment(product.nutriments?.energy_kcal_100g, "kcal")} | Grassi:${formatNutriment(product.nutriments?.fat_100g)}g | Carbo:${formatNutriment(product.nutriments?.carbohydrates_100g)}g | Proteine:${formatNutriment(product.nutriments?.proteins_100g)}g | Sale:${formatNutriment(product.nutriments?.salt_100g)}g
SCORE ESISTENTI: Nutri:${formatField(product.nutrition_grades?.toUpperCase())} | Nova:${formatField(product.nova_group)} | Eco:${formatField(product.ecoscore_grade?.toUpperCase())}
${estimateNutritionPrompt}

ANALISI NUTRIZIONALE SCIENTIFICA STILE YUKA${userProfile ? ' PERSONALIZZATA' : ''}:

🚨 CASO SPECIALE ACQUA: Se il prodotto è ACQUA PURA NATURALE (senza additivi, aromi, vitamine), assegna SEMPRE healthScore: 100

HEALTH SCORE${userProfile ? ' PERSONALIZZATO' : ''} (1-100): Basato SOLO su impatto nutrizionale e sanitario
${hasNutriScore ? `
MAPPATURA NUTRI-SCORE UFFICIALE (usa ESATTAMENTE questi intervalli):
• Nutri-Score E → 1-20 punti (prodotti molto scadenti)
• Nutri-Score D → 21-40 punti (prodotti scadenti) 
• Nutri-Score C → 41-60 punti (prodotti medi)
• Nutri-Score B → 61-90 punti (prodotti buoni)
• Nutri-Score A → 91-100 punti (prodotti eccellenti)

Considera anche i fattori NOVA, additivi, e qualità ingredienti per affinare il punteggio nell'intervallo Nutri-Score.${userProfile ? '\nPOI PERSONALIZZA in base agli obiettivi utente (±15 punti per allineamento agli obiettivi)' : ''}` : `
RIFERIMENTI SCIENTIFICI INTERNAZIONALI (consulta database nutrizionali WHO/FAO/EFSA):
• Alimenti naturali integrali: 85-100 (frutta fresca, verdure, cereali integrali)
• Minimamente processati: 65-84 (yogurt naturale, formaggi freschi, pane integrale)
• Processati: 35-64 (conserve, salumi, formaggi stagionati)
• Ultra-processati: 10-34 (snack industriali, bevande zuccherate, dolci confezionati)
• Ad alto rischio nutrizionale: 1-9 (prodotti con additivi nocivi, trans grassi)

🎯 USA TUTTO IL RANGE!! IMPORTANTE!!! Usa punteggi precisi come 23, 47, 68, 84, 93, etc, non usare assolutamente il 15!
🚨 IMPORTANTE: Anche con Nutri-Score ufficiale, usa punteggi PRECISI nell'intervallo (es. Nutri-C = 41-60, usa 43, 52, 58, NON 50!)${userProfile ? '\nPOI PERSONALIZZA in base agli obiettivi utente (±15 punti per allineamento agli obiettivi)' : ''}`}

NOVA: Gruppo 1=+0, 2=-5, 3=-15, 4=-25 punti (modifica il punteggio base)

VALUTAZIONE ADDITIVI (secondo EFSA/FDA/studi internazionali):
🟢 SICURI/BENEFICI: E300-E309 (antiossidanti naturali), E306-E309 (tocoferoli), E330 (acido citrico), E440 (pectine), E407 (carragenina), probiotici
🟡 NEUTRI/STANDARD: E322 (lecitina), E415 (gomma di xantano), E412 (gomma di guar), E471 (mono/digliceridi)
🔴 CONTROVERSI/DANNOSI: E250/E252 (nitriti/nitrati), E621 (glutammato), E102/E110/E122/E124/E129 (coloranti azoici), E320/E321 (BHA/BHT), E951 (aspartame in eccesso), E220-E228 (solfiti), E200-E203 (acido sorbico)

ISTRUZIONI ADDITIVI:
- Crea un contro/neutro PER OGNI ADDITIVO che consideri quasi sicuro o proprio dannoso, usando una classificazione scientifica EFSA/FDA
- Includi il codice E nel titolo quando disponibile
- Includi il codice E nel titolo quando disponibile
- Spiega il meccanismo d'azione e i rischi/benefici nel dettaglio
- Devi sottrarre 10 punti al health score per ogni additivo che consideri dannoso o controverso oppure 5 per ogni additivo che consideri neutro o sicuro.
${userProfile ? `
- PERSONALIZZA la valutazione in base agli obiettivi utente (es. se vuole "ridurre infiammazione" penalizza additivi pro-infiammatori)` : ''}

SOSTENIBILITÀ: ${hasEcoScore ? `Eco-Score: A=84-97, B=63-83, C=39-62, D=16-38, E=1-15` : `0 - Ecoscore non disponibile - NON GENERARE PRO/CONTRO/NEUTRI SOSTENIBILITÀ`}${userProfile ? `

ISTRUZIONI SCIENTIFICHE AVANZATE PERSONALIZZATE:
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
5. Se l'utente vuole "ridurre infiammazione" → premia antiossidanti, penalizza omega-6 eccessivi` : ''}

COSA VALUTARE (SOLO ASPETTI NUTRIZIONALI/SANITARI e INFORMAZIONI/CURIOSITÀ SCIENTIFICHE VALIDE):


⚠️ IMPORTANTE: NON creare PRO/CONTRO/NEUTRI per Nutri-Score, NOVA o Eco-Score! 
L'app aggiunge automaticamente le descrizioni standard per questi score.
NON includere campi nutriScoreExplanation, novaExplanation, ecoScoreExplanation nel JSON.

🚨 REGOLA ECOSCORE: ${hasEcoScore ? 'Eco-Score disponibile ma NON GENERARE sustainabilityPros/Cons/Neutrals per il punteggio Eco-Score stesso - l\'app aggiunge automaticamente la descrizione standard. Genera solo sustainabilityPros/Cons/Neutrals per ALTRI aspetti ambientali (packaging, origine, trasporto, etc.)' : 'ECOSCORE NON DISPONIBILE (unknown/not-applicable) - NON GENERARE NESSUN sustainabilityPros/Cons/Neutrals - lascia array COMPLETAMENTE VUOTI []!'}

PRO - Identifica SOLO se presenti (ESCLUSI Nutri-Score, NOVA, Eco-Score):
✅ Vitamine/minerali in quantità significative (>15% RDA)
✅ Fibre alimentari (>3g/100g)
✅ Proteine complete di qualità
✅ Acidi grassi essenziali (omega-3, omega-6)
✅ Antiossidanti naturali quantificabili
✅ Basso contenuto di sodio (<0.3g/100g)
✅ Assenza di zuccheri aggiunti
✅ Assenza di additivi problematici
✅ Additivi sicuri/benefici (es. E300-Vitamina C, E306-Tocoferoli, probiotici)
✅ Informazioni/curiosità scientifiche interessanti BASATE su linee guida internazionali WHO/FAO/EFSA

CONTRO - Identifica SOLO se presenti (ESCLUSI Nutri-Score, NOVA, Eco-Score):
❌ Eccesso di zuccheri (>15g/100g o >22.5g/porzione)
❌ Eccesso di grassi saturi (>5g/100g)
❌ Eccesso di sodio (>1.5g/100g)
❌ Additivi controversi/dannosi secondo EFSA/FDA (E250-nitriti, E621-glutammato, E102-tartrazina, E110-giallo tramonto, E122-azorubina, E124-rosso cocciniglia, E129-rosso allura, BHA-E320, BHT-E321, E951-aspartame in eccesso)
❌ Grassi trans (>0.2g/100g)
❌ Alto indice glicemico con zuccheri semplici
❌ Ultra-processamento (NOVA 4)
❌ Informazioni/curiosità scientifiche interessanti BASATE su linee guida internazionali WHO/FAO/EFSA

NEUTRI - Usa per aspetti non rilevanti o bilanciati (ESCLUSI Nutri-Score, NOVA, Eco-Score):
➖ Nutrienti presenti ma in quantità normali
➖ Aspetti che non impattano significativamente la salute
➖ Caratteristiche standard per la categoria

🚨 REGOLE FERREE PER TITOLI PRO/CONTRO/NEUTRALI:
❌ MAI usare parentesi nei titoli o specificazioni tecniche  
❌ MAI aggiungere "(Stima AI)" o "(fonte dati)" nei titoli
❌ MAI usare due punti seguiti da specificazioni nel titolo
✅ SEMPRE titoli SEMPLICI, DIRETTI e DISCORSIVI
✅ Massimo 4-5 parole per titolo
✅ Stile naturale come una conversazione
✅ AGGIUNGI I NUMERI QUANDO DISPONIBILI per giustificare (es. "Basso contenuto proteine 5g")

ESEMPI TITOLI CORRETTI (OBBLIGATORI):
PRO: "Proteine di alta qualità"
PRO: "Ricco di fibre 8g"  
PRO: "Basso contenuto sodio 0.2g"
PRO: "Vitamina C elevata 89mg"
CONTRO: "Grassi saturi elevati 12g"
CONTRO: "Zuccheri eccessivi 25g"
CONTRO: "Alto contenuto sodio 1.8g" 
CONTRO: "Basso contenuto proteine 2g"
NEUTRO: "Apporto calorico standard"
NEUTRO: "Contenuto proteico moderato 8g"

ESEMPI TITOLI SBAGLIATI (DA EVITARE):
❌ "Vitamina C: 89mg/100g (99% RDA)"
❌ "Zuccheri: 25g/100g (125% limite OMS)"
❌ "Sodio: 1.8g/100g (Stima AI)"
❌ "Proteine: 2.1g/100g (valore standard)"

REGOLE FERREE:
❌ MAI dire "0g di X" come CONTRO (è neutro o positivo!)
❌ MAI creare neutri per "ASSENZA" di nutrienti (es. "Assenza di proteine" - VIETATO!)
❌ MAI valutare effetti psicologici (concentrazione, energia mentale)
❌ MAI commentare sapore, texture, appetibilità
❌ MAI giustificare con frasi tipo "normale per la categoria"
❌ MAI inventare problemi inesistenti

✅ SOLO valutazioni nutrizionali oggettive con soglie scientifiche
✅ SOLO quantità misurabili con riferimenti WHO/FAO/EFSA
✅ USA neutri SOLO per nutrienti PRESENTI ma in quantità standard/non rilevanti
✅ TITOLI SEMPLICI con NUMERI quando disponibili per giustificare
✅ Sii conciso e ottimizzato per velocità
✅ PUNTEGGI PRECISI: usa 23, 47, 68, 84, 93 invece di 25, 50, 70, 85, 95
🚨 IMPORTANTE: Anche con Nutri-Score ufficiale, usa punteggi PRECISI nell'intervallo (es. Nutri-C = 41-60, usa 43, 52, 58, NON 50!)

🚀 OTTIMIZZAZIONE TOKEN OUTPUT:
- Mantieni il dettaglio scientifico ma usa frasi CONCISE e DIRETTE
- Evita ripetizioni e frasi di riempimento
- Usa abbreviazioni scientifiche standard (es: "RDA" invece di "dose giornaliera raccomandata")
- Combina concetti correlati in una singola frase quando possibile
- Massimo 2 righe per campo "detail" nei pro/contro/neutrali
- Campo "analysis": descrivi in modo chiaro, breve e conciso le proprietà del prodotto, scientifico e vai dritto al punto, breve emax 200 caratteri.
- Spiegazioni score: 1 frase concisa per ciascuna

JSON OTTIMIZZATO:
{
  "healthScore": [numero PRECISO da 1-100, non usare multipli di 5],
  "sustainabilityScore": [${hasEcoScore ? 'numero 1-100' : '0'}],
  "analysis": "[max 2 frasi: composizione + impatto nutrizionale]",
  "pros": [{"title":"[Nutriente]: [numero][unità] ([fonte])","detail":"[significato sanitario + riferimento scientifico]"}],
  "cons": [{"title":"[Problema]: [numero][unità] ([fonte])","detail":"[rischio sanitario + soglia limite]"}],
  "neutrals": [{"title":"[Aspetto]: [numero][unità] (valore standard)","detail":"[descrizione neutra]"}],

  "sustainabilityPros": [${hasEcoScore ? '{"title":"[aspetto]","detail":"[dato]"}' : ''}],
  "sustainabilityCons": [${hasEcoScore ? '{"title":"[problema]","detail":"[impatto]"}' : ''}],
  "sustainabilityNeutrals": [${hasEcoScore ? '' : ''}]
  ${missingNutritionalInfo ? `,"estimated_energy_kcal_100g":[numero],"estimated_proteins_100g":[numero],"estimated_carbs_100g":[numero],"estimated_fats_100g":[numero]` : ''}
}`;
};

/**
 * Crea un prompt dettagliato per l'analisi visiva del prodotto con criteri scientifici come Yuka
 * Include condizionalmente le informazioni del profilo utente se fornite
 */
const createVisualAnalysisPrompt = (productNameHint: string, userProfile?: any): string => {
  // Sezione profilo utente - aggiunta condizionalmente
  let userInfo = '';
  if (userProfile && (userProfile.profile || (userProfile.goals && userProfile.goals.length > 0))) {
    userInfo = "PROFILO UTENTE:\n";
    
    if (userProfile.profile) {
      userInfo += `- ID Utente: ${userProfile.profile.user_id}\n`;
    } else {
      userInfo += `- Profilo base non configurato\n`;
    }

    if (userProfile.goals && userProfile.goals.length > 0) {
      userInfo += "\nOBIETTIVI DI SALUTE:\n";
      userProfile.goals.forEach((goal: any, index: number) => {
        userInfo += `${index + 1}. ${goal.name}: ${goal.description}\n`;
      });
    } else {
      userInfo += "\nNessun obiettivo di salute specifico impostato.\n";
    }
    userInfo += "\n";
  }

  return `${userInfo}ANALISI VISIVA CIBO: ${productNameHint}

ANALISI NUTRIZIONALE SCIENTIFICA STILE YUKA${userProfile ? ' PERSONALIZZATA' : ''}:

🚨 CASO SPECIALE ACQUA: Se il prodotto è ACQUA PURA NATURALE (senza additivi, aromi, vitamine), assegna SEMPRE healthScore: 100

HEALTH SCORE${userProfile ? ' PERSONALIZZATO' : ''} (1-100): Basato SOLO su composizione nutrizionale identificata
RIFERIMENTI SCIENTIFICI INTERNAZIONALI (consulta database nutrizionali WHO/FAO/EFSA):
• Alimenti naturali integrali: 85-100 (frutta fresca, verdure crude, cereali integrali, legumi)
• Minimamente processati: 65-84 (yogurt naturale, formaggi freschi, pane integrale, pesce al vapore)
• Processati: 35-64 (conserve vegetali, salumi artigianali, formaggi stagionati, pane bianco)
• Ultra-processati: 10-34 (snack industriali, bevande zuccherate, dolci confezionati, fritture)
• Ad alto rischio nutrizionale: 1-9 (prodotti con additivi nocivi, trans grassi, eccesso zuccheri/sodio)

🎯 USA TUTTO IL RANGE: Non limitarti a multipli di 5! Usa punteggi precisi come 23, 47, 68, 84, 93, etc.
Considera processamento visibile, metodi di cottura, qualità ingredienti per punteggio preciso.${userProfile ? '\nPOI PERSONALIZZA in base agli obiettivi utente (±15 punti per allineamento agli obiettivi)' : ''}

SOSTENIBILITÀ: 0 - "Ecoscore non disponibile per analisi foto"

METODOLOGIA SCIENTIFICA${userProfile ? ' PERSONALIZZATA' : ''}:
1. Identifica precisamente il cibo consultando database nutrizionali internazionali
2. Stima composizione nutrizionale basata su linee guida WHO/FAO/EFSA
3. Valuta processamento visibile secondo classificazione NOVA
4. Calcola score nutrizionale con criteri scientifici oggettivi
5. Identifica pro/contro/neutri basati su evidenze nutrizionali${userProfile ? `
6. PERSONALIZZA IL PUNTEGGIO in base al profilo e obiettivi dell'utente
7. Per ogni PRO/CONTRO GIUSTIFICA come si collega agli obiettivi di salute

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
5. Se l'utente vuole "ridurre infiammazione" → premia antiossidanti, penalizza omega-6 eccessivi` : ''}

COSA VALUTARE (SOLO ASPETTI NUTRIZIONALI/SANITARI BASATI SU EVIDENZE SCIENTIFICHE):

PRO - Identifica SOLO se stimabili con riferimenti WHO/FAO/EFSA:
✅ Vitamine/minerali significativi (>15% RDA secondo linee guida internazionali)
✅ Fibre alimentari (>3g/100g secondo raccomandazioni WHO)
✅ Proteine di qualità visibili (aminoacidi essenziali completi)
✅ Grassi buoni identificabili (omega-3, monoinsaturi)
✅ Antiossidanti naturali stimabili (polifenoli, carotenoidi, vitamina C)
✅ Basso sodio (<0.3g/100g secondo WHO)
✅ Nessun zucchero aggiunto visibile
✅ Cottura salutare (vapore, griglia senza carbonizzazione)

CONTRO - Identifica SOLO se stimabili con soglie scientifiche WHO/FAO/EFSA:
❌ Zuccheri eccessivi (>15g/100g secondo linee guida WHO)
❌ Grassi saturi eccessivi (>5g/100g secondo raccomandazioni FAO)
❌ Sodio eccessivo (>1.5g/100g secondo soglie WHO)
❌ Frittura/cottura ad alte temperature visibile (formazione acrilamide/AGE)
❌ Processamento industriale evidente (classificazione NOVA 4)
❌ Additivi/conservanti visibili (coloranti artificiali, conservanti chimici)
❌ Densità calorica eccessiva per categoria (>400 kcal/100g per snack)

NEUTRI - SOLO per nutrienti PRESENTI in quantità standard:
➖ Nutrienti presenti in quantità normali per la categoria (secondo EFSA)
➖ Aspetti presenti che non impattano significativamente (evidenze scientifiche limitate)
➖ Caratteristiche presenti e bilanciate per tipologia alimentare
❌ MAI dire "Assenza di X" o "Mancanza di Y" - VIETATO!

🚨 REGOLE FERREE PER TITOLI PRO/CONTRO/NEUTRALI:
❌ MAI usare parentesi nei titoli o specificazioni tecniche
❌ MAI aggiungere numeri o unità di misura nei titoli
❌ MAI usare due punti seguiti da specificazioni nel titolo
✅ SEMPRE titoli SEMPLICI, DIRETTI e DISCORSIVI
✅ Massimo 4-5 parole per titolo
✅ Stile naturale come una conversazione

ESEMPI TITOLI CORRETTI (OBBLIGATORI):
PRO: "Proteine di alta qualità"
PRO: "Ferro biodisponibile"  
PRO: "Antiossidanti dalle verdure"
PRO: "Fibre per la digestione"
CONTRO: "Grassi saturi elevati"
CONTRO: "Zuccheri aggiunti"
CONTRO: "Sodio eccessivo" 
NEUTRO: "Apporto calorico standard"
NEUTRO: "Contenuto proteico moderato"

ESEMPI TITOLI SBAGLIATI (DA EVITARE):
❌ "Vitamina C: 65mg/100g (Stima AI)"
❌ "Zuccheri: 18g/100g (Stima AI)"
❌ "Sodio: 1.2g/100g (Stima AI)"
❌ "Calorie: 52kcal/100g (densità normale)"

REGOLE FERREE:
❌ MAI dire "0g di X" come CONTRO
❌ MAI creare neutri per "ASSENZA" di nutrienti (es. "Assenza di proteine" - VIETATO!)
❌ MAI valutare effetti psicologici/energetici
❌ MAI commentare aspetto estetico o gusto/sapore
❌ MAI inventare problemi inesistenti
✅ SOLO stime nutrizionali oggettive basate su database WHO/FAO/EFSA
✅ USA neutri SOLO per nutrienti PRESENTI ma in quantità standard/non rilevanti
✅ TITOLI SEMPLICI E DISCORSIVI
✅ Massima concisione per velocità
✅ PUNTEGGI PRECISI: usa 23, 47, 68, 84, 93 invece di 25, 50, 70, 85, 95

REGOLE NOME E DESCRIZIONE:
❌ MAI nomi come "Pane (tipologia non definita, probabilmente...)" → USA "Pane"
❌ MAI frasi generiche come "importante per la salute"
✅ Nome max 3 parole (es: "Pane integrale", "Pizza margherita")
✅ Analisi DIRETTA sui valori nutrizionali basata su evidenze scientifiche

TIPOLOGIA PRODOTTO - DETERMINA CORRETTAMENTE:

🍽️ PASTO (breakdown): SOLO per cibo CUCINATO, piatti FATTI IN CASA, pasti PREPARATI dal vivo
- Esempi: pasta al pomodoro, pizza fatta in casa, insalata, risotto, carne grigliata, verdure cotte
- Usa "calorie_estimation_type": "breakdown" 
- Includi "ingredients_breakdown" con ingredienti stimati
- "calories_estimate": "Totale: ~[numero] kcal"

🧠 METODOLOGIA RIGOROSA PER STIMA PESI E CALORIE PASTI:

1. **ANALISI VISIVA PRECISA**: Osserva ATTENTAMENTE le proporzioni degli ingredienti nel piatto
   - Stima la dimensione del piatto (standard ~25cm diametro)
   - Calcola la superficie occupata da ogni ingrediente
   - Considera l'altezza/spessore di ogni componente

2. **STIMA PESI REALISTICI**: Usa porzioni REALI, non teoriche
   - Pasta: 180g (non 100g sempre!)
   - Carne: 100-150g per porzione principale
   - Verdure crude: 50-100g per contorno
   - Verdure cotte: 80-120g (perdono volume)
   - Formaggio grattugiato: 10-20g (non 50g!)
   - Olio/condimenti: 5-15g (non esagerare!)

3. **CALORIE PRECISE PER PESO**: Usa database nutrizionali REALI
   - Pollo petto: ~165 kcal/100g
   - Manzo magro: ~200 kcal/100g
   - Verdure crude: 15-30 kcal/100g
   - Olio oliva: ~900 kcal/100g (attento alle quantità!)

5. **INGREDIENTI NASCOSTI**: Non dimenticare
   - Olio di cottura (5-10g = 45-90 kcal)
   - Sale/spezie (trascurabili per kcal)
   - Burro/margarina se visibili
   - Salse/condimenti

⚠️ ERRORI COMUNI DA EVITARE:
❌ Sovrastimare le porzioni (100g di tutto non è realistico)
❌ Dimenticare che la cottura cambia peso e densità
❌ Non considerare l'olio di cottura
❌ Calcoli matematici sbagliati nel breakdown

📦 PRODOTTO CONFEZIONATO (per_100g): TUTTO ciò che è INDUSTRIALE, con CONFEZIONE, MARCA, ETICHETTA
- Esempi OBBLIGATORI: biscotti, crackers, snack, merendine, cioccolato, caramelle, chips, cereali, yogurt confezionato, succhi, bevande
- ANCHE SE VEDI INGREDIENTI SEPARATI: se c'è una MARCA o CONFEZIONE = prodotto confezionato!
- Tarallucci, Oreo, Nutella, Pringles, Kinder = SEMPRE prodotto confezionato!
- Usa "calorie_estimation_type": "per_100g"
- NON includere "ingredients_breakdown" 
- Includi "estimated_energy_kcal_100g", "estimated_proteins_100g", "estimated_carbs_100g", "estimated_fats_100g"
- "calories_estimate": "~[numero] kcal per 100g"

REGOLA FERREA: Se vedi MARCA/BRAND = prodotto confezionato, NON pasto!

🚀 OTTIMIZZAZIONE TOKEN OUTPUT:
- Mantieni il dettaglio scientifico ma usa frasi CONCISE e DIRETTE
- Evita ripetizioni e frasi di riempimento
- Usa abbreviazioni scientifiche standard (es: "RDA" invece di "dose giornaliera raccomandata")
- Combina concetti correlati in una singola frase quando possibile
- Massimo 2 righe per campo "detail" nei pro/contro/neutrali
- Campo "analysis": descrivi in modo chiaro, breve e conciso le proprietà del prodotto, scientifico e vai dritto al punto, breve emax 200 caratteri.

JSON OTTIMIZZATO:

🚨 REGOLE FERREE PER NOMI INGREDIENTI:
❌ MAI scrivere peso nel nome: "Pasta (100g)"
❌ MAI errori di battitura: "Scotttona" 
❌ MAI specificazioni tecniche nel nome dell'ingrediente
✅ SEMPRE nomi PULITI e SEMPLICI: "Pasta", "Scottona", "Pomodoro"
✅ Il peso va SOLO nel campo "estimated_weight_g"
✅ Controlla SEMPRE l'ortografia

PER PASTI (solo piatti cucinati/fatti in casa):
{
  "productNameFromVision": "Pasta Pomodoro",
  "brandFromVision": null,
  "healthScore": [numero PRECISO 1-100, non usare multipli di 5],
  "analysis": "[analisi valori nutrizionali]",
  "pros": [{"title":"[TITOLO SEMPLICE]","detail":"[dettaglio con numeri e spiegazione]"}],
  "cons": [{"title":"[TITOLO SEMPLICE]","detail":"[dettaglio con numeri e spiegazione]"}],
  "neutrals": [{"title":"[TITOLO SEMPLICE]","detail":"[dettaglio]"}],
  "calorie_estimation_type": "breakdown",
  "ingredients_breakdown": [
    {
      "id": 1,
      "name": "Pasta",
      "estimated_weight_g": 125, (hai visto? è un numero preciso ce devi capire bene in base alla foto il peso)
      "estimated_calories_kcal": 350,
      "estimated_proteins_g": 4.5,
      "estimated_carbs_g": 27,
      "estimated_fats_g": 1.1
    },
    {
      "id": 2, 
      "name": "Pomodoro",
      "estimated_weight_g": 80,
      "estimated_calories_kcal": 14,
      "estimated_proteins_g": 0.9,
      "estimated_carbs_g": 2.7,
      "estimated_fats_g": 0.2
    },
    {
      "id": 3,
      "name": "Olio oliva",
      "estimated_weight_g": 8,
      "estimated_calories_kcal": 72,
      "estimated_proteins_g": 0,
      "estimated_carbs_g": 0,
      "estimated_fats_g": 8
    }
  ],
  "calories_estimate": "Totale: ~221 kcal",
  "sustainabilityScore": 0,
  "sustainabilityPros": [],
  "sustainabilityCons": [],
  "sustainabilityNeutrals": []
}


- Pomodoro 80g × 0.18 kcal/g = 14 kcal  
- Olio 8g × 9 kcal/g = 72 kcal
- TOTALE: 135 + 14 + 72 = 221 kcal ✅



PER PRODOTTI CONFEZIONATI (biscotti, snack, merendine con marca):
{
  "productNameFromVision": "Tarallucci",
  "brandFromVision": "Mulino Bianco",
  "healthScore": [numero PRECISO 1-100, non per forza multipli di 5],
  "analysis": "[analisi valori nutrizionali]",
  "pros": [{"title":"[TITOLO SEMPLICE]","detail":"[dettaglio con numeri e spiegazione]"}],
  "cons": [{"title":"[TITOLO SEMPLICE]","detail":"[dettaglio con numeri e spiegazione]"}],
  "neutrals": [{"title":"[TITOLO SEMPLICE]","detail":"[dettaglio]"}],
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
    
    // *** DEBUG: MOSTRA LA RISPOSTA COMPLETA ***
    console.log(`[GEMINI AI-SDK PARSE DEBUG] RISPOSTA COMPLETA RICEVUTA:`);
    console.log(`"${response}"`);
    console.log(`[GEMINI AI-SDK PARSE DEBUG] FINE RISPOSTA COMPLETA`);

    // Cerca il JSON nella risposta con regex più robusta
    let jsonStr = '';
    let jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
      console.log(`[GEMINI AI-SDK PARSE] JSON trovato nella risposta (lunghezza: ${jsonStr.length} caratteri)`);
      console.log(`[GEMINI AI-SDK PARSE DEBUG] JSON ESTRATTO: "${jsonStr}"`);
      
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
    } else {
      console.error(`[GEMINI AI-SDK PARSE ERROR] NESSUN JSON TROVATO! Risposta non contiene { }`);
      console.log(`[GEMINI AI-SDK PARSE DEBUG] Primi 100 caratteri: "${response.substring(0, 100)}"`);
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

      // Assicurati che sustainabilityScore sia 0 se non disponibile o nullo
      if (typeof result.sustainabilityScore !== "number" || result.sustainabilityScore < 0) {
        result.sustainabilityScore = 0;
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
    sustainabilityScore: 0, // Imposta 0 quando non disponibile
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
    const personalizedPrompt = createAnalysisPrompt(product, userProfile);
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
      experimental_providerMetadata: {
        google: {
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }
      }
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
    const personalizedVisualPrompt = createVisualAnalysisPrompt(productNameHint, userProfile);
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
      experimental_providerMetadata: {
        google: {
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }
      }
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

// DESCRIZIONI STANDARD FISSE PER SCORE UFFICIALI - ESPORTATE
export const NUTRI_SCORE_DESCRIPTIONS: Record<string, { type: 'pro' | 'con' | 'neutral', title: string, detail: string }> = {
  'A': { type: 'pro', title: 'Nutri-Score A', detail: 'Prodotto con profilo nutrizionale eccellente secondo il sistema di valutazione europeo Nutri-Score.' },
  'B': { type: 'pro', title: 'Nutri-Score B', detail: 'Prodotto con buon profilo nutrizionale secondo il sistema di valutazione europeo Nutri-Score.' },
  'C': { type: 'neutral', title: 'Nutri-Score C', detail: 'Prodotto con profilo nutrizionale medio secondo il sistema di valutazione europeo Nutri-Score.' },
  'D': { type: 'con', title: 'Nutri-Score D', detail: 'Prodotto con profilo nutrizionale scadente secondo il sistema di valutazione europeo Nutri-Score.' },
  'E': { type: 'con', title: 'Nutri-Score E', detail: 'Prodotto con profilo nutrizionale molto scadente secondo il sistema di valutazione europeo Nutri-Score.' }
};

export const ECO_SCORE_DESCRIPTIONS: Record<string, { type: 'pro' | 'con' | 'neutral', title: string, detail: string }> = {
  'A': { type: 'pro', title: 'Eco-Score A', detail: 'Prodotto con impatto ambientale molto basso secondo il sistema di valutazione Eco-Score.' },
  'B': { type: 'pro', title: 'Eco-Score B', detail: 'Prodotto con basso impatto ambientale secondo il sistema di valutazione Eco-Score.' },
  'C': { type: 'neutral', title: 'Eco-Score C', detail: 'Prodotto con impatto ambientale moderato secondo il sistema di valutazione Eco-Score.' },
  'D': { type: 'con', title: 'Eco-Score D', detail: 'Prodotto con alto impatto ambientale secondo il sistema di valutazione Eco-Score.' },
  'E': { type: 'con', title: 'Eco-Score E', detail: 'Prodotto con impatto ambientale molto alto secondo il sistema di valutazione Eco-Score.' }
};

export const NOVA_DESCRIPTIONS: Record<string, { type: 'pro' | 'con' | 'neutral', title: string, detail: string }> = {
  '1': { type: 'pro', title: 'NOVA Gruppo 1', detail: 'Alimento non trasformato o minimamente trasformato secondo la classificazione NOVA.' },
  '2': { type: 'neutral', title: 'NOVA Gruppo 2', detail: 'Ingrediente culinario trasformato secondo la classificazione NOVA.' },
  '3': { type: 'con', title: 'NOVA Gruppo 3', detail: 'Alimento trasformato secondo la classificazione NOVA.' },
  '4': { type: 'con', title: 'NOVA Gruppo 4', detail: 'Alimento ultra-trasformato secondo la classificazione NOVA.' }
};



