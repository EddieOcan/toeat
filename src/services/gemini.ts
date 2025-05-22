import type { RawProductData } from "./api"

// Chiave API di Google Gemini
const GEMINI_API_KEY = "AIzaSyAEGyih0ORP7r6Ej041q-fKRyCYbRgeaKw"
const GEMINI_MODEL = "gemini-1.5-flash"
const GEMINI_TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const GEMINI_VISION_MODEL = "gemini-1.5-flash"
const GEMINI_VISION_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`

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
  recommendations: string[] // Solo salute per analisi foto
  sustainabilityAnalysis: string // Vuoto o non presente per analisi foto
  sustainabilityPros: Array<{title: string, detail: string}> // Vuoto o non presente per analisi foto
  sustainabilityCons: Array<{title: string, detail: string}> // Vuoto o non presente per analisi foto
  sustainabilityNeutrals?: Array<{title: string, detail: string}> // Elementi neutrali/intermedi per la sostenibilità
  sustainabilityRecommendations: string[] // Vuoto o non presente per analisi foto
  productNameFromVision?: string // Nome prodotto identificato da Gemini Vision (opzionale)
  brandFromVision?: string // Marca identificata da Gemini Vision (opzionale)
  suggestedPortionGrams?: number; // Porzione suggerita in grammi (per prodotti con barcode)
  nutriScoreExplanation?: string; // Spiegazione Nutri-Score (solo salute per analisi foto)
  novaExplanation?: string; // Spiegazione NOVA (solo salute per analisi foto)
  ecoScoreExplanation?: string; // Vuoto o non presente per analisi foto
  
  // CAMPI SPECIFICI PER NUOVA ANALISI CALORIE FOTO
  calorie_estimation_type?: 'breakdown' | 'per_100g' | 'per_serving_packaged'; 
  ingredients_breakdown?: EstimatedIngredient[]; 
  // calories_estimate conterrà:
  // - Per 'breakdown': la somma totale formattata (es. "Totale: ~550 kcal")
  // - Per 'per_100g': la stima per 100g (es. "~450 kcal per 100g")
  // - Per 'per_serving_packaged': la stima per porzione del prodotto confezionato (es. "~180 kcal per porzione (30g)")
  calories_estimate?: string; 
}

// NUOVA INTERFACCIA PER LA RISPOSTA DELLA STIMA CALORIE SINGOLO INGREDIENTE
export interface SingleIngredientEstimateResponse {
  calories: number | null;
  correctedName: string | null;
  error: boolean;
  errorMessage?: string;
  proteins?: number | null; // Proteine stimate in grammi
  carbs?: number | null; // Carboidrati stimati in grammi
  fats?: number | null; // Grassi stimati in grammi
}

/**
 * Analizza un prodotto alimentare utilizzando Google Gemini
 * @param product Dati del prodotto da OpenFoodFacts o analisi visiva (RawProductData)
 * @returns Risultato dell'analisi
 */
export const analyzeProductWithGemini = async (product: RawProductData): Promise<GeminiAnalysisResult> => {
  try {
    console.log(`[GEMINI START] Avvio analisi per il prodotto ${product.code}: ${product.product_name}`)
    console.time(`[GEMINI TIMING] Analisi completa per ${product.code}`)

    // Costruisci un prompt dettagliato per ottenere risultati coerenti
    const prompt = createAnalysisPrompt(product)
    console.log(`[GEMINI PROMPT] Prompt generato per ${product.code} (lunghezza: ${prompt.length} caratteri)`)

    // Chiama l'API di Google Gemini
    console.log(`[GEMINI API] Chiamata API per ${product.code}`)
    console.time(`[GEMINI API TIMING] Chiamata API per ${product.code}`)

    const response = await fetch(`${GEMINI_TEXT_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1, // Temperatura bassa per risultati più deterministici
          topK: 32,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
      }),
    })

    console.timeEnd(`[GEMINI API TIMING] Chiamata API per ${product.code}`)

    if (!response.ok) {
      const errorData = await response.json()
      console.error(`[GEMINI API ERROR] Errore nella risposta API per ${product.code}:`, errorData)
      throw new Error(`Errore API Gemini: ${errorData.error?.message || "Errore sconosciuto"}`)
    }

    const data = await response.json()
    const generatedText = data.candidates[0]?.content?.parts[0]?.text || ""
    console.log(
      `[GEMINI RESPONSE] Risposta ricevuta per ${product.code} (lunghezza: ${generatedText.length} caratteri)`,
    )

    // Analizza la risposta di Gemini per estrarre i dati strutturati
    console.log(`[GEMINI PARSE] Analisi della risposta per ${product.code}`)
    const result = parseGeminiResponse(generatedText)

    console.timeEnd(`[GEMINI TIMING] Analisi completa per ${product.code}`)
    console.log(`[GEMINI SUCCESS] Analisi completata per ${product.code}:`, {
      healthScore: result.healthScore,
      sustainabilityScore: result.sustainabilityScore,
    })

    return result
  } catch (error) {
    console.error(`[GEMINI ERROR] Errore nell'analisi con Gemini per ${product.code}:`, error)
    throw new Error("Si è verificato un errore durante l'analisi del prodotto.")
  }
}

/**
 * Crea un prompt dettagliato per l'analisi del prodotto
 */
const createAnalysisPrompt = (product: RawProductData): string => {
  // Helper per formattare array di tag o stringhe opzionali
  const formatField = (value: string | string[] | undefined | null, defaultValue: string = "Non disponibile") => {
    if (Array.isArray(value) && value.length > 0) return value.join(', ');
    return value || defaultValue;
  };

  const formatNutriment = (value: number | undefined | null, unit: string = "g", defaultValue: string = "N/A") => {
    return (value !== undefined && value !== null) ? `${value}${unit}` : defaultValue; // Rimosso spazio per compattezza se preferito
  };

  // Definisci qui le fasce di punteggio per chiarezza
  const healthScoreRanges = {
    A: { min: 90, max: 100, desc: "eccellente" },
    B: { min: 75, max: 89, desc: "buono" },
    C: { min: 60, max: 74, desc: "discreto" },
    D: { min: 40, max: 59, desc: "scarso" },
    E: { min: 0, max: 39, desc: "molto scarso/da evitare" },
    default: { min: 0, max: 100, desc: "valutato su altri criteri" }
  };

  const nutriScore = product.nutrition_grades?.toUpperCase();
  const novaScore = product.nova_group?.toString(); // Prendi valore NOVA
  const ecoScore = product.ecoscore_grade?.toUpperCase(); // Prendi valore Eco-Score
  
  const currentHealthRange = (nutriScore && healthScoreRanges[nutriScore as keyof typeof healthScoreRanges]) 
                             ? healthScoreRanges[nutriScore as keyof typeof healthScoreRanges] 
                             : healthScoreRanges.default;

  // Determina se mancano i valori nutrizionali principali
  const missingNutritionalInfo = !product.nutriments?.energy_kcal_100g && 
                                !product.nutriments?.proteins_100g && 
                                !product.nutriments?.carbohydrates_100g && 
                                !product.nutriments?.fat_100g;
  
  // Aggiungi istruzioni speciali per generare stime nutrizionali se mancano
  const estimateNutritionPrompt = missingNutritionalInfo ? `
  IMPORTANTE: I valori nutrizionali per questo prodotto NON SONO DISPONIBILI nei dati di OpenFoodFacts.
  
  DEVI STIMARE i seguenti valori nutrizionali per 100g di prodotto, basandoti sul tuo database di conoscenze:
  1. Calorie (kcal)
  2. Proteine (g)
  3. Carboidrati (g)
  4. Grassi (g)
  
  Aggiungi questi valori nel tuo JSON di risposta usando i seguenti campi:
  - "estimated_energy_kcal_100g": stima delle calorie per 100g (numero intero)
  - "estimated_proteins_100g": stima delle proteine per 100g (numero con 1 decimale)
  - "estimated_carbs_100g": stima dei carboidrati per 100g (numero con 1 decimale)
  - "estimated_fats_100g": stima dei grassi per 100g (numero con 1 decimale)
  
  Queste stime dovranno essere utilizzate in assenza dei valori reali, quindi sii il più accurato possibile.
  ` : '';
  
  return `
  Analizza questo prodotto alimentare basandoti sui dati di OpenFoodFacts e fornisci un'analisi nutrizionale e di sostenibilità.
  
  DATI DEL PRODOTTO:
  Nome: ${formatField(product.product_name)}
  Marca: ${formatField(product.brands)}
  Categoria: ${formatField(product.categories)}
  Ingredients: ${formatField(product.ingredients_text)}
  Paese di vendita: ${formatField(product.countries)}
  Nutri-Score: ${formatField(product.nutrition_grades)}
  Eco-Score: ${formatField(product.ecoscore_grade)}
  Nova Score: ${formatField(product.nova_group || 
    (product.nutriments && 'nova_group' in product.nutriments ? product.nutriments.nova_group : undefined))}
  
  VALORI NUTRIZIONALI (per 100g/ml):
  Energia: ${formatNutriment(product.nutriments?.energy_kcal_100g)} kcal / ${formatNutriment(product.nutriments?.energy_100g)} kJ
  Grassi: ${formatNutriment(product.nutriments?.fat_100g)} g
    di cui saturi: ${formatNutriment(product.nutriments?.saturated_fat_100g)} g
  Carboidrati: ${formatNutriment(product.nutriments?.carbohydrates_100g)} g
    di cui zuccheri: ${formatNutriment(product.nutriments?.sugars_100g)} g
  Fibre: ${formatNutriment(product.nutriments?.fiber_100g)} g
  Proteine: ${formatNutriment(product.nutriments?.proteins_100g)} g
  Sale: ${formatNutriment(product.nutriments?.salt_100g)} g
  
  ${estimateNutritionPrompt}
  
  COMPITO:
  1. ANALISI NUTRIZIONALE:
     * Valuta la qualità nutrizionale complessiva con un punteggio da 0 a 100.
     * Identifica aspetti nutrizionali positivi, negativi e neutri.
     * Considera tutti i dati disponibili, inclusi gli ingredienti e i valori nutrizionali.
     * Se il Nutri-Score è disponibile, utilizzalo come guida ma approfondisci oltre.

  2. ANALISI DI SOSTENIBILITÀ AMBIENTALE:
     * Valuta l'impatto ambientale complessivo con un punteggio da 0 a 100.
     * Identifica aspetti ambientali positivi, negativi e neutri.
     * Considera packaging, trasporto, origine degli ingredienti.
     * Se l'Eco-Score è disponibile, utilizzalo come guida ma approfondisci oltre.

  3. SUGGERIMENTI:
     * Offri 2-3 consigli specifici per migliorare la qualità nutrizionale.
     * Offri 2-3 consigli specifici per ridurre l'impatto ambientale.

  FORMATO RISPOSTA (JSON):
  {
    "healthScore": [0-100],
    "sustainabilityScore": [0-100],
    "analysis": "[BREVE analisi nutrizionale in 1-2 frasi]",
    "pros": [
      {"title": "[TITOLO del punto positivo]", "detail": "[DETTAGLIO del punto positivo]"}
    ],
    "cons": [
      {"title": "[TITOLO del punto negativo]", "detail": "[DETTAGLIO del punto negativo]"}
    ],
    "neutrals": [
      {"title": "[TITOLO del punto neutro]", "detail": "[DETTAGLIO del punto neutro]"}
    ],
    "recommendations": ["[RACCOMANDAZIONE 1]", "[RACCOMANDAZIONE 2]", ...],
    "sustainabilityAnalysis": "[BREVE analisi sostenibilità in 1-2 frasi]",
    "sustainabilityPros": [
      {"title": "[TITOLO del punto positivo]", "detail": "[DETTAGLIO del punto positivo]"}
    ],
    "sustainabilityCons": [
      {"title": "[TITOLO del punto negativo]", "detail": "[DETTAGLIO del punto negativo]"}
    ],
    "sustainabilityNeutrals": [
      {"title": "[TITOLO del punto neutro]", "detail": "[DETTAGLIO del punto neutro]"}
    ],
    "sustainabilityRecommendations": ["[RACCOMANDAZIONE 1]", "[RACCOMANDAZIONE 2]", ...],
    "suggestedPortionGrams": [Peso in grammi della porzione suggerita (es. 30, 100, 250), o null se non determinabile],
    "nutriScoreExplanation": "[Spiegazione del Nutri-Score se disponibile]",
    "novaExplanation": "[Spiegazione del gruppo NOVA se disponibile]",
    "ecoScoreExplanation": "[Spiegazione dell'Eco-Score se disponibile]"
    ${missingNutritionalInfo ? `,
    "estimated_energy_kcal_100g": [Stima calorie per 100g],
    "estimated_proteins_100g": [Stima proteine per 100g],
    "estimated_carbs_100g": [Stima carboidrati per 100g],
    "estimated_fats_100g": [Stima grassi per 100g]` : ''}
  }

  RACCOMANDAZIONI GENERALI:
  1. Sii PRECISO e CONCRETO, evita generalismi.
  2. Fornisci un'analisi BILANCIATA, menzionando sia positivi che negativi quando possibile.
  3. Basati sui DATI FORNITI, non inventare informazioni non presenti.
  4. Quando possibile, confronta con RACCOMANDAZIONI UFFICIALI (es. OMS, linee guida nutrizionali).
  5. Per prodotti con valori nutrizionali NON disponibili, fai STIME RAGIONEVOLI basate su prodotti simili.
  6. Segui il formato JSON richiesto in modo PRECISO.
  7. Le analisi e le spiegazioni devono essere in ITALIANO.
  `;
};

/**
 * Analizza la risposta di Gemini per estrarre i dati strutturati
 */
const parseGeminiResponse = (response: string, isPhotoAnalysis: boolean = false): GeminiAnalysisResult => {
  try {
    console.log(`[GEMINI PARSE] Inizio parsing della risposta (lunghezza: ${response.length} caratteri). Foto: ${isPhotoAnalysis}`)

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const jsonStr = jsonMatch[0]
      console.log(`[GEMINI PARSE] JSON trovato nella risposta (lunghezza: ${jsonStr.length} caratteri)`)

      let result = JSON.parse(jsonStr) as GeminiAnalysisResult;

      // Validazione campi principali (sempre richiesti)
      const coreHealthFieldsPresent = 
        typeof result.healthScore === "number" &&
        typeof result.analysis === "string" &&
        Array.isArray(result.pros) &&
        Array.isArray(result.cons) &&
        Array.isArray(result.recommendations);

      // Assicurati che i campi neutrals esistano (anche vuoti se non forniti dall'AI)
      if (!Array.isArray(result.neutrals)) {
        result.neutrals = [];
      }
      
      if (!Array.isArray(result.sustainabilityNeutrals)) {
        result.sustainabilityNeutrals = [];
      }

      // Validazione campi calorie se è analisi foto
      let calorieFieldsValidForPhoto = true;
      if (isPhotoAnalysis) {
        calorieFieldsValidForPhoto = 
          typeof result.calories_estimate === 'string' &&
          result.calories_estimate.trim() !== '' &&
          (result.calorie_estimation_type === 'breakdown' || 
           result.calorie_estimation_type === 'per_100g' || 
           result.calorie_estimation_type === 'per_serving_packaged');
        if (!calorieFieldsValidForPhoto) {
            console.warn('[GEMINI PARSE WARN] Campi calorie per analisi foto non validi:', result.calories_estimate, result.calorie_estimation_type);
        }
      }

      // Validazione ingredients_breakdown se type è 'breakdown' (solo per analisi foto)
      let ingredientsBreakdownValid = true;
      if (isPhotoAnalysis && result.calorie_estimation_type === 'breakdown') {
        ingredientsBreakdownValid = 
          Array.isArray(result.ingredients_breakdown) &&
          result.ingredients_breakdown.every(
            (item: any) => 
              typeof item.id === 'string' &&
              typeof item.name === 'string' &&
              typeof item.estimated_weight_g === 'number' &&
              typeof item.estimated_calories_kcal === 'number'
          );
        if (!ingredientsBreakdownValid) {
          console.warn('[GEMINI PARSE WARN] ingredients_breakdown non valido per tipo breakdown (analisi foto):', result.ingredients_breakdown);
        }
      } else if (isPhotoAnalysis) {
        // Se è analisi foto ma non breakdown, ingredients_breakdown dovrebbe essere vuoto o non presente
        if (result.ingredients_breakdown && result.ingredients_breakdown.length > 0) {
          console.warn(`[GEMINI PARSE WARN] ingredients_breakdown presente per tipo ${result.calorie_estimation_type} (analisi foto). Sarà ignorato.`);
        }
        result.ingredients_breakdown = undefined; 
      }
      
      // Normalizzazione campi di sostenibilità per analisi foto
      if (isPhotoAnalysis) {
        result.sustainabilityScore = 0;
        result.sustainabilityAnalysis = "";
        result.sustainabilityPros = [];
        result.sustainabilityCons = [];
        result.sustainabilityNeutrals = [];
        result.sustainabilityRecommendations = [];
        result.ecoScoreExplanation = "";
      } else {
         // Per analisi NON foto, i campi di sostenibilità sono attesi
         const sustainabilityFieldsPresent = 
            typeof result.sustainabilityScore === "number" &&
            typeof result.sustainabilityAnalysis === "string" &&
            Array.isArray(result.sustainabilityPros) &&
            Array.isArray(result.sustainabilityCons) &&
            Array.isArray(result.sustainabilityRecommendations);
        if (!sustainabilityFieldsPresent) {
            console.warn('[GEMINI PARSE WARN] Campi di sostenibilità mancanti o invalidi per analisi NON foto.');
            // Potremmo decidere di fallire qui o popolare con fallback specifici per sostenibilità
        }
      }

      if (coreHealthFieldsPresent && (!isPhotoAnalysis || (calorieFieldsValidForPhoto && ingredientsBreakdownValid)) ) {
        console.log(`[GEMINI PARSE] Tutti i campi richiesti e validi sono presenti nel JSON.`);
        
        // Parole chiave da filtrare nei titoli (per rimuovere voci duplicate con i punteggi già presenti nell'UI)
        const keywordsToFilterByTitle = [
          "NOVA", "GRUPPO NOVA", 
          "NUTRI-SCORE", "NUTRISCORE",
          isPhotoAnalysis ? null : "ECO-SCORE", // Non filtrare Eco-Score per foto
          isPhotoAnalysis ? null : "ECOSCORE",
          "ULTRA-PROCESSATO", "ULTRAPROCESSATO", "ULTRA-LAVORATO", "ULTRALAVORATO"
        ].filter(Boolean) as string[]; // Rimuove i null e asserisce il tipo
        
        // Parole chiave nel dettaglio che potrebbero indicare elementi da filtrare
        const keywordsToFilterByDetail = [ 
          "questo prodotto è classificato come NOVA",
          "il Nutri-Score di questo prodotto è",
          isPhotoAnalysis ? null : "l'Eco-Score di questo prodotto è",
          "appartiene al gruppo NOVA"
        ].filter(Boolean) as string[];

        // Parole chiave per titoli irrilevanti o troppo generici nei pro/contro salute
        const irrelevantHealthKeywords = [
          "FACILITÀ DI CONSUMO", "FACILE DA CONSUMARE", "FACILE DA PREPARARE", "VELOCE DA PREPARARE",
          "SAPORE", "GUSTO", "GRADEVOLE AL PALATO", "AROMA", "COMODO", "PRATICO", "PRATICITÀ", 
          "POTENZIALE ALLERGIA", "ALLERGIA", "ALLERGENICO", "ALLERGENI", "PUÒ CAUSARE ALLERGIE"
        ];

        // Parole chiave per titoli irrilevanti nei pro/contro ambientali
        const irrelevantEcoKeywords = [
          "SENZA LATTOSIO", "SENZA GLUTINE", "GLUTEN FREE", "LATTOSIO", "GLUTINE",
          "SENZA OGM", "OGM", "NON CONTIENE ALLERGENI", "ADATTO CELIACHIA", "ADATTO INTOLLERANTI"
        ];

        // Funzione migliorata per filtrare elementi pro/contro
        const filterItems = (items: Array<{title: string, detail: string}>, isSustainability: boolean = false) => {
          if (!Array.isArray(items)) return [];
          
          return items.filter(item => {
            if (!item || !item.title) return false;
            
            const titleUpper = item.title.toUpperCase();
            const detailUpper = item.detail ? item.detail.toUpperCase() : "";

            // 1. Filtro per score che appaiono già nell'UI
            const titleMatchesScore = keywordsToFilterByTitle.some(keyword => 
              titleUpper.includes(keyword)
            );
            
            // 2. Filtro per titoli che sono solo lo score (es. "NUTRI-SCORE: A")
            const titleIsJustScore = 
              titleUpper.match(/^NUTRI-SCORE:?\s*[A-E]$/) ||
              (isSustainability ? titleUpper.match(/^ECO-SCORE:?\s*[A-E]$/) : false) || 
              titleUpper.match(/^NOVA:?\s*[1-4]$/) ||
              titleUpper.match(/^GRUPPO NOVA:?\s*[1-4]$/);

            // 3. Filtro per dettagli che parlano principalmente dello score
            const detailMatchesScore = keywordsToFilterByDetail.some(keyword =>
              detailUpper.includes(keyword.toUpperCase())
            );
            
            // 4. Filtro per titoli che sono parole singole (monosillabi o termini singoli)
            const titleIsSingleWord = titleUpper.split(/\s+/).length === 1 || 
                                     titleUpper === "FIBRE" || 
                                     titleUpper === "PROTEINE" || 
                                     titleUpper === "SALE" ||
                                     titleUpper === "ZUCCHERI" || 
                                     titleUpper === "GRASSI";
            
            // 5. Filtro per pro/contro irrilevanti alla salute (solo se non è sostenibilità)
            const titleContainsIrrelevantHealthInfo = !isSustainability && 
                irrelevantHealthKeywords.some(keyword => titleUpper.includes(keyword));
            
            // 6. Filtro per pro/contro non-ambientali nella sostenibilità
            const titleContainsIrrelevantEcoInfo = isSustainability && 
                irrelevantEcoKeywords.some(keyword => titleUpper.includes(keyword));
            
            // 7. Filtro per NON-APPLICABILE o ORIGINE SCONOSCIUTA
            const titleContainsNonApplicable = (
              titleUpper.includes("NON APPLICABILE") || 
              titleUpper.includes("NOT APPLICABLE") || 
              titleUpper.includes("ORIGINE SCONOSCIUTA") || 
              titleUpper.includes("DATI INSUFFICIENTI") || 
              titleUpper.includes("INFORMAZIONI MANCANTI") || 
              titleUpper.includes("DATI NON DISPONIBILI")
            );
            
            // Un item è valido se NON corrisponde a nessuno dei criteri di filtraggio
            const isValid = !(
              titleMatchesScore || 
              titleIsJustScore || 
              detailMatchesScore || 
              titleIsSingleWord || 
              titleContainsIrrelevantHealthInfo || 
              titleContainsIrrelevantEcoInfo || 
              titleContainsNonApplicable
            );
            
            return isValid;
          });
        };

        // Applica il filtraggio migliorato a tutti i pro/contro
        result.pros = filterItems(result.pros);
        result.cons = filterItems(result.cons);
        
        // Filtra anche gli elementi neutrali
        if (Array.isArray(result.neutrals)) {
          result.neutrals = filterItems(result.neutrals);
        }
        
        if (!isPhotoAnalysis) {
            result.sustainabilityPros = filterItems(result.sustainabilityPros, true);
            result.sustainabilityCons = filterItems(result.sustainabilityCons, true);
            
            // Filtra anche gli elementi neutrali di sostenibilità
            if (Array.isArray(result.sustainabilityNeutrals)) {
              result.sustainabilityNeutrals = filterItems(result.sustainabilityNeutrals, true);
            }
            
            console.log('[GEMINI PARSE FILTER] Pro/Contro SOSTENIBILITÀ filtrati.');
        }
        console.log('[GEMINI PARSE FILTER] Pro/Contro/Neutrali SALUTE filtrati.');

        // Validazione porzione suggerita come numero
        if (result.hasOwnProperty('suggestedPortionGrams') && typeof result.suggestedPortionGrams !== 'number') {
            const parsedPortion = parseInt(result.suggestedPortionGrams as any, 10);
            if (!isNaN(parsedPortion)) {
                result.suggestedPortionGrams = parsedPortion;
            } else {
                delete result.suggestedPortionGrams; 
                console.warn('[GEMINI PARSE WARN] suggestedPortionGrams presente ma non è un numero valido, rimosso.');
            }
        }
        return result;
      }
    }

    console.warn(`[GEMINI PARSE WARNING] Impossibile analizzare la risposta di Gemini come JSON valido o campi mancanti/invalidi`)
    return createFallbackResult(response, isPhotoAnalysis) 
  } catch (error) {
    console.error(`[GEMINI PARSE ERROR] Errore nell'analisi della risposta di Gemini:`, error)
    return createFallbackResult(response, isPhotoAnalysis) 
  }
}

/**
 * Crea un risultato di fallback se l'analisi della risposta fallisce
 */
const createFallbackResult = (response: string, isPhotoAnalysisFallback: boolean = false): GeminiAnalysisResult => {
  console.log(`[GEMINI PARSE FALLBACK] Creazione risultato di fallback per risposta non conforme. Analisi foto: ${isPhotoAnalysisFallback}`);
  
  // Estrai automaticamente alcune informazioni di base
  let healthScore = 50; // Punteggio neutro di default
  
  // Cerca di estrarre il punteggio salute se presente nella risposta
  const healthScoreMatch = response.match(/healthScore["\s:]+(\d+)/);
  if (healthScoreMatch && healthScoreMatch[1]) {
    const parsedScore = parseInt(healthScoreMatch[1], 10);
    if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
      healthScore = parsedScore;
    }
  }
  
  // Oggetto di base
  const fallbackResult: GeminiAnalysisResult = {
    healthScore: healthScore,
    sustainabilityScore: isPhotoAnalysisFallback ? 0 : 50, 
    analysis: "Non è stato possibile generare un'analisi dettagliata per questo prodotto. Verifica gli ingredienti e la tabella nutrizionale per maggiori informazioni.",
    pros: [],
    cons: [],
    neutrals: [], // Aggiunto campo neutrals vuoto
    recommendations: [],
    sustainabilityAnalysis: isPhotoAnalysisFallback ? "" : "Non è stato possibile generare un'analisi ambientale dettagliata.",
    sustainabilityPros: [],
    sustainabilityCons: [],
    sustainabilityNeutrals: [], // Aggiunto campo sustainabilityNeutrals vuoto
    sustainabilityRecommendations: []
  };
  
  // Ulteriore garanzia che i campi eco siano vuoti per fallback da analisi foto
  if (isPhotoAnalysisFallback) {
      fallbackResult.sustainabilityScore = 0;
      fallbackResult.sustainabilityAnalysis = "";
      fallbackResult.sustainabilityPros = [];
      fallbackResult.sustainabilityCons = [];
      fallbackResult.sustainabilityNeutrals = [];
      fallbackResult.sustainabilityRecommendations = [];
      fallbackResult.ecoScoreExplanation = "";
      // Assicuriamo i campi specifici calorie per foto in fallback
      fallbackResult.calorie_estimation_type = 'per_100g';
      fallbackResult.ingredients_breakdown = [];
      fallbackResult.calories_estimate = "~... kcal per 100g";
  }

  return fallbackResult;
}

// Funzione helper per convertire Blob in base64 (necessaria in ambiente React Native/browser)
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = reader.result as string;
      if (typeof result === 'string' && result.includes(';base64,')) {
        // Estrae la stringa base64 dopo ";base64,"
        const base64String = result.substring(result.indexOf(';base64,') + ';base64,'.length);
        resolve(base64String);
      } else {
        console.error('[GEMINI HELPER ERROR] Formato Data URL non valido o imprevisto durante la conversione blob in base64:', typeof result === 'string' ? result.substring(0, 100) + '...' : 'Risultato non stringa');
        reject(new Error('Impossibile convertire blob in base64: formato Data URL non valido.'));
      }
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Analizza un'immagine di un prodotto alimentare utilizzando Google Gemini Vision
 * @param imageBase64 La stringa base64 dell'immagine
 * @param mimeType Il tipo MIME dell'immagine (es. "image/jpeg", "image/png")
 * @param productNameHint Un nome generico o suggerimento per guidare l'analisi
 * @returns Risultato dell'analisi, inclusi nome e marca identificati (se possibile)
 */
export const analyzeImageWithGeminiVision = async (
    imageBase64: string,      // Modificato da imagePublicUrl
    mimeType: string,         // Nuovo parametro
    productNameHint: string
): Promise<GeminiAnalysisResult> => {
  try {
    console.log(`[GEMINI VISION START] Avvio analisi per immagine fornita come base64 (MIME: ${mimeType}, Hint: ${productNameHint})`);
    console.time(`[GEMINI VISION TIMING] Analisi immagine completa`);

    if (!imageBase64) {
        throw new Error('Stringa base64 dell\'immagine non fornita a Gemini Vision.');
    }
    if (!mimeType) {
        throw new Error('Tipo MIME dell\'immagine non fornito a Gemini Vision.');
    }

    // La logica di download e il ritardo sono stati rimossi.
    // L'immagine è già fornita come base64.

    console.log(`[GEMINI VISION] Immagine base64 ricevuta (lunghezza stringa: ${imageBase64.length})`);

    // Costruisci il prompt per l'analisi visiva
    const prompt = createVisualAnalysisPrompt(productNameHint);
    // console.log(`[GEMINI VISION PROMPT] Prompt generato (lunghezza: ${prompt.length} caratteri)`); // Log opzionale del prompt completo

    // Chiama l'API Gemini Vision usando inlineData
    console.log(`[GEMINI VISION API] Chiamata API con dati immagine inline.`);
    console.time(`[GEMINI VISION API TIMING] Chiamata API`);
    
    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            // TEMPORANEAMENTE COMMENTIAMO L'INVIO DELL'IMMAGINE PER TESTARE LA CONNESSIONE BASE
            {
              inlineData: {
                mimeType: mimeType, 
                data: imageBase64
              }
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2, 
        topK: 32,
        topP: 0.95,
        maxOutputTokens: 2048, 
      },
    };

    const response = await fetch(`${GEMINI_VISION_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    console.log(`[GEMINI VISION API] Risposta API Gemini ricevuta. Status: ${response.status}`);

    console.timeEnd(`[GEMINI VISION API TIMING] Chiamata API`);

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[GEMINI VISION API ERROR] Errore nella risposta API:`, errorData);
      throw new Error(`Errore API Gemini Vision: ${errorData.error?.message || "Errore sconosciuto"}`);
    }

    const data = await response.json();
    const generatedText = data.candidates[0]?.content?.parts[0]?.text || "";
    console.log(
      `[GEMINI VISION RESPONSE] Risposta ricevuta (lunghezza: ${generatedText.length} caratteri)`
    );

    // Analizza la risposta di Gemini Vision
    console.log(`[GEMINI VISION PARSE] Analisi della risposta`);
    const result = parseGeminiResponse(generatedText); // Usa lo stesso parser, il formato JSON richiesto è identico

    // Estrai nome e marca identificati (se il parser li gestisce)
    // Questi campi sono stati aggiunti all'interfaccia GeminiAnalysisResult
    // Il parser parseGeminiResponse dovrebbe essere aggiornato per estrarre
    // productNameFromVision e brandFromVision se il prompt li richiede e il modello li fornisce.
    // const identifiedProductName = result.productNameFromVision || productNameHint; // Fallback
    // const identifiedBrand = result.brandFromVision; // Può essere undefined

    console.timeEnd(`[GEMINI VISION TIMING] Analisi immagine completa`);
    console.log(`[GEMINI VISION SUCCESS] Analisi completata:`, {
      healthScore: result.healthScore,
      sustainabilityScore: result.sustainabilityScore,
      // productNameFromVision: identifiedProductName, // Log opzionale
      // brandFromVision: identifiedBrand, // Log opzionale
    });

    // Restituisci il risultato completo
    return result;

  } catch (error) {
    console.error(`[GEMINI VISION ERROR] Errore nell'analisi visiva:`, error);
    throw new Error("Si è verificato un errore durante l'analisi dell'immagine.");
  }
};

/**
 * Crea un prompt dettagliato per l'analisi visiva del prodotto
 */
const createVisualAnalysisPrompt = (productNameHint: string): string => {
  return `
Mi viene mostrata un'immagine di cibo, piatto preparato o prodotto alimentare. Analizzane il contenuto per determinare:

A) Se è un PIATTO COMPOSTO (es. pasta al ragù, insalata mista, pizza con topping) oppure un PRODOTTO CONFEZIONATO (es. pacchetto di pasta, barretta energetica, bottiglia d'acqua) oppure un ALIMENTO SINGOLO (es. mela, filetto di pesce).

B) Identifica con precisione: 
   1. Il nome esatto del prodotto/piatto/alimento
   2. Se è un prodotto confezionato, identifica il brand se visibile
   3. Una valutazione nutrizionale da 0 a 100 punti, dove 100 è ottimale (es. acqua, frutta fresca, vegetali), 0 è pessima (es. snack ultra-processati)

C) STIMA NUTRIZIONALE in base alla tipologia:
   1. Se è un PIATTO COMPOSTO:
      - Identifica e lista ogni componente separato con peso stimato in grammi e calorie approssimative.
      - Per ogni componente, stima anche proteine (g), carboidrati (g) e grassi (g).
      - Esempio: una pasta al pomodoro potrebbe avere 80g di pasta (280 kcal, 10g proteine, 56g carb, 1.5g grassi) e 120g di sugo (90 kcal, 2g proteine, 8g carb, 5g grassi).
   
   2. Se è un PRODOTTO CONFEZIONATO o ALIMENTO SINGOLO:
      - Fornisci una stima per 100g del prodotto di: calorie (kcal), proteine (g), carboidrati (g) e grassi (g).
      - Per alimenti singoli come frutta usa valori nutrizionali standard per 100g di quel prodotto.

REGOLE DI ANALISI SALUTE:
*   Considera POSITIVO per la salute: alimenti poco processati, freschi, ricchi di fibre/proteine/nutrienti, basso contenuto di zuccheri aggiunti/grassi saturi/sale.
*   Considera NEGATIVO: alimenti ultra-processati, ricchi di zuccheri aggiunti, grassi saturi/trans, sale, coloranti, conservanti artificiali, additivi.
*   ELEMENTI VIETATI NEI PRO: MAI includere come PRO della salute fattori come "facilità di consumo", "sapore gradevole", "praticità", "veloce da preparare". Questi NON SONO fattori nutrizionali.

Nome del prodotto suggerito dall'utente (se utile per il contesto, ma non vincolante): ${productNameHint}

FORMATO RISPOSTA (SINGOLO OGGETTO JSON VALIDO, SENZA TESTO EXTRA PRIMA O DOPO):
{
  "productNameFromVision": "[nome generico del prodotto o del piatto identificato]",
  "brandFromVision": "[possibile marca, se prodotto confezionato e identificabile, altrimenti null]",
  "healthScore": [Punteggio INTERO 0-100 SALUTE, 100 se è acqua],
  "analysis": "[DESCRIZIONE ULTRA-SINTETICA (MAX 1-2 FRASI) SALUTE. MAI ripetere il nome.]",
  "pros": [
    {"title": "[TITOLO PRO SALUTE CON FRASE COMPLETA E DATO NUMERICO]", "detail": "[SPIEGAZIONE CAUTA BENEFICI SALUTE (1-2 frasi)]"}
  ],
  "cons": [
    {"title": "[TITOLO CONTRO SALUTE CON FRASE COMPLETA E DATO NUMERICO]", "detail": "[SPIEGAZIONE CAUTA RISCHI SALUTE (1-2 frasi)]"}
  ],
  "neutrals": [
    {"title": "[TITOLO NEUTRAL/INTERMEDIO SALUTE CON FRASE COMPLETA E DATO NUMERICO]", "detail": "[SPIEGAZIONE ASPETTI NEUTRALI O MISTI PER LA SALUTE (1-2 frasi)]"}
  ],
  "recommendations": [], // ARRAY VUOTO - NON FORNIRE RACCOMANDAZIONI
  "nutriScoreExplanation": "[EVENTUALE SPIEGAZIONE NUTRI-SCORE CONTESTUALIZZATA ALLA SALUTE]",
  "novaExplanation": "[EVENTUALE SPIEGAZIONE GRUPPO NOVA CONTESTUALIZZATA ALLA SALUTE]",
  
  "calorie_estimation_type": "[breakdown OR per_100g OR per_serving_packaged]",
  "ingredients_breakdown": [
    // Per "breakdown" di un piatto composto con più componenti:
    // {"id": "pasta", "name": "Pasta", "estimated_weight_g": 80, "estimated_calories_kcal": 280, "estimated_proteins_g": 10, "estimated_carbs_g": 56, "estimated_fats_g": 1.5},
    // {"id": "sugo", "name": "Sugo al pomodoro", "estimated_weight_g": 120, "estimated_calories_kcal": 90, "estimated_proteins_g": 2, "estimated_carbs_g": 8, "estimated_fats_g": 5}
    
    // Per "breakdown" di un singolo frutto o alimento:
    // {"id": "kiwi_fresco", "name": "Kiwi", "estimated_weight_g": 70, "estimated_calories_kcal": 45, "estimated_proteins_g": 0.8, "estimated_carbs_g": 10.1, "estimated_fats_g": 0.4}
  ],
  "calories_estimate": "[STRINGA: Es. 'Totale: ~430 kcal' per breakdown, o '~450 kcal per 100g' per confezionato]",
  
  // Campi di sostenibilità DEVONO essere omessi o null/vuoti:
  "sustainabilityScore": null,
  "sustainabilityAnalysis": "",
  "sustainabilityPros": [],
  "sustainabilityCons": [],
  "sustainabilityNeutrals": [],
  "sustainabilityRecommendations": [],
  "ecoScoreExplanation": ""
}

ISTRUZIONI FINALI IMPORTANTISSIME:
1.  ATTENZIONE: La frutta e verdura fresca singola (es. kiwi, mela, banana) va SEMPRE trattata come CASO B (breakdown), anche se è un solo elemento.
2.  Se fornisci "ingredients_breakdown", assicurati che "calories_estimate" sia la somma delle calorie dei componenti e formattata come "Totale: ~[SOMMA] kcal".
3.  NON includere MAI campi relativi alla sostenibilità che non siano null o stringhe/array vuoti come specificato nel formato JSON.
4.  Fornisci stime di peso e calorie RAGIONEVOLI e basate sulla tua conoscenza.
5.  Sii ULTRA-SINTETICO nei testi.
6.  Se il prodotto è acqua (in qualsiasi forma non aromatizzata), assegna SEMPRE un punteggio di 100 per la salute.
7.  RISPONDI SEMPRE E SOLO IN ITALIANO.
`;
};

/**
 * Stima le calorie e i valori nutrizionali per un singolo ingrediente e ne corregge il nome usando Gemini.
 * Se weightGrams è 0 o non fornito, l'AI stimerà per una porzione media.
 * @param name Nome dell'ingrediente fornito dall'utente.
 * @param weightGrams Peso in grammi (opzionale, se 0 o undefined, l'AI stima una porzione media).
 * @returns Un oggetto SingleIngredientEstimateResponse con calorie e valori nutrizionali.
 */
export const getCaloriesForSingleIngredientFromGemini = async (
  name: string,
  weightGrams?: number
): Promise<SingleIngredientEstimateResponse> => {
  console.log(`[GEMINI CALORIES] Richiesta stima per: "${name}", peso: ${weightGrams !== undefined ? weightGrams + 'g' : 'porzione media'}`);
  try {
    const weightPrompt = (weightGrams && weightGrams > 0) ? 
      `per un peso di ${weightGrams} grammi` : 
      `per una porzione media (se non riesci a stimare una porzione media specifica per questo ingrediente, considera un peso generico di 100g per la stima nutrizionale).`;

  const prompt = `
    Analizza il seguente ingrediente alimentare fornito dall'utente: "${name}".

    Il tuo compito è:
    1. **Correggi e Normalizza il Nome:** Se il nome fornito dall'utente ("${name}") sembra contenere errori di battitura, usa un case scorretto, o è una descrizione colloquiale, restituisci una versione corretta, normalizzata e più "ufficiale" del nome. Ad esempio, se l'utente scrive "toNNo in scatla", correggilo in "Tonno in scatola". Se il nome è già corretto e formale, restituiscilo così com'è. Il nome corretto deve essere singolare e specifico (es. "Mela Fuji" invece di "Mele").
    
    2. **Stima i Valori Nutrizionali** ${weightPrompt} per il nome CORRETTO dell'ingrediente:
       - Calorie (kcal)
       - Proteine (g)
       - Carboidrati (g)
       - Grassi (g)

    REGOLE IMPORTANTISSIME:
    * **ACQUA = 0 CALORIE E VALORI NUTRIZIONALI:** Se l'ingrediente è acqua o acqua minerale naturale (non aromatizzata), assegna SEMPRE 0 a tutti i valori nutrizionali.
    * **NOME TROPPO COMPLESSO/GENERICO:** Se il nome fornito è una descrizione di un piatto complesso o se è troppo generico per una stima nutrizionale accurata, indica chiaramente che il nome è troppo complesso o generico.
    * **BASATI SU DATI REALI:** Utilizza dati nutrizionali reali e database standard per fare una stima accurata, non fare supposizioni generiche.
    * **INCLUDI SEMPRE TUTTI I VALORI NUTRIZIONALI QUANDO POSSIBILE:** Per qualsiasi ingrediente alimentare riconoscibile, fai sempre del tuo meglio per fornire stime concrete per tutti i valori richiesti.
    * **FATTI GUIDARE DALLE TABELLE NUTRIZIONALI:** Basati sui valori medi per 100g di prodotto delle tabelle nutrizionali ufficiali e scala appropriatamente.

    FORMATO DELLA RISPOSTA (DEVI RESTITUIRE ESATTAMENTE QUESTO FORMATO JSON, SENZA TESTO AGGIUNTIVO PRIMA O DOPO):
    {
      "corrected_name": "[Nome corretto e normalizzato dell'ingrediente]",
      "estimated_calories_kcal": [Numero intero di calorie stimate, 0 per acqua, o null se non stimabile],
      "estimated_proteins_g": [Numero di grammi di proteine, con massimo 1 decimale, 0 per acqua, o null se non stimabile],
      "estimated_carbs_g": [Numero di grammi di carboidrati, con massimo 1 decimale, 0 per acqua, o null se non stimabile],
      "estimated_fats_g": [Numero di grammi di grassi, con massimo 1 decimale, 0 per acqua, o null se non stimabile],
      "error_message": "[Eventuale messaggio di errore se la stima fallisce. Lascia vuoto se non ci sono errori.]"
    }
    `;

    console.log("[GEMINI CALORIES PROMPT]", prompt);

    const response = await fetch(`${GEMINI_TEXT_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, 
          topK: 32,
          topP: 0.95,
          maxOutputTokens: 256,
          responseMimeType: "application/json", // Richiedi risposta JSON direttamente
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => response.text());
      console.error("[GEMINI CALORIES API ERROR]", errorData);
      return {
        calories: null,
        correctedName: null,
        error: true,
        errorMessage: `Errore API Gemini: ${errorData?.error?.message || 'Errore sconosciuto durante la chiamata API.'}`,
        proteins: null,
        carbs: null,
        fats: null
      };
    }

    const rawResponseData = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(rawResponseData);
      if (parsedData.candidates && parsedData.candidates[0]?.content?.parts[0]?.text) {
         // Ulteriore parsing se il JSON è wrappato dentro il campo text
        try {
            parsedData = JSON.parse(parsedData.candidates[0].content.parts[0].text);
        } catch (innerError) {
            console.warn("[GEMINI CALORIES] Risposta JSON non wrappata come atteso, tentando di usare la struttura esterna.");
             // Se fallisce il parsing interno, significa che il JSON potrebbe essere già quello corretto al primo livello
            // Questo può accadere se l'API restituisce direttamente il JSON richiesto senza il wrapping aggiuntivo
            if (parsedData.candidates && parsedData.candidates[0]?.content?.parts[0]) { // Verifica che esista parts[0]
                // Se non c'è 'text' ma c'è 'functionCall' o altro, potrebbe essere un problema di prompt
                // Per ora assumiamo che se text non c'è, il parsing è fallito prima
            } else {
                 // Se il parsing interno fallisce e la struttura esterna non è come ci aspettiamo, allora è un errore.
                console.error("[GEMINI CALORIES PARSE ERROR] La risposta JSON non ha la struttura attesa.", rawResponseData);
                return {
                    calories: null,
                    correctedName: name, // Restituisci il nome originale in caso di errore di parsing completo
                    error: true,
                    errorMessage: "Formato risposta AI non valido.",
                    proteins: null,
                    carbs: null,
                    fats: null
                };
            }
        }
      } else if (!parsedData.corrected_name && !parsedData.estimated_calories_kcal) {
          // Se il primo parse ha successo ma non ci sono i campi attesi, potrebbe essere un JSON di errore dall'API stessa
          console.error("[GEMINI CALORIES PARSE ERROR] JSON ricevuto non contiene i campi attesi.", parsedData);
          return { 
              calories: null, 
              correctedName: name, 
              error: true, 
              errorMessage: parsedData.error?.message || "La risposta AI non contiene i dati richiesti.",
              proteins: null,
              carbs: null,
              fats: null
          };
      }
    } catch (e) {
      console.error("[GEMINI CALORIES PARSE ERROR]", rawResponseData, e);
      return {
        calories: null,
        correctedName: name,
        error: true,
        errorMessage: "Errore durante l'analisi della risposta JSON.",
        proteins: null,
        carbs: null,
        fats: null
      };
    }

    // Se tutto è andato bene, estraiamo i dati pertinenti
    const correctedName = parsedData.corrected_name;
    const caloriesRaw = parsedData.estimated_calories_kcal;
    const proteinsRaw = parsedData.estimated_proteins_g;
    const carbsRaw = parsedData.estimated_carbs_g;
    const fatsRaw = parsedData.estimated_fats_g;
    const errorMessage = parsedData.error_message;

    // Valida le calorie e i macronutrienti
    let calories: number | null = null;
    let proteins: number | null = null;
    let carbs: number | null = null;
    let fats: number | null = null;

    if (typeof caloriesRaw === 'number') {
      calories = Math.max(0, Math.round(caloriesRaw)); // Assicura che sia almeno 0 e arrotondato all'intero
    }
    
    if (typeof proteinsRaw === 'number') {
      proteins = Math.max(0, Number(proteinsRaw.toFixed(1))); // Assicura che sia almeno 0 e con max 1 decimale
    }
    
    if (typeof carbsRaw === 'number') {
      carbs = Math.max(0, Number(carbsRaw.toFixed(1))); // Assicura che sia almeno 0 e con max 1 decimale
    }
    
    if (typeof fatsRaw === 'number') {
      fats = Math.max(0, Number(fatsRaw.toFixed(1))); // Assicura che sia almeno 0 e con max 1 decimale
    }

    // Costruisci e restituisci la risposta
    return {
      calories,
      correctedName: correctedName || name, // Fallback al nome originale se correctedName è nullo o vuoto
      error: !!errorMessage || calories === null,
      errorMessage: errorMessage || (calories === null ? "Impossibile calcolare i valori nutrizionali per questo ingrediente." : undefined),
      proteins,
      carbs,
      fats
    };

  } catch (error) {
    console.error("[GEMINI CALORIES UNEXPECTED ERROR]", error);
    return {
      calories: null,
      correctedName: name,
      error: true,
      errorMessage: error instanceof Error ? error.message : "Errore inatteso durante la stima delle calorie.",
      proteins: null,
      carbs: null,
      fats: null
    };
  }
};