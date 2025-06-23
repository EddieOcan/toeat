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
  Dimensions,
  findNodeHandle, // <<< AGGIUNTO QUESTO
  Modal,
  KeyboardAvoidingView,
} from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { AppStackParamList } from "../../navigation"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../../contexts/AuthContext"
import { useNavigation } from "@react-navigation/native"
import { usePhotoAnalysis } from "../../contexts/PhotoAnalysisContext"
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
import { addProductToDay } from "../../services/nutritionApi"
import EmptyState from "../../components/EmptyState"
import { formatNutritionValue, getNutritionGradeLabel, getEcoScoreLabel, getScoreColor } from "../../utils/formatters"
import HealthScoreIndicator from "../../components/HealthScoreIndicator"
import SustainabilityScoreIndicator from "../../components/SustainabilityScoreIndicator"
import type { GeminiAnalysisResult, EstimatedIngredient } from "../../services/gemini"
import { StatusBar } from 'expo-status-bar';
import { StatusBar as RNStatusBar } from 'react-native';
import ScoreIndicatorCard from '../../components/ScoreIndicatorCard';

import { getCaloriesForSingleIngredientFromGeminiAiSdk, NUTRI_SCORE_DESCRIPTIONS, ECO_SCORE_DESCRIPTIONS, NOVA_DESCRIPTIONS } from "../../services/gemini"; // IMPORTAZIONE NUOVA FUNZIONE
import { scaleFont } from '../../theme/typography';

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

// Funzioni helper rimosse - ora si usa getScoreColor globale

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
  isUpdate?: boolean; // Flag per indicare che è un aggiornamento di una pagina esistente
  openedFromDiary?: boolean; // Nuovo parametro per indicare che è stato aperto dal diario
  shouldStartAiAnalysis?: boolean; // Flag per avviare l'analisi AI per prodotti scansionati senza AI
};

type Props = NativeStackScreenProps<AppStackParamList, "ProductDetail">;

const ProductDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { productRecordId, initialProductData: routeInitialProductData, aiAnalysisResult: routeAiAnalysisResult, isPhotoAnalysis, isUpdate, openedFromDiary, shouldStartAiAnalysis } = route.params as ProductDetailScreenRouteParams;
  
  // TUTTI GLI HOOKS DI STATO ALL'INIZIO DEL COMPONENTE
  const [displayProductInfo, setDisplayProductInfo] = useState<RawProductData | ProductRecord | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<GeminiAnalysisResult | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [loadingInitialData, setLoadingInitialData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [editableIngredients, setEditableIngredients] = useState<EstimatedIngredient[] | null>(null);
  const [totalEstimatedCalories, setTotalEstimatedCalories] = useState<number | null>(null);
  const [isAddingIngredient, setIsAddingIngredient] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientWeight, setNewIngredientWeight] = useState("");
  const [newIngredientQuantity, setNewIngredientQuantity] = useState("1");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavingIngredients, setIsSavingIngredients] = useState(false);
  const [weightInputFocused, setWeightInputFocused] = useState<string | null>(null);
  const [nameInputFocused, setNameInputFocused] = useState(false);
  const [showLoadingAnimation, setShowLoadingAnimation] = useState(false);
  const [currentLoadingMessage, setCurrentLoadingMessage] = useState("");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [quantity, setQuantity] = useState('100');
  const [addingToTracking, setAddingToTracking] = useState(false);

  // HOOKS DI CONTESTO
  const { currentAnalysis, clearAnalysis, isAnalyzing: isPhotoAnalyzing } = usePhotoAnalysis();
  const { colors } = useTheme();
  const { user } = useAuth();
  const navigationHook = useNavigation();

  // REFS
  const originalIngredientsBreakdownRef = useRef<EstimatedIngredient[] | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRefs = useRef<{[key: string]: { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void } | null}>({});
  const dataCache = useRef(new Map<string, { timestamp: number, data: any }>()).current;
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedApiCalls = useRef(new Map<string, NodeJS.Timeout>()).current;

  // MEMO HOOKS
  const disableFavoriteFeature = useMemo(() => {
    return isPhotoAnalysis && (!productRecordId || productRecordId === "temp_visual_scan");
  }, [isPhotoAnalysis, productRecordId]);

  const isProductFromBarcodeScan = useMemo(() => {
    if (!displayProductInfo) return false;
    
    const hasValidBarcode = 
      ('barcode' in displayProductInfo && displayProductInfo.barcode && displayProductInfo.barcode !== 'temp_visual_scan') ||
      ('code' in displayProductInfo && displayProductInfo.code && displayProductInfo.code !== 'temp_visual_scan');
    
    const isNotPhotoAnalysis = !isProductFromPhotoAnalysis(isPhotoAnalysis, displayProductInfo, aiAnalysis);
    
    return hasValidBarcode && isNotPhotoAnalysis;
  }, [displayProductInfo, isPhotoAnalysis, aiAnalysis]);

  // CALLBACK HOOKS
  const getCachedData = useCallback((key: string) => {
    const cached = dataCache.get(key);
    const now = Date.now();
    const CACHE_DURATION = 60000; // 1 minuto di cache
    
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
      console.log(`[CACHE HIT] Utilizzando dati dalla cache per ${key}`);
      return cached.data;
    }
    
    return null;
  }, []);
  
  const setCachedData = useCallback((key: string, data: any) => {
    dataCache.set(key, { timestamp: Date.now(), data });
  }, []);

  // COSTANTI E CONFIGURAZIONI
  const loadingMessages = [
    "Analisi valori nutrizionali...",
    "Analisi del livello di lavorazione industriale...",
    "Analisi impatto ambientale...",
    "Calcolo punteggio salute...",
    "Generazione raccomandazioni..."
  ];

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

  const CARD_BORDER_WIDTH = 2;
  const SHADOW_OFFSET_VALUE = 2.5;
  const BORDER_COLOR = "#000";
  const BACKGROUND_COLOR = "#f8f4ec";
  const CARD_BACKGROUND_COLOR = "#FFFFFF";
  const COMMON_BORDER_WIDTH = 2;
  const IMAGE_SHADOW_OFFSET = 2;
  const PILL_BORDER_WIDTH = 1.5;
  const PILL_SHADOW_OFFSET = 1.5;
  const PILL_BORDER_RADIUS = 15;
  const PILL_HEIGHT = 48; 
  const ICON_PILL_SIZE = 48;

  // FUNZIONI HELPER
  const getNutrientIconName = (nutrientKey: string): string => {
    switch (nutrientKey) {
      case 'energy_kcal_100g': return 'flame';
      case 'fat_100g': return 'cafe';
      case 'saturated_fat_100g': return 'ellipse';
      case 'carbohydrates_100g': return 'layers';
      case 'sugars_100g': return 'cube';
      case 'fiber_100g': return 'analytics';
      case 'proteins_100g': return 'barbell';
      case 'salt_100g': return 'grid';
      default: return 'help-circle';
    }
  };

  const getNutrientIconColor = (nutrientKey: string): string => {
    switch (nutrientKey) {
      case 'energy_kcal_100g': return '#FFA07A';
      case 'fat_100g': return '#87CEEB';
      case 'saturated_fat_100g': return '#DA70D6';
      case 'carbohydrates_100g': return '#FFD700';
      case 'sugars_100g': return '#FFB6C1';
      case 'fiber_100g': return '#20B2AA';
      case 'proteins_100g': return '#CD5C5C';
      case 'salt_100g': return '#D3D3D3';
      default: return BORDER_COLOR;
    }
  };

  const toggleItemExpansion = (key: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getNutrimentValue = (field: keyof ProductRecord | keyof NonNullable<RawProductData['nutriments']>): number | undefined => {
    if (!displayProductInfo) return undefined;

    if ('nutriments' in displayProductInfo && displayProductInfo.nutriments) {
      const nutrimentData = displayProductInfo.nutriments;
      if (field in nutrimentData) {
        const value = nutrimentData[field as keyof NonNullable<RawProductData['nutriments']>];
        return typeof value === 'number' ? value : undefined;
      }
    } else if (field in displayProductInfo) {
      const value = (displayProductInfo as ProductRecord)[field as keyof ProductRecord];
      return typeof value === 'number' ? value : undefined;
    }

    return undefined;
  };

  const loadProductData = useCallback(async (mountedRef: { current: boolean }) => {
    const loadStartTime = Date.now();
    
    // Caso speciale per l'analisi foto
    const isPhotoAnalysisWithTempId = productRecordId === "temp_visual_scan" && isPhotoAnalysis && routeInitialProductData;
    
    logCalories(`loadProductData ottimizzato iniziato, productRecordId=${productRecordId}, isPhotoAnalysis=${isPhotoAnalysis}, isUpdate=${isUpdate}`);
    
    // Verifica cache per dati esistenti
    const cacheKey = `product-${productRecordId}-${user?.id}`;
    const cachedProduct = getCachedData(cacheKey);
    
    if (cachedProduct && !isUpdate && mountedRef.current) {
      console.log(`[CACHE] Utilizzando dati prodotto dalla cache per ${productRecordId}`);
      setDisplayProductInfo(cachedProduct.displayData);
      setAiAnalysis(cachedProduct.aiData);
      setLoadingInitialData(false);
      
             // Continua con il caricamento degli ingredienti se necessario
       if (cachedProduct.needsIngredients && user?.id) {
         // Carica ingredienti in background
         loadIngredientsInBackground(productRecordId, user.id, cachedProduct.aiData);
       }
      return;
    }
    
    // Reset COMPLETO dello stato SOLO se NON è un aggiornamento
    if (mountedRef.current && !isUpdate) {
      setDisplayProductInfo(null);
      setAiAnalysis(null);
      setLoadingInitialData(true);
      setError(null);
      setEditableIngredients(null);
      setTotalEstimatedCalories(null);
      originalIngredientsBreakdownRef.current = null;
      logCalories('Reset completo dello stato effettuato (NON è un aggiornamento)');
    } else if (isUpdate) {
      logCalories('Aggiornamento in corso - mantenendo stato esistente');
      if (mountedRef.current && !displayProductInfo) {
        setLoadingInitialData(true);
      }
    }
    
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
      let initialAiAnalysis: GeminiAnalysisResult | null = null;

      // OTTIMIZZAZIONE: Gestisci i dati dalla route in modo più efficiente
      if (routeInitialProductData && mountedRef.current) {
        initialDisplayData = routeInitialProductData;
        setDisplayProductInfo(initialDisplayData); 
        
        if (routeAiAnalysisResult) {
          logCalories("Dati RAW e Analisi AI dalla route.");
          
          // Ottimizzazione: parsing parallelo dei campi JSON
          const [pros, cons, sustainabilityPros, sustainabilityCons] = await Promise.all([
            Promise.resolve(parseJsonArrayField(routeAiAnalysisResult.pros)),
            Promise.resolve(parseJsonArrayField(routeAiAnalysisResult.cons)),
            Promise.resolve(parseJsonArrayField(routeAiAnalysisResult.sustainabilityPros)),
            Promise.resolve(parseJsonArrayField(routeAiAnalysisResult.sustainabilityCons))
          ]);
          
          initialAiAnalysis = { 
            ...routeAiAnalysisResult,
            pros,
            cons,
            sustainabilityPros,
            sustainabilityCons,
            calories_estimate: routeAiAnalysisResult.calories_estimate,
            calorie_estimation_type: routeAiAnalysisResult.calorie_estimation_type,
            ingredients_breakdown: routeAiAnalysisResult.ingredients_breakdown
          };
          
          logCalories('initialAiAnalysis creato:', initialAiAnalysis);
          setAiAnalysis(initialAiAnalysis);
        } else {
          logCalories("Dati RAW dalla route, NESSUNA AI disponibile.");
          setAiAnalysis(null);
        }
      } else {
        logCalories(`Caricamento ProductRecord ottimizzato per ID: ${productRecordId}.`);
        
        // OTTIMIZZAZIONE: Carica solo i campi necessari inizialmente
        fetchedProduct = await getProductRecordById(productRecordId);
        
        if (mountedRef.current) {
          if (fetchedProduct) {
            initialDisplayData = fetchedProduct;
            setDisplayProductInfo(fetchedProduct);
            logCalories('Dati prodotto caricati dal DB:', fetchedProduct);
            
            // OTTIMIZZAZIONE: Verifica AI in modo più efficiente
            const hasAiData = fetchedProduct.calories_estimate || 
                             (fetchedProduct.health_score !== undefined && fetchedProduct.health_score !== null);
            
            if (hasAiData) {
              logCalories(`Dati AI trovati in fetchedProduct: ${productRecordId}.`);
              
              // OTTIMIZZAZIONE: Parse ingredients_breakdown in modo asincrono
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
              
              // OTTIMIZZAZIONE: Parsing parallelo dei campi JSON
              const [pros, cons, sustainabilityPros, sustainabilityCons] = await Promise.all([
                Promise.resolve(parseJsonArrayField(fetchedProduct.health_pros)),
                Promise.resolve(parseJsonArrayField(fetchedProduct.health_cons)),
                Promise.resolve(parseJsonArrayField(fetchedProduct.sustainability_pros)),
                Promise.resolve(parseJsonArrayField(fetchedProduct.sustainability_cons))
              ]);
              
              initialAiAnalysis = {
                healthScore: fetchedProduct.health_score ?? 0, 
                sustainabilityScore: fetchedProduct.sustainability_score ?? 0,
                analysis: fetchedProduct.health_analysis ?? '',
                pros,
                cons,
                sustainabilityPros,
                sustainabilityCons,
                        // RIMOSSO: nutriScoreExplanation, novaExplanation, ecoScoreExplanation
                calories_estimate: fetchedProduct.calories_estimate, 
                calorie_estimation_type: (fetchedProduct as any).calorie_estimation_type || 
                  (fetchedProduct.is_visually_analyzed ? 'breakdown' : undefined),
                ingredients_breakdown: parsedIngredientsBreakdown,
                productNameFromVision: (fetchedProduct as any).product_name_from_vision, 
                brandFromVision: (fetchedProduct as any).brand_from_vision,
                estimated_energy_kcal_100g: (fetchedProduct as any).estimated_energy_kcal_100g,
                estimated_proteins_100g: (fetchedProduct as any).estimated_proteins_100g,
                estimated_carbs_100g: (fetchedProduct as any).estimated_carbs_100g,
                estimated_fats_100g: (fetchedProduct as any).estimated_fats_100g,
              };
              
              logCalories('initialAiAnalysis creato da DB:', initialAiAnalysis);
              setAiAnalysis(initialAiAnalysis);
              
              // OTTIMIZZAZIONE: Inizializza ingredienti solo se necessario
              if (initialAiAnalysis.calorie_estimation_type === 'breakdown' && 
                  initialAiAnalysis.ingredients_breakdown && 
                  initialAiAnalysis.ingredients_breakdown.length > 0) {
                
                // Esegui calcoli in parallelo
                const [totalCal, ingredientsCopy] = await Promise.all([
                  Promise.resolve(initialAiAnalysis.ingredients_breakdown.reduce(
                    (acc, ing) => acc + ing.estimated_calories_kcal, 0
                  )),
                  Promise.resolve(initialAiAnalysis.ingredients_breakdown.map(ing => ({...ing})))
                ]);
                
                setEditableIngredients(initialAiAnalysis.ingredients_breakdown);
                setTotalEstimatedCalories(totalCal);
                originalIngredientsBreakdownRef.current = ingredientsCopy;
                logCalories('Inizializzati ingredienti modificabili dal DB: ', initialAiAnalysis.ingredients_breakdown);
              }
            } else {
              logCalories(`Nessuna AI/stima calorie preesistente in fetchedProduct: ${productRecordId}.`);
              setAiAnalysis(null);
            }
          } else {
            setError("Prodotto non trovato nel database.");
          }
        }
      }

      // OTTIMIZZAZIONE: Cache dei dati caricati
      const needsIngredients = isProductFromPhotoAnalysis(isPhotoAnalysis, fetchedProduct, initialAiAnalysis) &&
                              productRecordId !== "temp_visual_scan" && 
                              !productRecordId.startsWith('photo_analysis_');
      
      setCachedData(cacheKey, {
        displayData: initialDisplayData,
        aiData: initialAiAnalysis,
        needsIngredients
      });

      // OTTIMIZZAZIONE: Carica ingredienti personalizzati in background
      if (user && needsIngredients) {
        loadIngredientsInBackground(productRecordId, user.id, initialAiAnalysis);
      }

      if (mountedRef.current) {
        setLoadingInitialData(false); 
      }

      // OTTIMIZZAZIONE: Carica stato preferiti in background
      if (user && productRecordId && mountedRef.current && !productRecordId.startsWith('photo_analysis_')) {
        loadFavoriteStatusInBackground(user.id, productRecordId);
      }

      const loadTime = Date.now() - loadStartTime;
      console.log(`[PERFORMANCE] loadProductData completato in ${loadTime}ms`);

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
      isPhotoAnalysis,
      isUpdate,
      getCachedData,
      setCachedData
  ]);

  // OTTIMIZZAZIONE: Funzione per caricare ingredienti in background
  const loadIngredientsInBackground = useCallback(async (
    productId: string, 
    userId: string, 
    aiAnalysis: GeminiAnalysisResult | null
  ) => {
    try {
      const savedIngredients = await loadPhotoAnalysisIngredients(productId, userId);
      if (savedIngredients && savedIngredients.length > 0) {
        logCalories('Ingredienti personalizzati caricati in background:', savedIngredients);
        
        const [totalCal, ingredientsCopy] = await Promise.all([
          Promise.resolve(savedIngredients.reduce((acc, ing) => acc + ing.estimated_calories_kcal, 0)),
          Promise.resolve(savedIngredients.map(ing => ({...ing})))
        ]);
        
        setEditableIngredients(savedIngredients);
        setTotalEstimatedCalories(totalCal);
        originalIngredientsBreakdownRef.current = ingredientsCopy;
        setHasUnsavedChanges(false);
        
        // Aggiorna aiAnalysis se necessario
        if (aiAnalysis) {
          const updatedAiAnalysis = {
            ...aiAnalysis,
            calorie_estimation_type: 'breakdown' as const,
            ingredients_breakdown: savedIngredients,
            calories_estimate: `Calorie stimate: ${totalCal} kcal`
          };
          setAiAnalysis(updatedAiAnalysis);
        }
      }
    } catch (error) {
      console.error('Errore nel caricamento degli ingredienti personalizzati in background:', error);
    }
  }, []);

  // OTTIMIZZAZIONE: Funzione per caricare stato preferiti in background
  const loadFavoriteStatusInBackground = useCallback(async (userId: string, productId: string) => {
    try {
      const favoriteStatus = await isProductInFavorites(userId, productId);
      setIsFavorite(favoriteStatus);
    } catch (error) {
      console.error('Errore nel caricamento dello stato preferiti:', error);
    }
  }, []);

  // useEffect esistente per caricare i dati
  useEffect(() => {
    const mountedRef = { current: true };
    loadProductData(mountedRef);
    return () => { mountedRef.current = false; };
  }, [loadProductData]);

  // Effetto per gestire l'animazione dei messaggi di caricamento
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    // Interrompi l'animazione se l'analisi AI è completata
    if (aiAnalysis && showLoadingAnimation) {
      setShowLoadingAnimation(false);
      return;
    }
    
    // OTTIMIZZAZIONE: Determina se mostrare il loading per analisi foto
    const shouldShowLoadingForPhoto = isPhotoAnalysis && (
      (productRecordId.startsWith('photo_analysis_') && !aiAnalysis) || // Caso: ID dinamico analisi foto
      (isPhotoAnalyzing && !aiAnalysis) || // Caso: context indica analisi in corso
      (currentAnalysis && !currentAnalysis.isComplete && !aiAnalysis) // Caso: analisi non completata via context
    );
    
    // Per barcode, mantieni la logica originale ma semplificata
    const shouldShowLoadingForBarcode = !isPhotoAnalysis && isProductFromBarcodeScan && isAiLoading && !aiAnalysis;
    
    if (shouldShowLoadingForBarcode || shouldShowLoadingForPhoto) {
      console.log('[LOADING DEBUG] Mostrando loading animation:', {
        shouldShowLoadingForBarcode,
        shouldShowLoadingForPhoto,
        isPhotoAnalysis,
        productRecordId,
        isPhotoAnalyzing,
        aiAnalysis: !!aiAnalysis,
        currentAnalysis: !!currentAnalysis
      });
      
      setShowLoadingAnimation(true);
      
      // Messaggi ottimizzati per velocità percepita
      const photoLoadingMessages = [
        "Analisi immagine in corso...",
        "Riconoscimento prodotto...", 
        "Analisi valori nutrizionali...",
        "Calcolo punteggio salute...",
        "Generazione raccomandazioni...",
        "Finalizzazione risultati..."
      ];
      
      const messages = shouldShowLoadingForPhoto ? photoLoadingMessages : loadingMessages;
      setCurrentLoadingMessage(messages[0]);
      setLoadingMessageIndex(0);
      
      interval = setInterval(() => {
        setLoadingMessageIndex(prev => {
          const nextIndex = (prev + 1) % messages.length;
          setCurrentLoadingMessage(messages[nextIndex]);
          return nextIndex;
        });
      }, 1500); // Cambia messaggio ogni 1.5 secondi (più veloce)
    } else {
      console.log('[LOADING DEBUG] NON mostrando loading animation:', {
        shouldShowLoadingForBarcode,
        shouldShowLoadingForPhoto,
        isPhotoAnalysis,
        productRecordId,
        isPhotoAnalyzing,
        aiAnalysis: !!aiAnalysis,
        currentAnalysis: !!currentAnalysis
      });
      setShowLoadingAnimation(false);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isProductFromBarcodeScan, isPhotoAnalysis, productRecordId, isAiLoading, aiAnalysis, showLoadingAnimation, isPhotoAnalyzing, currentAnalysis]);

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
              sustainabilityPros: [],
              sustainabilityCons: [],
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

      // CORREZIONE: Controlla se l'analisi AI è già completa
      const hasCompleteAiAnalysis = aiAnalysis && 
        (aiAnalysis.healthScore !== undefined && aiAnalysis.healthScore !== null && aiAnalysis.healthScore > 0) &&
        aiAnalysis.analysis && aiAnalysis.analysis.trim() !== "";

      // Condizione per eseguire l'analisi AI testuale/barcode
      const needsAiFetch = displayProductInfo && !hasCompleteAiAnalysis;
      
      // Forza l'analisi AI solo se shouldStartAiAnalysis è true E non c'è già un'analisi completa
      const shouldForceAiAnalysis = shouldStartAiAnalysis && displayProductInfo && hasValidBarcodeForTextAnalysis && !hasCompleteAiAnalysis;
        
      if (user && productRecordId && (needsAiFetch || shouldForceAiAnalysis) && hasValidBarcodeForTextAnalysis) {
        
        if (shouldForceAiAnalysis) {
          logCalories("Analisi AI forzata tramite shouldStartAiAnalysis flag.");
        } else {
          logCalories("Condizioni per fetch/generate AI (barcode/text) soddisfatte.");
        }
        
        if (mountedRef.current) {
          setIsAiLoading(true);
        }

        let dataForGeminiAnalysis: RawProductData;
        // Priorità ai dati della route se disponibili e se è una scansione nuova (routeInitialProductData implica questo)
        if (routeInitialProductData && routeInitialProductData.code) {
          logCalories("Uso routeInitialProductData per Gemini.");
          dataForGeminiAnalysis = routeInitialProductData;
        } else if (displayProductInfo && (displayProductInfo as RawProductData).code) { // È RawProductData
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
        else if (hasCompleteAiAnalysis) logCalories("Skip fetchOrGenerate (analisi AI già completa).");
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
    shouldStartAiAnalysis, // Aggiunta dipendenza per avvio forzato AI
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
        estimated_calories_kcal: estimatedCalories || 65, // Se non abbiamo calorie, usiamo un valore predefinito
        quantity: 1 // Default a 1
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
      
      // NUOVO: Raggruppamento ingredienti identici
      const ingredientMap = new Map<string, EstimatedIngredient>();
      
      aiAnalysis.ingredients_breakdown.forEach(ing => {
        // Normalizza il nome (minuscolo, trim)
        const normalizedName = ing.name.toLowerCase().trim();
        
        if (ingredientMap.has(normalizedName)) {
          // Se l'ingrediente esiste già, aumenta la quantità
          const existingIng = ingredientMap.get(normalizedName)!;
          existingIng.quantity = (existingIng.quantity || 1) + 1;
        } else {
          // Se è un nuovo ingrediente, aggiungilo alla mappa con quantity=1
          ingredientMap.set(normalizedName, {
            ...ing,
            quantity: ing.quantity || 1
          });
        }
      });
      
      // Converti la mappa in array
      const groupedIngredients = Array.from(ingredientMap.values());
      
      // Imposta gli ingredienti raggruppati
      setEditableIngredients(groupedIngredients);
      
      // Calcola il totale delle calorie considerando le quantità
      const totalCal = groupedIngredients.reduce(
        (acc, ing) => acc + (ing.estimated_calories_kcal * (ing.quantity || 1)), 0
      );
      setTotalEstimatedCalories(totalCal);
      logCalories('Somma calorie iniziali calcolata:', totalCal);
      
      // Salva una copia per ricalcoli
      originalIngredientsBreakdownRef.current = groupedIngredients.map(ing => ({...ing}));
    }
  }, [aiAnalysis, editableIngredients, displayProductInfo]);

  // useEffect per ascoltare gli aggiornamenti dall'analisi foto via context
  useEffect(() => {
    if (!currentAnalysis) return;
    
    // Controlla se l'aggiornamento è per il prodotto corrente
    if (currentAnalysis.productRecordId === productRecordId || 
        (productRecordId.startsWith('photo_analysis_') && currentAnalysis.productRecordId.startsWith('photo_analysis_'))) {
      
      console.log('[PHOTO CONTEXT] Aggiornamento ricevuto per prodotto:', currentAnalysis.productRecordId);
      
      // Aggiorna i dati del prodotto se disponibili
      if (currentAnalysis.productData) {
        console.log('[PHOTO CONTEXT] Aggiornamento displayProductInfo');
        setDisplayProductInfo(currentAnalysis.productData);
      }
      
      // Aggiorna l'analisi AI se disponibile
      if (currentAnalysis.aiAnalysisResult) {
        console.log('[PHOTO CONTEXT] Aggiornamento aiAnalysis');
        setAiAnalysis(currentAnalysis.aiAnalysisResult);
      }
      
      // Se l'analisi è completa, aggiorna anche l'ID del prodotto
      if (currentAnalysis.isComplete && currentAnalysis.productRecordId !== productRecordId) {
        console.log('[PHOTO CONTEXT] Analisi completa, aggiorno productRecordId');
        // Aggiorna i parametri della route per riflettere l'ID finale
        navigation.setParams({
          productRecordId: currentAnalysis.productRecordId,
          initialProductData: currentAnalysis.productData,
          aiAnalysisResult: currentAnalysis.aiAnalysisResult,
          isPhotoAnalysis: true
        });
      }
    }
  }, [currentAnalysis, productRecordId, navigation]);

  // Cleanup del context quando si esce dalla schermata
  useEffect(() => {
    return () => {
      if (isPhotoAnalysis) {
        clearAnalysis();
      }
    };
  }, [isPhotoAnalysis, clearAnalysis]);

  // Cleanup dei timeout quando il componente si smonta
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      // Pulisci tutti i timeout delle API calls
      debouncedApiCalls.forEach(timeout => clearTimeout(timeout));
      debouncedApiCalls.clear();
    };
  }, []);

  const handleToggleFavorite = async () => {
    if (!displayProductInfo || !user || !productRecordId || productRecordId.startsWith('photo_analysis_')) return;

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

  // Funzioni per il tracking calorie
  const determineEntryType = (): 'barcode' | 'photo_packaged' | 'photo_meal' => {
    if (!displayProductInfo) return 'barcode';
    
    // Prima controlla se è un prodotto da analisi foto
    const isFromPhotoAnalysis = isProductFromPhotoAnalysis(isPhotoAnalysis, displayProductInfo, aiAnalysis);
    
    if (isFromPhotoAnalysis) {
      // Controlla se è un pasto con breakdown di ingredienti
      const hasBreakdown = 
        ('calorie_estimation_type' in displayProductInfo && displayProductInfo.calorie_estimation_type === 'breakdown') ||
        ('ingredients_breakdown' in displayProductInfo && displayProductInfo.ingredients_breakdown) ||
        (aiAnalysis?.ingredients_breakdown && aiAnalysis.ingredients_breakdown.length > 0) ||
        editableIngredients && editableIngredients.length > 0;
      
      if (hasBreakdown) {
        console.log('[TRACKING] Identificato come photo_meal (pasto fotografato con breakdown)');
        return 'photo_meal'; // Pasto completo fotografato con ingredienti
      } else {
        console.log('[TRACKING] Identificato come photo_packaged (prodotto confezionato fotografato)');
        return 'photo_packaged'; // Prodotto confezionato fotografato
      }
    }
    
    console.log('[TRACKING] Identificato come barcode (prodotto da barcode)');
    return 'barcode'; // Prodotto da barcode
  };

  const handleAddToTracking = () => {
    if (!displayProductInfo || productRecordId.startsWith('photo_analysis_')) return;
    
    const entryType = determineEntryType();
    console.log('[TRACKING] Entry type determinato:', entryType);
    
    if (entryType === 'photo_meal') {
      console.log('[TRACKING] Pasto fotografato - aggiunta diretta');
      // Per i pasti fotografati, aggiungi direttamente
      addToTrackingDirect();
    } else {
      console.log('[TRACKING] Prodotto confezionato - richiesta quantità');
      // Per prodotti confezionati, chiedi la quantità
      setShowQuantityModal(true);
    }
  };

  const addToTrackingDirect = async () => {
    if (!displayProductInfo) return;
    
    try {
      setAddingToTracking(true);
      
      const today = new Date().toISOString().split('T')[0];
      const entryType = determineEntryType();
      
      await addProductToDay(
        today,
        productRecordId,
        entryType,
        undefined, // Nessuna quantità per i pasti fotografati
        entryType === 'photo_meal' ? (
          ('calories_estimate' in displayProductInfo && displayProductInfo.calories_estimate) || 
          aiAnalysis?.calories_estimate || 
          'Pasto fotografato'
        ) : undefined
      );

      Alert.alert(
        'Aggiunto al Tracking!',
        `${displayProductInfo.product_name} è stato aggiunto al tuo diario di oggi`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Errore aggiunta al tracking:', error);
      Alert.alert('Errore', 'Impossibile aggiungere il prodotto al tracking calorie');
    } finally {
      setAddingToTracking(false);
    }
  };

  const handleQuantityConfirm = async () => {
    if (!displayProductInfo) return;
    
    const quantityNum = parseFloat(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      Alert.alert('Errore', 'Inserisci una quantità valida');
      return;
    }

    try {
      setAddingToTracking(true);
      setShowQuantityModal(false);
      
      const today = new Date().toISOString().split('T')[0];
      const entryType = determineEntryType();
      
      await addProductToDay(
        today,
        productRecordId,
        entryType,
        quantityNum
      );

      Alert.alert(
        'Aggiunto al Tracking!',
        `${displayProductInfo.product_name} (${quantityNum}g) è stato aggiunto al tuo diario di oggi`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Errore aggiunta al tracking:', error);
      Alert.alert('Errore', 'Impossibile aggiungere il prodotto al tracking calorie');
    } finally {
      setAddingToTracking(false);
    }
  };

  // getScoreColorForIcon rimossa - ora si usa getScoreColor globale direttamente

  // Nuova funzione per verificare se ci sono dati nutrizionali reali (non stimati)
  const hasRealNutritionData = (): boolean => {
    if (!displayProductInfo) return false;
    // Verifica se i valori nutrizionali provengono da OpenFoodFacts
    // Controlliamo se almeno un campo nutrizionale ha un valore maggiore di zero
    const fieldsToCheck: Array<keyof ProductRecord | keyof NonNullable<RawProductData['nutriments']>> = [
        'energy_kcal_100g', 'fat_100g', 'saturated_fat_100g', 
        'carbohydrates_100g', 'sugars_100g', 'fiber_100g', 
        'proteins_100g', 'salt_100g'
    ];
    
    // Se il prodotto ha un campo che indica esplicitamente se i valori sono stimati, usalo
    if ('has_estimated_nutrition' in displayProductInfo) {
      return !(displayProductInfo as any).has_estimated_nutrition;
    }
    
    // Altrimenti, controlla se ci sono valori nutrizionali
    for (const field of fieldsToCheck) {
        const value = getNutrimentValue(field);
        if (typeof value === 'number' && value > 0.01) {
            return true;
        }
    }
    return false;
  };

  // Funzione helper per verificare se ci sono dati nutrizionali significativi da mostrare
  const hasNutritionData = (): boolean => {
    // Se ci sono dati reali, restituisci true
    if (hasRealNutritionData()) return true;
    
    // Se è un'analisi foto, considera che abbiamo sempre dati nutrizionali da mostrare
    if (isCurrentProductFromPhotoAnalysis) return true;
    
    // Se abbiamo un aiAnalysis con healthScore, consideriamo che l'AI possa stimare i valori
    if (aiAnalysis?.healthScore !== undefined) return true;
    
    // Altrimenti, non abbiamo dati nutrizionali
    return false;
  };

  // --- MODIFICA renderAiDetailSection --- 
  const renderAiDetailSection = (
    sectionTitle: string, 
    items: Array<{ title: string; detail?: string } | ScoreItem>, // Accetta anche ScoreItem
    category: 'health' | 'sustainability' | 'neutral' // Aggiunta categoria neutral
  ): React.ReactNode => {
    if (!Array.isArray(items) || items.length === 0) return null;

    // Determina lo stile del blocco se necessario (ma lo rimuoviamo)
    // const isNegativeBlock = category === 'health' && sectionTitle.toLowerCase().includes('negativi');
    // const isPositiveBlock = category === 'health' && sectionTitle.toLowerCase().includes('positivi');
    // const isNeutralBlock = category === 'neutral';

    return (
      <View style={styles.itemListContainer}> 
        {sectionTitle && <Text style={styles.aiSectionTitleAlt} allowFontScaling={false}>{sectionTitle}</Text>} {/* Titolo opzionale per sezione */} 
        {items.map((itemData, index) => {
          const isScoreItem = typeof itemData === 'object' && itemData !== null && 'classification' in itemData && 'scoreType' in itemData; // Check più robusto per ScoreItem
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
                    <Text style={styles.itemCardTitleText} allowFontScaling={false}>{itemTitle}</Text>
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
                      itemDetail ? <Text style={styles.itemDetailText} allowFontScaling={false}>{itemDetail}</Text> : null
                    )}
                    {/* Testo dell'AI per ScoreItem, ora posizionato DOPO ScoreIndicatorCard */} 
                    {isScoreItem && scoreItemData && (
                        <Text style={[styles.itemDetailText, { marginTop: 20 }]} allowFontScaling={false}> 
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
      resizeMode: 'cover', // Cambiato da 'contain' a 'cover' per riempire lo spazio
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
      fontSize: scaleFont(19), 
      marginBottom: 5,
      color: colors.text, 
      fontFamily: 'BricolageGrotesque-Regular',
    },
    topCardBrandName: {
      fontSize: scaleFont(15), 
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
      fontSize: scaleFont(15),
      color: colors.text, 
      fontFamily: 'BricolageGrotesque-Bold',
    },
    topCardProductSummaryText: {
      fontSize: scaleFont(15),
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
    nutritionPortionSection: {
      marginTop: 15,
      marginBottom: 30,
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
    },
    itemDetailText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted || '#495057',
      fontFamily: 'BricolageGrotesque-Regular',
      flexWrap: 'wrap',
      alignSelf: 'stretch',
      width: '100%',
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
        fontWeight: '600',
        color: BORDER_COLOR,
        textAlign: 'center',
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
      top: PILL_SHADOW_OFFSET,
      left: PILL_SHADOW_OFFSET,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    portionIconPillContainer: {
      backgroundColor: '#FFA07A', // Colore originale della fiamma come sfondo
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
    portionValuePillWrapper: {
      position: 'relative',
      flex: 1,
      height: PILL_HEIGHT,
    },
    portionValuePillShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      position: 'absolute',
      top: PILL_SHADOW_OFFSET,
      left: PILL_SHADOW_OFFSET,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    portionValuePillContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: PILL_BORDER_RADIUS,
      borderWidth: PILL_BORDER_WIDTH,
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
      backgroundColor: '#fff', // Sfondo bianco per la riga
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      // alignItems: 'center', // Rimosso per controllo più granulare
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
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
      paddingHorizontal: 18, // Ridotto padding orizzontale per allineamento con x1
      paddingBottom: 12, // Aumentato padding inferiore
    },
    ingredientNameText: {
      fontSize: 16,
      fontWeight: '600',
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-SemiBold',
      flex: 1, // Aggiunto flex per gestire meglio lo spazio
    },
    ingredientDetailsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 0, 
      paddingVertical: 5, // Ridotto da 10
      width: '100%',
    },
    quantityIndicator: {
      fontSize: 16, // Aumentato dimensione per uniformità col nome
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-SemiBold',
      marginRight: 8,
    },
    quantityInputInName: {
      width: 30,
      textAlign: 'center',
      fontSize: 16,
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-SemiBold',
      marginRight: 8,
      backgroundColor: 'transparent',
      padding: 0,
    },
    quantityInputLabel: {
      fontSize: 16,
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-SemiBold',
      marginRight: 2,
    },
    ingredientNameTextInput: {
      fontSize: 16,
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-SemiBold',
      flex: 1,
      borderBottomWidth: 1,
      borderBottomColor: '#e0e0e0',
    },
    ingredientWeightText: {
      fontSize: 16,
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-SemiBold',
      minWidth: 30,
      textAlign: 'center',
    },
    ingredientCaloriesText: {
      fontSize: 15,
      color: colors.textMuted,
      fontFamily: 'BricolageGrotesque-Regular',
      marginLeft: 12,
      marginRight: 'auto', // Push the trash icon to the right
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
      minWidth: 80,
      maxWidth: 120,
      paddingVertical: 4, // Deve essere consistente con text sottostante se serve
      fontSize: 15,
      color: '#333',
      textAlign: 'right',
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
    // Stili per la quantità e gli input degli ingredienti
    quantityContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 10,
    },
    quantityText: {
      fontSize: 15,
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-SemiBold',
    },
    quantityInput: {
      width: 40,
      textAlign: 'center',
      fontSize: 15,
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-Regular',
      backgroundColor: 'transparent',
      padding: 0,
      minWidth: 30,
    },
    // Rinominato per evitare duplicati
    quantityPrefixText: {
      fontSize: 16,
      color: '#FF9900', // Colore arancione
      fontFamily: 'BricolageGrotesque-SemiBold',
      marginRight: 8,
    },
    quantityPrefixInput: {
      width: 20, // Ridotta la larghezza per eliminare lo spazio
      textAlign: 'left', // Allineato a sinistra invece che al centro
      fontSize: 16,
      color: '#FF9900', // Colore arancione
      fontFamily: 'BricolageGrotesque-SemiBold',
      marginRight: 0, // Rimosso margine a destra
      backgroundColor: 'transparent',
      padding: 0,
    },
    quantityPrefixLabel: {
      fontSize: 16,
      color: '#FF9900', // Colore arancione
      fontFamily: 'BricolageGrotesque-SemiBold',
      marginRight: 0, // Rimosso lo spazio tra "x" e il numero
    },
    ingredientNameInput: {
      fontSize: 16,
      color: BORDER_COLOR,
      fontFamily: 'BricolageGrotesque-SemiBold',
      flex: 1,
    },
    // Nuovi stili per input con container grigio
    weightInputTouchable: {
      minWidth: 80,
      maxWidth: 120,
      paddingVertical: 5,
      paddingHorizontal: 0,
      justifyContent: 'center',
    },
    weightInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e0e0e0',
      backgroundColor: '#fff',
      minHeight: 40,
      justifyContent: 'center',
    },
    weightInputContainerFocused: {
      backgroundColor: '#f8f8f8',
      borderColor: colors.primary,
      padding: 8,
      borderRadius: 8,
    },
    weightDisplayContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    nameInputContainer: {
      flex: 1,
      borderRadius: 6,
    },
    nameInputContainerFocused: {
      backgroundColor: '#f0f0f0',
      padding: 6,
      borderRadius: 6,
    },
    infoText: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'left',
      marginTop: 4,
      marginBottom: 2, // Spazio prima dei pulsanti
      marginLeft: 5, // Aggiungiamo un po' di spazio a sinistra
      fontFamily: 'BricolageGrotesque-Regular',
    },
    trashIconButton: {
      padding: 8,
      marginLeft: 5,
    },
    scoreSkeletonContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 15,
    },
    scoreSkeletonTitle: {
      width: 20,
      height: 20,
      backgroundColor: colors.textMuted + '30',
      borderRadius: 10,
      marginRight: 5,
    },
    scoreSkeletonValue: {
      width: 30,
      height: 16,
      backgroundColor: colors.textMuted + '30',
      borderRadius: 8,
    },
    descriptionSkeletonContainer: {
      marginTop: 15,
      paddingHorizontal: 15,
    },
    descriptionSkeletonLine: {
      height: 12,
      backgroundColor: colors.textMuted + '30',
      borderRadius: 6,
      marginBottom: 8,
    },
    loadingAnimationContainer: {
      marginTop: 20,
      marginHorizontal: 5, // Cambiato da 15 a 20 per allinearsi con il resto
      marginBottom: 20,
      position: 'relative',
      zIndex: 1,
    },
    loadingCard: {
      backgroundColor: '#FFFFFF', // Cambiato da CARD_BACKGROUND_COLOR a bianco fisso
      borderRadius: 15,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      padding: 25,
      shadowColor: BORDER_COLOR,
      shadowOffset: { width: SHADOW_OFFSET_VALUE, height: SHADOW_OFFSET_VALUE },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 5,
    },
    loadingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
    },
    loadingIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${colors.primary}20`,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    loadingTitle: {
      fontSize: 18,
      fontFamily: 'BricolageGrotesque-SemiBold',
      color: colors.text,
    },
    loadingMessage: {
      fontSize: 16,
      fontFamily: 'BricolageGrotesque-Medium',
      color: colors.text, // Cambiato da colors.textMuted a colors.text per colore fisso
      textAlign: 'center',
      marginTop: 15,
      minHeight: 20,
      lineHeight: 22,
    },
    progressBarContainer: {
      marginBottom: 20,
    },
    progressBarBackground: {
      height: 6,
      backgroundColor: '#E0E0E0',
      borderRadius: 3,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: '#D0D0D0',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    dotsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginHorizontal: 4,
    },
    loadingSpinner: {
    },
    loadingContent: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 80,
    },
    // Stili per lo skeleton text (nome e marca durante loading foto)
    skeletonTextContainer: {
      marginVertical: 4,
    },
    skeletonText: {
      backgroundColor: colors.textMuted + '30',
      borderRadius: 6,
      // width e height verranno impostate inline
    },

    // STILI PER IL LOADING PULITO E MINIMALISTA
    cleanLoadingContainer: {
      marginTop: 0, // Ridotto drasticamente da 20 a 8 per avvicinarlo al container sopra
      marginHorizontal: 0, // Allineato con topCardWrapper e altri elementi
      marginBottom: 20,
    },
    cleanLoadingCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      padding: 18, // Ridotto da 24 a 18 per allineamento con topCardContainer
      alignItems: 'center',
      shadowColor: BORDER_COLOR,
      shadowOffset: { width: SHADOW_OFFSET_VALUE, height: SHADOW_OFFSET_VALUE },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 3,
    },
    cleanIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: `${colors.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12, // Ridotto da 16 a 12
      borderWidth: 1,
      borderColor: `${colors.primary}30`,
    },
    cleanLoadingMessage: {
      fontSize: 16,
      fontFamily: 'BricolageGrotesque-SemiBold',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 16, // Ridotto da 20 a 16
      lineHeight: 22,
    },
    cleanProgressContainer: {
      width: '100%',
      marginBottom: 12, // Ridotto da 16 a 12
    },
    cleanProgressBackground: {
      height: 4,
      backgroundColor: '#F0F0F0',
      borderRadius: 2,
      overflow: 'hidden',
    },
    cleanProgressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    cleanDotsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cleanDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primary,
      marginHorizontal: 3,
    },

    // NUOVI STILI PER IL DESIGN MODERNO DEI VALORI NUTRIZIONALI
    modernNutritionSection: {
      paddingVertical: 20,
      paddingHorizontal: 0, // Rimosso padding per uniformare con il resto
    },
    
    // Header della sezione nutrizionale - RIMOSSO PERCHE' NON SERVE PIU'
    
    nutritionModernTitle: {
      fontSize: 18, // Ridotto da 22 a 18 per uniformare
      fontFamily: 'BricolageGrotesque-Bold',
      flex: 1,
      textAlign: 'left',
    },

    // Nuovo container grande per i valori nutrizionali
    nutritionMainCardWrapper: {
      position: 'relative',
      marginBottom: 20,
      marginTop: 0, // Ridotto da 12 a 0 per uniformare con le altre sezioni
    },
    nutritionMainCardShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 16,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    nutritionMainCardContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: 16,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      paddingTop: 24, // Mantengo 24 per il top
      paddingBottom: 0, // Rimosso padding fisso - verrà gestito dinamicamente
      paddingHorizontal: 20,
      position: 'relative',
      zIndex: 1,
    },
    nutritionGridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    nutritionItemWrapper: {
      width: '48%', // Due colonne
      marginBottom: 28, // Aumentato da 20 a 28 per più spazio tra le righe
    },
    // Nuovo stile per valori secondari (più piccoli, 3 per riga)
    nutritionItemWrapperSecondary: {
      width: '31%', // Tre colonne per i valori secondari
      marginBottom: 16,
    },
    nutritionItemContent: {
      alignItems: 'center',
    },
    nutritionIconContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 0,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    // Icona più piccola per valori secondari
    nutritionIconContainerSecondary: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 0,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 6,
    },
    nutritionValueText: {
      fontSize: 18,
      fontFamily: 'BricolageGrotesque-Bold',
      color: BORDER_COLOR,
      textAlign: 'center',
      marginBottom: 4,
    },
    // Testo più piccolo per valori secondari
    nutritionValueTextSecondary: {
      fontSize: 15,
      fontFamily: 'BricolageGrotesque-Bold',
      color: BORDER_COLOR,
      textAlign: 'center',
      marginBottom: 3,
    },
    nutritionLabelText: {
      fontSize: 13,
      fontFamily: 'BricolageGrotesque-Medium',
      color: colors.textMuted,
      textAlign: 'center',
    },
    // Label più piccola per valori secondari
    nutritionLabelTextSecondary: {
      fontSize: 11,
      fontFamily: 'BricolageGrotesque-Medium',
      color: colors.textMuted,
      textAlign: 'center',
    },
    nutritionProgressContainer: {
      width: '100%',
      height: 4,
      backgroundColor: 'rgba(0,0,0,0.1)',
      borderRadius: 2,
      marginTop: 8,
      overflow: 'hidden',
    },
    nutritionProgressFill: {
      height: '100%',
      borderRadius: 2,
    },

    // Grid principale 2x2 per i valori primari - RIMOSSO
    primaryNutrientsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    primaryNutrientCardWrapper: {
      position: 'relative',
      width: '48%', // Due colonne con piccolo gap
      marginBottom: 15,
      height: 140,
    },
    primaryNutrientCardShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 18,
      position: 'absolute',
      top: 2, // Ridotto da 4 a 2
      left: 2, // Ridotto da 4 a 2
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    primaryNutrientCardContainer: {
      borderRadius: 18,
      borderWidth: 2.5,
      borderColor: BORDER_COLOR,
      width: '100%',
      height: '100%',
      padding: 12,
      justifyContent: 'space-between',
      position: 'relative',
      zIndex: 1,
    },
    primaryNutrientCardHeader: {
      alignItems: 'flex-end',
      marginBottom: 5,
    },
    primaryNutrientIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: '#000000',
    },
    primaryNutrientValueContainer: {
      alignItems: 'center',
      marginVertical: 5,
    },
    primaryNutrientValue: {
      fontSize: 24,
      fontFamily: 'BricolageGrotesque-Bold',
      color: '#000000',
      textAlign: 'center',
    },
    primaryNutrientProgressContainer: {
      position: 'relative',
      height: 6,
      backgroundColor: 'rgba(0,0,0,0.2)',
      borderRadius: 3,
      marginVertical: 8,
      overflow: 'hidden',
    },
    primaryNutrientProgressTrack: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.1)',
    },
    primaryNutrientProgressFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: '#000000',
      borderRadius: 3,
    },
    primaryNutrientLabel: {
      fontSize: 13,
      fontFamily: 'BricolageGrotesque-SemiBold',
      color: '#000000',
      textAlign: 'center',
      marginTop: 2,
      paddingBottom: 4, // Aggiunto padding inferiore
    },

    // Sezione secondaria per valori nutrizionali dettagliati
    secondaryNutrientsSection: {
      marginTop: 10,
      paddingHorizontal: 5,
    },
    secondaryNutrientsTitle: {
      fontSize: 18,
      fontFamily: 'BricolageGrotesque-Bold',
      color: BORDER_COLOR,
      marginBottom: 15,
      paddingLeft: 5,
    },
    secondaryNutrientsContainer: {
      // Container per le righe secondarie
    },
    secondaryNutrientRowWrapper: {
      position: 'relative',
      marginBottom: 12,
      height: 65, // Aumentato da 55 a 65 per il padding aggiuntivo
    },
    secondaryNutrientRowShadow: {
      backgroundColor: BORDER_COLOR,
      borderRadius: 12,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE-1, // Uso la costante globale invece di 1
      left: SHADOW_OFFSET_VALUE-1, // Uso la costante globale invece di 1
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    secondaryNutrientRowContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: 12,
      borderWidth: CARD_BORDER_WIDTH, // Uso la costante globale invece di 1.5
      borderColor: BORDER_COLOR,
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 16, // Aumentato da implicito a 16 per più respiro
      position: 'relative',
      zIndex: 1,
    },
    secondaryNutrientIcon: {
      width: 35,
      height: 35,
      borderRadius: 17.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      borderWidth: 1.5,
      borderColor: BORDER_COLOR,
    },
    secondaryNutrientContent: {
      flex: 1,
    },
    secondaryNutrientInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    secondaryNutrientLabel: {
      fontSize: 15,
      fontFamily: 'BricolageGrotesque-SemiBold',
      color: BORDER_COLOR,
      flex: 1,
    },
    secondaryNutrientValue: {
      fontSize: 14,
      fontFamily: 'BricolageGrotesque-Medium',
      color: BORDER_COLOR,
    },
    secondaryNutrientProgressContainer: {
      position: 'relative',
      height: 4,
      backgroundColor: 'rgba(0,0,0,0.1)',
      borderRadius: 2,
      overflow: 'hidden',
    },
    secondaryNutrientProgressTrack: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.1)',
    },
    secondaryNutrientProgressFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      borderRadius: 2,
      // Il colore viene settato dinamicamente in base al nutriente
    },
    // Stili per il pulsante tracking calorie
    trackingButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 14,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderRadius: 12,
      borderColor: '#00463b',
      backgroundColor: 'rgba(0, 70, 59, 0.05)',
      marginVertical: 16,
      marginHorizontal: 0,
    },
    trackingButtonText: {
      color: '#00463b',
      fontSize: 16,
      fontFamily: 'BricolageGrotesque-SemiBold',
      marginLeft: 8,
    },
    // Modal Styles
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    modalWrapper: {
      backgroundColor: CARD_BACKGROUND_COLOR,
      borderRadius: 20,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: -2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 10,
    },
    modalContent: {
      padding: 20,
      paddingBottom: 24,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: 'BricolageGrotesque-Bold',
      color: BORDER_COLOR,
    },
    modalCloseButton: {
      padding: 4,
    },
    modalProductInfo: {
      marginBottom: 16,
    },
    modalProductName: {
      fontSize: 16,
      fontFamily: 'BricolageGrotesque-SemiBold',
      color: BORDER_COLOR,
      marginBottom: 4,
    },
    modalProductBrand: {
      fontSize: 14,
      fontFamily: 'BricolageGrotesque-Regular',
      color: '#666666',
    },
    quantityInputContainer: {
      marginBottom: 16,
    },
    quantityLabel: {
      fontSize: 16,
      fontFamily: 'BricolageGrotesque-SemiBold',
      color: BORDER_COLOR,
      marginBottom: 8,
    },
    quantityInputField: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F8F9FA',
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#E0E0E0',
      paddingHorizontal: 16,
      marginBottom: 4,
    },
    quantityModalInput: {
      flex: 1,
      fontSize: 18,
      fontFamily: 'BricolageGrotesque-Regular',
      paddingVertical: 14,
      color: BORDER_COLOR,
    },
    quantityUnit: {
      fontSize: 16,
      fontFamily: 'BricolageGrotesque-Medium',
      color: '#666666',
      marginLeft: 8,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 4,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#E0E0E0',
      backgroundColor: '#F8F9FA',
      alignItems: 'center',
    },
    cancelButtonText: {
      color: '#666666',
      fontSize: 16,
      fontFamily: 'BricolageGrotesque-SemiBold',
    },
    confirmButton: {
      flex: 1,
      backgroundColor: '#00463b',
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#00463b',
      paddingVertical: 14,
      alignItems: 'center',
    },
    confirmButtonDisabled: {
      opacity: 0.6,
    },
    confirmButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: 'BricolageGrotesque-SemiBold',
    },
    // Stili per l'informativa del diario
    diaryNoticeWrapper: {
      marginHorizontal: 0,
      marginTop: -2, // Ridotto - stesso padding tra titolo e container come Punteggio Salute
      marginBottom: 16, // Padding verso i componenti sotto
    },
    diaryNoticeContainer: {
      backgroundColor: '#FFF8E1',
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: '#FF9900',
      padding: 16,
    },
    diaryNoticeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    diaryNoticeTitle: {
      fontSize: 16,
      fontFamily: 'BricolageGrotesque-SemiBold',
      color: '#000000',
      marginLeft: 8,
    },
    diaryNoticeText: {
      fontSize: 14,
      fontFamily: 'BricolageGrotesque-Regular',
      color: '#333333',
      lineHeight: 20,
    },
  })

  // --- LOG CONDIZIONI DI RENDERING --- 
  // Rimuoviamo il log qui perché le variabili potrebbero non essere definite
  // console.log(...)



  // 2. Se stiamo caricando i dati iniziali OPPURE se AI è attiva ma non abbiamo ancora i dati base 
  //    (es. navigazione da recenti senza dati pre-caricati)
  //    Mostriamo un indicatore di caricamento generico.
  if (loadingInitialData || (isAiLoading && !aiAnalysis && !displayProductInfo)) {
     console.log(`[DETAIL RENDER] Mostro Loader Iniziale/Attesa Dati: loadingInitialData=${loadingInitialData}, isAiLoading=${isAiLoading}, !aiAnalysis=${!aiAnalysis}, !displayProductInfo=${!displayProductInfo}`);
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: BACKGROUND_COLOR }]}>
        <StatusBar style="dark" backgroundColor={BACKGROUND_COLOR} />
        <ActivityIndicator size="large" color={colors.primary} />
         <Text style={{ marginTop: 10, color: colors.text, fontFamily: 'BricolageGrotesque-Regular' }} allowFontScaling={false}>
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

  // Variabili per le calorie per porzione rimosse - campo suggestedPortionGrams eliminato

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
    
    // Se non abbiamo trovato calorie stimate - log rimosso per evitare spam
  } else {
    logCalories("Prodotto NON identificato come analizzato con foto, non mostreremo calorie stimate");
  }
  
  // Gestione porzione/calorie per prodotti con barcode rimossa - campo suggestedPortionGrams eliminato
  // Fine dichiarazioni variabili

  // --- Creazione Score Items --- 
  const healthScoreItems: ScoreItem[] = [];
  const healthNeutralItems: ScoreItem[] = [];
  const sustainabilityScoreItems: ScoreItem[] = [];
  const sustainabilityNeutralItems: ScoreItem[] = [];

  // Nutri-Score (Sezione Salute)
  if (nutritionGrade && typeof nutritionGrade === 'string' && nutritionGrade.toLowerCase() !== 'unknown') {
    let classification: ScoreItem['classification'] = 'neutral';
    const gradeUpper = nutritionGrade.toUpperCase();
    if (['A+', 'A', 'B'].includes(gradeUpper)) classification = 'positive'; // Aggiunto A+
    else if (['D', 'E'].includes(gradeUpper)) classification = 'negative';
    
    // Ottieni la descrizione standard per questo Nutri-Score
    const standardDescription = NUTRI_SCORE_DESCRIPTIONS[gradeUpper];
    const aiExplanation = standardDescription ? standardDescription.detail : "Descrizione non disponibile per questo punteggio.";
    
    const nutriItem: ScoreItem = {
      id: 'nutri-score',
      title: `Nutri-Score: ${gradeUpper}`,
      classification: classification,
      scoreType: 'nutri',
      originalValue: gradeUpper,
      scale: ['A', 'B', 'C', 'D', 'E'], // La scala visualizzata rimane A-E
      valueType: 'letter',
      aiExplanation: aiExplanation,
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

        // Ottieni la descrizione standard per questo NOVA Group
        const standardDescription = NOVA_DESCRIPTIONS[novaValueStr];
        const aiExplanation = standardDescription ? standardDescription.detail : "Descrizione non disponibile per questo gruppo NOVA.";

        const novaItem: ScoreItem = {
            id: 'nova-group',
            title: `Gruppo NOVA: ${novaValueNum}`,
            classification: classification,
            scoreType: 'nova',
            originalValue: novaValueNum, // Usiamo il numero
            scale: [1, 2, 3, 4],
            valueType: 'number',
            aiExplanation: aiExplanation,
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

    // Ottieni la descrizione standard per questo Eco-Score
    const standardDescription = ECO_SCORE_DESCRIPTIONS[gradeUpper];
    const aiExplanation = standardDescription ? standardDescription.detail : "Descrizione non disponibile per questo punteggio ambientale.";

    const ecoItem: ScoreItem = {
        id: 'eco-score',
        title: `Eco-Score: ${gradeUpper}`,
        classification: classification,
        scoreType: 'eco',
        originalValue: gradeUpper,
        scale: ['A', 'B', 'C', 'D', 'E'], // La scala visualizzata rimane A-E
        valueType: 'letter',
        aiExplanation: aiExplanation,
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
    
    // Aggiungi classification='neutral' ai neutrals standard
    ...(aiAnalysis?.neutrals ? parseJsonArrayField(aiAnalysis.neutrals).map(item => ({ ...item, classification: 'neutral' as const })) : []),
    // Aggiungi gli ScoreItem neutri
    ...healthNeutralItems,
    
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
    
    // Aggiungi classification='neutral' ai neutrals standard
    ...(aiAnalysis?.sustainabilityNeutrals ? parseJsonArrayField(aiAnalysis.sustainabilityNeutrals).map(item => ({ ...item, classification: 'neutral' as const })) : []),
    // Aggiungi gli ScoreItem neutri
    ...sustainabilityNeutralItems,
    
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
                const isScoreItem = typeof itemData === 'object' && itemData !== null && 'classification' in itemData && 'scoreType' in itemData; // Raffinato check per ScoreItem
                
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
                            <Text style={styles.itemCardTitleText} allowFontScaling={false}>{itemTitle}</Text>
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
                            itemDetail ? <Text style={styles.itemDetailText} allowFontScaling={false}>{itemDetail}</Text> : null
                            )}
                            {isScoreItem && scoreItemData && (
                                <Text style={[styles.itemDetailText, { marginTop: 20 }]} allowFontScaling={false}> 
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
  const handleWeightChange = (ingredientId: string, newWeightText: string) => { 
    logCalories(`handleWeightChange: id=${ingredientId}, newWeightText=${newWeightText}`);
    // Replace both comma and dot with dot for international number formatting
    const newWeight = parseFloat(newWeightText.replace(',', '.'));

    // Validazione più gentile - ritorna se non è un numero ma non mostra alert
    // Mostrerà alert solo quando l'utente finisce la modifica con un valore non valido
    if (isNaN(newWeight)) {
      return;
    }
    
    // Validazione stretta solo per valori fuori intervallo consentito
    if (newWeight <= 0 || newWeight > 999) {
      logCalories("Peso non valido (<=0 o >999), non aggiorno e mostro alert.");
      // Alert più amichevole
      Alert.alert(
        "Valore non valido", 
        "Inserisci un peso tra 1 e 999 grammi."
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
            
            // Calcola anche i nuovi valori nutrizionali proporzionalmente
            const originalProteins = originalIngredient.estimated_proteins_g || 0;
            const originalCarbs = originalIngredient.estimated_carbs_g || 0;
            const originalFats = originalIngredient.estimated_fats_g || 0;
            
            const newCalculatedProteins = Number(((originalProteins / originalWeight) * newWeight).toFixed(1));
            const newCalculatedCarbs = Number(((originalCarbs / originalWeight) * newWeight).toFixed(1));
            const newCalculatedFats = Number(((originalFats / originalWeight) * newWeight).toFixed(1));
            
            logCalories(`Ricalcolo per ${ing.name}: origKcal=${originalCalories}, origPeso=${originalWeight}, newPeso=${newWeight}, newKcal=${newCalculatedCalories}`);
            return { 
              ...ing, 
              estimated_weight_g: newWeight, 
              estimated_calories_kcal: newCalculatedCalories, 
              quantity: ing.quantity || 1,
              estimated_proteins_g: newCalculatedProteins,
              estimated_carbs_g: newCalculatedCarbs,
              estimated_fats_g: newCalculatedFats
            };
          } else {
            // Se non troviamo l'originale o il peso originale era 0, non possiamo ricalcolare proporzionalmente
            // Manteniamo le calorie originali o le impostiamo a 0 se non disponibili
            logCalories(`Impossibile ricalcolare proporzionalmente per ${ing.name}, peso originale 0 o non trovato.`);
            return { ...ing, estimated_weight_g: newWeight, estimated_calories_kcal: ing.estimated_calories_kcal, quantity: ing.quantity || 1 }; 
          }
        }
        return ing;
      });

      // Ricalcola il totale
      const newTotal = updatedIngredients.reduce((acc, curr) => acc + (curr.estimated_calories_kcal * (curr.quantity || 1)), 0);
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
      
      // Ricalcola il totale considerando la quantità
      const newTotal = updatedIngredients.reduce((acc, curr) => acc + (curr.estimated_calories_kcal * (curr.quantity || 1)), 0);
      logCalories("Nuovo totale calorie dopo rimozione:", newTotal);
      setTotalEstimatedCalories(newTotal);
      // Imposta la flag di modifiche non salvate
      setHasUnsavedChanges(true);
      return updatedIngredients.length > 0 ? updatedIngredients : null; // Se l'array diventa vuoto, impostalo a null
    });
  };

  // Modifico la funzione renderIngredientsEditor per migliorare il layout della card
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
          <Text style={styles.ingredientsEditorTitle} allowFontScaling={false}>Componenti del pasto</Text>
          <View style={{flexDirection: 'row'}}>
            {isSavingIngredients && (
                    <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>
        </View>

        {/* Informativa per prodotti da analisi foto aperti dal diario */}
        {openedFromDiary && (
          <View style={styles.diaryNoticeWrapper}>
            <View style={styles.diaryNoticeContainer}>
              <View style={styles.diaryNoticeHeader}>
                <Ionicons name="information-circle" size={20} color="#FF9900" />
                <Text style={styles.diaryNoticeTitle} allowFontScaling={false}>Informazione Importante</Text>
              </View>
              <Text style={styles.diaryNoticeText} allowFontScaling={false}>
                Eventuali componenti aggiunti o porzioni modificate dopo l'inserimento nel diario 
                potrebbero aver cambiato i valori nutrizionali rispetto a quelli originariamente registrati.
              </Text>
            </View>
          </View>
        )}

        {/* Ingredienti con nuovo stile card con ombra direzionata */}
        {editableIngredients.map((ingredient, index) => (
          <View key={ingredient.id || `ing-${index}`} style={styles.ingredientCardWrapper}>
            <View style={styles.ingredientCardShadow} />
            <View style={styles.ingredientCardContainer}>
              {/* Nome ingrediente con indicatore di quantità sulla stessa riga */}
              <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', paddingBottom: 8, marginBottom: 5, paddingTop: 20 }}>

                <Text style={styles.quantityPrefixText} allowFontScaling={false}>x{ingredient.quantity || 1}</Text>
              <Text style={styles.ingredientNameText} allowFontScaling={false}>{ingredient.name}</Text>
              </View>
              
              {/* Riga con grammi, kcal e pulsante elimina */}
              <View style={styles.ingredientDetailsRow}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  {/* Peso in grammi con freccia - layout migliorato con gestione focus */}
                  <TouchableOpacity 
                    style={styles.weightInputTouchable}
                    onPress={() => {
                      setWeightInputFocused(ingredient.id);
                      // Scorro alla posizione dell'input quando viene attivato
                      scrollToActiveComponent(`weight-${ingredient.id}`);
                    }}
                    activeOpacity={1}
                  >
                    <View 
                      style={[
                        styles.weightInputContainer,
                        weightInputFocused === ingredient.id && styles.weightInputContainerFocused
                      ]}
                      ref={(ref) => { 
                        if (ref) {
                          inputRefs.current[`weight-${ingredient.id}`] = ref;
                        }
                      }}
                    >
                      {weightInputFocused === ingredient.id ? (
                        <TextInput
                          style={styles.ingredientWeightText}
                          value={ingredient.estimated_weight_g.toString()}
                          onChangeText={(text) => handleWeightChange(ingredient.id, text)}
                          keyboardType="numeric"
                          autoFocus={true}
                          onBlur={() => {
                            setWeightInputFocused(null);
                            // Auto-save when blurring the input field
                            setTimeout(() => {
                              if (hasUnsavedChanges) {
                                handleSaveIngredients();
                              }
                            }, 500);
                          }}
                          selectTextOnFocus={true}
                        />
                      ) : (
                        <View style={styles.weightDisplayContainer}>
                          <Text style={styles.ingredientWeightText} allowFontScaling={false}>{ingredient.estimated_weight_g.toString()}</Text>
                          <Text style={{color: colors.text, fontFamily: 'BricolageGrotesque-Regular', marginLeft: 1}} allowFontScaling={false}>g</Text>
                          <Ionicons name="pencil-outline" size={14} color={colors.textMuted} style={{marginLeft: 4, marginRight: 0}} />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                
                {/* Calorie (senza container) */}
                <Text style={styles.ingredientCaloriesText} allowFontScaling={false}>~{Math.round(ingredient.estimated_calories_kcal)} kcal</Text>
                </View>
                
                {/* Icona cestino semplice */}
                <TouchableOpacity 
                  onPress={() => handleRemoveIngredient(ingredient.id)} 
                  style={styles.trashIconButton}
                >
                  <Ionicons name="trash" size={18} color="#dc3545" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
        
        {isAddingIngredient ? (
          <View style={[styles.ingredientCardWrapper, {marginTop: 3}]}>
            <View style={styles.ingredientCardShadow} />
            <View style={styles.ingredientCardContainer}>
              <View 
                style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 16}}
                ref={(ref) => { 
                  if (ref) {
                    inputRefs.current['new-ingredient-form'] = ref;
                  }
                }}
              >
                <Text style={{fontSize: 18, fontWeight: '600', color: BORDER_COLOR, fontFamily: 'BricolageGrotesque-Bold'}} allowFontScaling={false}>Nuovo componente</Text>
                <TouchableOpacity 
                  onPress={() => {
                    setIsAddingIngredient(false);
                    setNewIngredientName("");
                    setNewIngredientWeight("");
                    setNewIngredientQuantity("1");
                  }}
                  style={{padding: 4}}
                >
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Nome componente con hint chiaro */}
              <View style={{marginBottom: 16}}>
                <Text style={{fontSize: 14, color: colors.textMuted, marginBottom: 6, fontFamily: 'BricolageGrotesque-Regular'}} allowFontScaling={false}>Cosa aggiungi?</Text>
              <TextInput 
                  style={{
                    borderWidth: 1,
                    borderColor: '#ddd',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                    color: BORDER_COLOR,
                    fontFamily: 'BricolageGrotesque-Regular',
                    backgroundColor: '#fafafa'
                  }}
                  placeholder="es. Petto di pollo, insalata, mozzarella..."
                value={newIngredientName}
                onChangeText={setNewIngredientName}
                  placeholderTextColor={'#aaa'}
                  autoFocus={true}
                  onFocus={() => scrollToActiveComponent('new-ingredient-form')}
              />
              </View>
              
              {/* Riga con quantità e peso */}
              <View style={{flexDirection: 'row', marginBottom: 8}}>
                {/* Quantità */}
                <View style={{flex: 1}}>
                  <Text style={{fontSize: 14, color: colors.textMuted, marginBottom: 6, fontFamily: 'BricolageGrotesque-Regular'}} allowFontScaling={false}>Quantità</Text>
                  <View style={{flexDirection: 'row', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fafafa', alignItems: 'center', overflow: 'hidden'}}>
                <TextInput
                      style={{paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: BORDER_COLOR, fontFamily: 'BricolageGrotesque-Regular', flex: 1}}
                      value={newIngredientQuantity}
                      onChangeText={setNewIngredientQuantity}
                      keyboardType="numeric"
                      placeholder="1"
                      placeholderTextColor={'#aaa'}
                      selectTextOnFocus={true}
                      onFocus={() => scrollToActiveComponent('new-ingredient-form')}
                    />
                    <View style={{width: 36, borderLeftWidth: 1, borderLeftColor: '#ddd', height: '100%'}}>
                      <TouchableOpacity 
                        style={{alignItems: 'center', justifyContent: 'center', height: 20}}
                        onPress={() => {
                          const currentQty = parseInt(newIngredientQuantity || "1");
                          setNewIngredientQuantity(Math.min(currentQty + 1, 99).toString());
                        }}
                      >
                        <Ionicons name="chevron-up" size={16} color={BORDER_COLOR} />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={{alignItems: 'center', justifyContent: 'center', height: 20}}
                        onPress={() => {
                          const currentQty = parseInt(newIngredientQuantity || "1");
                          if (currentQty > 1) {
                            setNewIngredientQuantity((currentQty - 1).toString());
                          }
                        }}
                      >
                        <Ionicons name="chevron-down" size={16} color={BORDER_COLOR} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Spazio tra i campi */}
                <View style={{width: 20}} />
                
                {/* Peso */}
                <View style={{flex: 1}}>
                  <Text style={{fontSize: 14, color: colors.textMuted, marginBottom: 6, fontFamily: 'BricolageGrotesque-Regular'}} allowFontScaling={false}>Peso (g)</Text>
                  <View style={{flexDirection: 'row', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fafafa', alignItems: 'center', paddingHorizontal: 12}}>
                    <TextInput
                      style={{paddingVertical: 10, paddingRight: 4, fontSize: 16, color: BORDER_COLOR, fontFamily: 'BricolageGrotesque-Regular', flex: 1}}
                  value={newIngredientWeight}
                  onChangeText={setNewIngredientWeight}
                  keyboardType="numeric"
                      placeholder="100"
                      placeholderTextColor={'#aaa'}
                      selectTextOnFocus={true}
                      onFocus={() => scrollToActiveComponent('new-ingredient-form')}
                />
                    <Text style={{fontSize: 16, color: colors.textMuted, fontFamily: 'BricolageGrotesque-Regular'}} allowFontScaling={false}>g</Text>
                  </View>
                </View>
              </View>
              
              {/* Suggerimento e avvertenza peso */}
              <Text style={{fontSize: 13, color: colors.textMuted, fontFamily: 'BricolageGrotesque-Regular', marginBottom: 16}} allowFontScaling={false}>
                Se non specifichi il peso, verrà stimata una porzione media
              </Text>

              {/* Pulsante aggiungi */}
              <View style={{position: 'relative', marginBottom: 8}}>
                <View style={{position: 'absolute', top: 3, left: 3, backgroundColor: BORDER_COLOR, width: '100%', height: '100%', borderRadius: 8, zIndex: 0}} />
                  <TouchableOpacity 
                  style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: BORDER_COLOR, position: 'relative', zIndex: 1}}
                    onPress={handleConfirmAddIngredient}
                  >
                  <Ionicons name="checkmark-circle" size={22} color="#000" style={{marginRight: 8}} />
                  <Text style={{color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'BricolageGrotesque-SemiBold'}} allowFontScaling={false}>Aggiungi al pasto</Text>
                  </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={{marginTop: 8, marginBottom: 8}}>
            <TouchableOpacity 
              style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 12, backgroundColor: 'rgba(0, 123, 255, 0.05)'}}
              onPress={() => {
                setIsAddingIngredient(true);
                // Usiamo la funzione scrollToActiveComponent per coerenza
                setTimeout(() => {
                  scrollToActiveComponent('new-ingredient-form');
                }, 100);
              }}
            >
              <Ionicons name="add-circle" size={24} color={colors.primary} style={{marginRight: 8}}/>
              <Text style={{color: colors.primary, fontSize: 16, fontWeight: '600', fontFamily: 'BricolageGrotesque-SemiBold'}} allowFontScaling={false}>Aggiungi componente</Text>
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
    const weightString = newIngredientWeight.trim();
    let weight = parseFloat(weightString.replace(',', '.'));
    const quantity = parseInt(newIngredientQuantity || "1");

    if (weightString && (isNaN(weight) || weight <= 0 || weight > 999)) {
      Alert.alert("Peso non valido", "Il peso inserito deve essere maggiore di 0 e non superiore a 999 grammi. Lascia vuoto per una stima media.");
      return;
    }
    // Se il peso è vuoto o non un numero valido (ma non stringa vuota), l'AI userà una porzione media.
    // Passiamo undefined a getCaloriesForSingleIngredientFromGemini se il peso non è valido o è vuoto.
    const weightForAI = (weightString && !isNaN(weight) && weight > 0 && weight <= 999) ? weight : undefined;

    if (!name || isNaN(quantity) || quantity < 1) {
      Alert.alert("Input non valido", "Inserisci un nome e una quantità validi per l'ingrediente.");
      return;
    }
    setIsAddingIngredient(false); 
    logCalories(`handleConfirmAddIngredient: name=${name}, weightForAI=${weightForAI}, quantity=${quantity}`);
    setIsAiLoading(true);

    try {
      // Chiamata alla funzione aggiornata che restituisce un oggetto SingleIngredientEstimateResponse
      const aiResponse = await getCaloriesForSingleIngredientFromGeminiAiSdk(name, weightForAI);

      if (!aiResponse.success || aiResponse.estimated_calories_kcal === null || aiResponse.estimated_calories_kcal === undefined) {
        console.error("[ADD INGREDIENT AI ERROR]", aiResponse.error_message);
        Alert.alert(
          "Componente non registrato!", 
          aiResponse.error_message || "L'AI non è riuscita a elaborare questo componente."
        );
      } else {
        const newId = `user_${Date.now()}`;
        // Usa il nome inserito dall'utente
        const finalName = name;
        // Il peso da salvare nell'oggetto ingrediente è quello che l'utente ha inserito (o 0 se lasciato vuoto per stima media).
        // Se l'utente ha lasciato vuoto, l'AI ha stimato per una porzione media; dobbiamo decidere quale peso visualizzare.
        // Per ora, usiamo il peso che l'AI avrebbe usato per la stima (se non specificato dall'utente, potrebbe essere un default o uno calcolato dall'AI).
        // Questa parte potrebbe necessitare di ulteriore logica se l'AI restituisce anche il peso della porzione media usata.
        // Ai fini del calcolo qui, usiamo il peso inserito dall'utente (o 0 se non inserito) perché le calorie sono già stimate per quel contesto.
        const displayWeight = (weightString && !isNaN(weight) && weight > 0) ? weight : (aiResponse.estimated_calories_kcal && finalName ? 100 : 0); // Fallback a 100g se peso non dato ma calorie sì

        const newIngredient: EstimatedIngredient = {
          id: newId,
          name: finalName, // Nome inserito dall'utente
          estimated_weight_g: displayWeight, // Peso inserito o stimato
          estimated_calories_kcal: aiResponse.estimated_calories_kcal, // Calorie dall'AI
          quantity: quantity,
          // Aggiungi i nuovi valori nutrizionali
          estimated_proteins_g: aiResponse.estimated_proteins_g || 0,
          estimated_carbs_g: aiResponse.estimated_carbs_g || 0,
          estimated_fats_g: aiResponse.estimated_fats_g || 0
        };
        setEditableIngredients(prevIngredients => [...(prevIngredients || []), newIngredient]);
        setTotalEstimatedCalories(prevTotal => (prevTotal || 0) + (aiResponse.estimated_calories_kcal! * quantity));
        logCalories("Nuovo ingrediente (AI processed) aggiunto e totale aggiornato", newIngredient);
        setHasUnsavedChanges(true);
        setTimeout(() => {
          handleSaveIngredients();
        }, 100); 
      }
    } catch (error) {
      console.error("Errore durante l'aggiunta del nuovo ingrediente:", error);
      Alert.alert("Errore", "Si è verificato un problema durante l'aggiunta dell'ingrediente.");
    } finally {
      setIsAiLoading(false);
      setNewIngredientName("");
      setNewIngredientWeight("");
      setNewIngredientQuantity("1");
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
    const newCaloriesEstimateString = `Calorie stimate: ${totalEstimatedCalories} kcal`;
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
      
      // Ricalcola il totale considerando la quantità
      const totalCal = restoredIngredients.reduce((acc, ing) => acc + (ing.estimated_calories_kcal * (ing.quantity || 1)), 0);
      setTotalEstimatedCalories(totalCal);
      
      // Rimuovi la flag di modifiche non salvate
      setHasUnsavedChanges(false);
    } else {
      logCalories('Impossibile ripristinare: nessun ingrediente originale disponibile');
      Alert.alert("Info", "Nessuna modifica da annullare.");
    }
  };

  // Nuova funzione per gestire il cambio di quantità
  const handleQuantityChange = (ingredientId: string, newQuantityText: string) => {
    logCalories(`handleQuantityChange: id=${ingredientId}, newQuantityText=${newQuantityText}`);
    const newQuantity = parseInt(newQuantityText);

    if (isNaN(newQuantity) || newQuantity < 1) {
      logCalories("Quantità non valida, non aggiorno");
      return;
    }

    setEditableIngredients(prevIngredients => {
      if (!prevIngredients) return null;

      const updatedIngredients = prevIngredients.map(ing => {
        if (ing.id === ingredientId) {
          return { 
            ...ing, 
            quantity: newQuantity 
          };
        }
        return ing;
      });

      // Ricalcola il totale considerando la quantità
      const newTotal = updatedIngredients.reduce((acc, curr) => acc + (curr.estimated_calories_kcal * (curr.quantity || 1)), 0);
      logCalories("Nuovo totale calorie dopo cambio quantità:", newTotal);
      setTotalEstimatedCalories(newTotal);
      // Imposta la flag di modifiche non salvate
      setHasUnsavedChanges(true);
      return updatedIngredients;
    });
  };

  // Miglioro la funzione per calcolare lo scroll in modo più preciso
  const scrollToActiveComponent = (elementId: string) => {
    setTimeout(() => {
      const targetElement = inputRefs.current[elementId];
      const scrollViewElement = scrollViewRef.current;

      if (targetElement && scrollViewElement) {
        const targetNode = findNodeHandle(targetElement as any); // Usiamo 'as any' perché il tipo è complesso
        const scrollViewNode = findNodeHandle(scrollViewElement);

        if (targetNode && scrollViewNode) {
          console.log(`Trovato elemento ${elementId} e ScrollView. Misurazione in corso...`);
          
          UIManager.measureLayout(
            targetNode,
            scrollViewNode,
            () => { // RIMOSSO parametro 'error'
              console.error("Errore durante la misurazione del layout (failure callback).");
              // Fallback se la misurazione fallisce
              scrollViewRef.current?.scrollTo({ y: 500, animated: true }); 
            },
            (left: number, top: number, width: number, height: number) => {
              // 'top' è la posizione dell'elemento rispetto all'inizio dello ScrollView
              // Vogliamo che questa 'top' sia a 150px dal bordo superiore della finestra
              // Quindi, lo ScrollView deve scrollare fino a (top - 150)
              const scrollPosition = Math.max(0, top - 350); 
              
              console.log(`Elemento ${elementId} si trova a ${top}px dall'inizio dello ScrollView. Scroll a ${scrollPosition}px.`);
              
              scrollViewRef.current?.scrollTo({
                y: scrollPosition,
                animated: true,
              });
            }
          );
        } else {
          console.warn(`Impossibile ottenere i NodeHandle per l'elemento ${elementId} o lo ScrollView.`);
          const fallbackScroll = elementId === 'new-ingredient-form' ? 550 : 400;
          scrollViewRef.current?.scrollTo({ y: fallbackScroll, animated: true });
        }
      } else {
        console.warn(`Impossibile trovare l'elemento ${elementId} o lo ScrollView per lo scroll.`);
        const fallbackScroll = elementId === 'new-ingredient-form' ? 550 : 400;
        scrollViewRef.current?.scrollTo({ y: fallbackScroll, animated: true });
      }
    }, 150); // Timeout leggermente aumentato per dare tempo alla UI di stabilizzarsi
  };

  // Componente Skeleton per i punteggi
  const ScoreSkeleton = () => (
    <View style={styles.scoreSkeletonContainer}>
      <View style={styles.scoreSkeletonTitle} />
      <View style={styles.scoreSkeletonValue} />
    </View>
  );

  // Componente Skeleton per la descrizione
  const DescriptionSkeleton = () => (
    <View style={styles.descriptionSkeletonContainer}>
      <View style={styles.descriptionSkeletonLine} />
      <View style={[styles.descriptionSkeletonLine, { width: '80%' }]} />
      <View style={[styles.descriptionSkeletonLine, { width: '60%' }]} />
    </View>
  );

    // Componente per l'animazione di caricamento pulita e minimalista
  const LoadingAnimation = () => {
    const [dotOpacity, setDotOpacity] = useState(0.3);
    
    useEffect(() => {
      const interval = setInterval(() => {
        setDotOpacity(prev => prev === 0.3 ? 1 : 0.3);
      }, 800);
      
      return () => clearInterval(interval);
    }, []);

    // Funzione semplificata per ottenere solo l'icona
    const getStepIcon = (message: string) => {
      if (message.includes('Analisi immagine')) return 'camera-outline';
      if (message.includes('Riconoscimento')) return 'scan-outline';
      if (message.includes('valori nutrizionali')) return 'nutrition-outline';
      if (message.includes('punteggio salute')) return 'heart-outline';
      if (message.includes('raccomandazioni')) return 'bulb-outline';
      if (message.includes('Finalizzazione')) return 'checkmark-circle-outline';
      return 'refresh-outline';
    };
    
    return (
      <View style={styles.cleanLoadingContainer}>
        <View style={styles.cleanLoadingCard}>
          {/* Icona centrale semplice */}
          <View style={styles.cleanIconContainer}>
            <Ionicons 
              name={getStepIcon(currentLoadingMessage) as any} 
              size={28} 
              color={colors.primary} 
            />
          </View>
          
          {/* Messaggio principale */}
          <Text style={styles.cleanLoadingMessage} allowFontScaling={false}>
            {currentLoadingMessage}
          </Text>
          
          {/* Progress bar minimalista */}
          <View style={styles.cleanProgressContainer}>
            <View style={styles.cleanProgressBackground}>
              <View style={[
                styles.cleanProgressFill,
                { width: `${(loadingMessageIndex + 1) * (100 / 6)}%` }
              ]} />
            </View>
          </View>
          
          {/* Dots animati semplici */}
          <View style={styles.cleanDotsContainer}>
            <View style={[styles.cleanDot, { opacity: dotOpacity }]} />
            <View style={[styles.cleanDot, { opacity: dotOpacity * 0.7 }]} />
            <View style={[styles.cleanDot, { opacity: dotOpacity * 0.4 }]} />
          </View>
        </View>
      </View>
    );
  };

  // Rimosso il codice per le raccomandazioni

  // Riaggiunta della funzione renderNutritionTable
  const renderNutritionTable = (): React.ReactNode => {
    // Determina se i valori sono stimati dall'AI o provengono da OpenFoodFacts
    const isAiEstimated = !hasRealNutritionData() && (aiAnalysis?.healthScore !== undefined);
    
    // Determina se è un prodotto imbustato o un piatto/pasto
    const isPackagedProduct = isCurrentProductFromPhotoAnalysis && !editableIngredients;
    const isComposedMeal = isCurrentProductFromPhotoAnalysis && editableIngredients && editableIngredients.length > 0;
    
    // Seleziona il titolo appropriato
    let tableTitle = "Valori Nutrizionali (per 100g/100ml)";
    if (isAiEstimated && !isCurrentProductFromPhotoAnalysis) {
      tableTitle = "Valori Nutrizionali (per 100g - Stime AI)";
    } else if (isPackagedProduct) {
      tableTitle = "Valori Nutrizionali per 100g (Stime AI)";
    } else if (isComposedMeal) {
      tableTitle = "Valori Nutrizionali del pasto (Stime AI)";
    }
    
    const nutritionFields: Array<{ 
      label: string; 
      key: keyof ProductRecord | keyof NonNullable<RawProductData['nutriments']>; 
      unit: string;
      maxValue?: number; // Per calcolare la progress bar
    }> = [
      { label: "Energia", key: "energy_kcal_100g", unit: "kcal", maxValue: 900 },
      { label: "Proteine", key: "proteins_100g", unit: "g", maxValue: 50 },
      { label: "Carboidrati", key: "carbohydrates_100g", unit: "g", maxValue: 100 },
      { label: "Grassi", key: "fat_100g", unit: "g", maxValue: 50 },
    ];
    
    // Solo per dati reali da OpenFoodFacts, mostra tutti i campi nutrizionali
    if (!isAiEstimated && !isCurrentProductFromPhotoAnalysis) {
      nutritionFields.push(
        { label: "di cui Saturi", key: "saturated_fat_100g", unit: "g", maxValue: 30 },
        { label: "di cui Zuccheri", key: "sugars_100g", unit: "g", maxValue: 50 },
        { label: "Fibre", key: "fiber_100g", unit: "g", maxValue: 25 },
        { label: "Sale", key: "salt_100g", unit: "g", maxValue: 5 }
      );
    }

    // Preparazione dati per le cards
    const nutritionData = nutritionFields.map(field => {
          let value;
          
          if (isComposedMeal && editableIngredients) {
            // Per i pasti composti, calcoliamo la somma dai componenti
            if (field.key === "energy_kcal_100g" && totalEstimatedCalories) {
              // Per le calorie usiamo il totale già calcolato
              value = totalEstimatedCalories;
            } else {
              // Per proteine, carboidrati e grassi, calcoliamo la somma
              value = 0;
              
              if (field.key === "proteins_100g") {
                // Somma delle proteine di tutti i componenti, considerando la quantità
                value = editableIngredients.reduce((total, ing) => 
                  total + ((ing.estimated_proteins_g || 0) * (ing.quantity || 1)), 0);
              } else if (field.key === "carbohydrates_100g") {
                // Somma dei carboidrati di tutti i componenti, considerando la quantità
                value = editableIngredients.reduce((total, ing) => 
                  total + ((ing.estimated_carbs_g || 0) * (ing.quantity || 1)), 0);
              } else if (field.key === "fat_100g") {
                // Somma dei grassi di tutti i componenti, considerando la quantità
                value = editableIngredients.reduce((total, ing) => 
                  total + ((ing.estimated_fats_g || 0) * (ing.quantity || 1)), 0);
              }
              
              // Arrotonda a 1 decimale per i macronutrienti
              if (value !== 0) {
                value = Number(value.toFixed(1));
              }
            }
          } else {
            // Per altri prodotti, usa i valori esistenti o stimati
            if (isPackagedProduct && aiAnalysis) {
              // Per prodotti imbustati da foto, usa i valori stimati dall'AI
              if (field.key === "energy_kcal_100g") {
                value = aiAnalysis.estimated_energy_kcal_100g;
              } else if (field.key === "proteins_100g") {
                value = aiAnalysis.estimated_proteins_100g;
              } else if (field.key === "carbohydrates_100g") {
                value = aiAnalysis.estimated_carbs_100g;
              } else if (field.key === "fat_100g") {
                value = aiAnalysis.estimated_fats_100g;
              } else {
                value = getNutrimentValue(field.key);
              }
            } else {
              // Per prodotti con barcode o altri casi, usa i valori esistenti
              value = getNutrimentValue(field.key);
            }
          }
          
      return {
        ...field,
        value: value !== undefined && value !== null ? value : null
      };
    }).filter(item => item.value !== null); // Filtra solo i valori disponibili
          
    return (
      <View style={styles.modernNutritionSection}>
        {/* Titolo uniforme con gli altri titoli delle sezioni */}
        <Text style={styles.scoreSectionTitle} allowFontScaling={false}>
          {tableTitle}
        </Text>

        {/* Container principale moderno con tutti i valori nutrizionali */}
        <View style={styles.nutritionMainCardWrapper}>
          <View style={styles.nutritionMainCardShadow} />
          <View style={[
            styles.nutritionMainCardContainer,
            { 
              paddingBottom: nutritionData.some(n => ['saturated_fat_100g', 'sugars_100g', 'fiber_100g', 'salt_100g'].includes(n.key as string)) 
                ? 8   // Padding ridotto quando ci sono valori secondari
                : -5  // Padding negativo per ridurre ulteriormente lo spazio
            }
          ]}>
            <View style={[
              styles.nutritionGridContainer,
              {
                marginBottom: nutritionData.some(n => ['saturated_fat_100g', 'sugars_100g', 'fiber_100g', 'salt_100g'].includes(n.key as string)) 
                  ? 0   // Margin normale quando ci sono valori secondari
                  : -4 // Margin negativo per ridurre lo spazio quando ci sono solo valori principali
              }
            ]}>
              {nutritionData.map((nutrient, index) => {
                const progressPercentage = nutrient.maxValue 
                  ? Math.min((nutrient.value as number) / nutrient.maxValue * 100, 100) 
                  : 0;
                const iconColor = getNutrientIconColor(nutrient.key as string);
                
                // Determina se è un valore secondario (più piccolo)
                const isSecondary = ['saturated_fat_100g', 'sugars_100g', 'fiber_100g', 'salt_100g'].includes(nutrient.key as string);
                
                return (
                  <View 
                    key={nutrient.key} 
                    style={isSecondary ? styles.nutritionItemWrapperSecondary : styles.nutritionItemWrapper}
                  >
                    <View style={styles.nutritionItemContent}>
                      {/* Icona colorata */}
                      <View style={[
                        isSecondary ? styles.nutritionIconContainerSecondary : styles.nutritionIconContainer,
                        { backgroundColor: iconColor }
                      ]}>
                        <Ionicons 
                          name={getNutrientIconName(nutrient.key as string) as any} 
                          size={isSecondary ? 22 : 28} 
                          color="#000000" 
                        />
                      </View>
                      
                      {/* Valore */}
                      <Text style={isSecondary ? styles.nutritionValueTextSecondary : styles.nutritionValueText} allowFontScaling={false}>
                        {formatNutritionValue(nutrient.value as number, nutrient.unit)}
                      </Text>
                      
                      {/* Label */}
                      <Text style={isSecondary ? styles.nutritionLabelTextSecondary : styles.nutritionLabelText} allowFontScaling={false}>
                        {nutrient.label}
                      </Text>
                      
                      {/* Progress bar */}
                      <View style={styles.nutritionProgressContainer}>
                        <View style={[
                          styles.nutritionProgressFill,
                          { 
                            width: `${progressPercentage}%`,
                            backgroundColor: iconColor
                          }
                        ]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    );
  };



  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={BACKGROUND_COLOR} />
      <ScrollView contentContainerStyle={styles.scrollViewContent} ref={scrollViewRef}>
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

        {/* Pulsante Aggiungi al Tracking Calorie */}
        {displayProductInfo && !loadingInitialData && !showLoadingAnimation && (
          <TouchableOpacity 
            style={styles.trackingButton} 
            onPress={handleAddToTracking}
            disabled={addingToTracking}
          >
            {addingToTracking ? (
              <ActivityIndicator size="small" color="#00463b" />
            ) : (
              <Ionicons name="add-circle" size={20} color="#00463b" />
            )}
            <Text style={styles.trackingButtonText} allowFontScaling={false}>
              {addingToTracking ? 'Aggiungendo...' : 'Aggiungi al tracking calorie'}
            </Text>
          </TouchableOpacity>
        )}

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
                            />
        ) : (
                            <View style={styles.productImagePlaceholderInCard}>
                                <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
          </View>
        )}
        </View>

                    <View style={styles.topCardContent}>
                        {/* Nome prodotto con effetto loading per analisi foto */}
                        {isPhotoAnalysis && productRecordId === "temp_visual_scan" && !aiAnalysis ? (
                          <View style={styles.skeletonTextContainer}>
                            <View style={[styles.skeletonText, { width: '80%', height: 24 }]} />
                          </View>
                        ) : (
                          <Text style={styles.topCardProductName} numberOfLines={2} allowFontScaling={false}>
                            {productName || "Nome non disponibile"}
                          </Text>
                        )}
                        
                        {/* Marca con effetto loading per analisi foto */}
                        {isPhotoAnalysis && productRecordId === "temp_visual_scan" && !aiAnalysis ? (
                          <View style={styles.skeletonTextContainer}>
                            <View style={[styles.skeletonText, { width: '60%', height: 18, marginTop: 8 }]} />
                          </View>
                        ) : (
                          <Text style={styles.topCardBrandName} numberOfLines={1} allowFontScaling={false}>
                            {brandName || "Marca non disponibile"}
                          </Text>
                        )}
                        
                        {/* Punteggi o Skeleton */}
                        <View style={styles.scoresRowContainer}>
                          {((isProductFromBarcodeScan && isAiLoading && !aiAnalysis) || 
                            (isPhotoAnalysis && productRecordId === "temp_visual_scan" && !aiAnalysis)) ? (
                            // Mostra skeleton per i punteggi durante il caricamento
                            <>
                              <ScoreSkeleton />
                              <ScoreSkeleton />
                            </>
                          ) : (
                            // Mostra i punteggi reali
                            <>
                              {healthScoreForIcon !== undefined && (
                                <View style={styles.scoreIconTextContainer}>
                                  <Ionicons 
                                    name="heart" 
                                    size={18} 
                                    color={getScoreColor(healthScoreForIcon)} 
                                    style={styles.scoreIconStyle} 
                                  />
                                  <Text style={styles.scoreValueStyle} allowFontScaling={false}>
                                    {healthScoreForIcon}
                                  </Text>
                                </View>
                              )}
                              {(sustainabilityScoreForIcon !== undefined && sustainabilityScoreForIcon > 0 && !isCurrentProductFromPhotoAnalysis) && (
                                <View style={[styles.scoreIconTextContainer, { marginLeft: healthScoreForIcon !== undefined ? 15 : 0} ]}>
                                  <Ionicons 
                                    name="leaf" 
                                    size={18} 
                                    color={getScoreColor(sustainabilityScoreForIcon)} 
                                    style={styles.scoreIconStyle}
                                  />
                                  <Text style={styles.scoreValueStyle} allowFontScaling={false}>
                                    {sustainabilityScoreForIcon}
                                  </Text>
                                </View>
                              )}
                            </>
                          )}
                        </View>
          </View>
                </View>
                
                {/* Descrizione o Skeleton */}
                {isProductFromBarcodeScan && isAiLoading && !aiAnalysis ? (
                  <DescriptionSkeleton />
                ) : (
                  aiAnalysis && aiAnalysis.analysis && aiAnalysis.analysis.trim() !== "" && (
                    <Text style={styles.topCardProductSummaryText} allowFontScaling={false}>
                      {aiAnalysis.analysis}
                    </Text>
                  )
                )}
            </View>
      </View>
      

      
      {/* Animazione di caricamento per prodotti con barcode E analisi foto */}
      {showLoadingAnimation && (
        <View style={{ marginVertical: 10 }}>
          <LoadingAnimation />
        </View>
      )}

      {/* Editor ingredienti per prodotti da foto */}
      {isCurrentProductFromPhotoAnalysis && (
        <View style={{ 
          marginTop: aiAnalysis?.calorie_estimation_type === 'breakdown' ? 30 : 0 
        }}>
          {renderIngredientsEditor()}
        </View>
      )}
          
        {/* Sezione Analisi AI - Solo se NON c'è animazione di caricamento */}
        {showAiScores && !showLoadingAnimation ? (
          <View style={[styles.aiSectionWrapper, { 
            marginTop: isProductFromBarcodeScan ? 50 : 
                     (isCurrentProductFromPhotoAnalysis && aiAnalysis?.calorie_estimation_type === 'per_100g') ? 50 : 20 
          }]}>
                {/* Punteggio Salute Numerico */} 
                {aiAnalysis.healthScore !== undefined && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.scoreSectionTitle} allowFontScaling={false}>Punteggio Salute</Text>
                <View style={styles.scoreRowContainer}>
                  <View style={styles.numericScoreColumn}>
                    <View style={styles.scoreSquareCardWrapper}>
                                    {/* UNIFORM SHADOW/BORDER */}
                                    <View style={styles.scoreSquareCardShadow} /> 
                                    <View style={[styles.scoreSquareCard, { backgroundColor: getScoreColor(aiAnalysis.healthScore) }]}>
                        <Text style={styles.scoreValueTextLarge} allowFontScaling={false}>{aiAnalysis.healthScore}</Text>
        </View>
                    </View>
                  </View>
                </View>
              </View>
                )}

                {/* Dettagli Salute: Lista unica */} 
                {renderItemList(allHealthItems)}
                
                 {/* Punteggio Eco Numerico - NON MOSTRARE SE ANALISI FOTO */} 
                {aiAnalysis.sustainabilityScore !== undefined && aiAnalysis.sustainabilityScore > 0 && !isCurrentProductFromPhotoAnalysis && (
                    <View style={{marginTop: isProductFromBarcodeScan ? 50 : 30, marginBottom: 16}}> 
                <Text style={styles.scoreSectionTitle} allowFontScaling={false}>Punteggio Eco</Text>
                <View style={styles.scoreRowContainer}>
                  <View style={styles.numericScoreColumn}>
                    <View style={styles.scoreSquareCardWrapper}>
                                     {/* UNIFORM SHADOW/BORDER */}
                                    <View style={styles.scoreSquareCardShadow} /> 
                                    <View style={[styles.scoreSquareCard, { backgroundColor: getScoreColor(aiAnalysis.sustainabilityScore) }]}> 
                        <Text style={styles.scoreValueTextLarge} allowFontScaling={false}>{aiAnalysis.sustainabilityScore}</Text>
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

        {/* Valori nutrizionali per prodotti da analisi foto - PRIMA dell'analisi AI */}
        {isCurrentProductFromPhotoAnalysis && hasNutritionData() && !showLoadingAnimation && (
          <View style={{marginTop: 20}}>
            {renderNutritionTable()}
          </View>
        )}

        {/* Valori nutrizionali per prodotti con barcode - DOPO l'analisi AI */}
        {isProductFromBarcodeScan && hasNutritionData() && (aiAnalysis || !isAiLoading) && !showLoadingAnimation && (
          <View style={{marginTop: 30}}>
            {renderNutritionTable()}
          </View>
        )}
      </ScrollView>

      {/* Modal per selezione quantità */}
      <Modal
        visible={showQuantityModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuantityModal(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity 
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowQuantityModal(false)}
          >
            <TouchableOpacity 
              style={styles.modalWrapper}
              activeOpacity={1}
              onPress={() => {}} // Previene la chiusura quando si tocca il modal
            >
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle} allowFontScaling={false}>Inserisci Quantità</Text>
                  <TouchableOpacity
                    onPress={() => setShowQuantityModal(false)}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color="#666666" />
                  </TouchableOpacity>
                </View>

                {displayProductInfo && (
                  <View style={styles.modalProductInfo}>
                    <Text style={styles.modalProductName} allowFontScaling={false}>
                      {'product_name' in displayProductInfo ? displayProductInfo.product_name : (displayProductInfo as ProductRecord).product_name}
                    </Text>
                    {(('brands' in displayProductInfo && displayProductInfo.brands) || 
                      ('brand' in displayProductInfo && (displayProductInfo as ProductRecord).brand)) && (
                      <Text style={styles.modalProductBrand} allowFontScaling={false}>
                        {'brands' in displayProductInfo ? displayProductInfo.brands : (displayProductInfo as ProductRecord).brand}
                      </Text>
                    )}
                  </View>
                )}

                <View style={styles.quantityInputContainer}>
                  <Text style={styles.quantityLabel} allowFontScaling={false}>Quantità (grammi)</Text>
                  <View style={styles.quantityInputField}>
                    <TextInput
                      style={styles.quantityModalInput}
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="numeric"
                      placeholder="100"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleQuantityConfirm}
                    />
                    <Text style={styles.quantityUnit} allowFontScaling={false}>g</Text>
                  </View>
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setShowQuantityModal(false)}
                  >
                    <Text style={styles.cancelButtonText} allowFontScaling={false}>Annulla</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.confirmButton, addingToTracking && styles.confirmButtonDisabled]}
                    onPress={handleQuantityConfirm}
                    disabled={addingToTracking}
                  >
                    <Text style={styles.confirmButtonText} allowFontScaling={false}>
                      {addingToTracking ? 'Aggiungendo...' : 'Aggiungi'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

export default ProductDetailScreen;


