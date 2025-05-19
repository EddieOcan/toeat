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
}

export interface GeminiAnalysisResult {
  healthScore: number // Punteggio da 1 a 100
  sustainabilityScore: number // Punteggio di sostenibilità da 1 a 100 (sarà 0 o non presente per analisi foto)
  analysis: string // Analisi testuale (solo salute per analisi foto)
  pros: Array<{title: string, detail: string}> // Solo salute per analisi foto
  cons: Array<{title: string, detail: string}> // Solo salute per analisi foto
  recommendations: string[] // Solo salute per analisi foto
  sustainabilityAnalysis: string // Vuoto o non presente per analisi foto
  sustainabilityPros: Array<{title: string, detail: string}> // Vuoto o non presente per analisi foto
  sustainabilityCons: Array<{title: string, detail: string}> // Vuoto o non presente per analisi foto
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

  return `
Analizza ATTENTAMENTE e SCRUPOLOSAMENTE il seguente prodotto alimentare per valutarne l'impatto sulla SALUTE. Fornisci una valutazione critica, concisa e DIRETTA.

OBIETTIVO PRINCIPALE: Fornire all'utente informazioni CHIARE, VERITIERE, ACCURATE, NON BANALI e UTILI per prendere decisioni consapevoli, in modo EFFICIENTE.

ISTRUZIONI GENERALI IMPORTANTISSIME:
1. **EVITA INFORMAZIONI OVVIE:** Mai dire cose che un utente medio già sa. Le persone cercano informazioni NUOVE e UTILI, non ovvie.
2. **ADDITIVI - ANALISI DETTAGLIATA E INDIVIDUALE:** Per OGNI additivo presente (E-numbers), crea un punto critico nei CONTRO che spiega SPECIFICATAMENTE cosa fa quell'additivo, perché potrebbe essere problematico per la salute, e STUDI/RICERCHE che lo collegano a potenziali rischi. NON raggruppare gli additivi in un unico contro.
3. **MAI CREARE CONTRO PER DATI MANCANTI:** Non creare MAI elementi di "origine sconosciuta", "dati insufficienti", "tracciabilità non chiara". Solo aspetti CONCRETI e REALI.
4. **NON INCLUDERE CURIOSITÀ STORICHE O ANEDDOTI:** Concentrati SOLO su informazioni nutrizionali e di salute RILEVANTI e SPECIFICHE per il prodotto analizzato. NIENTE curiosità storiche, geografiche o aneddoti sulla categoria in generale.
5. **NELLA DESCRIZIONE (analysis):** NON RIPETERE MAI il nome del prodotto. Inizia direttamente con gli aspetti nutrizionali. Sii CONCISO ma INFORMATIVO.
6. **BASATI SUI DATI DISPONIBILI E FAI RICERCA:** Utilizza i dati forniti ma ANCHE la tua conoscenza. Se mancano informazioni, fai ipotesi ragionevoli basate sul tipo di prodotto.
7. **OMETTI COMPLETAMENTE LA DESCRIZIONE AMBIENTALE:** Nella risposta JSON, il campo sustainabilityAnalysis sarà restituito VUOTO ("").
8. **PUNTEGGI (0-100):** Usa l'INTERO range da 0 a 100.
9. **PORZIONE CONSIGLIATA (suggestedPortionGrams):** Devi DETERMINARE e includere nel JSON una porzione consigliata realistica in grammi (SENZA l'unità 'g', solo il numero). Basati su:
    a.  Il campo "Porzione consigliata" (serving_size) fornito nei dati, se presente e interpretabile in grammi (es. "30g", "2 biscotti (circa 25g)"). Se è vago (es. "un bicchiere"), ignoralo per questo scopo.
    b.  Il tipo di prodotto (campo "Categorie Prodotto"). Esempi: yogurt monoporzione -> 125g; snack/biscotti -> 25-40g; bevanda -> 200-250g; pasta/riso secchi -> 70-80g; formaggio spalmabile -> 30g.
    c.  Se i dati sono scarsi, fornisci una stima plausibile per la categoria di prodotto.

DATI DEL PRODOTTO (usa "Non disponibile" solo se il valore è effettivamente assente o vuoto):
- Nome: ${formatField(product.product_name)}
- Marca: ${formatField(product.brands)}
- Ingredienti (con allergeni): ${formatField(product.ingredients_text_with_allergens || product.ingredients_text)}
- Quantità: ${formatField(product.quantity)}
- Porzione consigliata: ${formatField(product.serving_size)}
- Allergeni (tag): ${formatField(product.allergens_tags)}
- Tracce possibili: ${formatField(product.traces)}
- Additivi (tag E-numbers): ${formatField(product.additives_tags)}
- Gruppo NOVA (Processazione Alimenti): ${formatField(product.nova_group?.toString())} (1=non processato, 2=ingredienti culinari, 3=processato, 4=ultra-processato)
- Paesi di vendita: ${formatField(product.countries)}
- Nutri-Score: ${formatField(nutriScore)}
- Eco-Score (Grado): ${formatField(product.ecoscore_grade?.toUpperCase())}
- Eco-Score (Punteggio Numerico): ${product.ecoscore_score !== undefined ? product.ecoscore_score : "Non disponibile"}
- Packaging (descrizione): ${formatField(product.packaging)}
- Packaging (tag): ${formatField(product.packaging_tags)}
- Impatto ambientale (livello tag): ${formatField(product.environmental_impact_level_tags)}
- Categorie Prodotto: ${formatField(product.categories)}
- Labels/Certificazioni (Biologico, FairTrade, ecc.): ${formatField(product.labels)}
- Avvisi qualità dati OpenFoodFacts: ${formatField(product.data_quality_warnings_tags)}
- Stato completezza dati OpenFoodFacts: ${formatField(product.states_tags)}
${product.ecoscore_data ? `- Dettagli Strutturati Eco-Score: ${JSON.stringify(product.ecoscore_data)}` : ''}

VALORI NUTRIZIONALI (per 100g o 100ml):
- Energia (kcal): ${formatNutriment(product.nutriments?.energy_kcal_100g, "kcal")}
- Grassi Totali: ${formatNutriment(product.nutriments?.fat_100g)}
  - di cui Grassi Saturi: ${formatNutriment(product.nutriments?.saturated_fat_100g)}
  - di cui Grassi Trans: ${formatNutriment(product.nutriments?.trans_fat_100g)}
- Colesterolo: ${formatNutriment(product.nutriments?.cholesterol_100g, "mg")}
- Carboidrati Totali: ${formatNutriment(product.nutriments?.carbohydrates_100g)}
  - di cui Zuccheri: ${formatNutriment(product.nutriments?.sugars_100g)}
- Fibre: ${formatNutriment(product.nutriments?.fiber_100g)}
- Proteine: ${formatNutriment(product.nutriments?.proteins_100g)}
- Sale: ${formatNutriment(product.nutriments?.salt_100g)} (Na x 2.5)
- Sodio: ${formatNutriment(product.nutriments?.sodium_100g, "mg")}

ISTRUZIONI SPECIFICHE PER IL PUNTEGGIO DI SALUTE (healthScore da 0 a 100):
- Se Nutri-Score disponibile (${formatField(nutriScore)}), punteggio nella fascia: A(${healthScoreRanges.A.min}-${healthScoreRanges.A.max}), B(${healthScoreRanges.B.min}-${healthScoreRanges.B.max}), C(${healthScoreRanges.C.min}-${healthScoreRanges.C.max}), D(${healthScoreRanges.D.min}-${healthScoreRanges.D.max}), E(${healthScoreRanges.E.min}-${healthScoreRanges.E.max}).
- Altrimenti, valuta da 0 a 100 basandoti su altri criteri.
- Affina (o determina) il punteggio considerando CRITICAMENTE:
    1. Ingredienti Problematici: Zuccheri, Sale/Sodio, Grassi Saturi/Trans.
    2. Additivi: Valuta i tag E-numbers (ANALIZZA OGNI E-NUMBER SEPARATAMENTE).
    3. Grado di Processazione (Gruppo NOVA): Penalizza NOVA 4, premia 1-2.
    4. Qualità Nutrizionale: Fibre, Proteine, micronutrienti (se noti).

ISTRUZIONI SPECIFICHE PER IL PUNTEGGIO DI SOSTENIBILITÀ (sustainabilityScore da 0 a 100):
- Basa il punteggio su:
    1. Eco-Score (Grado/Numerico).
    2. Packaging (Materiali, Riciclabilità, tag).
    3. Origine/Produzione (Località, Certificazioni Bio/FairTrade/MSC/etc.).
    4. Tipo Prodotto (Impatto intrinseco es. carne vs vegetali).
    5. Ingredienti Controversi (Olio di Palma non sostenibile).
- IMPORTANTE: Nonostante dovrai calcolare questo punteggio per il campo JSON, la descrizione dell'analisi ambientale sarà vuota.

// ---> NUOVE ISTRUZIONI PER SPIEGAZIONI SCORE <--- 
ISTRUZIONI AGGIUNTIVE PER LE SPIEGAZIONI DEGLI SCORE:
1.  **Nutri-Score Explanation:** Se un Nutri-Score (${formatField(nutriScore)}) è disponibile, genera una spiegazione INTERESSANTE e NON OVVIA (1-2 frasi) contestualizzata ai dati nutrizionali o agli ingredienti specifici di questo prodotto. Inserisci questa spiegazione nel campo JSON 'nutriScoreExplanation'.
2.  **NOVA Explanation:** Se un Gruppo NOVA (${formatField(novaScore)}) è disponibile, genera una spiegazione CHE VA OLTRE LA DEFINIZIONE STANDARD (1-2 frasi) con dettagli specifici sul processo di lavorazione o ingredienti tipici di questo prodotto. Inserisci questa spiegazione nel campo JSON 'novaExplanation'.
3.  **Eco-Score Explanation:** Se un Eco-Score (${formatField(ecoScore)}) è disponibile, genera una breve spiegazione (1-2 frasi) che rifletta l'impatto ambientale di questo specifico prodotto. Inserisci questa spiegazione nel campo JSON 'ecoScoreExplanation'.

FORMATO DELLA RISPOSTA (SINGOLO OGGETTO JSON VALIDO, SENZA TESTO EXTRA PRIMA O DOPO):
{
  "healthScore": [Punteggio numerico INTERO 0-100 SALUTE],
  "sustainabilityScore": [Punteggio numerico INTERO 0-100 SOSTENIBILITÀ],
  "analysis": "[NON INIZIARE MAI CON IL NOME DEL PRODOTTO! Descrizione concisa (2-3 FRASI al massimo) e chiara degli aspetti nutrizionali principali, particolarità e qualità nutrizionale generale. Fornisci informazioni ESSENZIALI, UTILI e NON OVVIE per l'utente.]",
  "pros": [
    {"title": "[TITOLO PRO SALUTE CON DATO NUMERICO SE DISPONIBILE]", "detail": "[SPIEGAZIONE DETTAGLIATA (2-3 FRASI) che includa benefici specifici per la salute basati su ingredienti e valori nutrizionali concreti.]"}
    // Generare altri pro salute significativi, utili e basati sui dati
  ],
  "cons": [
    {"title": "[TITOLO CONTRO SALUTE CON DATO SPECIFICO]", "detail": "[SPIEGAZIONE DETTAGLIATA (2-3 FRASI) dei rischi specifici. Se visibili additivi, spiegare dettagliatamente cosa fanno e i potenziali rischi.]"}
    // Ogni additivo va analizzato SEPARATAMENTE con dettagli su cosa fa e rischi potenziali
  ],
  "recommendations": [
    "[MASSIMO 2 RACCOMANDAZIONI PRATICHE, INTELLIGENTI, NON BANALI]"
  ],
  "sustainabilityAnalysis": "",
  "sustainabilityPros": [
     {"title": "[TITOLO PRO SOSTENIBILITÀ CON DETTAGLIO SPECIFICO]", "detail": "[SPIEGAZIONE DETTAGLIATA (2-3 FRASI) con fatti specifici sull'aspetto positivo ambientale.]"}
  ],
  "sustainabilityCons": [
    {"title": "[TITOLO CONTRO SOSTENIBILITÀ SPECIFICO]", "detail": "[SPIEGAZIONE DETTAGLIATA (2-3 FRASI) con fatti specifici sull'aspetto negativo ambientale.]"}
  ],
  "sustainabilityRecommendations": [
    "[MASSIMO 2 RACCOMANDAZIONI AMBIENTALI CONCRETE E SPECIFICHE]"
  ],
  "suggestedPortionGrams": [NUMERO INTERO della porzione consigliata in grammi],
  "nutriScoreExplanation": "[SPIEGAZIONE CONTESTUALIZZATA e NON OVVIA SUL NUTRI-SCORE]",
  "novaExplanation": "[SPIEGAZIONE CONTESTUALIZZATA e SPECIFICA SUL GRUPPO NOVA]",
  "ecoScoreExplanation": "[SPIEGAZIONE CONTESTUALIZZATA SULL'ECO-SCORE]"
}

ISTRUZIONI FINALI:
1. Ogni titolo di PRO/CONTRO deve contenere dati specifici quando disponibili.
2. NON ripetere il nome del prodotto nel campo "analysis".
3. Per OGNI additivo (E-number) presente, crea un CONTRO separato che ne spiega rischi specifici e scopo.
4. NON creare MAI contro del tipo "origine sconosciuta", "dati mancanti", ecc.
5. MANTIENI IL CAMPO "sustainabilityAnalysis" VUOTO ("") ma compila gli altri campi eco.
6. NON includere curiosità storiche o aneddoti che non siano direttamente rilevanti per il valore nutrizionale o la salute del consumatore.
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
        
        const keywordsToFilterByTitle = [
          "NOVA", "GRUPPO NOVA", 
          "NUTRI-SCORE", "NUTRISCORE",
          isPhotoAnalysis ? null : "ECO-SCORE", // Non filtrare Eco-Score per foto
          isPhotoAnalysis ? null : "ECOSCORE",
          "ULTRA-PROCESSATO", "ULTRAPROCESSATO", "ULTRA-LAVORATO", "ULTRALAVORATO"
        ].filter(Boolean) as string[]; // Rimuove i null e asserisce il tipo
        
        const keywordsToFilterByDetail = [ 
          "questo prodotto è classificato come NOVA",
          "il Nutri-Score di questo prodotto è",
          isPhotoAnalysis ? null : "l'Eco-Score di questo prodotto è",
          "appartiene al gruppo NOVA"
        ].filter(Boolean) as string[];

        const filterItems = (items: Array<{title: string, detail: string}>) => {
          if (!Array.isArray(items)) return [];
          return items.filter(item => {
            const titleUpper = item.title.toUpperCase();
            const detailUpper = item.detail ? item.detail.toUpperCase() : "";

            const titleMatches = keywordsToFilterByTitle.some(keyword => 
              titleUpper.includes(keyword)
            );
            const titleScoreOnlyMatch = 
              titleUpper.match(/^NUTRI-SCORE:?\s*[A-E]$/) ||
              (isPhotoAnalysis ? false : titleUpper.match(/^ECO-SCORE:?\s*[A-E]$/)) || // Condizionale per Eco-Score
              titleUpper.match(/^NOVA:?\s*[1-4]$/) ||
              titleUpper.match(/^GRUPPO NOVA:?\s*[1-4]$/);

            const detailMatches = keywordsToFilterByDetail.some(keyword =>
              detailUpper.includes(keyword.toUpperCase())
            );
            
            return !(titleMatches || titleScoreOnlyMatch || detailMatches);
          });
        };

        result.pros = filterItems(result.pros);
        result.cons = filterItems(result.cons);
        if (!isPhotoAnalysis) {
            result.sustainabilityPros = filterItems(result.sustainabilityPros);
            result.sustainabilityCons = filterItems(result.sustainabilityCons);
            console.log('[GEMINI PARSE FILTER] Pro/Contro SOSTENIBILITÀ filtrati.');
        }
        console.log('[GEMINI PARSE FILTER] Pro/Contro SALUTE filtrati.');

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
  console.log(`[GEMINI FALLBACK] Creazione risultato di fallback. Da analisi foto: ${isPhotoAnalysisFallback}`)

  const healthScoreMatch = response.match(/healthScore["\s:]+(\d+)/)
  let healthScore = healthScoreMatch ? Number.parseInt(healthScoreMatch[1], 10) : 50
  healthScore = Math.min(100, Math.max(1, healthScore));

  let sustainabilityScore = 50; // Default per analisi non-foto
  if (isPhotoAnalysisFallback) {
    sustainabilityScore = 0; 
  }
  else {
    const sustainabilityScoreMatch = response.match(/sustainabilityScore["\s:]+(\d+)/)
    sustainabilityScore = sustainabilityScoreMatch ? Number.parseInt(sustainabilityScoreMatch[1], 10) : 50;
    sustainabilityScore = Math.min(100, Math.max(1, sustainabilityScore));
  }
  
  console.log(`[GEMINI FALLBACK] Punteggi: Health=${healthScore}, Sustainability=${sustainabilityScore}`)

  const fallbackResult: GeminiAnalysisResult = {
    healthScore: healthScore,
    sustainabilityScore: sustainabilityScore,
    analysis: "Non è stato possibile generare un'analisi dettagliata.",
    pros: [{title: "Non disponibile", detail: "Informazioni non disponibili al momento."}],
    cons: [{title: "Non disponibile", detail: "Informazioni non disponibili al momento."}],
    recommendations: ["Riprova o consulta altre fonti."],
    sustainabilityAnalysis: isPhotoAnalysisFallback ? "" : "Non è stato possibile generare un'analisi dettagliata della sostenibilità.",
    sustainabilityPros: isPhotoAnalysisFallback ? [] : [{title: "Non disponibile", detail: "Non disponibile"}],
    sustainabilityCons: isPhotoAnalysisFallback ? [] : [{title: "Non disponibile", detail: "Non disponibile"}],
    sustainabilityRecommendations: isPhotoAnalysisFallback ? [] : ["Non disponibile"],
    productNameFromVision: undefined,
    brandFromVision: undefined,
    suggestedPortionGrams: undefined, 
    nutriScoreExplanation: undefined,
    novaExplanation: undefined,
    ecoScoreExplanation: isPhotoAnalysisFallback ? "" : undefined,
    // Campi specifici per calorie foto
    calorie_estimation_type: isPhotoAnalysisFallback ? 'per_100g' : undefined, 
    ingredients_breakdown: isPhotoAnalysisFallback ? [] : undefined,
    calories_estimate: isPhotoAnalysisFallback ? "~... kcal per 100g" : "Non disponibile" // Diverso fallback per non-foto
  }
  
  // Ulteriore garanzia che i campi eco siano vuoti per fallback da analisi foto
  if (isPhotoAnalysisFallback) {
      fallbackResult.sustainabilityScore = 0;
      fallbackResult.sustainabilityAnalysis = "";
      fallbackResult.sustainabilityPros = [];
      fallbackResult.sustainabilityCons = [];
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
Analizza ATTENTAMENTE l'immagine fornita di un prodotto alimentare.

OBIETTIVO PRINCIPALE: Fornire una stima calorica e un'analisi della salubrità.
NON FORNIRE ALCUNA ANALISI AMBIENTALE O PUNTEGGIO ECO.

ISTRUZIONI FONDAMENTALI PER LA STIMA CALORICA:
1.  **DISCERNI IL TIPO DI ALIMENTO:** Per una corretta classificazione:
    *  **CASO A: PRODOTTO CONFEZIONATO/INDUSTRIALE SINGOLO** = SOLO prodotti CHIARAMENTE industriali in una confezione commerciale, come:
       - Un pacchetto sigillato di biscotti
       - Una scatola/lattina/bottiglia etichettata di prodotto commerciale
       - Prodotti con marchio visibile e confezionamento industriale
    
    *  **CASO B: PIATTO COMPOSTO / ALIMENTI SFUSI** = TUTTI gli altri casi, specificamente:
       - FRUTTA FRESCA singola (es. mela, kiwi, banana) anche se è un solo elemento
       - VERDURA FRESCA singola (es. carota, pomodoro, patata) anche se è un solo elemento
       - ALIMENTI NATURALI NON TRASFORMATI (es. uovo, pezzo di formaggio fresco)
       - Piatti preparati con più ingredienti (es. pasta, insalata mista)
       - Alimenti non chiaramente confezionati industrialmente
       - TUTTO CIÒ CHE È NATURALE o fatto in casa

2.  **CASO A: PRODOTTO CONFEZIONATO/INDUSTRIALE SINGOLO:**
    *   Identifica il nome e la marca, se possibile.
    *   Imposta "calorie_estimation_type": "per_100g" (preferito) o "per_serving_packaged" (se la porzione della confezione è EVIDENTE e COMUNE, es. una piccola busta di patatine).
    *   Fornisci la stima calorica in "calories_estimate" (es. "~480 kcal per 100g" o "~150 kcal per porzione (30g)").
    *   Il campo "ingredients_breakdown" DEVE essere null o un array vuoto.
    *   BASA la stima su una ricerca della tua conoscenza per prodotti simili se i dettagli non sono visibili.

3.  **CASO B: PIATTO COMPOSTO / ALIMENTI SFUSI (COMPRESA FRUTTA E VERDURA SINGOLA):**
    *   Imposta "calorie_estimation_type": "breakdown".
    *   Identifica i COMPONENTI ALIMENTARI PRINCIPALI visibili (massimo 5-6 componenti per chiarezza).
    *   Per OGNI componente, fornisci un oggetto nel campo array "ingredients_breakdown" con:
        *   "id": Un identificatore testuale breve e univoco per l'ingrediente (es. "kiwi_fresco", "carota", "bistecca_manzo"). USA snake_case.
        *   "name": Un nome descrittivo (es. "Kiwi", "Carota", "Bistecca di manzo").
        *   "estimated_weight_g": La tua MIGLIORE STIMA del peso in grammi di quel componente, basandoti su porzioni standard e sull'aspetto visivo. Sii realistico.
        *   "estimated_calories_kcal": La tua MIGLIORE STIMA delle calorie per il peso stimato di QUEL componente.
    *   Nel campo "calories_estimate" (stringa), fornisci la SOMMA TOTALE delle "estimated_calories_kcal" di tutti i componenti identificati, formattata come: "Totale: ~[SOMMA] kcal". Esempio: "Totale: ~620 kcal".

ISTRUZIONI GENERALI PER L'ANALISI DELLA SALUTE (per entrambi i casi):
*   Fornisci un "healthScore" (0-100).
*   Fornisci una "analysis" (max 1-2 frasi sintetiche sugli aspetti nutrizionali principali).
*   Fornisci "pros" e "cons" sulla SALUTE (titoli diretti, dettagli cauti, max 2-3 per tipo).
*   Fornisci "recommendations" sulla SALUTE (1-2 consigli pratici).
*   Se rilevante, fornisci "nutriScoreExplanation" e "novaExplanation" contestualizzati alla salute.
*   Tutti i campi relativi alla sostenibilità (sustainabilityScore, sustainabilityAnalysis, sustainabilityPros, sustainabilityCons, sustainabilityRecommendations, ecoScoreExplanation) DEVONO ESSERE OMESSI o lasciati come stringhe vuote o valori null/undefined.

Nome del prodotto suggerito dall'utente (se utile per il contesto, ma non vincolante): ${productNameHint}

FORMATO RISPOSTA (SINGOLO OGGETTO JSON VALIDO, SENZA TESTO EXTRA PRIMA O DOPO):
{
  "productNameFromVision": "[nome generico del prodotto o del piatto identificato]",
  "brandFromVision": "[possibile marca, se prodotto confezionato e identificabile, altrimenti null]",
  "healthScore": [Punteggio INTERO 0-100 SALUTE],
  "analysis": "[DESCRIZIONE ULTRA-SINTETICA (MAX 1-2 FRASI) SALUTE. MAI ripetere il nome.]",
  "pros": [
    {"title": "[TITOLO PRO SALUTE DIRETTO]", "detail": "[SPIEGAZIONE CAUTA BENEFICI SALUTE (1-2 frasi)]"}
  ],
  "cons": [
    {"title": "[TITOLO CONTRO SALUTE DIRETTO]", "detail": "[SPIEGAZIONE CAUTA RISCHI SALUTE (1-2 frasi)]"}
  ],
  "recommendations": ["[1-2 RACCOMANDAZIONI PRATICHE SALUTE]"],
  "nutriScoreExplanation": "[EVENTUALE SPIEGAZIONE NUTRI-SCORE CONTESTUALIZZATA ALLA SALUTE]",
  "novaExplanation": "[EVENTUALE SPIEGAZIONE GRUPPO NOVA CONTESTUALIZZATA ALLA SALUTE]",
  
  "calorie_estimation_type": "[breakdown OR per_100g OR per_serving_packaged]",
  "ingredients_breakdown": [
    // Esempio per "breakdown" di un singolo frutto (kiwi):
    // {"id": "kiwi_fresco", "name": "Kiwi", "estimated_weight_g": 70, "estimated_calories_kcal": 45},
    
    // Esempio per "breakdown" di più componenti:
    // {"id": "bistecca_manzo", "name": "Bistecca di manzo", "estimated_weight_g": 150, "estimated_calories_kcal": 280},
    // {"id": "patate_forno", "name": "Patate al forno", "estimated_weight_g": 120, "estimated_calories_kcal": 150}
  ],
  "calories_estimate": "[STRINGA: Es. 'Totale: ~430 kcal' per breakdown, o '~450 kcal per 100g' per confezionato]",
  
  // Campi di sostenibilità DEVONO essere omessi o null/vuoti:
  "sustainabilityScore": null,
  "sustainabilityAnalysis": "",
  "sustainabilityPros": [],
  "sustainabilityCons": [],
  "sustainabilityRecommendations": [],
  "ecoScoreExplanation": ""
}

ISTRUZIONI FINALI IMPORTANTISSIME:
1.  ATTENZIONE: La frutta e verdura fresca singola (es. kiwi, mela, banana) va SEMPRE trattata come CASO B (breakdown), anche se è un solo elemento.
2.  Se fornisci "ingredients_breakdown", assicurati che "calories_estimate" sia la somma delle calorie dei componenti e formattata come "Totale: ~[SOMMA] kcal".
3.  NON includere MAI campi relativi alla sostenibilità che non siano null o stringhe/array vuoti come specificato nel formato JSON.
4.  Fornisci stime di peso e calorie RAGIONEVOLI e basate sulla tua conoscenza.
5.  Sii ULTRA-SINTETICO nei testi.
6.  RISPONDI SEMPRE E SOLO IN ITALIANO.
`;
};

/**
 * NUOVA FUNZIONE: Stima le calorie per un singolo ingrediente e peso.
 */
export const getCaloriesForSingleIngredientFromGemini = async (name: string, weightGrams: number): Promise<number | null> => {
  console.log(`[GEMINI SERVICE] Richiesta stima calorie per: ${name}, ${weightGrams}g`);

  if (!GEMINI_API_KEY) {
    console.error("[GEMINI SERVICE] Chiave API Gemini non configurata.");
    return null;
  }

  const prompt = `
    Per l'ingrediente "${name}", stima il numero di calorie (kcal) per ${weightGrams} grammi.
    Rispondi SOLO con un numero intero che rappresenta le calorie stimate.
    Non aggiungere alcuna altra parola, spiegazione o unità (come "kcal").
    Esempio di risposta valida: 150
    Se non puoi stimare le calorie in modo affidabile per l'ingrediente fornito, rispondi con "0".
  `;

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      // temperature: 0.4, // Valori più bassi per risposte più deterministiche
      // topK: 32,
      // topP: 1,
      maxOutputTokens: 10, // Le calorie sono un numero breve
      // stopSequences: [],
    },
  };

  try {
    const response = await fetch(`${GEMINI_TEXT_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[GEMINI SERVICE] Errore API (getCaloriesForSingleIngredient) ${response.status}:`,
        errorBody
      );
      return null;
    }

    const responseData = await response.json();
    console.log("[GEMINI SERVICE] Risposta API (getCaloriesForSingleIngredient):", JSON.stringify(responseData));

    // Estrai il testo dalla risposta
    // La struttura può variare leggermente, adattala se necessario basandoti sui log
    const candidate = responseData.candidates?.[0];
    const content = candidate?.content;
    const part = content?.parts?.[0];
    const textResponse = part?.text;

    if (textResponse) {
      const calories = parseInt(textResponse.trim(), 10);
      if (!isNaN(calories) && calories >= 0) { // Accetta 0 come risposta valida (se l'AI non sa stimare)
        console.log(`[GEMINI SERVICE] Calorie stimate per ${name} (${weightGrams}g): ${calories} kcal`);
        return calories;
      }
      console.warn(
        `[GEMINI SERVICE] Risposta calorie non numerica o non valida: "${textResponse}"`
      );
    }
    console.warn("[GEMINI SERVICE] Nessun testo valido trovato nella risposta per le calorie.");
    return null; // O un valore di fallback se preferito

  } catch (error) {
    console.error("[GEMINI SERVICE] Errore fetch (getCaloriesForSingleIngredient):", error);
    return null;
  }
};