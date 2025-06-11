import React, { useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Text,
  FlatList,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { useRecentProducts } from '../contexts/RecentProductsContext';
import { useAuth } from '../contexts/AuthContext';
import AppText from './AppText';
import { DisplayableHistoryProduct, RawProductData } from '../services/api';
import { GeminiAnalysisResult } from '../services/gemini';
import type { AppStackParamList } from '../navigation';

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

// Funzioni helper per colore punteggio
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
  
  // Caso speciale per ecoscore mancante
  if (type === 'eco' && (!grade || !numericScore)) {
    return '#888888'; // Grigio per ecoscore mancante
  }
  
  return getColorFromNumericScore_ForRecent(numericScore, currentThemeColors);
};

// Componente memoizzato per il renderizzatore degli elementi
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
     
                            // Spiegazioni score rimosse per analisi foto
            nutriScoreExplanation: item.is_visually_analyzed ? '' : (item.nutri_score_explanation || ''),
            novaExplanation: item.is_visually_analyzed ? '' : (item.nova_explanation || ''),
            ecoScoreExplanation: item.is_visually_analyzed ? '' : (item.eco_score_explanation || ''), 
    productNameFromVision: undefined, 
    brandFromVision: undefined,
    calories_estimate: item.calories_estimate || undefined,
    // AGGIUNTO: Includi i valori nutrizionali stimati dall'AI per prodotti confezionati
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

  return (
    <View style={styles.recentProductCardWrapper}> 
      <View style={[styles.recentProductButtonSolidShadow, styles.recentProductCardShadow]} />
      <TouchableOpacity
        style={styles.recentProductCardContainer} 
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.recentProductImageWrapper}>
          <View style={[styles.recentProductImageDirectedShadow, 
                      { borderRadius: styles.recentProductCardImage.borderRadius }
                    ]} />
          <Image
            source={{ uri: item.product_image || undefined }}
            style={styles.recentProductCardImage}
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
          <AppText 
            style={[styles.recentProductCardBrand, { color: "#333333" }]} 
            numberOfLines={1} 
            ellipsizeMode="tail"
          >
            {item.brand || "Marca non disponibile"}
          </AppText>
          <View style={styles.recentProductScoresRowContainer}> 
            {item.health_score !== undefined && (
              <View style={[styles.recentProductScoreIconTextContainer, { marginLeft: 0 }]}>
                <Ionicons 
                  name="heart" size={18} 
                  color={getScoreColor_ForRecent(item.nutrition_grade, 'nutri', item.health_score, colors)} 
                  style={styles.recentProductScoreIcon} 
                />
                <AppText style={[styles.recentProductScoreValueText, { color: "#000000" }]}>
                  {item.health_score}
                </AppText>
              </View>
            )}
            {(item.sustainability_score !== undefined || item.ecoscore_score !== undefined) && (
              <View style={[styles.recentProductScoreIconTextContainer, { marginLeft: item.health_score !== undefined ? 15 : 0} ]}>
                <Ionicons name="leaf" size={18} 
                  color={getScoreColor_ForRecent(item.ecoscore_grade, 'eco', item.sustainability_score ?? item.ecoscore_score, colors)} 
                  style={styles.recentProductScoreIcon}
                />
                <AppText style={[styles.recentProductScoreValueText, { color: "#000000" }]}>
                  {item.sustainability_score ?? item.ecoscore_score}
                </AppText>
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
  const { recentProducts, scrollPosition, setScrollPosition, reloadRecentProducts } = useRecentProducts();
  const flatListRef = useRef<FlatList<DisplayableHistoryProduct>>(null);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Aggiorna la posizione di scroll quando cambia
  useEffect(() => {
    if (flatListRef.current) {
      // Questo è necessario perché la lista potrebbe non essere ancora renderizzata
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: scrollPosition, animated: false });
      }, 0);
    }
  }, [scrollPosition]);

  // Gestisce il cambio di posizione di scroll con debounce
  const handleScroll = useCallback((event: any) => {
    const newPosition = event.nativeEvent.contentOffset.x;
    
    // Cancella timeout precedente
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Imposta un nuovo timeout per aggiornare la posizione solo dopo che l'utente ha smesso di scorrere
    scrollTimeoutRef.current = setTimeout(() => {
      setScrollPosition(newPosition);
    }, 100); // Aspetta 100ms prima di aggiornare lo stato
  }, [setScrollPosition]);

  // Ottimizza getItemLayout per evitare calcoli durante lo scorrimento
  const getItemLayout = useCallback((data: any, index: number) => (
    {length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index}
  ), []);

  // Memoizza il renderizzatore per evitare ri-renderizzazioni inutili
  const renderItem = useCallback(({ item }: { item: DisplayableHistoryProduct }) => (
    <RecentProductItem item={item} navigation={navigation} colors={colors} />
  ), [navigation, colors]);

  // Memoizza il keyExtractor per evitare ri-creazione della funzione
  const keyExtractor = useCallback((item: DisplayableHistoryProduct) => item.history_id || item.id, []);

  return (
    <View style={styles.recentProductsSection}>
      <View style={styles.recentProductsTitleContainer}>
        <AppText style={styles.recentProductsSectionTitleStyle}>I tuoi Recenti</AppText>
        <Image source={require('../../assets/Logo.png')} style={styles.logoImage} />
      </View>
      {recentProducts.length > 0 ? (
        <FlatList
          ref={flatListRef}
          data={recentProducts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          style={styles.recentProductsList}
          contentContainerStyle={styles.recentProductsListContentHorizontal}
          onScroll={handleScroll}
          scrollEventThrottle={32} // Ridotto per migliorare le prestazioni
          initialScrollIndex={0}
          getItemLayout={getItemLayout}
          initialNumToRender={3} // Renderizza solo gli elementi inizialmente visibili
          maxToRenderPerBatch={3} // Limite di elementi da renderizzare in un batch
          windowSize={5} // Ridotto per migliorare le prestazioni
          removeClippedSubviews={true} // Rimuove gli elementi non visibili dalla memory hierarchy
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
  recentProductsSectionTitleStyle: { fontSize: 24, color: "#000000", fontFamily: 'BricolageGrotesque-Bold' },
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
    height: 45,
    resizeMode: 'contain',
    marginTop: -10
  },
});

export default RecentProductsSection; 