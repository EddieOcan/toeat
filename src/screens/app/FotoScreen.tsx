"use client"

import React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import {
  View,
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
import { analyzeImageWithGeminiVision, type GeminiAnalysisResult } from "../../services/gemini"
import { useAuth } from "../../contexts/AuthContext"
import * as FileSystem from "expo-file-system"
import AppText from "../../components/AppText"
import { typography } from "../../theme/typography"
import RecentProductsSection from "../../components/RecentProductsSection"
import { useRecentProducts } from "../../contexts/RecentProductsContext"

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, "Foto">, // AGGIORNATO da "Home" a "Foto"
  NativeStackScreenProps<AppStackParamList>
>

const BACKGROUND_COLOR_FOTO = '#f8f4ec'; // Potrebbe essere diverso se vuoi
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Aggiungo le costanti mancanti
const RECENT_CARD_BORDER_WIDTH = 1.5;
const RECENT_SHADOW_OFFSET_VALUE = 3.5;

// Funzioni helper per colore punteggio (basate su SalvatiScreen)
const getColorFromNumericScore_ForRecent = (score: number | undefined | null, currentThemeColors: any): string => {
  const defaultColor = currentThemeColors.textMuted || '#888888'; 
  if (score === undefined || score === null) return defaultColor;
  if (score >= 81) return '#1E8F4E'; 
  if (score >= 61) return '#7AC547'; 
  if (score >= 41) return '#FFC734'; 
  if (score >= 21) return '#FF9900'; 
  if (score >= 0) return '#FF0000';   
  return defaultColor; 
};

const getScoreColor_ForRecent = (grade: string | undefined | null, type: 'nutri' | 'eco', numericScore?: number | undefined | null, currentThemeColors?: any) => {
  if (grade && typeof grade === 'string' && grade.toLowerCase() !== 'unknown') {
    if (type === 'nutri') {
      switch (grade.toLowerCase()) {
        case "a": return '#2ECC71'; case "b": return '#82E0AA'; case "c": return '#F4D03F'; 
        case "d": return '#E67E22'; case "e": return '#EC7063'; default: break; 
      }
    } else { 
      switch (grade.toLowerCase()) {
        case "a": return '#1D8348'; case "b": return '#28B463'; case "c": return '#F5B041'; 
        case "d": return '#DC7633'; case "e": return '#BA4A00'; default: break; 
      }
    }
  }
  return getColorFromNumericScore_ForRecent(numericScore, currentThemeColors);
};

const RECENT_SECTION_TITLE_HEIGHT = 50; 
const RECENT_LIST_ITEM_HEIGHT = 170;    
const PADDING_ABOVE_RECENT_LIST = 15; 
const BOTTOM_PADDING_FOR_LAYOUT = 8; // Aggiornato a 10 come in HomeScreen
const TAB_BAR_ESTIMATED_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

// Aggiungo la costante per il raggio di curvatura degli angoli
const WAVE_CORNER_RADIUS = 25;

const FotoScreen: React.FC<Props> = ({ navigation }) => {
  // const [scanMode, setScanMode] = useState<'barcode' | 'photo'>('photo'); // RIMOSSO, sempre foto
  const [visualAnalysisLoading, setVisualAnalysisLoading] = useState(false)
  // const [loading, setLoading] = useState(false) // loading era per processBarcodeScan
  const [isFotoCameraActive, setIsFotoCameraActive] = useState(true); // NUOVO STATO
  const { colors } = useTheme(); 
  const { user } = useAuth()
  const [cameraViewHeight, setCameraViewHeight] = useState(screenHeight); 
  const insets = useSafeAreaInsets();
  const { reloadRecentProducts } = useRecentProducts(); // Ottieni la funzione dal contesto condiviso

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
    if (user) { reloadRecentProducts(); }
    setIsFotoCameraActive(true); // Attiva la camera quando la schermata è a fuoco
    console.log("[FotoScreen] Foto focus Gained, Camera Active: true");
    return () => {
      setIsFotoCameraActive(false); // Disattiva la camera quando la schermata perde il focus
      console.log("[FotoScreen] Foto focus Lost, Camera Active: false");
    };
  }, [user, reloadRecentProducts]));

  const navigateToDetail = (productRecordId: string, initialProductData?: RawProductData | null, aiAnalysisResult?: GeminiAnalysisResult | null) => {
    navigation.navigate("ProductDetail", { 
      productRecordId, 
      initialProductData, 
      aiAnalysisResult,
      isPhotoAnalysis: true  // Aggiungo il flag isPhotoAnalysis=true per i prodotti analizzati con foto
    });
    reloadRecentProducts();
  };

  // processBarcodeScan RIMOSSO

  const processVisualScan = async (imageUri: string) => {
    if (!user) { Alert.alert("Login Richiesto", "Devi effettuare il login."); return; }
    setVisualAnalysisLoading(true);
    
    // Prima di iniziare l'analisi, naviga immediatamente alla schermata ProductDetail
    // con la schermata di caricamento isPhotoAnalysis=true
    // Preparazione dei dati minimi necessari per mostrare la schermata di caricamento
    const visualBarcode = generateVisualScanBarcode();
    const tempProductData: RawProductData = {
      code: visualBarcode,
      product_name: "Prodotto in analisi...",
      brands: "",
      image_url: imageUri,
      ingredients_text: "", 
      nutriments: {}, 
      nutrition_grades: "", 
      ecoscore_grade: "",
      categories: "Scansione Visiva", 
      labels: "", 
      packaging: "",
    };
    
    // Naviga alla schermata di dettaglio con il flag isPhotoAnalysis impostato a true
    // Questo causerà la visualizzazione della schermata di caricamento specializzata
    navigation.navigate("ProductDetail", { 
      productRecordId: "temp_visual_scan", // Usa un ID temporaneo per evitare l'errore di ID mancante
      initialProductData: tempProductData,
      aiAnalysisResult: null,
      isPhotoAnalysis: true // Flag specifico per l'analisi foto
    });
    
    try {
      const imageBase64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });
      let mimeType = "image/jpeg";
      if (imageUri.endsWith(".png")) mimeType = "image/png"; else if (imageUri.endsWith(".webp")) mimeType = "image/webp";
      const visualAiAnalysis = await analyzeImageWithGeminiVision(imageBase64, mimeType, "Prodotto da foto");
      if (!visualAiAnalysis) { Alert.alert("Errore Analisi AI", "Impossibile analizzare."); setVisualAnalysisLoading(false); return; }
      const uploadedImageUrl = await uploadProductImage(user.id, imageUri);
      if (!uploadedImageUrl) { Alert.alert("Errore Upload", "Impossibile caricare immagine."); setVisualAnalysisLoading(false); return; }
      const visualBarcode = generateVisualScanBarcode();
      const rawDataForVisual: RawProductData = {
        code: visualBarcode, product_name: visualAiAnalysis.productNameFromVision || "Prodotto (foto)",
        brands: visualAiAnalysis.brandFromVision || "Sconosciuta", image_url: uploadedImageUrl,
        ingredients_text: "", nutriments: {}, nutrition_grades: "", ecoscore_grade: "",
        categories: visualAiAnalysis.productNameFromVision || "Scansione Visiva", labels: "", packaging: "",
      };
      const savedProductRecord = await saveProductAndManageHistory(user.id, visualBarcode, rawDataForVisual, visualAiAnalysis, uploadedImageUrl, true);
      if (savedProductRecord?.id) { 
        navigateToDetail(savedProductRecord.id, rawDataForVisual, visualAiAnalysis);
        setVisualAnalysisLoading(false); // Imposta visualAnalysisLoading a false quando la navigazione avviene con successo
      }
      else { Alert.alert("Errore Salvataggio", "Impossibile salvare prodotto."); }
    } catch (error: any) { Alert.alert("Errore Inatteso", error.message || "Errore analisi visiva."); }
    finally { setVisualAnalysisLoading(false); }
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
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", zIndex: 1000 },
    loadingText: { marginTop: 12, color: "#FFFFFF", fontFamily: typography.bodyMedium.fontFamily },
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
      resizeMode: 'contain',
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
      width: 100,
      height: 35,
      resizeMode: 'contain'
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
      </View>
      
      <View style={{position: 'relative', marginTop: -WAVE_CORNER_RADIUS}}>
        {/* Sfondo nero che crea l'effetto bordo */}
        <View style={styles.recentContentBackground} />
        
        {/* Contenitore principale con sfondo bianco */}
        <View style={[styles.recentContentOuterContainer, {marginTop: 0}]}>
          <RecentProductsSection />
        </View>
      </View>

      {visualAnalysisLoading && ( // Modificato per mostrare solo visualAnalysisLoading
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <AppText style={styles.loadingText}>
            {visualAnalysisLoading ? "Analisi immagine..." : "Caricamento..."}
          </AppText>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

export default FotoScreen 