 "use client"

import React, { useMemo, useRef, useEffect, useState, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Share,
  LayoutAnimation,
  Platform,
  UIManager,
  ViewStyle,
  TextStyle,
  TextInput, // Unico import da 'react-native'
} from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { AppStackParamList } from "../../navigation"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../../contexts/AuthContext"
import { useNavigation } from "@react-navigation/native"
import {
  getProductRecordById,
  isProductInFavorites,
  addProductToFavorites,
  removeProductFromFavorites,
  fetchOrGenerateAiAnalysisAndUpdateProduct,
  type ProductRecord,
  type RawProductData,
  savePhotoAnalysisIngredients, // Importo le nuove funzioni
  loadPhotoAnalysisIngredients,
  saveProductWithIngredients,
  updateProductIngredientsInDb, // <-- Importa la nuova funzione
} from "../../services/api"
import EmptyState from "../../components/EmptyState"
import { formatNutritionValue, getNutritionGradeLabel, getEcoScoreLabel } from "../../utils/formatters"
import HealthScoreIndicator from "../../components/HealthScoreIndicator"
import SustainabilityScoreIndicator from "../../components/SustainabilityScoreIndicator"
import type { GeminiAnalysisResult, EstimatedIngredient } from "../../services/gemini"
import { StatusBar } from 'expo-status-bar';
import { StatusBar as RNStatusBar } from 'react-native';
import ScoreIndicatorCard from '../../components/ScoreIndicatorCard';
import LoadingAnimationScreen from '../../components/LoadingAnimationScreen';
import { getCaloriesForSingleIngredientFromGemini } from "../../services/gemini"; // IMPORTAZIONE NUOVA FUNZIONE

// *** NUOVO CODICE: DEBUG FLAG ***
const DEBUG_CALORIES = true; 
const logCalories = (message: string, ...data: any[]) => {
  if (DEBUG_CALORIES) {
    console.log(`[CALORIES DEBUG] ${message}`, ...data);
  }
};

// Verifica se un prodotto è stato analizzato con foto basandosi su diversi fattori
const isProductFromPhotoAnalysis = (
  isPhotoAnalysisFlag: boolean | undefined, 
  displayProductInfo: RawProductData | ProductRecord | null,
  aiAnalysis: GeminiAnalysisResult | null
): boolean => {
  // Prima controlla il flag esplicito (priorità massima)
  if (isPhotoAnalysisFlag === true) {
    logCalories("Prodotto da analisi foto: flag isPhotoAnalysis è true");
    return true;
  }
  
  // Controlla la presenza di calories_estimate in aiAnalysis
  if (aiAnalysis?.calories_estimate) {
    logCalories("Prodotto da analisi foto: trovato calories_estimate in aiAnalysis");
    return true;
  }
  
  // Controlla productNameFromVision che è un campo unico dell'analisi visiva
  if (aiAnalysis?.productNameFromVision) {
    logCalories("Prodotto da analisi foto: trovato productNameFromVision in aiAnalysis");
    return true;
  }
  
  // Controlla il prodotto caricato dal DB
  if (displayProductInfo) {
    // Controlla is_visually_analyzed se disponibile
    if ('is_visually_analyzed' in displayProductInfo && displayProductInfo.is_visually_analyzed) {
      logCalories("Prodotto da analisi foto: trovato is_visually_analyzed=true in displayProductInfo");
      return true;
    }
    
    // Controlla calories_estimate nel prodotto
    if ('calories_estimate' in displayProductInfo && displayProductInfo.calories_estimate) {
      logCalories("Prodotto da analisi foto: trovato calories_estimate in displayProductInfo");
      return true;
    }
    
    // Controlla barcode speciale per prodotti da analisi foto
    if ('barcode' in displayProductInfo && displayProductInfo.barcode === 'temp_visual_scan') {
      logCalories("Prodotto da analisi foto: trovato barcode=temp_visual_scan");
      return true;
    }
    
    // Controlla il codice speciale per prodotti da analisi foto (RawProductData)
    if ('code' in displayProductInfo && displayProductInfo.code === 'temp_visual_scan') {
      logCalories("Prodotto da analisi foto: trovato code=temp_visual_scan");
      return true;
    }
  }
  
  logCalories("Prodotto NON da analisi foto: nessun indicatore trovato");
  return false;
};

// Abilita LayoutAnimation su Android (se si decide di usarla)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- NUOVA FUNZIONE HELPER PER COLORE DA PUNTEGGIO NUMERICO ---
const getColorFromNumericScore = (score: number | undefined | null, themeColors: any): string => {
  const defaultColor = themeColors.textMuted || '#888888'; 
  if (score === undefined || score === null) return defaultColor;

  if (score >= 81) return '#1E8F4E'; // Verde Scuro (Nutri-A)
  if (score >= 61) return '#7AC547'; // Verde Chiaro (Nutri-B)
  if (score >= 41) return '#FFC734'; // Giallo (Nutri-C)
  if (score >= 21) return '#FF9900'; // Arancione (Nutri-D)
  if (score >= 0) return '#FF0000';   // Rosso (Nutri-E)
  return defaultColor; // Fallback se score < 0 (improbabile)
};
// --- FINE NUOVA FUNZIONE HELPER ---

// Tipo per gli item degli score (simile a pros/cons ma con info aggiuntive)
type ScoreItem = {
  id: string; // Aggiunto ID univoco per key prop
  title: string; // Es. "Nutri-Score: C"
  classification: 'positive' | 'negative' | 'neutral';
  scoreType: 'nutri' | 'nova' | 'eco'; // Per sapere quale scala mostrare
  originalValue: string | number | null | undefined; // Il valore effettivo (es. C, 4, B)
  scale: Array<string | number>; // La scala completa (es. ['A', 'B', 'C', 'D', 'E'])
  valueType: 'letter' | 'number'; // Tipo di valore per ScoreIndicatorCard
  aiExplanation?: string; // Spiegazione AI (placeholder per ora)
};

// Funzione helper per parsare campi array JSON, spostata fuori da loadProductData
const parseJsonArrayField = (fieldData: any): Array<{title: string, detail: string}> => {
  if (Array.isArray(fieldData)) {
    if (fieldData.length > 0 && typeof fieldData[0] === 'string') {
      try {
        // Tenta di parsare ogni elemento se l'array contiene stringhe JSON
        return fieldData.map(item => JSON.parse(item));
      } catch (e) {
        console.warn("[PARSE HELPER WARN] Errore parsing stringhe JSON nell'array, restituendo dati grezzi o fallback.", e, fieldData);
        // Se il parsing fallisce, potrebbe essere un array misto o non JSON valido.
        // Restituisci un formato di fallback o considera di loggare/gestire l'errore più specificamente.
        return fieldData.map(item => (typeof item === 'string' ? { title: "Errore formato", detail: item } : item)) as Array<{title: string, detail: string}>;
      }
    }
    // Se è già un array di oggetti (o un array vuoto), restituiscilo così com'è
    return fieldData as Array<{title: string, detail: string}>;
  } else if (typeof fieldData === 'string') {
    // Se è una singola stringa JSON che rappresenta un array
    try {
      const parsed = JSON.parse(fieldData);
      return Array.isArray(parsed) ? parsed : [{ title: "Errore formato dati", detail: "Il JSON non è un array" }];
    } catch (e) {
      console.warn("[PARSE HELPER WARN] Errore parsing stringa JSON del campo, fallback.", e, fieldData);
      return [{ title: "Errore formato dati", detail: "Impossibile leggere i dettagli" }];
    }
  }
  console.log("[PARSE HELPER INFO] fieldData non è né array né stringa, restituendo array vuoto:", fieldData);
  return []; // Fallback per tipi non gestiti (es. null, undefined)
};

// Definizioni icone e colori (spostata a livello modulo)
const SCORE_ITEM_ICONS = {
  positive: { name: "checkmark-circle", color: '#28a745' }, // Verde (Pieno)
  negative: { name: "close-circle", color: '#dc3545' },    // Rosso (Pieno)
  neutral: { name: "remove-circle", color: '#ff9900' }     // Arancione (Pieno)
};

type ProductDetailScreenRouteParams = {
  productRecordId: string;
  initialProductData?: RawProductData | null; 
  aiAnalysisResult?: GeminiAnalysisResult | null;
  isPhotoAnalysis?: boolean; // Nuovo parametro per distinguere l'analisi foto
};

type Props = NativeStackScreenProps<AppStackParamList, "ProductDetail">;

const ProductDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { productRecordId, initialProductData: routeInitialProductData, aiAnalysisResult: routeAiAnalysisResult, isPhotoAnalysis } = route.params as ProductDetailScreenRouteParams;
  
  const [displayProductInfo, setDisplayProductInfo] = useState<RawProductData | ProductRecord | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<GeminiAnalysisResult | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [loadingInitialData, setLoadingInitialData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [savingFavorite, setSavingFavorite] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const { colors } = useTheme()
  const { user } = useAuth()
  const navigationHook = useNavigation();

  // Nuovo stato per elementi espandibili
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // NUOVI STATI PER INGREDIENTI MODIFICABILI (ANALISI FOTO BREAKDOWN)
  const [editableIngredients, setEditableIngredients] = useState<EstimatedIngredient[] | null>(null);
  const [totalEstimatedCalories, setTotalEstimatedCalories] = useState<number | null>(null);
  // Salva una copia originale del breakdown per il ricalcolo proporzionale
  const originalIngredientsBreakdownRef = useRef<EstimatedIngredient[] | null>(null);
  // Stato per l'aggiunta di nuovi ingredienti
  const [isAddingIngredient, setIsAddingIngredient] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientWeight, setNewIngredientWeight] = useState("");
  // Stato per modifiche non salvate
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Stato per il salvataggio in corso
  const [isSavingIngredients, setIsSavingIngredients] = useState(false);

  // Determina se le funzionalità dei preferiti devono essere disabilitate
  const disableFavoriteFeature = useMemo(() => {
    // Disabilita se è un'analisi foto E non c'è un ID prodotto valido (diverso da temp_visual_scan)
    return isPhotoAnalysis && (!productRecordId || productRecordId === "temp_visual_scan");
  }, [isPhotoAnalysis, productRecordId]);

  // Stile per l'indicatore di caricamento minimale
  const aiLoadingMinimalStyle: { container: ViewStyle, text: TextStyle } = {
    container: {
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center', 
      paddingVertical: 15, 
      marginVertical: 10,
    },
    text: {
      marginLeft: 10,
      fontSize: 15,
      color: colors.textMuted,
    }
  };

  // Costanti per lo stile "bordo direzionato"
  const CARD_BORDER_WIDTH = 2;
  const SHADOW_OFFSET_VALUE = 2.5;
  const BORDER_COLOR = "#000";
  const BACKGROUND_COLOR = "#f8f4ec";
  const CARD_BACKGROUND_COLOR = "#FFFFFF"; // Per le card bianche dei pro/contro

  // Costanti dalla HomeScreen per coerenza (verificare se già definite o se servono precise)
  const COMMON_BORDER_WIDTH = 2; // Già CARD_BORDER_WIDTH, usiamo quella
  const IMAGE_SHADOW_OFFSET = 2; // Offset per l'ombra dell'immagine dentro la card

  // Costanti per le "pillole" dei valori nutrizionali
  const PILL_BORDER_WIDTH = 2;
  const PILL_SHADOW_OFFSET = 2.5;
  const PILL_BORDER_RADIUS = 10;
  const PILL_HEIGHT = 48; 
  const ICON_PILL_SIZE = 48; 

  const getNutrientIconName = (nutrientKey: string): string => {
    switch (nutrientKey) {
      case 'energy_kcal_100g': return 'flame';
      case 'fat_100g': return 'water';
      case 'saturated_fat_100g': return 'ellipse'; // Non ha versione piena standard, usiamo outline
      case 'carbohydrates_100g': return 'layers';
      case 'sugars_100g': return 'cube';
      case 'fiber_100g': return 'analytics'; // Non ha versione piena standard, usiamo outline
      case 'proteins_100g': return 'barbell';
      case 'salt_100g': return 'grid'; // Non ha versione piena standard, usiamo outline
      default: return 'help-circle'; // Usiamo versione piena
    }
  };

  const getNutrientIconColor = (nutrientKey: string): string => {
    switch (nutrientKey) {
      case 'energy_kcal_100g': return '#FFA07A'; // LightSalmon (Arancione chiaro)
      case 'fat_100g': return '#87CEEB';       // SkyBlue (Blu cielo)
      case 'saturated_fat_100g': return '#DA70D6'; // Orchid (Viola chiaro)
      case 'carbohydrates_100g': return '#FFD700'; // Gold (Giallo oro)
      case 'sugars_100g': return '#FFB6C1';    // LightPink (Rosa chiaro)
      case 'fiber_100g': return '#20B2AA';     // LightSeaGreen (Verde acqua)
      case 'proteins_100g': return '#CD5C5C';   // IndianRed (Rosso mattone chiaro)
      case 'salt_100g': return '#D3D3D3';      // LightGray (Grigio chiaro)
      default: return BORDER_COLOR; // Nero come fallback
    }
  };

  const toggleItemExpansion = (key: string) => {
      // Attiva animazione (opzionale)
      // LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedItems(prev => ({
          ...prev,
          [key]: !prev[key]
      }));
  };

  // Funzione helper per accedere ai valori nutrizionali in modo sicuro
  const getNutrimentValue = (field: keyof ProductRecord | keyof NonNullable<RawProductData['nutriments']>) => {
    if (!displayProductInfo) return undefined;
    if ('nutriments' in displayProductInfo && displayProductInfo.nutriments) {
      return displayProductInfo.nutriments[field as keyof NonNullable<RawProductData['nutriments']>];
    }
    // Prova ad accedere direttamente se displayProductInfo è un ProductRecord o una struttura piatta
    return (displayProductInfo as any)[field]; 
  };

  const loadProductData = useCallback(async (mountedRef: { current: boolean }) => {
    // Caso speciale per l'analisi foto: se abbiamo un ID temporaneo ma isPhotoAnalysis=true e abbiamo i dati iniziali, 
    // non mostriamo l'errore e continuiamo normalmente
    const isPhotoAnalysisWithTempId = productRecordId === "temp_visual_scan" && isPhotoAnalysis && routeInitialProductData;
    
    logCalories(`loadProductData iniziato, productRecordId=${productRecordId}, isPhotoAnalysis=${isPhotoAnalysis}`);
    
    // Reset COMPLETO dello stato all'inizio del caricamento di un nuovo prodotto
    // Questo è fondamentale per evitare contaminazione tra prodotti diversi
    if (mountedRef.current) {
      setDisplayProductInfo(null);
      setAiAnalysis(null);
      setLoadingInitialData(true);
      setError(null);
      setEditableIngredients(null);
      setTotalEstimatedCalories(null);
      originalIngredientsBreakdownRef.current = null;
      logCalories('Reset completo dello stato effettuato');
    }
    
    // Modifica della condizione per considerare valido anche il caso dell'analisi foto temporanea
    if ((!user || (!productRecordId && !isPhotoAnalysisWithTempId))) {
      if (mountedRef.current) {
        setError("Informazioni utente o ID prodotto mancanti.");
        setLoadingInitialData(false);
      }
      return;
    }

    try {
      let fetchedProduct: ProductRecord | null = null;
      let initialDisplayData: RawProductData | ProductRecord | null = null;
      let initialAiAnalysis: GeminiAnalysisResult | null = null; // Variabile locale per l'AI iniziale

      if (routeInitialProductData && mountedRef.current) {
        initialDisplayData = routeInitialProductData;
        setDisplayProductInfo(initialDisplayData); 
        if (routeAiAnalysisResult) {
          logCalories("Dati RAW e Analisi AI dalla route.");
          logCalories("routeAiAnalysisResult:", routeAiAnalysisResult);
          
          // Assicurati di copiare ESPLICITAMENTE tutte le proprietà, inclusa calories_estimate
          initialAiAnalysis = { 
            ...routeAiAnalysisResult,
            pros: parseJsonArrayField(routeAiAnalysisResult.pros),
            cons: parseJsonArrayField(routeAiAnalysisResult.cons),
            sustainabilityPros: parseJsonArrayField(routeAiAnalysisResult.sustainabilityPros),
            sustainabilityCons: parseJsonArrayField(routeAiAnalysisResult.sustainabilityCons),
            // Assicurati che calories_estimate sia incluso esplicitamente
            calories_estimate: routeAiAnalysisResult.calories_estimate,
            calorie_estimation_type: routeAiAnalysisResult.calorie_estimation_type,
            ingredients_breakdown: routeAiAnalysisResult.ingredients_breakdown
          };
          
          logCalories('initialAiAnalysis creato:', initialAiAnalysis);
          
          setAiAnalysis(initialAiAnalysis);
        } else {
          logCalories("Dati RAW dalla route, NESSUNA AI disponibile.");
          setAiAnalysis(null); // AI non presente dalla route
        }
      } else {
        logCalories(`Nessun dato dalla route. Caricamento ProductRecord completo per ID: ${productRecordId}.`);
        fetchedProduct = await getProductRecordById(productRecordId);
        if (mountedRef.current) {
          if (fetchedProduct) {
            initialDisplayData = fetchedProduct;
            setDisplayProductInfo(fetchedProduct);
            logCalories('Dati prodotto caricati dal DB:', fetchedProduct);
            
            // Se il fetchedProduct ha calories_estimate, O un health_score valido,
            // allora consideriamo che abbia dati AI da popolare.
            if (fetchedProduct.calories_estimate || (fetchedProduct.health_score !== undefined && fetchedProduct.health_score !== null)) {
              logCalories(`Dati AI (o stima calorie) trovati in fetchedProduct: ${productRecordId}.`);
              
              // Aggiunta: Parse ingredients_breakdown dal DB se presente
              let parsedIngredientsBreakdown: EstimatedIngredient[] | undefined = undefined;
              
              if ((fetchedProduct as any).ingredients_breakdown) {
                try {
                  const ingredientsJson = (fetchedProduct as any).ingredients_breakdown;
                  parsedIngredientsBreakdown = typeof ingredientsJson === 'string' 
                    ? JSON.parse(ingredientsJson) 
                    : ingredientsJson;
                  
                  logCalories('Parsed ingredients_breakdown:', parsedIngredientsBreakdown);
                } catch (e) {
                  console.error('Errore parsing ingredients_breakdown:', e);
                }
              }
              
              initialAiAnalysis = {
                healthScore: fetchedProduct.health_score ?? 0, 
                sustainabilityScore: fetchedProduct.sustainability_score ?? 0,
                analysis: fetchedProduct.health_analysis ?? '',
                pros: parseJsonArrayField(fetchedProduct.health_pros),
                cons: parseJsonArrayField(fetchedProduct.health_cons),
                recommendations: fetchedProduct.health_recommendations ?? [],
                sustainabilityAnalysis: fetchedProduct.sustainability_analysis ?? '',
                sustainabilityPros: parseJsonArrayField(fetchedProduct.sustainability_pros),
                sustainabilityCons: parseJsonArrayField(fetchedProduct.sustainability_cons),
                sustainabilityRecommendations: fetchedProduct.sustainability_recommendations ?? [],
                suggestedPortionGrams: fetchedProduct.suggested_portion_grams,
                nutriScoreExplanation: fetchedProduct.nutri_score_explanation,
                novaExplanation: fetchedProduct.nova_explanation,
                ecoScoreExplanation: fetchedProduct.eco_score_explanation,
                calories_estimate: fetchedProduct.calories_estimate, 
                // Aggiungiamo i campi per analisi calorie in foto
                calorie_estimation_type: (fetchedProduct as any).calorie_estimation_type || 
                  // Fallback: se è un prodotto da analisi visiva e non ha type, assumiamo 'breakdown'
                  (fetchedProduct.is_visually_analyzed ? 'breakdown' : undefined),
                ingredients_breakdown: parsedIngredientsBreakdown,
                // Aggiungiamo anche i campi specifici dell'analisi visiva se esistono nel record del DB
                productNameFromVision: (fetchedProduct as any).product_name_from_vision, 
                brandFromVision: (fetchedProduct as any).brand_from_vision,
              };
              
              logCalories('initialAiAnalysis creato da DB:', initialAiAnalysis);
              
              setAiAnalysis(initialAiAnalysis);
              
              // Inizializza l'editor degli ingredienti se abbiamo ingredients_breakdown
              if (initialAiAnalysis.calorie_estimation_type === 'breakdown' && 
                  initialAiAnalysis.ingredients_breakdown && 
                  initialAiAnalysis.ingredients_breakdown.length > 0) {
                setEditableIngredients(initialAiAnalysis.ingredients_breakdown);
                
                // Calcola il totale
                const totalCal = initialAiAnalysis.ingredients_breakdown.reduce(
                  (acc, ing) => acc + ing.estimated_calories_kcal, 0
                );
                setTotalEstimatedCalories(totalCal);
                originalIngredientsBreakdownRef.current = initialAiAnalysis.ingredients_breakdown.map(
                  ing => ({...ing})
                );
                logCalories('Inizializzati ingredienti modificabili dal DB: ', initialAiAnalysis.ingredients_breakdown);
              }
            } else {
              logCalories(`Nessuna AI/stima calorie preesistente in fetchedProduct: ${productRecordId}.`);
              setAiAnalysis(null); // Nessuna AI preesistente completa
            }
          } else {
            setError("Prodotto non trovato nel database.");
          }
        }
      }

      // NUOVO CODICE: Caricamento ingredienti personalizzati
      // Usa la funzione isProductFromPhotoAnalysis per determinare se il prodotto è da analisi visiva
      // Questa è più robusta perché verifica molteplici criteri
      const isVisuallyAnalyzed = 
        // Vecchio criterio basato sul flag nel DB
        (fetchedProduct && ((fetchedProduct as any).is_visually_analyzed === true)) ||
        // Nuovo criterio usando la funzione completa
        isProductFromPhotoAnalysis(isPhotoAnalysis, fetchedProduct, initialAiAnalysis);
      
      logCalories(`Verifica prodotto visivo: isVisuallyAnalyzed=${isVisuallyAnalyzed}, flag in DB=${fetchedProduct?.is_visually_analyzed}, prod=${fetchedProduct?.product_name}`);

      if (user && isVisuallyAnalyzed && productRecordId !== "temp_visual_scan") {
        try {
          const savedIngredients = await loadPhotoAnalysisIngredients(productRecordId, user.id);
          if (savedIngredients && savedIngredients.length > 0) {
            logCalories('Ingredienti personalizzati caricati dal DB:', savedIngredients);
            setEditableIngredients(savedIngredients);
            // Calcola il totale delle calorie
            const totalCal = savedIngredients.reduce((acc, ing) => acc + ing.estimated_calories_kcal, 0);
            setTotalEstimatedCalories(totalCal);
            // Salva una copia per il ricalcolo proporzionale
            originalIngredientsBreakdownRef.current = savedIngredients.map(ing => ({...ing}));
            // Se abbiamo già caricato i dati personalizzati, non ci sono modifiche non salvate
            setHasUnsavedChanges(false);
            
            // MODIFICA: Se abbiamo trovato ingredienti personalizzati, dobbiamo anche assicurarci 
            // che aiAnalysis sia aggiornato con il tipo di stima "breakdown" e gli ingredienti
            if (initialAiAnalysis) {
              logCalories('Aggiornamento di aiAnalysis con ingredienti personalizzati e calorie_estimation_type=breakdown');
              initialAiAnalysis = {
                ...initialAiAnalysis,
                calorie_estimation_type: 'breakdown',
                ingredients_breakdown: savedIngredients,
                calories_estimate: `Totale: ~${totalCal} kcal`
              };
              setAiAnalysis(initialAiAnalysis);
            }
          }
        } catch (error) {
          console.error('Errore nel caricamento degli ingredienti personalizzati:', error);
        }
      }

      if (mountedRef.current) {
        setLoadingInitialData(false); 
      }

      if (user && productRecordId && mountedRef.current) {
        const favoriteStatus = await isProductInFavorites(user.id, productRecordId);
        if (mountedRef.current) {
          setIsFavorite(favoriteStatus);
        }
      }

    } catch (err) {
      console.error("[DETAIL ERROR] Errore nel caricamento dei dati del prodotto:", err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Errore caricamento dati.");
        setLoadingInitialData(false);
      }
    }
  }, [
      user, 
      productRecordId, 
      routeInitialProductData, 
      routeAiAnalysisResult,
      isPhotoAnalysis, // Dipendenza esplicita
  ]);

  useEffect(() => {
    const mountedRef = { current: true };
    loadProductData(mountedRef);
    return () => { mountedRef.current = false; };
  }, [loadProductData]);

  // Log di aiAnalysis quando cambia
  useEffect(() => {
    if (aiAnalysis) {
      console.log("[DETAIL AI STATE LOG] Lo stato aiAnalysis è stato aggiornato:", JSON.stringify(aiAnalysis));
    } else {
      console.log("[DETAIL AI STATE LOG] Lo stato aiAnalysis è null.");
    }
  }, [aiAnalysis]);

  // Effetto per caricare/generare l'analisi AI
  useEffect(() => {
    const mountedRef = { current: true };

    const attemptAiAnalysis = async () => {
      if (isAiLoading) {
        logCalories("Skip fetchOrGenerate: isAiLoading è true.");
        return;
      }

      // *** NUOVA LOGICA: Gestione avanzata per prodotti analizzati con foto ***
      
      // 1. Determina se il prodotto corrente è da analisi foto
      const currentProductIsFromPhotoAnalysis = isProductFromPhotoAnalysis(
        isPhotoAnalysis,
        displayProductInfo,
        aiAnalysis
      );
      
      // 2. Se è un prodotto da analisi foto, non fare fetchOrGenerate
      if (currentProductIsFromPhotoAnalysis) {
        logCalories("Skip fetchOrGenerate: Prodotto identificato come analizzato con foto");
        
        // 2.1 Verifica la presenza di calories_estimate
        if (aiAnalysis?.calories_estimate) {
          logCalories("calories_estimate già disponibile in aiAnalysis:", aiAnalysis.calories_estimate);
        } else {
          logCalories("calories_estimate NON disponibile in aiAnalysis");
          
          // 2.2 Se non c'è aiAnalysis ma c'è calories_estimate in displayProductInfo, crea un aiAnalysis
          if (!aiAnalysis && displayProductInfo && 'calories_estimate' in displayProductInfo && displayProductInfo.calories_estimate) {
            logCalories("Creazione aiAnalysis da displayProductInfo.calories_estimate:", displayProductInfo.calories_estimate);
            
            // Crea un oggetto aiAnalysis minimale con calories_estimate
            const newAiAnalysis: GeminiAnalysisResult = {
              healthScore: displayProductInfo.health_score ?? 0,
              sustainabilityScore: displayProductInfo.sustainability_score ?? 0,
              analysis: displayProductInfo.health_analysis ?? '',
              pros: [],
              cons: [],
              recommendations: [],
              sustainabilityAnalysis: '',
              sustainabilityPros: [],
              sustainabilityCons: [],
              sustainabilityRecommendations: [],
              calories_estimate: displayProductInfo.calories_estimate,
              // Aggiungiamo il tipo come breakdown per la frutta e verdura singola
              calorie_estimation_type: 'breakdown'
            };
            
            // Imposta aiAnalysis
            if (mountedRef.current) {
              setAiAnalysis(newAiAnalysis);
              logCalories("aiAnalysis impostato con calories_estimate e default calorie_estimation_type='breakdown'");
            }
          }
        }
        
        // Fine operazioni per prodotto da analisi foto
        if (isAiLoading && mountedRef.current) {
          setIsAiLoading(false);
        }
        return;
      }

      // *** FINE NUOVA LOGICA ***
      
      // Il codice seguente viene eseguito solo per prodotti NON analizzati con foto (es. barcode)

      // Determina se il prodotto caricato da DB è "visivo" (ha stima calorie ma non barcode valido)
      // e se ha un barcode valido per l'analisi testuale.
      let hasValidBarcodeForTextAnalysis = false;

      if (displayProductInfo) {
          let currentBarcode: string | undefined | null = null;
          if ('barcode' in displayProductInfo && displayProductInfo.barcode) { // ProductRecord
              currentBarcode = displayProductInfo.barcode;
          } else if ('code' in displayProductInfo && displayProductInfo.code) { // RawProductData
              currentBarcode = displayProductInfo.code;
          }

          if (currentBarcode && currentBarcode.trim() !== "" && currentBarcode !== "temp_visual_scan") {
              hasValidBarcodeForTextAnalysis = true;
          }
      }

      // Condizione per eseguire l'analisi AI testuale/barcode
      const needsAiFetch = displayProductInfo && (!aiAnalysis || aiAnalysis.healthScore === undefined || aiAnalysis.healthScore === null);
      
      if (user && productRecordId && needsAiFetch && hasValidBarcodeForTextAnalysis) {
        
        logCalories("Condizioni per fetch/generate AI (barcode/text) soddisfatte.");
        if (mountedRef.current) {
          setIsAiLoading(true);
        }

        let dataForGeminiAnalysis: RawProductData;
        // Priorità ai dati della route se disponibili e se è una scansione nuova (routeInitialProductData implica questo)
        if (routeInitialProductData && routeInitialProductData.code) {
          logCalories("Uso routeInitialProductData per Gemini.");
          dataForGeminiAnalysis = routeInitialProductData;
        } else if (displayProductInfo && 'nutriments' in displayProductInfo && (displayProductInfo as any).code) { // È RawProductData
          logCalories("Uso displayProductInfo (RawProductData) per Gemini.");
          dataForGeminiAnalysis = displayProductInfo as RawProductData;
        } else if (displayProductInfo && (displayProductInfo as ProductRecord).barcode) { // È ProductRecord
          logCalories("Costruisco RawProductData da ProductRecord per Gemini.");
          const record = displayProductInfo as ProductRecord;
          dataForGeminiAnalysis = {
            code: record.barcode,
            product_name: record.product_name,
            image_url: record.product_image,
            brands: record.brand,
            ingredients_text: record.ingredients,
            nutrition_grades: record.nutrition_grade,
            // ... (altri campi da ProductRecord a RawProductData come prima)
            nutriments: {
                  energy_kcal_100g: record.energy_kcal_100g, 
                  energy_100g: record.energy_100g,
              fat_100g: record.fat_100g,
              saturated_fat_100g: record.saturated_fat_100g,
              carbohydrates_100g: record.carbohydrates_100g,
              sugars_100g: record.sugars_100g,
              fiber_100g: record.fiber_100g,
              proteins_100g: record.proteins_100g,
              salt_100g: record.salt_100g,
            },
            nova_group: (record as any).nova_group,
            ecoscore_grade: record.ecoscore_grade,
            ecoscore_score: record.ecoscore_score,
            // Aggiungi altri campi che potrebbero essere rilevanti per l'analisi AI
          };
        } else {
          logCalories("Dati insufficienti per l'analisi AI. Skip.");
          if (mountedRef.current) setIsAiLoading(false);
          return;
        }
        
        logCalories(`Chiamata a fetchOrGenerateAiAnalysisAndUpdateProduct per ProductRecordID: ${productRecordId}`);
        try {
          const newAiAnalysisResult = await fetchOrGenerateAiAnalysisAndUpdateProduct(
            productRecordId,
            user.id,
            dataForGeminiAnalysis 
          );
          
          // Rimuoviamo il check mountedRef.current qui per setAiAnalysis
          if (newAiAnalysisResult) {
            logCalories("Nuova analisi AI ricevuta. Aggiornamento stato...");
            // Sostituisci completamente aiAnalysis con il nuovo risultato,
            // assumendo che newAiAnalysisResult sia già un oggetto GeminiAnalysisResult 
            // completo e correttamente formattato (con array già parsati se necessario da parseGeminiResponse).
            setAiAnalysis(newAiAnalysisResult);
          } else {
            logCalories("fetchOrGenerate... ha restituito null. Stato AI non aggiornato.");
            // Si potrebbe considerare di non modificare aiAnalysis qui, o di impostarlo a null
            // a seconda di come si vuole gestire un fallimento dell'analisi.
            // Per ora, se newAiAnalysisResult è null, non modifichiamo lo stato.
          }
        } catch (error) {
          console.error("[DETAIL AI EFFECT ERROR] Errore durante fetchOrGenerateAiAnalysisAndUpdateProduct:", error);
        } finally {
          // Rimuoviamo il check mountedRef.current qui per setIsAiLoading
          logCalories("Operazione AI conclusa. Imposto isAiLoading = false.");
          setIsAiLoading(false);
        }
      } else {
        // Logica per lo skip se non si soddisfano le condizioni per fetch/generate AI
        if (isAiLoading && mountedRef.current) setIsAiLoading(false); // Assicura che loading finisca
        
        // Log dettagliati
        if (!user) logCalories("Skip fetchOrGenerate (no user).");
        else if (!productRecordId) logCalories("Skip fetchOrGenerate (no productRecordId).");
        else if (!displayProductInfo) logCalories("Skip fetchOrGenerate (no displayProductInfo).");
        else if (!hasValidBarcodeForTextAnalysis) logCalories("Skip fetchOrGenerate (no valid barcode for text analysis).");
        else if (!needsAiFetch) logCalories("Skip fetchOrGenerate (AI già presente e completa, o dati della route hanno AI).");
      }
    };

    // Esegui solo se i dati iniziali sono caricati E non c'è un errore principale
    if (!loadingInitialData && !error) {
      attemptAiAnalysis();
    }

    return () => { mountedRef.current = false; };
  }, [
    user, 
    productRecordId, 
    displayProductInfo, 
    aiAnalysis, 
    loadingInitialData,
    error, 
    routeInitialProductData, 
    isAiLoading, 
    isPhotoAnalysis, // Aggiunta dipendenza
  ]);

  // useEffect che monitora aiAnalysis e inizializza/aggiorna gli ingredienti modificabili se necessario
  useEffect(() => {
    logCalories(`useEffect [aiAnalysis] triggerato. Tipo stima: ${aiAnalysis?.calorie_estimation_type}`);

    if (!aiAnalysis) {
      logCalories('Resetting editableIngredients e totalEstimatedCalories a null');
      setEditableIngredients(null);
      setTotalEstimatedCalories(null);
      originalIngredientsBreakdownRef.current = null; // Reset anche della reference
      return;
    }
    
    // MODIFICA: Controlliamo se editableIngredients è già impostato, in tal caso non facciamo nulla
    // Questo è importante perché gli ingredienti potrebbero essere stati caricati direttamente 
    // da loadPhotoAnalysisIngredients e non vogliamo sovrascriverli
    if (editableIngredients !== null) {
      logCalories('Ingredienti già caricati, skip inizializzazione da aiAnalysis');
      return;
    }

    // Se è un tipo 'breakdown' ma non abbiamo ingredienti, creiamo un ingredient predefinito
    if (aiAnalysis.calorie_estimation_type === 'breakdown' && 
        (!aiAnalysis.ingredients_breakdown || aiAnalysis.ingredients_breakdown.length === 0)) {
      
      logCalories('Inizializzazione editableIngredients perché tipo=breakdown ma ingredienti mancanti');
      
      // Estraiamo il nome del prodotto da uno dei campi disponibili
      const productName = aiAnalysis.productNameFromVision || 
                       (displayProductInfo && 'productName' in displayProductInfo ? (displayProductInfo as any).productName as string : 
                       (displayProductInfo && 'product_name' in displayProductInfo ? (displayProductInfo as any).product_name as string : "Prodotto alimentare"));
      
      // Calcoliamo le calorie totali dalla stringa calories_estimate (deve contenere un numero)
      const caloriesMatch = aiAnalysis.calories_estimate?.match(/\~?\s*(\d+)\s*kcal/i);
      const estimatedCalories = caloriesMatch ? parseInt(caloriesMatch[1], 10) : 0;
      
      // Stimiamo un peso ragionevole
      let estimatedWeight = 0;
      if (estimatedCalories > 0) {
        // Media approssimativa di calorie per grammo di frutta/verdura è circa 0.65 kcal/g
        // Quindi calcolo inverso: calories / 0.65 = grammi
        estimatedWeight = Math.round(estimatedCalories / 0.65);
      } else {
        // Valore predefinito
        estimatedWeight = 100;
      }

      // Crea un ingrediente predefinito
      const defaultIngredient: EstimatedIngredient = {
        id: `default_${Date.now()}`,
        name: productName,
        estimated_weight_g: estimatedWeight,
        estimated_calories_kcal: estimatedCalories || 65 // Se non abbiamo calorie, usiamo un valore predefinito
      };
      
      // Imposta l'ingrediente e il totale calorie
      setEditableIngredients([defaultIngredient]);
      setTotalEstimatedCalories(defaultIngredient.estimated_calories_kcal);
      // Salva anche una copia per ricalcoli
      originalIngredientsBreakdownRef.current = [{ ...defaultIngredient }];
      
      logCalories('Ingrediente di default creato:', defaultIngredient);
    }
    // Se invece abbiamo già degli ingredienti, li inizializziamo subito
    else if (aiAnalysis.calorie_estimation_type === 'breakdown' && 
             aiAnalysis.ingredients_breakdown && 
             aiAnalysis.ingredients_breakdown.length > 0) {
      
      logCalories('Inizializzazione editableIngredients da aiAnalysis.ingredients_breakdown', aiAnalysis.ingredients_breakdown);
      
      // Imposta gli ingredienti esistenti
      setEditableIngredients(aiAnalysis.ingredients_breakdown);
      
      // Calcola il totale delle calorie
      const totalCal = aiAnalysis.ingredients_breakdown.reduce(
        (acc, ing) => acc + ing.estimated_calories_kcal, 0
      );
      setTotalEstimatedCalories(totalCal);
      logCalories('Somma calorie iniziali calcolata:', totalCal);
      
      // Salva una copia per ricalcoli
      originalIngredientsBreakdownRef.current = aiAnalysis.ingredients_breakdown.map(ing => ({...ing}));
    }
  }, [aiAnalysis, editableIngredients, displayProductInfo]);

  const handleToggleFavorite = async () => {
    if (!displayProductInfo || !user || !productRecordId) return;

    setSavingFavorite(true)
    try {
      let success = false
      if (isFavorite) {
        success = await removeProductFromFavorites(user.id, productRecordId)
        if (success) {
          setIsFavorite(false)
          Alert.alert("Info", "Prodotto rimosso dai preferiti.")
        } else {
          Alert.alert("Errore", "Impossibile rimuovere il prodotto dai preferiti.")
        }
      } else {
        success = await addProductToFavorites(user.id, productRecordId)
        if (success) {
          setIsFavorite(true)
          Alert.alert("Successo", "Prodotto salvato nei preferiti.")
        } else {
          Alert.alert("Errore", "Impossibile salvare il prodotto nei preferiti.")
        }
      }
    } catch (error) {
      Alert.alert(
        "Errore",
        error instanceof Error ? error.message : "Si è verificato un errore durante l'operazione.",
      )
    } finally {
      setSavingFavorite(false)
    }
  }

  const handleShareProduct = async () => {
    if (!displayProductInfo) return;

    try {
      const productName = 'product_name' in displayProductInfo ? displayProductInfo.product_name : (displayProductInfo as ProductRecord).product_name;
      const brandName = 'brands' in displayProductInfo ? displayProductInfo.brands : (displayProductInfo as ProductRecord).brand;
      const nutritionGradeValue = 'nutrition_grades' in displayProductInfo ? displayProductInfo.nutrition_grades : (displayProductInfo as ProductRecord).nutrition_grade;
      // const currentEcoScoreGradeValue = 'ecoscore_grade' in displayProductInfo ? displayProductInfo.ecoscore_grade : (displayProductInfo as ProductRecord).ecoscore_grade;

      let message = `Ho trovato questo prodotto con FoodScanner: ${productName || "Sconosciuto"} di ${brandName || "Marca Sconosciuta"}.`

      if (nutritionGradeValue) {
        message += ` Nutri-Score: ${nutritionGradeValue.toUpperCase()}.`
      }
      if (aiAnalysis?.healthScore !== undefined) {
        message += ` Punteggio Salute: ${aiAnalysis.healthScore}/100.`
      }
      // Potremmo aggiungere anche l'Eco-Score se disponibile e rilevante

      await Share.share({ message })
    } catch (error) {
      Alert.alert("Errore", "Impossibile condividere il prodotto.")
    }
  }

  const getScoreColorForIcon = (grade: string | undefined | null, type: 'nutri' | 'eco', numericScore?: number | undefined | null) => {
    // Priorità al grade letterale se disponibile e valido
    if (grade && typeof grade === 'string' && grade.toLowerCase() !== 'unknown') {
      if (type === 'nutri') {
        switch (grade.toLowerCase()) {
            case "a+": return "#6ECFF6"; 
            case "a": return "#1E8F4E";
            case "b": return "#7AC547";
            case "c": return "#FFC734"; 
            case "d": return "#FF9900"; 
            case "e": return "#FF0000"; 
            default: break; // Continua sotto se non matcha
        }
      } else { // eco
        switch (grade.toLowerCase()) {
            case "a": return "#10703E"; 
            case "b": return "#60B347"; 
            case "c": return "#FFC734"; 
            case "d": return "#DC7633"; 
            case "e": return "#BA4A00"; 
            default: break; // Continua sotto se non matcha
        }
      }
    }
    // Se il grade non è valido o non c'è, usa il punteggio numerico
    return getColorFromNumericScore(numericScore, colors);
  };

  const hasNutritionData = () => {
    if (!displayProductInfo) return false;
    const fieldsToCheck: Array<keyof ProductRecord | keyof NonNullable<RawProductData['nutriments']>> = [
        'energy_kcal_100g', 'fat_100g', 'saturated_fat_100g', 
        'carbohydrates_100g', 'sugars_100g', 'fiber_100g', 
        'proteins_100g', 'salt_100g'
    ];
    for (const field of fieldsToCheck) {
        const value = getNutrimentValue(field);
        if (typeof value === 'number' && value > 0.01) {
            return true;
        }
    }
    return false;
  }

  const renderNutritionTable = () => {
    const nutritionFields: Array<{ label: string; key: keyof ProductRecord | keyof NonNullable<RawProductData['nutriments']>; unit: string }> = [
      { label: "Energia", key: "energy_kcal_100g", unit: "kcal" }, // O energy_100g per kJ
      { label: "Grassi", key: "fat_100g", unit: "g" },
      { label: "di cui Saturi", key: "saturated_fat_100g", unit: "g" },
      { label: "Carboidrati", key: "carbohydrates_100g", unit: "g" },
      { label: "di cui Zuccheri", key: "sugars_100g", unit: "g" },
      { label: "Fibre", key: "fiber_100g", unit: "g" },
      { label: "Proteine", key: "proteins_100g", unit: "g" },
      { label: "Sale", key: "salt_100g", unit: "g" },
    ];

    return (
      <View style={styles.nutritionSection}>
        <Text style={[styles.sectionTitle, { color: BORDER_COLOR, marginBottom: 15 }]}>Valori Nutrizionali (per 100g/100ml)</Text>
        {nutritionFields.map(field => {
          const value = getNutrimentValue(field.key);
          if (value === undefined || value === null) return null; // Non mostrare la riga se il valore non è disponibile
          
          return (
            <View key={field.key} style={styles.nutritionDataRow}>
              {/* Icon Pill */}
              <View style={styles.iconPillWrapper}>
                <View style={styles.iconPillShadow} />
                <View style={styles.iconPillContainer}>
                  <Ionicons 
                    name={getNutrientIconName(field.key) as any} 
                    size={24} 
                    color={getNutrientIconColor(field.key)} 
                  />
                </View>
              </View>

              {/* Value Pill */}
              <View style={styles.valuePillWrapper}>
                <View style={styles.valuePillShadow} />
                <View style={styles.valuePillContainer}>
                  <Text style={styles.nutrientNameText}>{field.label}</Text>
                  <Text style={styles.nutrientValueText}>{formatNutritionValue(value as number, field.unit)}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // --- MODIFICA renderAiDetailSection --- 
  const renderAiDetailSection = (
    sectionTitle: string, 
    items: Array<{ title: string; detail?: string } | ScoreItem>, // Accetta anche ScoreItem
    category: 'health' | 'sustainability' | 'neutral' // Aggiunta categoria neutral
  ) => {
    if (!Array.isArray(items) || items.length === 0) return null;

    // Determina lo stile del blocco se necessario (ma lo rimuoviamo)
    // const isNegativeBlock = category === 'health' && sectionTitle.toLowerCase().includes('negativi');
    // const isPositiveBlock = category === 'health' && sectionTitle.toLowerCase().includes('positivi');
    // const isNeutralBlock = category === 'neutral';

    return (
      <View style={styles.itemListContainer}> 
        {sectionTitle && <Text style={styles.aiSectionTitleAlt}>{sectionTitle}</Text>} {/* Titolo opzionale per sezione */} 
        {items.map((itemData, index) => {
          const isScoreItem = typeof itemData === 'object' && itemData !== null && 'classification' in itemData; // Check più robusto per ScoreItem
          const key = isScoreItem ? (itemData as ScoreItem).id : `${category}-item-${index}`;
          const isExpanded = expandedItems[key] || false;

          let itemTitle = "";
          let itemDetail: string | undefined = undefined; // Dettaglio standard (pro/con)
          let classification: 'positive' | 'negative' | 'neutral' = 'neutral'; // Cambiato default a neutral
          let scoreItemData: ScoreItem | null = null;

          if (isScoreItem) {
            scoreItemData = itemData as ScoreItem;
            itemTitle = scoreItemData.title;
            classification = scoreItemData.classification;
            // Non impostiamo itemDetail qui
          } else if (typeof itemData === 'object' && itemData !== null && 'title' in itemData) {
             // Gestione item standard {title, detail?}
            itemTitle = itemData.title;
             itemDetail = itemData.detail;
             // Determina classificazione per pro/con standard (WORKAROUND)
             if (category === 'health' || category === 'sustainability') {
                classification = sectionTitle.toLowerCase().includes('negativi') ? 'negative' : 'positive';
          } else {
                classification = 'neutral';
             }
          } else {
             // Caso imprevisto o formato non gestito (es. stringa semplice che non dovrebbe esserci)
             console.warn("Invalid/unhandled item format in renderAiDetailSection:", itemData);
      return null;
    }

          // const iconInfo = SCORE_ITEM_ICONS[classification]; // Ora SCORE_ITEM_ICONS è visibile
          // Verifica che classification sia una chiave valida prima di accedere
          const validClassification = classification in SCORE_ITEM_ICONS ? classification : 'neutral';
          const iconInfo = SCORE_ITEM_ICONS[validClassification];

            return (
            <View key={key} style={styles.itemCardWrapper}>
              <View style={styles.itemCardShadow} />
              <View style={styles.itemCardContainer}>
                <TouchableOpacity
                  onPress={() => toggleItemExpansion(key)}
                  style={styles.itemCardTouchable}
                >
                  <View style={styles.itemCardHeader}>
                    <Ionicons name={iconInfo.name as any} size={22} color={iconInfo.color} style={styles.aiItemIcon} />
                    <Text style={styles.itemCardTitleText}>{itemTitle}</Text>
                  </View>
                  <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={24} color={BORDER_COLOR} style={styles.aiListChevron} />
                </TouchableOpacity>
                {isExpanded ? (
                  <View style={styles.itemDetailExpansionArea}>
                    {isScoreItem && scoreItemData ? (
                      // --- Rendering espanso per Score Item --- 
                      // Rimosso il View wrapper, ScoreIndicatorCard ora gestisce il proprio stile compreso il bordo
                      <ScoreIndicatorCard
                        title="" // Titolo vuoto come da richiesta
                        value={scoreItemData.originalValue}
                        description="" // Descrizione vuota
                        scale={scoreItemData.scale}
                        valueType={scoreItemData.valueType}
                        size="small"
                        layoutStyle="stacked" // Manteniamo stacked per la visualizzazione della sola scala
                       />
                      // La View precedente che conteneva lo ScoreIndicatorCard e il testo dell'AI è stata rimossa.
                      // Il testo dell'AI ora segue direttamente.
                    ) : (
                      // --- Rendering espanso per Pro/Con standard --- 
                      itemDetail ? <Text style={styles.itemDetailText}>{itemDetail}</Text> : null
                    )}
                    {/* Testo dell'AI per ScoreItem, ora posizionato DOPO ScoreIndicatorCard */} 
                    {isScoreItem && scoreItemData && (
                        <Text style={[styles.itemDetailText, { marginTop: 20 }]}> 
                            {scoreItemData.aiExplanation || "L'analisi AI specifica per questo punteggio sarà disponibile a breve."}
                        </Text>
                    )}
                  </View>
                ) : null}
              </View>
            </View>
            );
        })}
      </View>
    );
  };
  // --- FINE MODIFICA renderAiDetailSection ---

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: BACKGROUND_COLOR,
    },
    scrollViewContent: {
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight || 20 : 70, // Adattato per status bar Android
      paddingBottom: 40,
    },
    backButton: {
      padding: 10,
      marginBottom: 20, // Aumentato per dare più spazio sotto la nuova riga di header
      alignSelf: 'flex-start',
    },
    centered: {
      justifyContent: "center",
      alignItems: "center",
    },
    topCardWrapper: {
      position: 'relative',
      marginBottom: 16,
      marginHorizontal: 0,
    },
    topCardShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 16,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    topCardContainer: {
      flexDirection: 'column',
      backgroundColor: CARD_BACKGROUND_COLOR, 
      borderRadius: 16,
      padding: 18,
      position: 'relative', 
      zIndex: 1,
      borderTopWidth: CARD_BORDER_WIDTH,
      borderRightWidth: CARD_BORDER_WIDTH,
      borderLeftWidth: CARD_BORDER_WIDTH,
      borderBottomWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
    },
    topCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 15,
    },
    productImageOuterWrapper: {
      position: 'relative',
      width: 100,
      height: 100, 
      marginRight: 18,
    },
    productImageInnerShadow: {
      position: 'absolute',
      top: IMAGE_SHADOW_OFFSET,
      left: IMAGE_SHADOW_OFFSET,
      width: '100%',
      height: '100%',
      backgroundColor: BORDER_COLOR,
      borderRadius: 12,
    },
    productDisplayImage: {
      width: '100%',
      height: '100%',
      borderRadius: 12, 
      borderWidth: 1,
      borderColor: BORDER_COLOR,
      backgroundColor: colors.border,
      position: 'relative',
      zIndex: 1,
    },
    productImagePlaceholderInCard: {
        width: '100%',
        height: '100%',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: BORDER_COLOR,
        backgroundColor: colors.borderFaint, 
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    topCardContent: {
      flex: 1,
      justifyContent: 'center',
    },
    topCardProductName: {
      fontSize: 19, 
      marginBottom: 5,
      color: colors.text, 
      fontFamily: 'BricolageGrotesque-Regular',
    },
    topCardBrandName: {
      fontSize: 15, 
      color: colors.textMuted,
      opacity: 0.8,
      marginBottom: 8,
      fontFamily: 'BricolageGrotesque-Regular',
    },
    scoresRowContainer: { 
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 5, 
    },
    scoreIconTextContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    scoreIconStyle: {
      marginRight: 5, 
    },
    scoreValueStyle: {
      fontSize: 15,
      color: colors.text, 
      fontFamily: 'BricolageGrotesque-Bold',
    },
    topCardProductSummaryText: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
      marginTop: 3,
      fontFamily: 'BricolageGrotesque-Regular',
    },
    nutritionCardWrapper: {
      marginHorizontal: 100, 
      marginBottom: 25, 
    },
    nutritionCardShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 12,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: -1,
    },
    nutritionCardBase: {
      borderRadius: 12,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      borderBottomWidth: CARD_BORDER_WIDTH,
      backgroundColor: CARD_BACKGROUND_COLOR, 
      overflow: 'hidden',
    },
    nutritionSection: {
      paddingVertical: 15,
      paddingHorizontal: 0,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
      fontFamily: 'BricolageGrotesque-Bold', // Aggiunto font
    },
    scoreSectionTitle: {
      fontSize: 18,
      color: BORDER_COLOR,
      marginBottom: 12,
      fontFamily: 'BricolageGrotesque-Bold',
    },
    nutritionDataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 15,
    },
    iconPillWrapper: {
      position: 'relative',
      width: ICON_PILL_SIZE,
      height: PILL_HEIGHT,
      marginRight: 12,
    },
    iconPillShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      position: 'absolute',
      top: PILL_SHADOW_OFFSET,
      left: PILL_SHADOW_OFFSET,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    iconPillContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      borderWidth: PILL_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      zIndex: 1,
    },
    valuePillWrapper: {
      position: 'relative',
      flex: 1,
      height: PILL_HEIGHT,
    },
    valuePillShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      position: 'absolute',
      top: PILL_SHADOW_OFFSET,
      left: PILL_SHADOW_OFFSET,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    valuePillContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      borderWidth: PILL_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 15,
      position: 'relative',
      zIndex: 1,
    },
    nutrientNameText: {
      fontSize: 15,
      fontWeight: '600',
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-SemiBold', // Aggiunto font
    },
    nutrientValueText: {
      fontSize: 14,
      color: colors.textMuted,
      fontFamily: 'BricolageGrotesque-Medium',
    },
    aiSectionWrapper: {
        marginTop: 35, // Aggiunto piccolo marginTop per distanziare da eventuale editor ingredienti
        marginBottom: 25,
    },
    aiSectionTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.text,
        marginHorizontal: 10,
        marginBottom: 13,
        textAlign: 'center',
        fontFamily: 'BricolageGrotesque-Bold',
    },
    aiSectionTitleAlt: {
      fontSize: 18,
      marginBottom: 15,
      color: BORDER_COLOR,
        fontFamily: 'BricolageGrotesque-SemiBold',
        marginLeft: 5,
    },
    itemCardWrapper: {
      position: 'relative',
      marginBottom: 15,
    },
    itemCardShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 12,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    itemCardContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: 12,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      position: 'relative',
      zIndex: 1,
      overflow: 'hidden',
    },
    itemCardTouchable: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    itemCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1, 
    },
    itemCardTitleText: { 
      fontSize: 15,
      color: BORDER_COLOR, 
      flex: 1, 
      marginLeft: 0,
      fontFamily: 'BricolageGrotesque-Medium',
    },
    itemDetailExpansionArea: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      paddingTop: 8,
      overflow: 'hidden', // Aggiungo overflow:hidden per controllare i figli
    },
    itemDetailText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted || '#495057',
      fontFamily: 'BricolageGrotesque-Regular',
    },
    scoreRowContainer: { 
        flexDirection: 'row',
        marginBottom: 0,
        marginHorizontal: 0,
        alignItems: 'stretch',
    },
    labelTextColumn: { 
        flex: 2,
        marginRight: 8,
    },
    labelButtonWrapper: {
        position: 'relative',
        height: 70, 
    },
    labelButtonShadow: { 
        backgroundColor: BORDER_COLOR,
        borderRadius: 15,
        position: 'absolute',
        top: SHADOW_OFFSET_VALUE,
        left: SHADOW_OFFSET_VALUE,
        width: '100%',
        height: '100%', 
        zIndex: 0,
    },
    labelButtonShadowReduced: {
        backgroundColor: BORDER_COLOR,
        borderRadius: 12,
        position: 'absolute',
        top: SHADOW_OFFSET_VALUE - 1,
        left: SHADOW_OFFSET_VALUE - 1,
        width: '100%',
        height: '100%', 
        zIndex: 0,
    },
    labelButtonContainer: { 
        backgroundColor: '#00463b',
        borderRadius: 15,
        borderLeftWidth: CARD_BORDER_WIDTH,
        borderTopWidth: CARD_BORDER_WIDTH,
        borderRightWidth: CARD_BORDER_WIDTH,
        borderColor: BORDER_COLOR,
        borderBottomWidth: CARD_BORDER_WIDTH, 
        paddingVertical: 10, 
        paddingHorizontal: 15,
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%', 
        position: 'relative',
        zIndex: 1,
    },
    labelButtonContainerReducedRadius: {
        backgroundColor: CARD_BACKGROUND_COLOR,
        borderRadius: 12,
        borderLeftWidth: CARD_BORDER_WIDTH,
        borderTopWidth: CARD_BORDER_WIDTH,
        borderRightWidth: CARD_BORDER_WIDTH,
        borderColor: BORDER_COLOR,
        borderBottomWidth: CARD_BORDER_WIDTH, 
        paddingVertical: 10, 
        paddingHorizontal: 15,
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%', 
        position: 'relative',
        zIndex: 1,
    },
    labelButtonText: { 
      fontSize: 18,
        color: BORDER_COLOR,
        textAlign: 'center',
    },
    numericScoreColumn: { 
        flex: 1,
    },
    scoreSquareCardWrapper: { 
        position: 'relative',
        width: '100%',
        height: 70,
    },
    scoreSquareCardShadow: {
        backgroundColor: BORDER_COLOR,
        borderRadius: 10, 
        position: 'absolute',
        top: SHADOW_OFFSET_VALUE, 
        left: SHADOW_OFFSET_VALUE,
        width: '100%', 
        height: '100%', 
        zIndex: 0,
    },
    scoreSquareCard: {
        width: '100%', 
        height: '100%', 
        borderRadius: 10,
        borderWidth: CARD_BORDER_WIDTH, 
        borderColor: BORDER_COLOR,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        zIndex: 1,
    },
    scoreValueTextLarge: { 
        fontSize: 28,
        color: BORDER_COLOR, 
        fontFamily: 'BricolageGrotesque-Bold',
    },
    aiLoadingContainer: {
      alignItems: "center",
      paddingVertical: 30,
      marginVertical: 20,
    },
    aiLoadingText: {
      marginTop: 12,
      fontSize: 16,
      color: colors.text, 
      fontFamily: 'BricolageGrotesque-Regular',
    },
    itemListContainer: {
      marginTop: 0,
    },
    aiListChevron: {
    },
    aiItemIcon: {
      marginRight: 8,
    },
    portionButtonWrapper: {
      position: 'relative',
      marginHorizontal: 0,
      marginBottom: 16,
    },
    portionButtonShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 12,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    portionButtonContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: 12,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      paddingVertical: 12,
      paddingHorizontal: 15,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      zIndex: 1,
    },
    portionButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: BORDER_COLOR,
      textAlign: 'center',
    },
    portionDetailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 50,
    },
    portionIconPillWrapper: {
      position: 'relative',
      width: ICON_PILL_SIZE,
      height: PILL_HEIGHT,
      marginRight: 12,
    },
    portionIconPillShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    portionIconPillContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      zIndex: 1,
    },
    portionValuePillWrapper: {
      position: 'relative',
      flex: 1,
      height: PILL_HEIGHT,
    },
    portionValuePillShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    portionValuePillContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 15,
      position: 'relative',
      zIndex: 1,
    },
    portionValueText: {
      fontSize: 15,
      fontWeight: '600',
      color: BORDER_COLOR,
      textAlign: 'center',
    },
    offScoresTemporaryContainer: {
      marginVertical: 20,
      paddingHorizontal: 0, 
    },
    // NUOVI STILI PER HEADER ACTIONS
    headerActionsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 0, // Rimuoviamo padding orizzontale qui, il padding sarà sui bottoni stessi se serve
      marginBottom: 20, // Spazio sotto la riga di azioni
      // backgroundColor: 'lightgrey', // DEBUG
    },
    headerButton: {
      padding: 10, // Rende l'area toccabile più grande
    },
    ingredientsEditorContainer: {
      marginTop: 18, // Ridotto marginTop per avvicinarlo alla pillola calorie
      marginBottom: 40, 
      paddingHorizontal: 0, 
      backgroundColor: 'transparent', 
      borderRadius: 0, 
      paddingVertical: 0, 
      borderWidth: 0, 
      shadowColor: "transparent", 
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    ingredientsEditorHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      marginTop: 5,
    },
    ingredientsEditorTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-Bold',
      flex: 1,
    },
    saveIngredientsButton: {
      backgroundColor: colors.primaryFaded, // Sfondo tenue come Aggiungi componente
      paddingVertical: 10,
      paddingHorizontal: 15,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 70,
      marginLeft: 8,
      borderWidth: 1,
      borderColor: colors.primary, // Bordo con colore primario
    },
    undoChangesButton: {
      backgroundColor: '#fff0f0', // Sfondo rosso tenue
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 50,
      borderWidth: 1,
      borderColor: '#dc3545', // Bordo rosso
    },
    saveButtonDisabled: {
      backgroundColor: colors.textMuted,
      opacity: 0.7,
    },
    saveIngredientsButtonText: {
      color: colors.primary,
      fontWeight: '600',
      fontFamily: 'BricolageGrotesque-SemiBold',
    },
    ingredientRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12, // Aggiunto padding orizzontale
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      backgroundColor: '#fff', // Sfondo bianco per la riga
    },
    ingredientName: {
      flex: 2.5, // Più spazio per il nome
      fontSize: 15,
      color: '#333',
    },
    ingredientInputContainer: {
      flex: 1.5, // Spazio per input e unità
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#ddd',
      borderRadius: 5,
      paddingHorizontal: 6,
      marginHorizontal: 5, // Margine tra nome e input, e input e calorie
    },
    removeIngredientButton: {
      padding: 6, // Aumentato padding per tocco più facile
      marginLeft: 5, // Margine per separare dal testo calorie
    },
    // Aggiunti stili mancanti o corretti
    scoresRow: { // Assicuriamoci che scoresRow sia definito
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginVertical: 10,
      paddingHorizontal: 5, // Leggero padding per non far toccare i bordi alle card
    },
    scoreCardContainer: { // Stile per i contenitori delle card dei punteggi
      flex: 1, // Permette alle card di dividersi lo spazio
      marginHorizontal: 5, // Spazio tra le card
    },
    // Nuovi stili per l'aggiunta di ingredienti
    addIngredientContainer: {
      marginTop: 20,
      marginBottom: 20,
    },
    addIngredientTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-Bold',
      marginBottom: 15,
    },
    addIngredientContent: { 
      // Rimuovo l'ombra direzionata da qui, non serve
      backgroundColor: 'transparent',
      padding: 0,
    },
    addIngredientShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 12,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    addIngredientInput: { // Stile dell'input vero e proprio
      backgroundColor: colors.inputBackground || '#f8f8f8',
      borderColor: '#e0e0e0',
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 15,
      color: colors.text,
      fontFamily: 'BricolageGrotesque-Regular',
      // Rimuovo marginBottom da qui, sarà gestito dal wrapper della card
    },
    addIngredientButtonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 20,
    },
    addIngredientButtonWrapper: {
      position: 'relative',
      flex: 0.48,
    },
    addIngredientButtonShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 8,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    addIngredientButton: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2, // Aumentato spessore bordo
      borderColor: BORDER_COLOR,
      position: 'relative',
      zIndex: 1,
    },
    confirmButton: {
      backgroundColor: colors.primary,
    },
    cancelButton: {
      backgroundColor: colors.textMuted || '#6c757d',
    },
    addIngredientButtonText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: 'bold',
      fontFamily: 'BricolageGrotesque-Regular',
    },
    // addIngredientPromptButton e addIngredientPromptButtonText sono stati ridefiniti più avanti
    ingredientCardWrapper: {
      position: 'relative',
      marginBottom: 15,
    },
    ingredientCardShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 12,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    ingredientCardContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: 12,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      position: 'relative',
      zIndex: 1,
      overflow: 'hidden',
      paddingHorizontal: 18, // Allineato con topCardContainer
      paddingBottom: 12, // Aumentato padding inferiore
    },
    ingredientNameText: {
      fontSize: 16,
      fontWeight: '600',
      color: BORDER_COLOR,
      paddingHorizontal: 0, // Rimosso padding orizzontale
      paddingTop: 21,
      paddingBottom: 8, 
      marginBottom: 5,
      borderBottomWidth: 1,
      borderBottomColor: '#e0e0e0',
      fontFamily: 'BricolageGrotesque-SemiBold',
    },
    ingredientDetailsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 0, // Rimosso padding orizzontale
      paddingVertical: 10, 
    },
    ingredientWeightText: {
      fontSize: 15,
      color: '#333',
      fontFamily: 'BricolageGrotesque-Regular',
      textAlign: 'center',
      marginRight: 8, // Più spazio prima della freccia
    },
    ingredientCaloriesText: {
      fontSize: 15,
      color: '#333',
      fontFamily: 'BricolageGrotesque-Regular',
      marginLeft: 20, // Spazio a sinistra tra grammi e calorie
      flex: 1,
    },
    ingredientDetailPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8f8f8',
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginHorizontal: 4,
      borderWidth: CARD_BORDER_WIDTH, // Uniformato borderWidth
      borderColor: '#e0e0e0', // Mantenuto un colore di bordo leggermente più tenue per le pillole
      minHeight: 40,
    },
    ingredientWeightInput: {
      // flex: 1, // Rimosso flex per controllo manuale
      paddingVertical: 4, // Deve essere consistente con text sottostante se serve
      fontSize: 15,
      color: '#333',
      textAlign: 'right',
      minWidth: 40, // Spazio minimo per input
    },
    ingredientUnit: {
      fontSize: 15,
      color: '#777',
      marginLeft: 4,
    },
    ingredientCalories: {
      fontSize: 15,
      color: '#333',
      textAlign: 'center',
      fontFamily: 'BricolageGrotesque-Regular',
      paddingHorizontal: 5, // Leggero padding per respiro
    },
    addIngredientPromptButtonContainer: {
      position: 'relative',
      marginTop: 5,
      // zIndex: 1, // Rimosso perché il pulsante stesso ora non ha ombra
    },
    addIngredientPromptButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      backgroundColor: colors.primaryFaded, // colore più tenue del primario
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary, // Bordo con colore primario
      // position: 'relative', // Rimosso
      // zIndex: 1, // Rimosso
    },
    addIngredientPromptButtonText: {
      fontSize: 16,
      color: colors.primary, // Testo con colore primario
      fontWeight: '600',
      fontFamily: 'BricolageGrotesque-SemiBold',
    },
    inputFieldCardWrapper: {
      position: 'relative',
      marginBottom: 15,
    },
    inputFieldCardShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 8, // Raggio più piccolo per card input
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE -1, // Ombra leggermente più piccola
      left: SHADOW_OFFSET_VALUE -1,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    inputFieldCardContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: 8,
      borderWidth: CARD_BORDER_WIDTH - 0.5, // Bordo leggermente più sottile per input card
      borderColor: BORDER_COLOR,
      paddingVertical: 10,
      paddingHorizontal: 12,
      position: 'relative',
      zIndex: 1,
    },
    inputFieldLabel: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 5,
      fontFamily: 'BricolageGrotesque-Regular',
    },
    trashButtonWrapper: {
      position: 'relative',
      flex: 1,
      maxWidth: 50, // Limita la larghezza
      marginLeft: 4, // Stesso margine orizzontale delle pillole
      marginRight: 4, // Stesso margine orizzontale delle pillole
      // Rimosso alignSelf: 'stretch' come richiesto
    },
    trashButtonShadow: {
      backgroundColor: BORDER_COLOR, // Ripristinata ombra
      borderRadius: 8,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE, // Come i container principali
      left: SHADOW_OFFSET_VALUE, // Come i container principali
      width: '100%',
      height: '100%',
      zIndex: 0,
      minHeight: 40, // Assicura altezza minima
      // Rimosso height: '100%' come richiesto
    },
    trashButton: {
      backgroundColor: '#dc3545', // Rosso per i "contro"
      borderRadius: 8,
      borderWidth: CARD_BORDER_WIDTH, // Uniformato borderWidth con i container principali
      borderColor: BORDER_COLOR,
      padding: 8, // Questo include paddingVertical: 8
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      zIndex: 1,
      minHeight: 40, // Assicura altezza minima
      // Rimosso height: '100%' come richiesto
    },
  })

  // --- LOG CONDIZIONI DI RENDERING --- 
  // Rimuoviamo il log qui perché le variabili potrebbero non essere definite
  // console.log(...)

  // Condizione aggiornata per mostrare la schermata di animazione/caricamento AI:
  // - Caso normale: abbiamo dati iniziali, AI sta caricando e non abbiamo ancora risultati
  // - Caso analisi foto: isPhotoAnalysis=true, abbiamo dati iniziali MA NON abbiamo ancora l'aiAnalysis
  const shouldShowLoadingAnimation = (
    (routeInitialProductData && isAiLoading && !aiAnalysis && !error && displayProductInfo) || 
    (isPhotoAnalysis && routeInitialProductData && !error && displayProductInfo && !aiAnalysis)
  );

  // --- Rendering Logica --- Riorganizzata ---

  // 1. Mostra LoadingAnimationScreen se AI sta caricando e abbiamo già i dati base
  if (shouldShowLoadingAnimation) {
    console.log("[DETAIL RENDER] Rendering LoadingAnimationScreen...");
    // Passiamo direttamente displayProductInfo invece delle singole variabili estratte
    return (
        <LoadingAnimationScreen 
            productData={displayProductInfo} // Passiamo l'intero oggetto
            isAiStillLoading={isAiLoading} 
            isPhotoAnalysis={isPhotoAnalysis} // Passa il parametro per distinguere l'analisi foto
        />
    );
  }

  // 2. Se stiamo caricando i dati iniziali OPPURE se AI è attiva ma non abbiamo ancora i dati base 
  //    (es. navigazione da recenti senza dati pre-caricati)
  //    Mostriamo un indicatore di caricamento generico.
  if (loadingInitialData || (isAiLoading && !aiAnalysis && !displayProductInfo)) {
     console.log(`[DETAIL RENDER] Mostro Loader Iniziale/Attesa Dati: loadingInitialData=${loadingInitialData}, isAiLoading=${isAiLoading}, !aiAnalysis=${!aiAnalysis}, !displayProductInfo=${!displayProductInfo}`);
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: BACKGROUND_COLOR }]}>
        <StatusBar style="dark" backgroundColor={BACKGROUND_COLOR} />
        <ActivityIndicator size="large" color={colors.primary} />
         <Text style={{ marginTop: 10, color: colors.text, fontFamily: 'BricolageGrotesque-Regular' }}>
           {isAiLoading ? "Analisi AI in corso..." : "Caricamento dati prodotto..."}
         </Text>
      </View>
    );
  }

  // 3. Se c'è un errore confermato (e non stiamo più caricando)
  if (error) {
    console.log("[DETAIL RENDER] Mostro Errore Confermato: ", error);
    return (
      <View style={{flex: 1, backgroundColor: BACKGROUND_COLOR}}>
        <StatusBar style="dark" backgroundColor={BACKGROUND_COLOR} />
        <EmptyState title="Errore" message={error} icon="alert-circle-outline" />
      </View>
    );
  }

  // 4. Guardia finale: Se non stiamo caricando, non ci sono errori, ma displayProductInfo è ancora null, è uno stato inatteso.
  if (!displayProductInfo) {
    console.error("[DETAIL RENDER ERROR] displayProductInfo è null dopo i check di caricamento/errore.");
    return (
      <View style={{flex: 1, backgroundColor: BACKGROUND_COLOR}}>
        <StatusBar style="dark" backgroundColor={BACKGROUND_COLOR} />
         <EmptyState title="Errore Dati" message="Impossibile visualizzare i dettagli del prodotto (stato inatteso)." icon="alert-circle-outline" />
      </View>
    );
  }

  // 5. Se siamo qui, displayProductInfo è valido. Dichiarazioni delle variabili che dipendono da esso.
  console.log("[DETAIL RENDER] Rendering Contenuto Principale.");
  const productName = 'product_name' in displayProductInfo ? displayProductInfo.product_name : (displayProductInfo as ProductRecord).product_name;
  const brandName = 'brands' in displayProductInfo ? displayProductInfo.brands : (displayProductInfo as ProductRecord).brand;
  const imageUrl = 'image_url' in displayProductInfo && displayProductInfo.image_url ? displayProductInfo.image_url :
                   'product_image' in displayProductInfo && displayProductInfo.product_image ? displayProductInfo.product_image : undefined;
  const nutritionGrade = 'nutrition_grades' in displayProductInfo ? displayProductInfo.nutrition_grades : (displayProductInfo as ProductRecord).nutrition_grade;
  
  const currentEcoScoreGrade = 
      displayProductInfo && 'ecoscore_grade' in displayProductInfo ? displayProductInfo.ecoscore_grade 
      : displayProductInfo && 'data' in displayProductInfo && (displayProductInfo.data as any)?.ecoscore_grade
      ? (displayProductInfo.data as any).ecoscore_grade
      : undefined;
      
  const currentNovaGroup = 
      displayProductInfo && 'nova_group' in displayProductInfo ? (displayProductInfo as any).nova_group 
      : displayProductInfo && 'data' in displayProductInfo && (displayProductInfo.data as any)?.nova_group
      ? (displayProductInfo.data as any).nova_group
      : displayProductInfo && 'nutriments' in displayProductInfo && (displayProductInfo as any).nutriments?.nova_group
      ? (displayProductInfo as any).nutriments.nova_group
      : undefined;

  const healthScoreForIcon = aiAnalysis?.healthScore ?? (displayProductInfo && 'health_score' in displayProductInfo ? displayProductInfo.health_score : undefined);
  const sustainabilityScoreForIcon = aiAnalysis?.sustainabilityScore ?? (displayProductInfo && 'sustainability_score' in displayProductInfo ? displayProductInfo.sustainability_score : undefined);

  // Variabili per le calorie per porzione (prodotti con barcode)
  let suggestedPortionGramsToShow: number | undefined = undefined;
  let energyPer100g: number | undefined | null = undefined;
  let portionCalories: number | undefined = undefined;
  let displayPortionButton = false;

  // *** NUOVA LOGICA ROBUSTA PER CALORIE STIMATE ***
  // 1. Verifica se il prodotto corrente è stato analizzato con foto
  const isCurrentProductFromPhotoAnalysis = isProductFromPhotoAnalysis(
    isPhotoAnalysis, 
    displayProductInfo, 
    aiAnalysis
  );
  
  // 2. Inizializza le variabili per le calorie stimate
  let caloriesEstimate: string | undefined = undefined;
  let displayCaloriesEstimate = false;
  
  // 3. Se il prodotto è da analisi foto, cerca le calorie stimate
  if (isCurrentProductFromPhotoAnalysis) {
    logCalories("Prodotto identificato come analizzato con foto, cercando calorie stimate");
    
    // Prima verifica in aiAnalysis
    if (aiAnalysis?.calories_estimate) {
      caloriesEstimate = aiAnalysis.calories_estimate;
      displayCaloriesEstimate = true;
      logCalories("Calorie stimate trovate in aiAnalysis:", caloriesEstimate);
    }
    // Poi cerca in displayProductInfo
    else if (displayProductInfo && 'calories_estimate' in displayProductInfo && displayProductInfo.calories_estimate) {
      caloriesEstimate = displayProductInfo.calories_estimate;
      displayCaloriesEstimate = true;
      logCalories("Calorie stimate trovate in displayProductInfo:", caloriesEstimate);
    }
    
    // Se non abbiamo trovato calorie stimate
    if (!displayCaloriesEstimate) {
      logCalories("Nessuna stima calorie trovata per il prodotto da analisi foto");
    }
  } else {
    logCalories("Prodotto NON identificato come analizzato con foto, non mostreremo calorie stimate");
  }
  
  // Gestione porzione/calorie per prodotti con barcode (codice esistente)
  if (aiAnalysis?.suggestedPortionGrams && aiAnalysis.suggestedPortionGrams > 0) {
    suggestedPortionGramsToShow = aiAnalysis.suggestedPortionGrams;
  } else if ('suggested_portion_grams' in displayProductInfo && typeof (displayProductInfo as ProductRecord).suggested_portion_grams === 'number' && (displayProductInfo as ProductRecord).suggested_portion_grams! > 0) {
    suggestedPortionGramsToShow = (displayProductInfo as ProductRecord).suggested_portion_grams;
  }

  if (suggestedPortionGramsToShow) { // displayProductInfo è già garantito non null qui
    const rawEnergy = getNutrimentValue('energy_kcal_100g');
    if (typeof rawEnergy === 'number') {
      energyPer100g = rawEnergy;
      portionCalories = Math.round((energyPer100g / 100) * suggestedPortionGramsToShow);
      displayPortionButton = true;
    } else if (typeof rawEnergy === 'string') {
      const parsedEnergy = parseFloat(rawEnergy);
      if (!isNaN(parsedEnergy)) {
        energyPer100g = parsedEnergy;
        portionCalories = Math.round((energyPer100g / 100) * suggestedPortionGramsToShow);
        displayPortionButton = true;
      }
    }
  }
  // Fine dichiarazioni variabili

  // --- Creazione Score Items --- 
  const healthScoreItems: ScoreItem[] = [];
  const healthNeutralItems: ScoreItem[] = [];
  const sustainabilityScoreItems: ScoreItem[] = [];
  const sustainabilityNeutralItems: ScoreItem[] = [];
  const placeholderExplanation = "L'analisi AI specifica per questo punteggio sarà disponibile a breve.";

  // Nutri-Score (Sezione Salute)
  if (nutritionGrade && typeof nutritionGrade === 'string' && nutritionGrade.toLowerCase() !== 'unknown') {
    let classification: ScoreItem['classification'] = 'neutral';
    const gradeUpper = nutritionGrade.toUpperCase();
    if (['A+', 'A', 'B'].includes(gradeUpper)) classification = 'positive'; // Aggiunto A+
    else if (['D', 'E'].includes(gradeUpper)) classification = 'negative';
    
    const nutriItem: ScoreItem = {
      id: 'nutri-score',
      title: `Nutri-Score: ${gradeUpper}`,
      classification: classification,
      scoreType: 'nutri',
      originalValue: gradeUpper,
      scale: ['A', 'B', 'C', 'D', 'E'], // La scala visualizzata rimane A-E
      valueType: 'letter',
      aiExplanation: aiAnalysis?.nutriScoreExplanation ?? placeholderExplanation, 
    };
    if (classification === 'neutral') healthNeutralItems.push(nutriItem);
    else healthScoreItems.push(nutriItem); // Aggiungi a positivi/negativi salute
  }

  // NOVA Group (Sezione Salute)
  if (currentNovaGroup !== undefined && currentNovaGroup !== null && String(currentNovaGroup).toLowerCase() !== 'unknown') {
    const novaValueStr = String(currentNovaGroup);
    const novaValueNum = Number(novaValueStr); // Tentiamo la conversione
    if (!isNaN(novaValueNum) && [1, 2, 3, 4].includes(novaValueNum)) { // Verifica se è un numero valido nella scala
        let classification: ScoreItem['classification'] = 'neutral';
        if (novaValueNum <= 2) classification = 'positive';
        else if (novaValueNum === 4) classification = 'negative';

        const novaItem: ScoreItem = {
            id: 'nova-group',
            title: `Gruppo NOVA: ${novaValueNum}`,
            classification: classification,
            scoreType: 'nova',
            originalValue: novaValueNum, // Usiamo il numero
            scale: [1, 2, 3, 4],
            valueType: 'number',
            aiExplanation: aiAnalysis?.novaExplanation ?? placeholderExplanation, 
        };
        if (classification === 'neutral') healthNeutralItems.push(novaItem);
        else healthScoreItems.push(novaItem); // Aggiungi a positivi/negativi salute
    }
  }

  // Eco-Score (Sezione Eco)
  if (currentEcoScoreGrade && typeof currentEcoScoreGrade === 'string' && currentEcoScoreGrade.toLowerCase() !== 'unknown') {
    let classification: ScoreItem['classification'] = 'neutral';
    const gradeUpper = currentEcoScoreGrade.toUpperCase();
    if (['A+', 'A', 'B'].includes(gradeUpper)) classification = 'positive'; // Aggiunto A+
    else if (['D', 'E'].includes(gradeUpper)) classification = 'negative';

    const ecoItem: ScoreItem = {
        id: 'eco-score',
        title: `Eco-Score: ${gradeUpper}`,
        classification: classification,
        scoreType: 'eco',
        originalValue: gradeUpper,
        scale: ['A', 'B', 'C', 'D', 'E'], // La scala visualizzata rimane A-E
        valueType: 'letter',
        aiExplanation: aiAnalysis?.ecoScoreExplanation ?? placeholderExplanation, 
    };
     if (classification === 'neutral') sustainabilityNeutralItems.push(ecoItem);
    else sustainabilityScoreItems.push(ecoItem); // Aggiungi a positivi/negativi eco
  }

  // Ordina gli score items (es. positivi prima dei negativi)
  healthScoreItems.sort((a, b) => (a.classification === 'positive' ? -1 : 1) - (b.classification === 'positive' ? -1 : 1));
  sustainabilityScoreItems.sort((a, b) => (a.classification === 'positive' ? -1 : 1) - (b.classification === 'positive' ? -1 : 1));

  // Combina Score Items con Pro/Contro AI
  const combinedHealthPros = [
      ...healthScoreItems.filter(item => item.classification === 'positive'),
      ...(aiAnalysis?.pros ? parseJsonArrayField(aiAnalysis.pros) : [])
  ];
  const combinedHealthCons = [
      ...healthScoreItems.filter(item => item.classification === 'negative'),
      ...(aiAnalysis?.cons ? parseJsonArrayField(aiAnalysis.cons) : [])
  ];
  const combinedHealthNeutrals = [...healthNeutralItems]; // Solo score neutri per ora

  const combinedSustainabilityPros = [
      ...sustainabilityScoreItems.filter(item => item.classification === 'positive'),
      ...(aiAnalysis?.sustainabilityPros ? parseJsonArrayField(aiAnalysis.sustainabilityPros) : [])
  ];
  const combinedSustainabilityCons = [
      ...sustainabilityScoreItems.filter(item => item.classification === 'negative'),
      ...(aiAnalysis?.sustainabilityCons ? parseJsonArrayField(aiAnalysis.sustainabilityCons) : [])
  ];
   const combinedSustainabilityNeutrals = [...sustainabilityNeutralItems];

  // --- Fine Creazione Score Items ---

  // Combina TUTTI gli item Salute in un unico array ordinato, AGGIUNGENDO CLASSIFICAZIONE
  const allHealthItems = [
    // Aggiungi classification='positive' ai pro standard
    ...(aiAnalysis?.pros ? parseJsonArrayField(aiAnalysis.pros).map(item => ({ ...item, classification: 'positive' as const })) : []),
    // Aggiungi gli ScoreItem positivi
    ...healthScoreItems.filter(item => item.classification === 'positive'),
    // Aggiungi gli ScoreItem neutri e i pro/contro neutri standard (se mai ce ne fossero)
    ...healthNeutralItems,
    // ...eventuali pro/contro neutri standard qui...
    // Aggiungi gli ScoreItem negativi
    ...healthScoreItems.filter(item => item.classification === 'negative'),
     // Aggiungi classification='negative' ai cons standard
    ...(aiAnalysis?.cons ? parseJsonArrayField(aiAnalysis.cons).map(item => ({ ...item, classification: 'negative' as const })) : []),
  ];

  // Combina TUTTI gli item Eco in un unico array ordinato, AGGIUNGENDO CLASSIFICAZIONE
  const allEcoItems = [
    // Aggiungi classification='positive' ai pro standard
    ...(aiAnalysis?.sustainabilityPros ? parseJsonArrayField(aiAnalysis.sustainabilityPros).map(item => ({ ...item, classification: 'positive' as const })) : []),
     // Aggiungi gli ScoreItem positivi
    ...sustainabilityScoreItems.filter(item => item.classification === 'positive'),
    // Aggiungi gli ScoreItem neutri e i pro/contro neutri standard
    ...sustainabilityNeutralItems,
    // ...eventuali pro/contro neutri standard qui...
     // Aggiungi gli ScoreItem negativi
    ...sustainabilityScoreItems.filter(item => item.classification === 'negative'),
     // Aggiungi classification='negative' ai cons standard
    ...(aiAnalysis?.sustainabilityCons ? parseJsonArrayField(aiAnalysis.sustainabilityCons).map(item => ({ ...item, classification: 'negative' as const })) : []),
  ];

  const showAiScores = !!aiAnalysis; // Mostra i punteggi AI se aiAnalysis è presente

  // Funzione di rendering per una singola lista di item (usata per Salute ed Eco)
  const renderItemList = (items: Array<{ title: string; detail?: string } | ScoreItem>) => {
    if (!Array.isArray(items) || items.length === 0) return null;

    return (
        <View style={styles.itemListContainer}> 
            {items.map((itemData, index) => {
                const isScoreItem = typeof itemData === 'object' && itemData !== null && 'classification' in itemData; // Raffinato check per ScoreItem
                
                let itemTitle = "";
                let itemDetail: string | undefined = undefined; // Definizione di itemDetail spostata qui

                if (typeof itemData === 'object' && itemData !== null && 'title' in itemData) {
                    itemTitle = (itemData as { title: string }).title;
                    // Estrai itemDetail se presente e non è ScoreItem (gli ScoreItem non usano itemDetail direttamente qui)
                    if (!isScoreItem && 'detail' in itemData) {
                        itemDetail = (itemData as { detail?: string }).detail;
                    }
                } else {
                    itemTitle = "ElementoSenzaTitolo";
                }

                let key: string;
                if (isScoreItem) {
                    // Gli ScoreItem hanno un ID univoco definito nella loro creazione (es. 'nutri-score', 'nova-group')
                    key = (itemData as ScoreItem).id;
                } else {
                    // Per gli item standard (pro/contro), itemData ora ha 'classification' (es. 'positive', 'negative')
                    // e 'title'. L'indice 'index' è rispetto all'array 'items' passato a renderItemList.
                    const classificationPart = (itemData as any).classification || 'item'; // Fallback se classification non c'è
                    // Pulisce il titolo per l'uso in una chiave e lo accorcia per sicurezza
                    const titlePart = itemTitle.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30); 
                    key = `${classificationPart}_${titlePart}_${index}`;
                }

                const isExpanded = expandedItems[key] || false;

                // LEGGI LA CLASSIFICAZIONE DIRETTAMENTE DALL'OGGETTO ITEM
                let classification: 'positive' | 'negative' | 'neutral' = 
                    (itemData as any).classification || 'neutral'; // Usa la classificazione iniettata o default neutral

                let scoreItemData: ScoreItem | null = null;

                if (isScoreItem) {
                    scoreItemData = itemData as ScoreItem;
                    // classification è già letta sopra
                } else if (typeof itemData === 'object' && itemData !== null && 'title' in itemData) {
                    itemTitle = itemData.title;
                    itemDetail = (itemData as { detail?: string }).detail;
                     // classification è già letta sopra
                } else {
                    console.warn("Invalid/unhandled item format in renderItemList:", itemData);
                    return null;
                }

                const validClassification = classification in SCORE_ITEM_ICONS ? classification : 'neutral';
                const iconInfo = SCORE_ITEM_ICONS[validClassification];

                return (
                    <View key={key} style={styles.itemCardWrapper}> 
                    <View style={styles.itemCardShadow} />
                    <View style={styles.itemCardContainer}>
                        <TouchableOpacity
                        onPress={() => toggleItemExpansion(key)}
                        style={styles.itemCardTouchable}
                        >
                        <View style={styles.itemCardHeader}> 
                            <Ionicons name={iconInfo.name as any} size={22} color={iconInfo.color} style={styles.aiItemIcon} />
                            <Text style={styles.itemCardTitleText}>{itemTitle}</Text>
                        </View>
                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={24} color={BORDER_COLOR} style={styles.aiListChevron} />
                        </TouchableOpacity>
                        {isExpanded ? (
                        <View style={styles.itemDetailExpansionArea}>
                            {isScoreItem && scoreItemData ? (
                            <ScoreIndicatorCard
                                title="" 
                                value={scoreItemData.originalValue}
                                description=""
                                scale={scoreItemData.scale}
                                valueType={scoreItemData.valueType}
                                size="small"
                                layoutStyle="stacked"
                                borderless={true} // Attivo la modalità senza bordi
                            />
                            ) : (
                            itemDetail ? <Text style={styles.itemDetailText}>{itemDetail}</Text> : null
                            )}
                            {isScoreItem && scoreItemData && (
                                <Text style={[styles.itemDetailText, { marginTop: 20 }]}> 
                                    {scoreItemData.aiExplanation || "L'analisi AI specifica per questo punteggio sarà disponibile a breve."}
                                </Text>
                            )}
                        </View>
                        ) : null}
                    </View>
                    </View>
                );
            })}
        </View>
    );
  };

  // *** INIZIO LOGICA EDITOR INGREDIENTI ***
  const handleWeightChange = (ingredientId: string, newWeightText: string) => { // MODIFICA: Aggiunto tipo a newWeightText
    logCalories(`handleWeightChange: id=${ingredientId}, newWeightText=${newWeightText}`);
    const newWeight = parseFloat(newWeightText.replace(',', '.')); // Gestisce sia virgola che punto

    if (isNaN(newWeight) || newWeight < 0) {
      logCalories("Peso non valido, non aggiorno");
      // Potremmo voler mostrare un feedback all'utente qui
      // Per ora, aggiorniamo solo se il peso inserito è valido, per non cancellare subito l'input errato
      // e permettere all'utente di correggerlo. Il ricalcolo avverrà solo con pesi validi.
      // Aggiorniamo l'ingrediente con il testo inserito per mantenere l'input utente visibile,
      // ma senza ricalcolare le calorie se non è un numero valido.
      setEditableIngredients(prevIngredients =>
        prevIngredients?.map(ing => 
          ing.id === ingredientId ? { ...ing, estimated_weight_g: newWeightText as any } : ing // Mantiene il testo per l'input
        ) || null
      );
      return;
    }

    setEditableIngredients(prevIngredients => {
      if (!prevIngredients) return null;

      const updatedIngredients = prevIngredients.map(ing => {
        if (ing.id === ingredientId) {
          const originalIngredient = originalIngredientsBreakdownRef.current?.find(origIng => origIng.id === ingredientId);
          if (originalIngredient && originalIngredient.estimated_weight_g > 0) {
            const originalCalories = originalIngredient.estimated_calories_kcal;
            const originalWeight = originalIngredient.estimated_weight_g;
            const newCalculatedCalories = Math.round((originalCalories / originalWeight) * newWeight);
            logCalories(`Ricalcolo per ${ing.name}: origKcal=${originalCalories}, origPeso=${originalWeight}, newPeso=${newWeight}, newKcal=${newCalculatedCalories}`);
            return { ...ing, estimated_weight_g: newWeight, estimated_calories_kcal: newCalculatedCalories };
          } else {
            // Se non troviamo l'originale o il peso originale era 0, non possiamo ricalcolare proporzionalmente
            // Manteniamo le calorie originali o le impostiamo a 0 se non disponibili
            logCalories(`Impossibile ricalcolare proporzionalmente per ${ing.name}, peso originale 0 o non trovato.`);
            return { ...ing, estimated_weight_g: newWeight, estimated_calories_kcal: ing.estimated_calories_kcal }; 
          }
        }
        return ing;
      });

      // Ricalcola il totale
      const newTotal = updatedIngredients.reduce((acc, curr) => acc + curr.estimated_calories_kcal, 0);
      logCalories("Nuovo totale calorie dopo cambio peso:", newTotal);
      setTotalEstimatedCalories(newTotal);
      // Imposta la flag di modifiche non salvate
      setHasUnsavedChanges(true);
      return updatedIngredients;
    });
  };

  const handleRemoveIngredient = (ingredientId: string) => {
    logCalories(`handleRemoveIngredient: id=${ingredientId}`);
    setEditableIngredients(prevIngredients => {
      if (!prevIngredients) return null;
      const updatedIngredients = prevIngredients.filter(ing => ing.id !== ingredientId);
      
      const newTotal = updatedIngredients.reduce((acc, curr) => acc + curr.estimated_calories_kcal, 0);
      logCalories("Nuovo totale calorie dopo rimozione:", newTotal);
      setTotalEstimatedCalories(newTotal);
      // Imposta la flag di modifiche non salvate
      setHasUnsavedChanges(true);
      return updatedIngredients.length > 0 ? updatedIngredients : null; // Se l'array diventa vuoto, impostalo a null
    });
  };

  const renderIngredientsEditor = () => {
    // Determina se siamo in analisi foto o se abbiamo ingredienti carichi indipendentemente da aiAnalysis
    // LOGICA MIGLIORATA: Rendering avviene in questi casi:
    // 1. Siamo in analisi foto e il tipo è breakdown
    // 2. Abbiamo ingredienti editabili già caricati (indipendentemente da aiAnalysis)
    // 3. Siamo in analisi foto ed è marcato esplicitamente come isPhotoAnalysis=true dalla route
    const isPhotoBreakdown = 
      (isCurrentProductFromPhotoAnalysis && aiAnalysis?.calorie_estimation_type === 'breakdown') || 
      (editableIngredients !== null) ||
      (isPhotoAnalysis === true && isCurrentProductFromPhotoAnalysis);

    if (!isPhotoBreakdown || !editableIngredients || editableIngredients.length === 0) {
      logCalories("renderIngredientsEditor: non renderizzato perché non è photo breakdown o non ci sono ingredienti editabili", {
        isPhotoBreakdown, 
        editableIngredientsLength: editableIngredients?.length,
        isPhotoAnalysis: isPhotoAnalysis,
        isCurrentProductFromPhotoAnalysis: isCurrentProductFromPhotoAnalysis
      });
      return null;
    }
    logCalories("renderIngredientsEditor: rendering con ingredienti:", editableIngredients);

    return (
      <View style={styles.ingredientsEditorContainer}>
        <View style={styles.ingredientsEditorHeader}>
          <Text style={styles.ingredientsEditorTitle}>Componenti del pasto</Text>
          <View style={{flexDirection: 'row'}}>
            {hasUnsavedChanges && (
              <>
                <TouchableOpacity 
                  style={styles.undoChangesButton} 
                  onPress={handleUndoChanges}
                >
                  <Ionicons name="arrow-undo" size={20} color="#dc3545" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.saveIngredientsButton, isSavingIngredients && styles.saveButtonDisabled]} 
                  onPress={handleSaveIngredients}
                  disabled={isSavingIngredients}
                >
                  {isSavingIngredients ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.saveIngredientsButtonText}>Salva</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Ingredienti con nuovo stile card con ombra direzionata */}
        {editableIngredients.map((ingredient, index) => (
          <View key={ingredient.id || `ing-${index}`} style={styles.ingredientCardWrapper}>
            <View style={styles.ingredientCardShadow} />
            <View style={styles.ingredientCardContainer}>
              {/* Nome ingrediente nella prima riga */}
              <Text style={styles.ingredientNameText}>{ingredient.name}</Text>
              
              {/* Riga con grammi, kcal e pulsante elimina */}
              <View style={styles.ingredientDetailsRow}>
                {/* Peso in grammi con freccia */}
                <Text style={styles.ingredientWeightText}>
                  {ingredient.estimated_weight_g.toString()} g
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} style={{marginRight: 15}} />
                
                {/* Calorie (senza container) */}
                <Text style={styles.ingredientCaloriesText}>~{Math.round(ingredient.estimated_calories_kcal)} kcal</Text>
                
                {/* Icona cestino semplice */}
                <TouchableOpacity 
                  onPress={() => handleRemoveIngredient(ingredient.id)} 
                  style={{ paddingHorizontal: 8, marginLeft: 15 }} // Ridotto padding orizzontale
                >
                  <Ionicons name="trash" size={18} color="#dc3545" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
        
        {isAddingIngredient ? (
          <View style={styles.ingredientCardWrapper}>
            <View style={styles.ingredientCardShadow} />
            <View style={styles.ingredientCardContainer}>
              {/* Nome ingrediente come TextInput */}
              <TextInput 
                style={[styles.ingredientNameText]} 
                placeholder="Nome componente"
                value={newIngredientName}
                onChangeText={setNewIngredientName}
                placeholderTextColor={colors.textMuted}
              />
              
              {/* Riga con grammi e kcal */}
              <View style={styles.ingredientDetailsRow}>
                {/* Campo grammi con freccia */}
                <TextInput
                  style={[styles.ingredientWeightText, {minWidth: 50}]}
                  value={newIngredientWeight}
                  onChangeText={setNewIngredientWeight}
                  keyboardType="numeric"
                  placeholder="Grammi"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={{color: '#333', fontFamily: 'BricolageGrotesque-Regular', marginRight: 8}}>g</Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} style={{marginRight: 15}} />
                
                {/* kcal (senza container) */}
                <Text style={styles.ingredientCaloriesText}>~0 kcal</Text>
              </View>
              
              {/* Riga pulsanti Conferma/Annulla */}
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 15}}>
                <View style={{flex: 1, marginRight: 5}}>
                  <TouchableOpacity 
                    style={styles.saveIngredientsButton} 
                    onPress={handleConfirmAddIngredient}
                  >
                    <Text style={[styles.saveIngredientsButtonText, {textAlign: 'center'}]}>Conferma</Text>
                  </TouchableOpacity>
                </View>
                
                <View style={{flex: 1, marginLeft: 5}}>
                  <TouchableOpacity 
                    style={styles.undoChangesButton} 
                    onPress={() => {setIsAddingIngredient(false); setNewIngredientName(""); setNewIngredientWeight("");}}
                  >
                    <Text style={{color: '#dc3545', fontFamily: 'BricolageGrotesque-SemiBold', textAlign: 'center'}}>Annulla</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.addIngredientPromptButtonContainer}>
            {/* Rimosso <View style={styles.addIngredientPromptButtonShadow} /> */}
            <TouchableOpacity style={styles.addIngredientPromptButton} onPress={() => setIsAddingIngredient(true)}>
              <Ionicons name="add-circle-outline" size={24} color={colors.primary} style={{marginRight: 8}}/>
              <Text style={styles.addIngredientPromptButtonText}>Aggiungi componente</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };
  // *** FINE LOGICA EDITOR INGREDIENTI ***

  // *** INIZIO LOGICA EDITOR INGREDIENTI ***
  const handleConfirmAddIngredient = async () => {
    const name = newIngredientName.trim();
    const weight = parseFloat(newIngredientWeight.replace(',', '.'));

    if (!name || isNaN(weight) || weight <= 0) {
      Alert.alert("Input non valido", "Inserisci un nome e un peso validi per l'ingrediente.");
      return;
    }
    setIsAddingIngredient(false); // Nasconde i campi di input
    logCalories(`handleConfirmAddIngredient: name=${name}, weight=${weight}`);
    setIsAiLoading(true); // Mostra un indicatore di caricamento globale

    try {
      const calories = await getCaloriesForSingleIngredientFromGemini(name, weight);
      if (calories !== null) {
        const newId = `user_${Date.now()}`;
        const newIngredient: EstimatedIngredient = {
          id: newId,
          name: name,
          estimated_weight_g: weight,
          estimated_calories_kcal: calories,
        };
        setEditableIngredients(prevIngredients => [...(prevIngredients || []), newIngredient]);
        setTotalEstimatedCalories(prevTotal => (prevTotal || 0) + calories);
        logCalories("Nuovo ingrediente aggiunto e totale aggiornato", newIngredient);
        // Imposta la flag di modifiche non salvate
        setHasUnsavedChanges(true);
      } else {
        Alert.alert("Errore", "Impossibile stimare le calorie per l'ingrediente aggiunto.");
      }
    } catch (error) {
      console.error("Errore durante l'aggiunta del nuovo ingrediente:", error);
      Alert.alert("Errore", "Si è verificato un problema durante l'aggiunta dell'ingrediente.");
    } finally {
      setIsAiLoading(false);
      setNewIngredientName("");
      setNewIngredientWeight("");
    }
  };

  // NUOVA FUNZIONE: Salva gli ingredienti personalizzati
  const handleSaveIngredients = async () => {
    if (!user || !productRecordId || !editableIngredients || productRecordId === "temp_visual_scan") {
      logCalories('Salvataggio ingredienti saltato: dati mancanti o productRecordId temporaneo.');
      console.log('[SAVE DEBUG] Salvataggio ingredienti saltato. User:', !!user, 'ProductID:', productRecordId, 'EditableIngredients:', !!editableIngredients);
      if (productRecordId === "temp_visual_scan") {
        Alert.alert("Info", "Salva prima il prodotto analizzato per poter modificare gli ingredienti in modo permanente.");
      }
      return;
    }

    logCalories('Tentativo di salvataggio ingredienti:', editableIngredients);
    console.log('[SAVE DEBUG] Inizio salvataggio. ProductID:', productRecordId, 'UserID:', user.id);
    console.log('[SAVE DEBUG] Ingredienti da salvare:', JSON.stringify(editableIngredients));
    const newCaloriesEstimateString = `Totale: ~${totalEstimatedCalories} kcal`;
    console.log('[SAVE DEBUG] Stima calorie da salvare per la tabella products:', newCaloriesEstimateString);

    setIsSavingIngredients(true); // Mostra indicatore di caricamento sul pulsante

    try {
      console.log('[SAVE DEBUG] Chiamata a savePhotoAnalysisIngredients...');
      const customIngredientsSaveSuccess = await savePhotoAnalysisIngredients(productRecordId, user.id, editableIngredients);
      console.log('[SAVE DEBUG] Risultato savePhotoAnalysisIngredients:', customIngredientsSaveSuccess);

      if (customIngredientsSaveSuccess) {
        logCalories('Ingredienti personalizzati salvati con successo in photo_analysis_ingredients.');
        
        console.log('[SAVE DEBUG] Chiamata a updateProductIngredientsInDb...');
        const productUpdateSuccess = await updateProductIngredientsInDb(
          productRecordId,
          editableIngredients,
          newCaloriesEstimateString 
        );
        console.log('[SAVE DEBUG] Risultato updateProductIngredientsInDb:', productUpdateSuccess);

        if (productUpdateSuccess) {
          logCalories('Tabella products aggiornata con nuovi ingredients_breakdown e calories_estimate.');
          Alert.alert("Successo", "Modifiche agli ingredienti salvate.");
          setHasUnsavedChanges(false);

          setAiAnalysis(prevAiAnalysis => {
            if (prevAiAnalysis) {
              const updatedAiAnalysis: GeminiAnalysisResult = {
                ...prevAiAnalysis,
                ingredients_breakdown: [...editableIngredients],
                calories_estimate: newCaloriesEstimateString,
                calorie_estimation_type: 'breakdown', // CORRETTO: tipo specifico
              };
              logCalories("aiAnalysis locale aggiornato post-salvataggio:", updatedAiAnalysis);
              return updatedAiAnalysis;
            }
            return null;
          });
          
          setDisplayProductInfo(prevDisplayInfo => {
            if (prevDisplayInfo && 'created_at' in prevDisplayInfo) { 
               const updatedRecord = {
                ...prevDisplayInfo,
                ingredients_breakdown: JSON.stringify(editableIngredients), 
                calories_estimate: newCaloriesEstimateString,
                calorie_estimation_type: 'breakdown', // CORRETTO: tipo specifico
              } as ProductRecord;
              logCalories("displayProductInfo locale (ProductRecord) aggiornato post-salvataggio:", updatedRecord);
              return updatedRecord;
            }
            return prevDisplayInfo;
          });
          originalIngredientsBreakdownRef.current = editableIngredients.map(ing => ({...ing}));
          logCalories("originalIngredientsBreakdownRef aggiornato post-salvataggio.");

        } else {
          logCalories('Fallito aggiornamento ingredients_breakdown/calories_estimate nella tabella products.');
          Alert.alert("Attenzione", "Le modifiche agli ingredienti sono state salvate, ma la stima totale e i dettagli nel prodotto principale potrebbero non essere aggiornati immediatamente. Ricarica la pagina se necessario.");
        }
      } else {
        Alert.alert("Errore", "Salvataggio delle modifiche principali agli ingredienti fallito (in photo_analysis_ingredients).");
        console.error('[SAVE DEBUG] Fallimento savePhotoAnalysisIngredients.');
      }
    } catch (error) {
      console.error("[SAVE DEBUG] Errore grave durante handleSaveIngredients:", error);
      Alert.alert("Errore", "Si è verificato un errore grave durante il salvataggio.");
    } finally {
      setIsSavingIngredients(false); 
      console.log('[SAVE DEBUG] Fine salvataggio.');
    }
  };

  // Nuova funzione per ripristinare gli ingredienti originali
  const handleUndoChanges = () => {
    if (originalIngredientsBreakdownRef.current) {
      logCalories('Ripristino ingredienti originali:', originalIngredientsBreakdownRef.current);
      // Crea una copia profonda degli ingredienti originali
      const restoredIngredients = originalIngredientsBreakdownRef.current.map(ing => ({...ing}));
      setEditableIngredients(restoredIngredients);
      
      // Ricalcola il totale
      const totalCal = restoredIngredients.reduce((acc, ing) => acc + ing.estimated_calories_kcal, 0);
      setTotalEstimatedCalories(totalCal);
      
      // Rimuovi la flag di modifiche non salvate
      setHasUnsavedChanges(false);
    } else {
      logCalories('Impossibile ripristinare: nessun ingrediente originale disponibile');
      Alert.alert("Info", "Nessuna modifica da annullare.");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={BACKGROUND_COLOR} />
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* <TouchableOpacity style={styles.backButton} onPress={() => navigationHook.goBack()}>
          <Ionicons name="arrow-back" size={28} color={BORDER_COLOR} />
        </TouchableOpacity> */}

        {/* NUOVA RIGA PER FRECCIA INDIETRO E CUORE PREFERITI */}
        <View style={styles.headerActionsContainer}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigationHook.goBack()}>
            <Ionicons name="arrow-back" size={28} color={BORDER_COLOR} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.headerButton} 
            onPress={handleToggleFavorite}
            disabled={savingFavorite || disableFavoriteFeature} // Disabilita durante il salvataggio o se la feature è disabilitata
          >
            <Ionicons 
              name={isFavorite ? "heart" : "heart-outline"} 
              size={28} 
              color={(isFavorite && !disableFavoriteFeature) ? colors.primary : BORDER_COLOR} // Colore primario se preferito e non disabilitato
            />
          </TouchableOpacity>
        </View>

        <View style={styles.topCardWrapper}>
            <View style={styles.topCardShadow} />
            <View style={styles.topCardContainer}>
                <View style={styles.topCardRow}>
                    <View style={styles.productImageOuterWrapper}>
                        <View style={styles.productImageInnerShadow} />
        {imageUrl ? (
                            <Image 
                                source={{ uri: imageUrl }} 
                                style={styles.productDisplayImage} 
                                resizeMode="contain" 
                            />
        ) : (
                            <View style={styles.productImagePlaceholderInCard}>
                                <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
          </View>
        )}
        </View>

                    <View style={styles.topCardContent}>
                        <Text style={styles.topCardProductName} numberOfLines={2}>
                            {productName || "Nome non disponibile"}
                        </Text>
                        <Text style={styles.topCardBrandName} numberOfLines={1}>
                            {brandName || "Marca non disponibile"}
                        </Text>
                        
                        <View style={styles.scoresRowContainer}>
                            {healthScoreForIcon !== undefined && (
                            <View style={styles.scoreIconTextContainer}>
                                <Ionicons 
                                    name="heart" 
                                    size={18} 
                                    color={getScoreColorForIcon(nutritionGrade, 'nutri', healthScoreForIcon)} 
                                    style={styles.scoreIconStyle} 
                                />
                                <Text style={styles.scoreValueStyle}>
                                {healthScoreForIcon}
                                </Text>
      </View>
                            )}

                            {(sustainabilityScoreForIcon !== undefined && !isCurrentProductFromPhotoAnalysis) && (
                                <View style={[styles.scoreIconTextContainer, { marginLeft: healthScoreForIcon !== undefined ? 15 : 0} ]}>
                                    <Ionicons 
                                        name="leaf" 
                                        size={18} 
                                        color={getScoreColorForIcon(currentEcoScoreGrade, 'eco', sustainabilityScoreForIcon)} 
                                        style={styles.scoreIconStyle}
                                    />
                                    <Text style={styles.scoreValueStyle}>
                                        {sustainabilityScoreForIcon}
                                    </Text>
          </View>
        )}
            </View>
          </View>
                </View>
                
                {aiAnalysis && aiAnalysis.analysis && aiAnalysis.analysis.trim() !== "" && (
                    <Text style={styles.topCardProductSummaryText}>
                        {aiAnalysis.analysis}
                    </Text>
        )}
            </View>
      </View>
      
        {displayPortionButton && portionCalories !== undefined && suggestedPortionGramsToShow !== undefined && (
            <View style={styles.portionDetailRow}>
                <View style={styles.portionIconPillWrapper}>
                    <View style={styles.portionIconPillShadow} />
                    <View style={styles.portionIconPillContainer}>
                        <Ionicons 
                            name={'flame'} 
                            size={24} 
                            color={'#FFA07A'}
                        />
                    </View>
                </View>

                <View style={styles.portionValuePillWrapper}>
                    <View style={styles.portionValuePillShadow} />
                    <View style={styles.portionValuePillContainer}>
                        <Text style={styles.portionValueText}>
                            {`${portionCalories} kcal per porzione (${suggestedPortionGramsToShow}g)`}
                        </Text>
                    </View>
                </View>
            </View>
        )}

        {/* Mostra le calorie stimate per prodotti analizzati tramite foto */}
        {(() => {
            logCalories(`RENDER - Calorie stimate: isCurrentProductFromPhotoAnalysis=${isCurrentProductFromPhotoAnalysis}, displayCaloriesEstimate=${displayCaloriesEstimate}, caloriesEstimate=${caloriesEstimate}`);
            
            // ✓ NUOVO: Mostra sempre la pillola se il prodotto è da analisi foto e abbiamo una stima
            if (isCurrentProductFromPhotoAnalysis && displayCaloriesEstimate && caloriesEstimate) {
                logCalories("RENDER - Mostro pillola calorie stimate");
                return (
                    <View style={styles.portionDetailRow}>
                        <View style={styles.portionIconPillWrapper}>
                            <View style={styles.portionIconPillShadow} />
                            <View style={styles.portionIconPillContainer}>
                                <Ionicons 
                                    name={'flame'} 
                                    size={24} 
                                    color={'#FFA07A'}
                                />
                            </View>
                        </View>

                        <View style={styles.portionValuePillWrapper}>
                            <View style={styles.portionValuePillShadow} />
                            <View style={styles.portionValuePillContainer}>
                                <Text style={styles.portionValueText}>
                                    {`${caloriesEstimate}`}
                                </Text>
                            </View>
                        </View>
                    </View>
                );
            } else {
                logCalories("RENDER - NON mostro pillola calorie stimate");
                return null;
            }
        })()}
          
        {/* NUOVA POSIZIONE: Editor degli ingredienti subito dopo la pillola delle calorie */}
        {isCurrentProductFromPhotoAnalysis && renderIngredientsEditor()}
          
        {/* Sezione Analisi AI (Punteggi Salute/Eco 1-100 e dettagli) */}
        {showAiScores ? (
          <View style={styles.aiSectionWrapper}>
                {/* Punteggio Salute Numerico */} 
                {aiAnalysis.healthScore !== undefined && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.scoreSectionTitle}>Punteggio Salute</Text>
                <View style={styles.scoreRowContainer}>
                  <View style={styles.numericScoreColumn}>
                    <View style={styles.scoreSquareCardWrapper}>
                                    {/* UNIFORM SHADOW/BORDER */}
                                    <View style={styles.scoreSquareCardShadow} /> 
                                    <View style={[styles.scoreSquareCard, { backgroundColor: getScoreColorForIcon(nutritionGrade, 'nutri', aiAnalysis.healthScore) }]}>
                        <Text style={styles.scoreValueTextLarge}>{aiAnalysis.healthScore}</Text>
        </View>
                    </View>
                  </View>
                </View>
              </View>
                )}

                {/* Dettagli Salute: Lista unica */} 
                {renderItemList(allHealthItems)}
                
                 {/* Punteggio Eco Numerico - NON MOSTRARE SE ANALISI FOTO */} 
                {aiAnalysis.sustainabilityScore !== undefined && !isCurrentProductFromPhotoAnalysis && (
                    <View style={{marginTop: 30, marginBottom: 16}}> 
                <Text style={styles.scoreSectionTitle}>Punteggio Eco</Text>
                <View style={styles.scoreRowContainer}>
                  <View style={styles.numericScoreColumn}>
                    <View style={styles.scoreSquareCardWrapper}>
                                     {/* UNIFORM SHADOW/BORDER */}
                                    <View style={styles.scoreSquareCardShadow} /> 
                                    <View style={[styles.scoreSquareCard, { backgroundColor: getScoreColorForIcon(currentEcoScoreGrade, 'eco', aiAnalysis.sustainabilityScore) }]}> 
                        <Text style={styles.scoreValueTextLarge}>{aiAnalysis.sustainabilityScore}</Text>
            </View>
                </View>
          </View>
                </View>
              </View>
                )}

                 {/* Dettagli Eco: Lista unica - NON MOSTRARE SE ANALISI FOTO */} 
                {!isCurrentProductFromPhotoAnalysis && renderItemList(allEcoItems)}
          </View>
        ) : null}

        {hasNutritionData() ? (
          <View style={styles.nutritionSection}> 
            {renderNutritionTable()} 
          </View>
        ) : null}

        {/* RIMUOVO LA VECCHIA POSIZIONE DELL'EDITOR */}
        
        {/* Sezione Punteggi Salute e Sostenibilità (condizionale per foto) */}
        <View style={styles.scoresRow}> 
          {/* Card Punteggio Salute */} 
          {(healthScoreForIcon !== undefined && aiAnalysis) && ( // Aggiunto controllo aiAnalysis
            <View style={styles.scoreCardContainer}>
              <Text style={styles.scoreSectionTitle}>Punteggio Salute</Text>
              <View style={styles.scoreRowContainer}>
                <View style={styles.numericScoreColumn}>
                  <View style={styles.scoreSquareCardWrapper}>
                                    {/* UNIFORM SHADOW/BORDER */}
                                    <View style={styles.scoreSquareCardShadow} /> 
                                    <View style={[styles.scoreSquareCard, { backgroundColor: getScoreColorForIcon(nutritionGrade, 'nutri', aiAnalysis.healthScore) }]}>
                        <Text style={styles.scoreValueTextLarge}>{aiAnalysis.healthScore}</Text>
        </View>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Card Punteggio Eco */}
          {(sustainabilityScoreForIcon !== undefined && !isCurrentProductFromPhotoAnalysis && aiAnalysis) && ( // Aggiunto controllo aiAnalysis
            <View style={styles.scoreCardContainer}>
              <Text style={styles.scoreSectionTitle}>Punteggio Eco</Text>
              <View style={styles.scoreRowContainer}>
                <View style={styles.numericScoreColumn}>
                  <View style={styles.scoreSquareCardWrapper}>
                                     {/* UNIFORM SHADOW/BORDER */}
                                    <View style={styles.scoreSquareCardShadow} /> 
                                    <View style={[styles.scoreSquareCard, { backgroundColor: getScoreColorForIcon(currentEcoScoreGrade, 'eco', aiAnalysis.sustainabilityScore) }]}> 
                        <Text style={styles.scoreValueTextLarge}>{aiAnalysis.sustainabilityScore}</Text>
            </View>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

    </ScrollView>
    </View>
  );
};

export default ProductDetailScreen;


