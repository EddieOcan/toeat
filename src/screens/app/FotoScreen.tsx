"use client"

import React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
  Image,
  Dimensions,
  StatusBar,
} from "react-native"
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { useTheme } from "../../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { CompositeScreenProps } from "@react-navigation/native"
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { AppStackParamList, MainTabsParamList } from "../../navigation"
// import BarcodeScannerView from "../../components/BarcodeScannerView" // RIMOSSO
import PhotoCameraView from "../../components/PhotoCameraView"
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  saveProductAndManageHistory,
  getScanHistory,
  uploadProductImage,
  generateVisualScanBarcode,
  // handleBarcodeScan, // RIMOSSO
  type ProcessedProductInfo,
  type DisplayableHistoryProduct,
  type RawProductData,
} from "../../services/api"
import { 
  analyzeImageWithGeminiVisionAiSdk, 
  analyzeImageWithUserPreferences,
  type GeminiAnalysisResult 
} from "../../services/gemini"
import { useAuth } from "../../contexts/AuthContext"
import * as FileSystem from "expo-file-system"
import AppText from "../../components/AppText"
import { typography } from "../../theme/typography"
import RecentProductsSection from "../../components/RecentProductsSection"
import { useRecentProducts } from "../../contexts/RecentProductsContext"
import { usePhotoAnalysis } from "../../contexts/PhotoAnalysisContext"
import { getScoreColor } from "../../utils/formatters"

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, "Foto">, // AGGIORNATO da "Home" a "Foto"
  NativeStackScreenProps<AppStackParamList>
>

const BACKGROUND_COLOR_FOTO = '#f8f4ec'; // Potrebbe essere diverso se vuoi
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Aggiungo le costanti mancanti
const RECENT_CARD_BORDER_WIDTH = 1.5;
const RECENT_SHADOW_OFFSET_VALUE = 3.5;

// Funzioni helper rimosse - ora si usa getScoreColor globale

const RECENT_SECTION_TITLE_HEIGHT = 50; 
const RECENT_LIST_ITEM_HEIGHT = 170;    
const PADDING_ABOVE_RECENT_LIST = 15; 
const BOTTOM_PADDING_FOR_LAYOUT = 8; // Aggiornato a 10 come in HomeScreen
const TAB_BAR_ESTIMATED_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

// Aggiungo la costante per il raggio di curvatura degli angoli
const WAVE_CORNER_RADIUS = 25;

const FotoScreen: React.FC<Props> = ({ navigation }) => {
  // TUTTI GLI HOOKS DI STATO ALL'INIZIO
  const [isFotoCameraActive, setIsFotoCameraActive] = useState(true);
  const [cameraViewHeight, setCameraViewHeight] = useState(screenHeight);
  
  // HOOKS DI CONTESTO
  const { colors } = useTheme(); 
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { reloadRecentProducts } = useRecentProducts();
  const { updateAnalysis, setIsAnalyzing, clearAnalysis } = usePhotoAnalysis();
  
  // REFS
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastReloadRef = useRef(0);
  
  // COSTANTI
  const RELOAD_DEBOUNCE_MS = 2000; // 2 secondi di debounce
  const MIN_RELOAD_INTERVAL = 5000; // Minimo 5 secondi tra reload

  // Funzione ottimizzata per il reload con debounce
  const debouncedReloadRecentProducts = useCallback(() => {
    const now = Date.now();
    
    // Se è troppo presto per un altro reload, ignora
    if (now - lastReloadRef.current < MIN_RELOAD_INTERVAL) {
      console.log('[FOTO SCREEN] Reload ignorato - troppo presto');
      return;
    }
    
    // Cancella il timeout precedente se esiste
    if (reloadTimeoutRef.current) {
      clearTimeout(reloadTimeoutRef.current);
    }
    
    // Imposta un nuovo timeout
    reloadTimeoutRef.current = setTimeout(() => {
      reloadRecentProducts();
      lastReloadRef.current = Date.now();
    }, RELOAD_DEBOUNCE_MS);
  }, [reloadRecentProducts]);

  useEffect(() => {
    const calculateLayout = () => {
      const totalScreenHeight = screenHeight;
      const bottomContentTotalHeight = 
        PADDING_ABOVE_RECENT_LIST + 
        RECENT_SECTION_TITLE_HEIGHT + 
        RECENT_LIST_ITEM_HEIGHT + 
        BOTTOM_PADDING_FOR_LAYOUT + 
        TAB_BAR_ESTIMATED_HEIGHT;
      let calculatedCameraHeight = totalScreenHeight - bottomContentTotalHeight;
      const minCameraHeight = screenWidth * 0.5; 
      // Potremmo rimuovere minCameraHeightRequiredForRecents se non ci sono pulsanti overlay
      // if (calculatedCameraHeight < minCameraHeight && totalScreenHeight > minCameraHeightRequiredForRecents) { ... }
      setCameraViewHeight(calculatedCameraHeight);
    };
    calculateLayout();
  }, []); 

  useFocusEffect(useCallback(() => {
    if (user) { 
      // Ottimizza: ricarica solo se necessario e con debounce
      debouncedReloadRecentProducts();
    }
    setIsFotoCameraActive(true);
    console.log("[FotoScreen] Foto focus Gained, Camera Active: true");
    return () => {
      setIsFotoCameraActive(false);
      // Pulisci il timeout quando si perde il focus
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = null;
      }
      console.log("[FotoScreen] Foto focus Lost, Camera Active: false");
    };
  }, [user, debouncedReloadRecentProducts]));

  const navigateToDetail = (productRecordId: string, initialProductData?: RawProductData | null, aiAnalysisResult?: GeminiAnalysisResult | null) => {
    navigation.navigate("ProductDetail", { 
      productRecordId, 
      initialProductData, 
      aiAnalysisResult,
      isPhotoAnalysis: true
    });
    // Rimuovi il reload immediato - sarà gestito dal debounce se necessario
  };

  const navigateToPreferences = () => {
    navigation.navigate("UserPreferences");
  };

  // processBarcodeScan RIMOSSO

  const processVisualScan = async (imageUri: string) => {
    if (!user) { Alert.alert("Login Richiesto", "Devi effettuare il login."); return; }
    
    try {
      console.log("[FOTO SCREEN] Inizio processamento visual scan ottimizzato");
      
      // 1. GENERA ID UNICO E NAVIGA UNA SOLA VOLTA
      const analysisId = `photo_analysis_${Date.now()}`;
      const placeholderProductData: RawProductData = {
        code: analysisId,
        product_name: "Analisi in corso...",
        brands: "Rilevamento automatico...",
        image_url: imageUri,
        ingredients_text: "",
        nutriments: {},
        nutrition_grades: "",
        ecoscore_grade: "",
        categories: "Analisi Foto",
        labels: "",
        packaging: "",
      };
      
      // INIZIALIZZA IL CONTEXT E NAVIGA UNA SOLA VOLTA
      console.log("[FOTO SCREEN] Navigazione UNICA alla ProductDetailScreen");
      setIsAnalyzing(true);
      updateAnalysis({
        productRecordId: analysisId,
        productData: placeholderProductData,
        isComplete: false
      });
      
      // Naviga con flag isPhotoAnalysis per attivare i messaggi di loading
      navigation.navigate("ProductDetail", { 
        productRecordId: analysisId, 
        initialProductData: placeholderProductData, 
        aiAnalysisResult: null,
        isPhotoAnalysis: true
      });
      
      // 2. ESEGUI OPERAZIONI IN PARALLELO PER MASSIMIZZARE LA VELOCITÀ
      console.log("[FOTO SCREEN] Avvio operazioni parallele...");
      
      const analysisStartTime = Date.now();
      
      // Esegui conversione base64 e analisi AI in parallelo
      const [imageBase64, mimeTypeResult] = await Promise.all([
        FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 }),
        Promise.resolve(imageUri.endsWith(".png") ? "image/png" : 
                       imageUri.endsWith(".webp") ? "image/webp" : "image/jpeg")
      ]);
      
      // Esegui analisi AI con strategia di fallback veloce
      let visualAiAnalysis: GeminiAnalysisResult;
      
      try {
        console.log("[FOTO SCREEN] Tentativo analisi personalizzata veloce");
        // Timeout più aggressivo per l'analisi personalizzata
        const personalizedAnalysisPromise = analyzeImageWithUserPreferences(imageBase64, mimeTypeResult, "Prodotto da foto", user.id);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout analisi personalizzata')), 15000) // 15 secondi timeout
        );
        
        visualAiAnalysis = await Promise.race([personalizedAnalysisPromise, timeoutPromise]);
      } catch (personalizedError) {
        console.warn("[FOTO SCREEN] Analisi personalizzata fallita, fallback veloce:", personalizedError);
        // Fallback con timeout più breve
        const fallbackPromise = analyzeImageWithGeminiVisionAiSdk(imageBase64, mimeTypeResult, "Prodotto da foto");
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout analisi fallback')), 10000) // 10 secondi timeout
        );
        
        visualAiAnalysis = await Promise.race([fallbackPromise, timeoutPromise]);
      }
      
      const analysisTime = Date.now() - analysisStartTime;
      console.log(`[FOTO SCREEN] Analisi AI completata in ${analysisTime}ms`);
      
      if (!visualAiAnalysis) { 
        Alert.alert("Errore Analisi AI", "Impossibile analizzare l'immagine."); 
        setIsAnalyzing(false);
        return; 
      }
      
      // 3. AGGIORNA UI VIA CONTEXT CON I RISULTATI DELL'ANALISI
      console.log("[FOTO SCREEN] Aggiornamento UI via context con risultati analisi...");
      
      const tempFinalData: RawProductData = {
        code: analysisId,
        product_name: visualAiAnalysis.productNameFromVision || "Prodotto (foto)",
        brands: visualAiAnalysis.brandFromVision || "Marca rilevata",
        image_url: imageUri,
        ingredients_text: "",
        nutriments: {},
        nutrition_grades: "",
        ecoscore_grade: "",
        categories: visualAiAnalysis.productNameFromVision || "Analisi Foto",
        labels: "",
        packaging: "",
      };
      
      // AGGIORNA VIA CONTEXT - NESSUNA NAVIGAZIONE
      updateAnalysis({
        productRecordId: analysisId,
        productData: tempFinalData,
        aiAnalysisResult: visualAiAnalysis,
        isComplete: false
      });
      
      // 4. UPLOAD E SALVATAGGIO IN BACKGROUND OTTIMIZZATO
      console.log("[FOTO SCREEN] Upload e salvataggio in background...");
      
      const uploadStartTime = Date.now();
      
      // Esegui upload e generazione barcode in parallelo
      const [uploadedImageUrl, finalBarcode] = await Promise.all([
        uploadProductImage(user.id, imageUri).catch(error => {
          console.warn("[FOTO SCREEN] Upload immagine fallito:", error);
          return null;
        }),
        Promise.resolve(generateVisualScanBarcode())
      ]);
      
      const uploadTime = Date.now() - uploadStartTime;
      console.log(`[FOTO SCREEN] Upload completato in ${uploadTime}ms`);
      
      // Dati finali con URL immagine caricata
      const finalRawDataForVisual: RawProductData = {
        ...tempFinalData,
        code: finalBarcode,
        image_url: uploadedImageUrl || imageUri,
      };
      
      // Salva nel database
      const saveStartTime = Date.now();
      const savedProductRecord = await saveProductAndManageHistory(
        user.id, 
        finalBarcode, 
        finalRawDataForVisual, 
        visualAiAnalysis, 
        uploadedImageUrl || imageUri, 
        true
      );
      
      const saveTime = Date.now() - saveStartTime;
      console.log(`[FOTO SCREEN] Salvataggio completato in ${saveTime}ms`);
      
      if (savedProductRecord?.id) {
        console.log("[FOTO SCREEN] Processo completato, aggiornamento finale via context");
        
        // AGGIORNAMENTO FINALE VIA CONTEXT - NESSUNA NAVIGAZIONE
        updateAnalysis({
          productRecordId: savedProductRecord.id,
          productData: finalRawDataForVisual,
          aiAnalysisResult: visualAiAnalysis,
          isComplete: true
        });
        
        setIsAnalyzing(false);
        
        // Usa il reload ottimizzato con debounce
        debouncedReloadRecentProducts();
        
        const totalTime = Date.now() - analysisStartTime;
        console.log(`[FOTO SCREEN] Processo totale completato in ${totalTime}ms`);
      } else {
        Alert.alert("Errore Salvataggio", "Impossibile salvare l'analisi.");
        setIsAnalyzing(false);
      }

    } catch (error: any) { 
      console.error("[FOTO SCREEN] Errore critico nell'analisi visiva:", error);
      Alert.alert("Errore Critico", error.message || "Errore nell'analisi dell'immagine."); 
      setIsAnalyzing(false);
      clearAnalysis();
    }
  };

  // handleBarCodeScannedFromView RIMOSSO
  const handlePhotoTakenFromView = (uri?: string) => {
    if (uri) { processVisualScan(uri); } 
    // else { setScanMode('barcode'); } // RIMOSSO
  };
  // handleBarcodeScannerClose RIMOSSO

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: BACKGROUND_COLOR_FOTO },
    cameraViewWrapper: { 
        width: '100%', 
        backgroundColor: 'black', 
        position: 'relative',
        zIndex: 1, // Assicuro che la fotocamera sia sotto il contenitore dei recenti
    },
    recentContentBackground: {
      position: 'absolute',
      top: -2, // 2px più in alto per creare l'effetto bordo
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#000000',
      borderTopLeftRadius: WAVE_CORNER_RADIUS,
      borderTopRightRadius: WAVE_CORNER_RADIUS,
      zIndex: 1,
    },
    recentContentOuterContainer: {
      paddingBottom: BOTTOM_PADDING_FOR_LAYOUT,
      paddingHorizontal: 0, 
      backgroundColor: BACKGROUND_COLOR_FOTO,
      borderTopLeftRadius: WAVE_CORNER_RADIUS,
      borderTopRightRadius: WAVE_CORNER_RADIUS,
      marginTop: -WAVE_CORNER_RADIUS,
      paddingTop: 15,
      position: 'relative',
      zIndex: 2,
      borderWidth: 0, // Assicuro che non ci siano bordi
    },
    recentProductsSection: { }, 
    recentProductsTitleContainer: { 
      paddingHorizontal: 20, // Aggiornato a 20 come in HomeScreen
      height: RECENT_SECTION_TITLE_HEIGHT, 
      justifyContent: 'space-between', // Modificato da 'center' a 'space-between'
      flexDirection: 'row', // Aggiunto per posizionare gli elementi in orizzontale
      alignItems: 'center' // Aggiunto per allineare verticalmente gli elementi
    }, 
    recentProductsSectionTitleStyle: { fontSize: 24, color: "#000000", fontFamily: 'BricolageGrotesque-Bold' },
    recentProductsList: { 
      height: RECENT_LIST_ITEM_HEIGHT 
    }, 
    recentProductsListContentHorizontal: { paddingHorizontal: 16, paddingVertical: 10 }, 
    emptyStateText: { textAlign: "center", paddingVertical: 24, paddingHorizontal: 24, color: "#555555", opacity: 0.7, fontFamily: typography.body.fontFamily, marginTop: 20 },
    
    recentProductCardWrapper: { 
      position: 'relative',
      width: screenWidth * 0.85, 
      marginRight: 16,        
      height: 150, 
    },
    recentProductButtonSolidShadow: { 
      backgroundColor: 'black',
      borderRadius: 16,
      position: 'absolute',
      top: RECENT_SHADOW_OFFSET_VALUE,
      left: RECENT_SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
    },
    recentProductCardShadow: { }, 
    recentProductCardContainer: { 
      flexDirection: 'row',
      backgroundColor: '#FFFFFF', 
      borderRadius: 16,
      padding: 18,
      position: 'relative', 
      zIndex: 1,
      height: 150, 
      alignItems: 'center',
      borderWidth: RECENT_CARD_BORDER_WIDTH,
      borderColor: '#000000',
      width: '100%', 
    },
    recentProductImageWrapper: { 
      position: 'relative',
      width: 100,
      height: 100,
      marginRight: 18, 
    },
    recentProductImageDirectedShadow: { 
      position: 'absolute',
      top: RECENT_SHADOW_OFFSET_VALUE - 1,
      left: RECENT_SHADOW_OFFSET_VALUE - 1,
      width: '100%',
      height: '100%',
      backgroundColor: '#000000',
      borderRadius: 12, 
    },
    recentProductCardImage: { 
      width: '100%',
      height: '100%',
      borderRadius: 12, 
      backgroundColor: '#e0e0e0', 
      borderWidth: 1,
      borderColor: '#000000',
      position: 'relative',
      zIndex: 1, 
      resizeMode: 'cover',
    },
    recentProductCardContent: { 
      flex: 1,
      justifyContent: 'center',
      paddingLeft: 5,
    },
    recentProductCardName: { 
      fontSize: 19, 
      fontWeight: '600',
      fontFamily: "BricolageGrotesque-Regular", 
      marginBottom: 5,
    },
    recentProductCardBrand: { 
      fontSize: 15, 
      fontFamily: "BricolageGrotesque-Regular", 
      opacity: 0.7,
      marginBottom: 6,
    },
    recentProductScoresRowContainer: {  
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 0,
      flexWrap: 'nowrap',
    },
    recentProductScoreIconTextContainer: { 
      flexDirection: 'row',
      alignItems: 'center',
    },
    recentProductScoreIcon: { 
      marginRight: 5,
    },
    recentProductScoreValueText: { 
      fontSize: 15,
      fontFamily: "BricolageGrotesque-SemiBold", 
    },
    logoImage: {
      width: 10,
      height: 35,
      resizeMode: 'contain'
    },
    // Stili per il pulsante preferenze (identico al pulsante Scansiona)
    preferencesButtonWrapper: {
      position: 'absolute',
      right: 20,
      zIndex: 10,
    },
    preferencesButtonShadow: {
      position: 'absolute',
      top: 3,
      left: 3,
      width: '100%',
      height: '100%',
      backgroundColor: '#4A90E2', // Azzurro per l'ombra
      borderRadius: 16,
      zIndex: 0,
    },
    preferencesButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      padding: 12,
      paddingHorizontal: 16,
      backgroundColor: '#FFFFFF', // Sfondo bianco
      borderWidth: 2,
      borderColor: '#4A90E2', // Bordo azzurro
      position: 'relative',
      zIndex: 1,
      minHeight: 48,
    },
    preferencesButtonText: {
      fontSize: 14,
      fontFamily: 'BricolageGrotesque-SemiBold',
      color: '#4A90E2', // Testo azzurro
      marginLeft: 8,
    },
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ExpoStatusBar style="light" backgroundColor="rgba(0,0,0,0.3)" translucent={true} /> 
      <View style={[styles.cameraViewWrapper, { height: cameraViewHeight }]}>
        <PhotoCameraView 
            onPhotoTaken={handlePhotoTakenFromView} 
            isCameraActive={isFotoCameraActive} // PASSA LO STATO
        />
        
        {/* Pulsante Preferenze */}
        <View style={[styles.preferencesButtonWrapper, { top: insets.top + 10 }]}>
          <View style={styles.preferencesButtonShadow} />
          <TouchableOpacity 
            style={styles.preferencesButton}
            onPress={navigateToPreferences}
            activeOpacity={1}
          >
            <Ionicons name="settings" size={20} color="#4A90E2" />
            <Text style={styles.preferencesButtonText} allowFontScaling={false}>Le mie preferenze</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={{position: 'relative', marginTop: -WAVE_CORNER_RADIUS}}>
        {/* Sfondo nero che crea l'effetto bordo */}
        <View style={styles.recentContentBackground} />
        
        {/* Contenitore principale con sfondo bianco */}
        <View style={[styles.recentContentOuterContainer, {marginTop: 0}]}>
          <RecentProductsSection />
        </View>
      </View>


    </KeyboardAvoidingView>
  )
}

export default FotoScreen 