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
import BarcodeScannerView from "../../components/BarcodeScannerView"
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  saveProductAndManageHistory,
  getScanHistory,
  handleBarcodeScan,
  fetchProductFromOpenFoodFacts,
  type ProcessedProductInfo,
  type DisplayableHistoryProduct,
  type RawProductData,
} from "../../services/api"
import { type GeminiAnalysisResult } from "../../services/gemini"
import { useAuth } from "../../contexts/AuthContext"
import AppText from "../../components/AppText"
import { typography } from "../../theme/typography"
import { type BarcodeScannerViewRef } from "../../components/BarcodeScannerView"
import RecentProductsSection from "../../components/RecentProductsSection"
import { useRecentProducts } from "../../contexts/RecentProductsContext"
import { supabase } from "../../lib/supabase"
import { getScoreColor } from "../../utils/formatters"
import { optimizedProductService } from "../../services/optimizedApi"

// Funzioni helper rimosse - ora si usa getScoreColor globale

// interface ScannerScreenProps extends CompositeScreenProps<
//     BottomTabScreenProps<MainTabsParamList, 'Home'>, // Sarà 'Scanner'
//     NativeStackScreenProps<AppStackParamList>
// > {}
// Per ora mantengo la Props originale e la modificherò insieme a quelle di FotoScreen dopo aver aggiornato i tipi di navigazione.
type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, "Scanner">, // AGGIORNATO da "Home" a "Scanner"
  NativeStackScreenProps<AppStackParamList>
>;

const BACKGROUND_COLOR_SCANNER = '#f8f4ec';
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const RECENT_SECTION_TITLE_HEIGHT = 50;
const RECENT_LIST_ITEM_HEIGHT = 170;    
const PADDING_ABOVE_RECENT_LIST = 15; 
const BOTTOM_PADDING_FOR_LAYOUT = 8; 
const TAB_BAR_ESTIMATED_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

const RECENT_CARD_BORDER_WIDTH = 1.5;
const RECENT_SHADOW_OFFSET_VALUE = 3.5;

// Aggiungo nuova costante per il raggio di curvatura degli angoli
const WAVE_CORNER_RADIUS = 25;

// La dichiarazione di styles deve avvenire PRIMA del suo utilizzo in renderRecentProduct
// E il componente HomeScreen deve ritornare JSX, non void
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND_COLOR_SCANNER },
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
    backgroundColor: BACKGROUND_COLOR_SCANNER,
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
    paddingHorizontal: 20, 
    height: RECENT_SECTION_TITLE_HEIGHT, 
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'center'
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
  // Aggiungo stili per le curve laterali (cerchi decorativi)
  waveCurveLeft: {
    position: 'absolute',
    top: -WAVE_CORNER_RADIUS/2,
    left: 20,
    width: WAVE_CORNER_RADIUS*2,
    height: WAVE_CORNER_RADIUS*2,
    borderRadius: WAVE_CORNER_RADIUS,
    backgroundColor: 'black',
    zIndex: 3,
  },
  waveCurveRight: {
    position: 'absolute',
    top: -WAVE_CORNER_RADIUS/2,
    right: 20,
    width: WAVE_CORNER_RADIUS*2,
    height: WAVE_CORNER_RADIUS*2,
    borderRadius: WAVE_CORNER_RADIUS,
    backgroundColor: 'black',
    zIndex: 3,
  },
  logoImage: {
    width: 100,
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

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  // TUTTI GLI HOOKS DEVONO ESSERE ALL'INIZIO DEL COMPONENTE
  const [isScannerCameraActive, setIsScannerCameraActive] = useState(true);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [cameraViewHeight, setCameraViewHeight] = useState(screenHeight);
  const [processingState, setProcessingState] = useState({
    isProcessing: false,
    currentBarcode: null as string | null,
    pendingCount: 0
  });
  
  // HOOKS DI CONTESTO
  const { colors } = useTheme(); 
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { reloadRecentProducts, addPendingProduct, updatePendingProduct, removePendingProduct, pendingProducts } = useRecentProducts();
  
  // REFS
  const barcodeScannerRef = useRef<BarcodeScannerViewRef>(null);
  const processingBarcodes = useRef(new Set<string>()).current;
  const productCheckCache = useRef(new Map<string, { timestamp: number, result: any }>()).current;
  const lastReloadRef = useRef(0);
  
  // COSTANTI
  const CACHE_DURATION = 30000; // 30 secondi di cache

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
      setCameraViewHeight(calculatedCameraHeight);
    };
    calculateLayout();
  }, []); 

  useFocusEffect(useCallback(() => {
    if (user) { 
      // Ottimizza: ricarica solo se necessario
      const now = Date.now();
      if (now - lastReloadRef.current > 10000) { // Ricarica max ogni 10 secondi
        reloadRecentProducts();
        lastReloadRef.current = now;
      }
    }
    barcodeScannerRef.current?.resetScanner();
    setIsScannerCameraActive(true);
    setProcessingState(prev => ({ ...prev, isProcessing: false, currentBarcode: null }));
    processingBarcodes.clear();
    console.log("[HomeScreen] Scanner focus Gained, Camera Active: true");
    return () => {
      setIsScannerCameraActive(false);
      setProcessingState(prev => ({ ...prev, isProcessing: false, currentBarcode: null }));
      processingBarcodes.clear();
      console.log("[HomeScreen] Scanner focus Lost, Camera Active: false");
    };
  }, [user, reloadRecentProducts]));

  const navigateToDetail = (productRecordId: string, initialProductData?: RawProductData | null, aiAnalysisResult?: GeminiAnalysisResult | null) => {
    navigation.navigate("ProductDetail", { productRecordId, initialProductData, aiAnalysisResult });
    reloadRecentProducts();
  };

  const navigateToPreferences = () => {
    navigation.navigate("UserPreferences");
  };

  const processBarcodeScan = async (barcode: string) => {
    if (!user) { Alert.alert("Login Richiesto", "Devi effettuare il login."); return; }
    
    // CONTROLLO 1: Blocca se c'è già un'elaborazione in corso
    if (processingState.isProcessing) {
      console.log(`[BARCODE SCAN] Scansione ignorata - elaborazione generale in corso`);
      barcodeScannerRef.current?.resetScanner();
      return;
    }
    
    // CONTROLLO 2: Verifica se questo specifico barcode è già in elaborazione
    if (processingBarcodes.has(barcode)) {
      console.log(`[BARCODE SCAN] Scansione ignorata - barcode ${barcode} già in elaborazione`);
      barcodeScannerRef.current?.resetScanner();
      return;
    }
    
    // CONTROLLO 3: Verifica se esiste già una card pending per questo barcode
    const existingPendingCard = pendingProducts.find(p => p.barcode === barcode);
    if (existingPendingCard) {
      console.log(`[BARCODE SCAN] Scansione ignorata - esiste già card pending per barcode: ${barcode}`);
      barcodeScannerRef.current?.resetScanner();
      return;
    }
    
    // CONTROLLO 4: Verifica cache prima di chiamare il database
    const cacheKey = `${user.id}-${barcode}`;
    const cached = productCheckCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
      console.log(`[BARCODE SCAN] Utilizzando risultato dalla cache per ${barcode}`);
      if (cached.result) {
        // Prodotto esiste in cache, naviga direttamente
        navigation.navigate("ProductDetail", { 
          productRecordId: cached.result.id,
          shouldStartAiAnalysis: !cached.result.health_score || cached.result.health_score <= 0
        });
        barcodeScannerRef.current?.resetScanner();
        return;
      }
    }
    
    // Marca questo barcode come in elaborazione
    processingBarcodes.add(barcode);
    setProcessingState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      currentBarcode: barcode,
      pendingCount: prev.pendingCount + 1
    }));
    
    try {
      console.log(`[BARCODE SCAN] Inizio nuovo flusso ottimizzato per barcode: ${barcode}`);
      
             // 1. CONTROLLA SE ESISTE GIÀ NEL DATABASE (ottimizzato con servizio)
       const existingProduct = await optimizedProductService.checkProductExists(barcode, user.id, true);

       // Aggiorna cache manualmente se necessario
       productCheckCache.set(cacheKey, { timestamp: now, result: existingProduct });

      if (existingProduct) {
        console.log(`[BARCODE SCAN] Prodotto esistente trovato: ${existingProduct.id}`);
        
        // Naviga direttamente senza ricaricare la lista
        navigation.navigate("ProductDetail", { 
          productRecordId: existingProduct.id,
          shouldStartAiAnalysis: !existingProduct.health_score || existingProduct.health_score <= 0
        });
        barcodeScannerRef.current?.resetScanner();
        return;
      }

      // 2. CREA LA CARD PENDING E PROCESSA IN PARALLELO
      const tempId = addPendingProduct(barcode);
      console.log(`[BARCODE SCAN] Aggiunta card pending con ID: ${tempId}`);

      // 3. RECUPERA DA OPENFOODFACTS E PROCESSA IN PARALLELO
      console.log(`[BARCODE SCAN] Recupero dati da OpenFoodFacts per: ${barcode}`);
      const [rawProductData] = await Promise.all([
        fetchProductFromOpenFoodFacts(barcode)
      ]);

      if (!rawProductData || !rawProductData.product_name) {
        console.warn(`[BARCODE SCAN] Prodotto non trovato su OpenFoodFacts: ${barcode}`);
        removePendingProduct(tempId);
        Alert.alert("Prodotto Non Trovato", `Barcode ${barcode} non trovato su OpenFoodFacts.`);
        barcodeScannerRef.current?.resetScanner();
        return;
      }

      // 4. AGGIORNA LA CARD PENDING CON I DATI DA OFF
      updatePendingProduct(tempId, {
        isLoading: false,
        product_name: rawProductData.product_name,
        brand: rawProductData.brands,
        product_image: rawProductData.image_url,
        awaitingAiAnalysis: true
      });

      // 5. SALVA NEL DATABASE (ottimizzato)
      console.log(`[BARCODE SCAN] Salvataggio dati base per: ${barcode}`);
      const savedProduct = await saveProductAndManageHistory(
        user.id,
        barcode,
        rawProductData,
        null,
        rawProductData.image_url,
        false
      );

      if (savedProduct?.id) {
        console.log(`[BARCODE SCAN] Prodotto salvato con ID: ${savedProduct.id}`);
        
        // CORREZIONE: Non rimuovere la card pending qui!
        // La card pending deve rimanere fino a quando l'utente clicca "Analizza"
        // removePendingProduct(tempId); // RIMOSSO
        
        // Ricarica i prodotti recenti per aggiornare la lista
        await reloadRecentProducts();
      } else {
        Alert.alert("Errore Salvataggio", "Impossibile salvare il prodotto.");
        removePendingProduct(tempId);
      }

      barcodeScannerRef.current?.resetScanner();

    } catch (error: any) { 
      console.error(`[BARCODE SCAN] Errore critico:`, error);
      Alert.alert("Errore Critico", error.message || "Errore grave."); 
      barcodeScannerRef.current?.resetScanner();
    } finally {
      // IMPORTANTE: Rimuovi il barcode dal Set e sblocca le scansioni
      processingBarcodes.delete(barcode);
      setProcessingState(prev => ({ 
        ...prev, 
        isProcessing: prev.pendingCount <= 1 ? false : prev.isProcessing,
        currentBarcode: prev.currentBarcode === barcode ? null : prev.currentBarcode,
        pendingCount: Math.max(0, prev.pendingCount - 1)
      }));
    }
  };

  const handleBarCodeScannedFromView = (barcode: string) => { 
      processBarcodeScan(barcode); 
  };
  const handleBarcodeScannerClose = () => { 
      console.log("BarcodeScannerView onClose è stato chiamato.");
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ExpoStatusBar style="light" backgroundColor="rgba(0,0,0,0.3)" translucent={true} /> 
      <View style={[styles.cameraViewWrapper, { height: cameraViewHeight }]}>
        <BarcodeScannerView 
            ref={barcodeScannerRef}
            onScan={handleBarCodeScannedFromView} 
            onClose={handleBarcodeScannerClose}
            isCameraActive={isScannerCameraActive}
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
  );
};

export default HomeScreen;
