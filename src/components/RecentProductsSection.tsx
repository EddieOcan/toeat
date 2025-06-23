import React, { useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Text,
  FlatList,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { useRecentProducts, type PendingProduct } from '../contexts/RecentProductsContext';
import { useAuth } from '../contexts/AuthContext';
import AppText from './AppText';
import { DisplayableHistoryProduct, RawProductData } from '../services/api';
import { GeminiAnalysisResult } from '../services/gemini';
import type { AppStackParamList } from '../navigation';
import { scaleFont } from '../theme/typography';
import { getScoreColor } from '../utils/formatters';

const { width: screenWidth } = Dimensions.get('window');

// Costanti condivise
const RECENT_SECTION_TITLE_HEIGHT = 50;
const RECENT_LIST_ITEM_HEIGHT = 170;
const RECENT_CARD_BORDER_WIDTH = 1.5;
const RECENT_SHADOW_OFFSET_VALUE = 3.5;
const WAVE_CORNER_RADIUS = 25;

// Costanti per ottimizzazione
const CARD_WIDTH = screenWidth * 0.85;
const CARD_MARGIN = 16;
const ITEM_WIDTH = CARD_WIDTH + CARD_MARGIN;

// Tipo unione per gli elementi della lista
type ListItem = (DisplayableHistoryProduct & { type: 'recent' }) | (PendingProduct & { type: 'pending' });

// Funzioni helper rimosse - ora si usa getScoreColor globale

// Componente per il skeleton loading
const SkeletonText = memo(({ width, height = 16 }: { width: number | string; height?: number }) => (
  <View 
    style={[
      styles.skeletonText, 
      { 
        width: typeof width === 'number' ? width : undefined,
        height 
      }
    ]} 
  />
));

// Componente per i prodotti pending
const PendingProductItem = memo(({ item, navigation, colors, onAnalyzePress }: { 
  item: PendingProduct, 
  navigation: NativeStackNavigationProp<AppStackParamList>,
  colors: any,
  onAnalyzePress: (barcode: string, pendingItem: PendingProduct) => void
}) => {
  const handlePress = () => {
    if (item.awaitingAiAnalysis) {
      onAnalyzePress(item.barcode, item);
    }
  };

  // Per i prodotti pending, usa il colore blu dell'analisi se pronto, altrimenti grigio
  const cardColor = item.awaitingAiAnalysis ? '#4A90E2' : '#888888';

  return (
    <View style={styles.recentProductCardWrapper}> 
      <View style={[
        styles.recentProductButtonSolidShadow, 
        styles.recentProductCardShadow,
        { backgroundColor: cardColor }
      ]} />
      <TouchableOpacity
        style={[
          styles.recentProductCardContainer,
          { borderColor: cardColor },
          item.awaitingAiAnalysis && styles.analyzeReadyCard
        ]} 
        onPress={handlePress}
        activeOpacity={item.awaitingAiAnalysis ? 0.7 : 1}
        disabled={!item.awaitingAiAnalysis}
      >
        <View style={styles.recentProductImageWrapper}>
          <View style={[
            styles.recentProductImageDirectedShadow, 
            { borderRadius: styles.recentProductCardImage.borderRadius },
            { backgroundColor: cardColor }
          ]} />
          {item.isLoading ? (
            <View style={[styles.recentProductCardImage, styles.skeletonImage, { borderColor: cardColor }]}>
              <ActivityIndicator size="small" color="#999" />
            </View>
          ) : (
            <Image
              source={{ uri: item.product_image || undefined }}
              style={[
                styles.recentProductCardImage,
                { borderColor: cardColor }
              ]}
              defaultSource={require('../../assets/icon.png')} 
            />
          )}
        </View>
        <View style={styles.recentProductCardContent}>
          {item.isLoading ? (
            <View style={styles.skeletonContainer}>
              <SkeletonText width={140} height={20} />
              <SkeletonText width={100} height={16} />
              <SkeletonText width={80} height={14} />
            </View>
          ) : (
            <>
              <AppText 
                style={[styles.recentProductCardName, { color: "#000000" }]} 
                numberOfLines={2} 
                ellipsizeMode="tail"
              >
                {item.product_name || "Nome non disponibile"}
              </AppText>
              <View style={styles.recentProductScoresRowContainer}> 
                {item.awaitingAiAnalysis ? (
                  <View style={styles.analyzeButtonContainer}>
                    <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                    <AppText style={styles.analyzeButtonText}>Analizza</AppText>
                  </View>
                ) : (
                  <View style={styles.processingContainer}>
                    <ActivityIndicator size="small" color="#999" />
                    <AppText style={styles.processingText}>Elaborazione...</AppText>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
});

// Componente memoizzato per il renderizzatore degli elementi recenti (esistenti)
const RecentProductItem = memo(({ item, navigation, colors }: { 
  item: DisplayableHistoryProduct, 
  navigation: NativeStackNavigationProp<AppStackParamList>,
  colors: any 
}) => {
  const initialProductData: RawProductData = {
    code: item.barcode,
    product_name: item.product_name,
    brands: item.brand,
    image_url: item.product_image,
    ingredients_text: item.ingredients,
    nutriments: {
      energy_100g: item.energy_100g,
      energy_kcal_100g: item.energy_kcal_100g,
      fat_100g: item.fat_100g,
      saturated_fat_100g: item.saturated_fat_100g,
      carbohydrates_100g: item.carbohydrates_100g,
      sugars_100g: item.sugars_100g,
      fiber_100g: item.fiber_100g,
      proteins_100g: item.proteins_100g,
      salt_100g: item.salt_100g,
    },
    nutrition_grades: item.nutrition_grade,
    ecoscore_grade: item.ecoscore_grade,
    ecoscore_score: item.ecoscore_score,
    categories: undefined, 
    labels: undefined,
    packaging: undefined,
  };

  const aiAnalysisResult: GeminiAnalysisResult | null = (
    (typeof item.health_score === 'number' || 
     typeof item.sustainability_score === 'number' || 
     item.health_analysis)
  ) ? {
    healthScore: typeof item.health_score === 'number' ? item.health_score : 0, 
    sustainabilityScore: typeof item.sustainability_score === 'number' ? item.sustainability_score : 0, 
    analysis: item.health_analysis || '', 
    pros: item.health_pros || [], 
    cons: item.health_cons || [], 
     
    sustainabilityPros: item.sustainability_pros || [], 
    sustainabilityCons: item.sustainability_cons || [], 
     
                    // RIMOSSO: nutriScoreExplanation, novaExplanation, ecoScoreExplanation 
    productNameFromVision: undefined, 
    brandFromVision: undefined,
    calories_estimate: item.calories_estimate || undefined,
    calorie_estimation_type: (item as any).calorie_estimation_type,
    estimated_energy_kcal_100g: (item as any).estimated_energy_kcal_100g,
    estimated_proteins_100g: (item as any).estimated_proteins_100g,
    estimated_carbs_100g: (item as any).estimated_carbs_100g,
    estimated_fats_100g: (item as any).estimated_fats_100g,
  } : null;
  
  const handlePress = () => {
    if (item.id) { 
      navigation.navigate("ProductDetail", { 
        productRecordId: item.id, 
        initialProductData: initialProductData, 
        aiAnalysisResult: aiAnalysisResult 
      }); 
    }
  };

  // Verifica se il prodotto ha bisogno di analisi AI
  const needsAiAnalysis = !aiAnalysisResult || (aiAnalysisResult.healthScore === 0 && !aiAnalysisResult.analysis);

  // Determina il colore della card basato sul punteggio salute
  const cardColor = item.health_score !== undefined ? getScoreColor(item.health_score) : '#000000';

  return (
    <View style={styles.recentProductCardWrapper}> 
      <View style={[
        styles.recentProductButtonSolidShadow, 
        styles.recentProductCardShadow,
        needsAiAnalysis ? styles.analyzeReadyCardShadow : { backgroundColor: cardColor }
      ]} />
      <TouchableOpacity
        style={[
          styles.recentProductCardContainer,
          needsAiAnalysis ? styles.analyzeReadyCard : { borderColor: cardColor }
        ]} 
        onPress={handlePress}
        activeOpacity={1}
      >
        <View style={styles.recentProductImageWrapper}>
          <View style={[
            styles.recentProductImageDirectedShadow, 
            { borderRadius: styles.recentProductCardImage.borderRadius },
            needsAiAnalysis ? styles.analyzeReadyImageShadow : { backgroundColor: cardColor }
                    ]} />
          <Image
            source={{ uri: item.product_image || undefined }}
            style={[
              styles.recentProductCardImage,
              needsAiAnalysis ? styles.analyzeReadyImage : { borderColor: cardColor }
            ]}
            defaultSource={require('../../assets/icon.png')} 
          />
        </View>
        <View style={styles.recentProductCardContent}>
          <AppText 
            style={[styles.recentProductCardName, { color: "#000000" }]} 
            numberOfLines={2} 
            ellipsizeMode="tail"
          >
            {item.product_name || "Nome non disponibile"}
          </AppText>
          
          <View style={styles.recentProductScoresRowContainer}> 
            {needsAiAnalysis ? (
              <View style={styles.analyzeButtonContainer}>
                <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                <AppText style={styles.analyzeButtonText}>Analizza</AppText>
              </View>
            ) : (
              <View style={styles.scoreButtonsContainer}>
                {item.health_score !== undefined && (
                  <View style={[styles.scoreButton, { backgroundColor: getScoreColor(item.health_score) }]}>
                    <Ionicons name="heart" size={14} color="#FFFFFF" />
                    <AppText style={styles.scoreButtonText}>
                      {item.health_score}
                    </AppText>
                  </View>
                )}
                {((item.sustainability_score !== undefined && item.sustainability_score > 0) || (item.ecoscore_score !== undefined && item.ecoscore_score > 0)) && (
                  <View style={[styles.scoreButton, { backgroundColor: getScoreColor(item.sustainability_score ?? item.ecoscore_score) }]}>
                    <Ionicons name="leaf" size={14} color="#FFFFFF" />
                    <AppText style={styles.scoreButtonText}>
                      {item.sustainability_score ?? item.ecoscore_score}
                    </AppText>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
});

const RecentProductsSection: React.FC = () => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { recentProducts, pendingProducts, scrollPosition, setScrollPosition, reloadRecentProducts, removePendingProduct } = useRecentProducts();
  const flatListRef = useRef<FlatList<ListItem>>(null);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Combina prodotti pending e recenti, FILTRANDO I DUPLICATI
  const combinedItems = useMemo(() => {
    const pending: ListItem[] = pendingProducts.map(item => ({ ...item, type: 'pending' as const }));
    
    // Crea un Set dei barcode pending per filtrare i duplicati
    const pendingBarcodes = new Set(pendingProducts.map(item => item.barcode));
    
    // Filtra i prodotti recent che NON hanno un barcode presente nei pending
    const recent: ListItem[] = recentProducts
      .filter(item => !pendingBarcodes.has(item.barcode))
      .map(item => ({ ...item, type: 'recent' as const }));
    
    return [...pending, ...recent];
  }, [pendingProducts, recentProducts]);
  
  // Aggiorna la posizione di scroll quando cambia
  useEffect(() => {
    if (flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: scrollPosition, animated: false });
      }, 0);
    }
  }, [scrollPosition]);

  // Gestisce il cambio di posizione di scroll con debounce
  const handleScroll = useCallback((event: any) => {
    const newPosition = event.nativeEvent.contentOffset.x;
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      setScrollPosition(newPosition);
    }, 100);
  }, [setScrollPosition]);

  // Gestisce il click su "Analizza" per i prodotti pending
  const handleAnalyzePress = useCallback(async (barcode: string, pendingItem: PendingProduct) => {
    try {
      // Prima di tutto, rimuovi la card pending
      removePendingProduct(pendingItem.id);
      
      // Trova il prodotto nel database usando il barcode
      // (il prodotto dovrebbe essere già stato salvato quando è stata creata la card pending)
      const existingProduct = recentProducts.find(product => product.barcode === barcode);
      
      if (existingProduct && existingProduct.id) {
        console.log(`[ANALYZE PRESS] Trovato prodotto esistente con ID: ${existingProduct.id}`);
        
        // Naviga usando l'ID corretto del database
        navigation.navigate("ProductDetail", { 
          productRecordId: existingProduct.id, // ← CORRETTO: Usa l'UUID del database
          shouldStartAiAnalysis: true // Flag per indicare che deve iniziare l'analisi AI
        });
      } else {
        console.warn(`[ANALYZE PRESS] Prodotto con barcode ${barcode} non trovato nei recenti`);
        
        // Fallback: crea i dati iniziali per la navigazione (caso raro)
        const initialProductData: RawProductData = {
          code: barcode,
          product_name: pendingItem.product_name,
          brands: pendingItem.brand,
          image_url: pendingItem.product_image,
          ingredients_text: "",
          nutriments: {},
          nutrition_grades: "",
          ecoscore_grade: "",
          categories: undefined,
          labels: undefined,
          packaging: undefined,
        };

        // Naviga con i dati iniziali
        navigation.navigate("ProductDetail", { 
          productRecordId: barcode, // Usa il barcode come fallback temporaneo
          initialProductData: initialProductData, 
          aiAnalysisResult: null,
          shouldStartAiAnalysis: true
        });
      }
    } catch (error) {
      console.error('[ANALYZE PRESS] Errore:', error);
      Alert.alert("Errore", "Impossibile avviare l'analisi del prodotto.");
    }
  }, [navigation, removePendingProduct, recentProducts]);

  // Ottimizza getItemLayout per evitare calcoli durante lo scorrimento
  const getItemLayout = useCallback((data: any, index: number) => (
    {length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index}
  ), []);

  // Memoizza il renderizzatore per evitare ri-renderizzazioni inutili
  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'pending') {
      return <PendingProductItem 
        item={item} 
        navigation={navigation} 
        colors={colors} 
        onAnalyzePress={handleAnalyzePress}
      />;
    } else {
      return <RecentProductItem item={item} navigation={navigation} colors={colors} />;
    }
  }, [navigation, colors, handleAnalyzePress]);

  // Memoizza il keyExtractor per evitare ri-creazione della funzione
  const keyExtractor = useCallback((item: ListItem) => {
    if (item.type === 'pending') {
      return item.id;
    } else {
      return item.history_id || item.id;
    }
  }, []);

  return (
    <View style={styles.recentProductsSection}>
      <View style={styles.recentProductsTitleContainer}>
        <AppText style={styles.recentProductsSectionTitleStyle}>I tuoi Recenti</AppText>
        <Image source={require('../../assets/Logo.png')} style={styles.logoImage} />
      </View>
      {combinedItems.length > 0 ? (
        <FlatList
          ref={flatListRef}
          data={combinedItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          style={styles.recentProductsList}
          contentContainerStyle={styles.recentProductsListContentHorizontal}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          initialScrollIndex={0}
          getItemLayout={getItemLayout}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          removeClippedSubviews={true}
        />
      ) : (
        <AppText style={styles.emptyStateText}>
          {user ? "Nessun prodotto scansionato di recente." : "Effettua il login per vedere la cronologia."}
        </AppText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  recentProductsSection: {}, 
  recentProductsTitleContainer: { 
    paddingLeft: 20, 
    paddingRight: 0, 
    height: RECENT_SECTION_TITLE_HEIGHT, 
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'center'
  }, 
  recentProductsSectionTitleStyle: { fontSize: scaleFont(24), color: "#000000", fontFamily: 'BricolageGrotesque-Bold' },
  recentProductsList: { 
    height: RECENT_LIST_ITEM_HEIGHT 
  }, 
  recentProductsListContentHorizontal: { paddingHorizontal: 16, paddingVertical: 10 }, 
  emptyStateText: { textAlign: "center", paddingVertical: 24, paddingHorizontal: 24, color: "#555555", opacity: 0.7, fontFamily: 'System', marginTop: 20 },
  recentProductCardWrapper: { 
    position: 'relative',
    width: CARD_WIDTH, 
    marginRight: CARD_MARGIN,        
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
  recentProductCardShadow: {}, 
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
  analyzeReadyCard: {
    borderColor: '#4A90E2',
    borderWidth: 2.5,
    backgroundColor: '#FAFCFF', // Sfondo leggermente blu
  },
  analyzeReadyCardShadow: {
    backgroundColor: '#4A90E2', // Ombra blu invece che nera
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
  skeletonImage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  skeletonContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 5,
  },
  skeletonText: {
    backgroundColor: '#e8e8e8',
    borderRadius: 6,
    marginBottom: 8,
    opacity: 0.6,
  },
  recentProductCardContent: { 
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 5,
  },
  recentProductCardName: { 
    fontSize: scaleFont(19), 
    fontWeight: '600',
    fontFamily: "BricolageGrotesque-Regular", 
    marginBottom: 5,
  },
  recentProductCardBrand: { 
    fontSize: scaleFont(15), 
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
    fontSize: scaleFont(15),
    fontFamily: "BricolageGrotesque-SemiBold", 
  },
  analyzeButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90E2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    minWidth: 90,
  },
  analyzeButtonText: {
    fontSize: scaleFont(13),
    fontFamily: "BricolageGrotesque-SemiBold",
    color: '#FFFFFF',
    marginLeft: 6,
    letterSpacing: 0.3,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  processingText: {
    fontSize: scaleFont(12),
    fontFamily: "BricolageGrotesque-Regular",
    color: '#6c757d',
    marginLeft: 8,
  },
  logoImage: {
    width: 100,
    height: 45,
    resizeMode: 'contain',
    marginTop: -10
  },
  analyzeReadyImage: {
    borderColor: '#4A90E2',
    borderWidth: 2.5,
  },
  analyzeReadyImageShadow: {
    backgroundColor: '#4A90E2',
  },
  // Nuovi stili per i pulsanti dei punteggi
  scoreButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    marginTop: 8,
  },
  scoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 50,
  },
  scoreButtonText: {
    fontSize: scaleFont(12),
    fontFamily: "BricolageGrotesque-Bold",
    color: '#FFFFFF',
    marginLeft: 4,
    letterSpacing: 0.2,
  },
});

export default RecentProductsSection; 