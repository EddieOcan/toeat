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
import BarcodeScannerView from "../../components/BarcodeScannerView"
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  saveProductAndManageHistory,
  getScanHistory,
  handleBarcodeScan,
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

// Funzioni helper per colore punteggio (RIAGGIUNTE)
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
  // Stile per l'icona preferenze
  preferencesButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 10,
  },
});

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [isScannerCameraActive, setIsScannerCameraActive] = useState(true);
  const { colors } = useTheme(); 
  const { user } = useAuth()
  const [cameraViewHeight, setCameraViewHeight] = useState(screenHeight); 
  const insets = useSafeAreaInsets();
  const barcodeScannerRef = useRef<BarcodeScannerViewRef>(null);
  const { reloadRecentProducts } = useRecentProducts();

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
    if (user) { reloadRecentProducts(); }
    barcodeScannerRef.current?.resetScanner();
    setIsScannerCameraActive(true);
    console.log("[HomeScreen] Scanner focus Gained, Camera Active: true");
    return () => {
      setIsScannerCameraActive(false);
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
    try {
      const result: ProcessedProductInfo = await handleBarcodeScan(barcode, user.id);
      if (result.source === "error") { 
        Alert.alert("Errore Processamento", result.errorMessage || "Errore sconosciuto.");
        // Reset scanner per permettere nuove scansioni
        barcodeScannerRef.current?.resetScanner();
      } else if (result.source === "not_found_off") {
        Alert.alert("Prodotto Non Trovato", result.errorMessage || `Barcode ${barcode} non trovato.`);
        // Reset scanner per permettere nuove scansioni
        barcodeScannerRef.current?.resetScanner();
      } else if (result.dbProduct?.id) { 
        navigateToDetail(result.dbProduct.id, result.productData, result.aiAnalysis); 
      }
      else { 
        Alert.alert("Errore Inatteso", "Dettagli prodotto non disponibili."); 
        // Reset scanner per permettere nuove scansioni
        barcodeScannerRef.current?.resetScanner();
      }
    } catch (error: any) { 
      Alert.alert("Errore Critico", error.message || "Errore grave."); 
      // Reset scanner per permettere nuove scansioni
      barcodeScannerRef.current?.resetScanner();
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
        
        {/* Icona Preferenze */}
        <TouchableOpacity 
          style={[styles.preferencesButton, { top: insets.top + 10 }]}
          onPress={navigateToPreferences}
        >
          <Ionicons name="settings" size={24} color="#333" />
        </TouchableOpacity>
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
