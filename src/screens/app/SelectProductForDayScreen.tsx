import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Image,
  Platform,
  KeyboardAvoidingView,
  FlatList,
} from 'react-native';
import { scaleFont } from '../../theme/typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { getRecentProducts, ProductRecord } from '../../services/api';
import { addProductToDay } from '../../services/nutritionApi';
import { getScoreColor } from '../../utils/formatters';

// Costanti di stile per uniformare con l'app
const BACKGROUND_COLOR = '#f8f4ec';
const CARD_BACKGROUND_COLOR = '#FFFFFF';
const BORDER_COLOR = '#000000';
const PRIMARY_GREEN = '#00463b'; // Verde scuro della navbar
const SHADOW_OFFSET_VALUE = 3.5;
const CARD_BORDER_WIDTH = 1.5;
const CARD_BORDER_RADIUS = 16;

interface Props {
  navigation: any;
  route: {
    params: {
      selectedDate: string;
    };
  };
}

export default function SelectProductForDayScreen({ navigation, route }: Props) {
  const { selectedDate } = route.params;
  const [recentProducts, setRecentProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [quantity, setQuantity] = useState(100);
  const [adding, setAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'saved'>('recent');
  const [healthFilter, setHealthFilter] = useState<'all' | 'eccellente' | 'ottimo' | 'buono' | 'discreto' | 'scarso'>('all');
  const [entriesNutritionVisibility, setEntriesNutritionVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadRecentProducts();
  }, []);

  const loadRecentProducts = async () => {
    try {
      setLoading(true);
      const products = await getRecentProducts();
      setRecentProducts(products);
    } catch (error) {
      console.error('Errore caricamento prodotti recenti:', error);
      Alert.alert('Errore', 'Impossibile caricare i prodotti recenti');
    } finally {
      setLoading(false);
    }
  };

  const toggleNutritionVisibility = (productId: string) => {
    setEntriesNutritionVisibility(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  const getNutrientIconName = (nutrientKey: string): string => {
    switch (nutrientKey) {
      case 'energy_kcal_100g': return 'flame';
      case 'fat_100g': return 'cafe';
      case 'carbohydrates_100g': return 'layers';
      case 'proteins_100g': return 'barbell';
      default: return 'help-circle';
    }
  };

  const getNutrientIconColor = (nutrientKey: string): string => {
    switch (nutrientKey) {
      case 'energy_kcal_100g': return '#FFA07A'; // LightSalmon (Arancione chiaro)
      case 'fat_100g': return '#87CEEB';       // SkyBlue (Blu cielo)
      case 'carbohydrates_100g': return '#FFD700'; // Gold (Giallo oro)
      case 'proteins_100g': return '#CD5C5C';   // IndianRed (Rosso mattone chiaro)
      default: return BORDER_COLOR;
    }
  };

  const formatNutritionValue = (value: number, unit: string): string => {
    if (unit === 'kcal') {
      return `${Math.round(value)} ${unit}`;
    }
    return `${Math.round(value)}${unit}`;
  };

  // getHealthScoreColor rimossa - ora si usa getScoreColor globale

  const getHealthScoreCategory = (score: number | undefined | null): 'eccellente' | 'ottimo' | 'buono' | 'discreto' | 'scarso' => {
    if (score === undefined || score === null) return 'scarso';
    if (score >= 91) return 'eccellente';
    if (score >= 61) return 'ottimo';
    if (score >= 41) return 'buono';
    if (score >= 21) return 'discreto';
    return 'scarso';
  };

  const getFilteredProducts = () => {
    if (healthFilter === 'all') return recentProducts;
    return recentProducts.filter(product => {
      const category = getHealthScoreCategory(product.health_score);
      return category === healthFilter;
    });
  };

  const determineEntryType = (product: ProductRecord): 'barcode' | 'photo_packaged' | 'photo_meal' => {
    if (!product.is_visually_analyzed) {
      return 'barcode'; // Prodotto da barcode
    }
    
    // Prodotto analizzato visivamente
    if (product.calorie_estimation_type === 'breakdown') {
      return 'photo_meal'; // Pasto completo fotografato con ingredienti
    } else if (product.calorie_estimation_type === 'per_100g') {
      return 'photo_packaged'; // Prodotto confezionato fotografato
    }
    
    // Fallback per backward compatibility
    return 'photo_packaged';
  };

  const handleProductSelect = (product: ProductRecord) => {
    const entryType = determineEntryType(product);
    
    if (entryType === 'photo_meal') {
      // Per i pasti fotografati, aggiungi direttamente
      addProductToLog(product, entryType);
    } else {
      // Per prodotti confezionati, chiedi la quantità
      setSelectedProduct(product);
      setShowQuantityModal(true);
    }
  };

  const addProductToLog = async (
    product: ProductRecord,
    entryType: 'barcode' | 'photo_packaged' | 'photo_meal',
    quantityG?: number
  ) => {
    try {
      setAdding(true);

      await addProductToDay(
        selectedDate,
        product.id,
        entryType,
        quantityG,
        entryType === 'photo_meal' ? (product.calories_estimate || 'Pasto fotografato') : undefined
      );

      Alert.alert(
        'Prodotto Aggiunto!',
        `${product.product_name} è stato aggiunto al tuo diario`,
        [{
          text: 'OK',
          onPress: () => navigation.goBack()
        }]
      );
    } catch (error) {
      console.error('Errore aggiunta prodotto:', error);
      Alert.alert('Errore', 'Impossibile aggiungere il prodotto al diario');
    } finally {
      setAdding(false);
    }
  };

  const handleQuantityConfirm = () => {
    if (!selectedProduct) return;
    
    if (quantity <= 0) {
      Alert.alert('Errore', 'Inserisci una quantità valida');
      return;
    }

    setShowQuantityModal(false);
    const entryType = determineEntryType(selectedProduct);
    addProductToLog(selectedProduct, entryType, quantity);
  };

  const renderProduct = (product: ProductRecord) => {
    const entryType = determineEntryType(product);
    const isPhotoMeal = entryType === 'photo_meal';
    const showNutrition = entriesNutritionVisibility[product.id];
    
    // Determina il colore della card basato sul punteggio salute
    const cardColor = product.health_score !== undefined ? getScoreColor(product.health_score) : '#000000';
    
    // Per i prodotti photo_meal, estrai i valori dal breakdown
    // Per i prodotti photo_packaged, usa i valori stimati per 100g
    let nutritionValues = {
      kcal: product.estimated_energy_kcal_100g || product.energy_kcal_100g || 0,
      proteins: product.estimated_proteins_100g || product.proteins_100g || 0,
      carbs: product.estimated_carbs_100g || product.carbohydrates_100g || 0,
      fats: product.estimated_fats_100g || product.fat_100g || 0
    };
    
    if (isPhotoMeal && product.ingredients_breakdown) {
      try {
        // Il breakdown può essere già un array o una stringa JSON da parsare
        let breakdown;
        if (typeof product.ingredients_breakdown === 'string') {
          breakdown = JSON.parse(product.ingredients_breakdown);
        } else if (Array.isArray(product.ingredients_breakdown)) {
          breakdown = product.ingredients_breakdown;
        }
        
        if (Array.isArray(breakdown)) {
          nutritionValues = {
            kcal: breakdown.reduce((sum, item) => sum + (item.estimated_calories_kcal || 0), 0),
            proteins: breakdown.reduce((sum, item) => sum + (item.estimated_proteins_g || 0), 0),
            carbs: breakdown.reduce((sum, item) => sum + (item.estimated_carbs_g || 0), 0),
            fats: breakdown.reduce((sum, item) => sum + (item.estimated_fats_g || 0), 0)
          };
        }
      } catch (error) {
        console.error('Errore parsing ingredients_breakdown:', error);
      }
    }
    
    return (
      <View key={product.id}>
        {/* Card unificata */}
        <View style={showNutrition ? styles.entryCardWrapperExpanded : styles.entryCardWrapper}>
          <View style={[styles.entryCardShadow, { backgroundColor: cardColor }]} />
          <TouchableOpacity 
            style={[
              styles.entryCardContainer,
              { borderColor: cardColor },
              showNutrition && styles.entryCardContainerExpanded
            ]}
            onPress={() => toggleNutritionVisibility(product.id)}
            activeOpacity={1}
          >
            {/* Prima riga: Immagine, Nome, Marchio, Punteggio + Icone azioni se espansa */}
            <View style={styles.entryFirstRow}>
              <View style={styles.entryImageWrapper}>
                <View style={[styles.entryImageShadow, { backgroundColor: cardColor }]} />
                {product.product_image ? (
                  <Image 
                    source={{ uri: product.product_image }} 
                    style={[styles.entryImage, { borderColor: cardColor }]} 
                  />
                ) : (
                  <View style={[styles.entryImagePlaceholder, { borderColor: cardColor }]}>
                    <Ionicons name="image-outline" size={24} color="#666666" />
                  </View>
                )}
              </View>
              
              <View style={styles.entryInfo}>
                <Text style={styles.entryName} numberOfLines={2} ellipsizeMode="tail" allowFontScaling={false}>
                  {product.product_name}
                </Text>
                
                {/* Punteggio salute con pulsante colorato */}
                <View style={styles.entryScoreContainer}>
                  <View style={[styles.scoreButton, { backgroundColor: getScoreColor(product.health_score) }]}>
                    <Ionicons name="heart" size={14} color="#FFFFFF" />
                    <Text style={styles.scoreButtonText}>
                      {product.health_score || '--'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Icone azioni - Visibili solo quando la card è espansa */}
              {showNutrition && (
                <View style={styles.cardActionsHeader}>
                  <TouchableOpacity 
                    style={styles.headerActionButton}
                    onPress={() => {
                      navigation.navigate('ProductDetail', {
                        productRecordId: product.id,
                        openedFromDiary: true
                      });
                    }}
                  >
                    <Ionicons name="eye" size={22} color="#666666" />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.addButton}
                    onPress={() => handleProductSelect(product)}
                  >
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Seconda riga: Valori nutrizionali (se espansi) */}
            {showNutrition && (
                                <View style={styles.nutritionRowContainer}>


                    {/* Grid 2x2 con i valori nutrizionali */}
                    <View style={styles.nutritionGridContainer}>
                  {/* Calorie */}
                  <View style={styles.nutritionItemWrapper}>
                    <View style={styles.nutritionItemContent}>
                      <View style={[
                        styles.nutritionIconContainer,
                        { backgroundColor: getNutrientIconColor('energy_kcal_100g') }
                      ]}>
                        <Ionicons 
                          name={getNutrientIconName('energy_kcal_100g') as any} 
                          size={22} 
                          color="#000000" 
                        />
                      </View>
                      
                      <Text style={styles.nutritionValueText} allowFontScaling={false}>
                        {formatNutritionValue(nutritionValues.kcal, 'kcal')}
                      </Text>
                      
                      <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                        Energia
                      </Text>
                      
                      <View style={styles.nutritionProgressContainer}>
                        <View style={[
                          styles.nutritionProgressFill,
                          { 
                            width: `${Math.min((nutritionValues.kcal / 900) * 100, 100)}%`,
                            backgroundColor: getNutrientIconColor('energy_kcal_100g')
                          }
                        ]} />
                      </View>
                    </View>
                  </View>

                  {/* Proteine */}
                  <View style={styles.nutritionItemWrapper}>
                    <View style={styles.nutritionItemContent}>
                      <View style={[
                        styles.nutritionIconContainer,
                        { backgroundColor: getNutrientIconColor('proteins_100g') }
                      ]}>
                        <Ionicons 
                          name={getNutrientIconName('proteins_100g') as any} 
                          size={22} 
                          color="#000000" 
                        />
                      </View>
                      
                      <Text style={styles.nutritionValueText} allowFontScaling={false}>
                        {formatNutritionValue(nutritionValues.proteins, 'g')}
                      </Text>
                      
                      <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                        Proteine
                      </Text>
                      
                      <View style={styles.nutritionProgressContainer}>
                        <View style={[
                          styles.nutritionProgressFill,
                          { 
                            width: `${Math.min((nutritionValues.proteins / 50) * 100, 100)}%`,
                            backgroundColor: getNutrientIconColor('proteins_100g')
                          }
                        ]} />
                      </View>
                    </View>
                  </View>

                  {/* Carboidrati */}
                  <View style={styles.nutritionItemWrapper}>
                    <View style={styles.nutritionItemContent}>
                      <View style={[
                        styles.nutritionIconContainer,
                        { backgroundColor: getNutrientIconColor('carbohydrates_100g') }
                      ]}>
                        <Ionicons 
                          name={getNutrientIconName('carbohydrates_100g') as any} 
                          size={22} 
                          color="#000000" 
                        />
                      </View>
                      
                      <Text style={styles.nutritionValueText} allowFontScaling={false}>
                        {formatNutritionValue(nutritionValues.carbs, 'g')}
                      </Text>
                      
                      <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                        Carboidrati
                      </Text>
                      
                      <View style={styles.nutritionProgressContainer}>
                        <View style={[
                          styles.nutritionProgressFill,
                          { 
                            width: `${Math.min((nutritionValues.carbs / 100) * 100, 100)}%`,
                            backgroundColor: getNutrientIconColor('carbohydrates_100g')
                          }
                        ]} />
                      </View>
                    </View>
                  </View>

                  {/* Grassi */}
                  <View style={styles.nutritionItemWrapper}>
                    <View style={styles.nutritionItemContent}>
                      <View style={[
                        styles.nutritionIconContainer,
                        { backgroundColor: getNutrientIconColor('fat_100g') }
                      ]}>
                        <Ionicons 
                          name={getNutrientIconName('fat_100g') as any} 
                          size={22} 
                          color="#000000" 
                        />
                      </View>
                      
                      <Text style={styles.nutritionValueText} allowFontScaling={false}>
                        {formatNutritionValue(nutritionValues.fats, 'g')}
                      </Text>
                      
                      <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                        Grassi
                      </Text>
                      
                      <View style={styles.nutritionProgressContainer}>
                        <View style={[
                          styles.nutritionProgressFill,
                          { 
                            width: `${Math.min((nutritionValues.fats / 50) * 100, 100)}%`,
                            backgroundColor: getNutrientIconColor('fat_100g')
                          }
                        ]} />
                      </View>
                    </View>
                  </View>
                </View>

                                {/* Descrizione sotto i valori nutrizionali */}
                <View style={[
                  styles.nutritionInfoContainer,
                  {
                    backgroundColor: product.health_score !== undefined 
                      ? `${getScoreColor(product.health_score)}15` 
                      : '#F8F8F8',
                    borderColor: product.health_score !== undefined 
                      ? `${getScoreColor(product.health_score)}40` 
                      : '#E5E5E5',
                  }
                ]}>
                  <Text style={styles.nutritionInfoText} allowFontScaling={false}>
                     {entryType === 'photo_meal' 
                       ? (
                           <Text>
                             Valori stimati per il <Text style={styles.boldText}>pasto</Text> fotografato
                           </Text>
                         )
                       : 'Valori nutrizionali per 100g di prodotto'
                     }
                   </Text>
                </View>

              </View>
            )}
          </TouchableOpacity>
        </View>

      </View>
    );
  };

  const renderQuantityModal = () => (
    <Modal
      visible={showQuantityModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowQuantityModal(false)}
    >
      <View style={styles.pickerModalOverlay}>
        <View style={styles.pickerModalContent}>
          <View style={styles.pickerModalHeader}>
            <TouchableOpacity onPress={() => setShowQuantityModal(false)}>
              <Text style={styles.pickerModalCancelText} allowFontScaling={false}>Annulla</Text>
            </TouchableOpacity>
            <Text style={styles.pickerModalTitle} allowFontScaling={false}>Seleziona Quantità</Text>
            <TouchableOpacity onPress={handleQuantityConfirm} disabled={adding}>
              <Text style={[styles.pickerModalDoneText, adding && styles.pickerModalDoneTextDisabled]} allowFontScaling={false}>
                {adding ? 'Aggiungendo...' : 'Aggiungi'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {selectedProduct && (
            <View style={styles.pickerProductInfo}>
              <Text style={styles.pickerProductName} allowFontScaling={false}>{selectedProduct.product_name}</Text>
              {selectedProduct.brand && (
                <Text style={styles.pickerProductBrand} allowFontScaling={false}>{selectedProduct.brand}</Text>
              )}
            </View>
          )}

          {/* Sezione grigia che si estende fino al bottom */}
          <View style={styles.pickerBottomSection}>
            {Platform.OS === 'ios' ? (
              <Picker
                selectedValue={quantity}
                onValueChange={(value) => setQuantity(value)}
                style={styles.quantityPicker}
                itemStyle={styles.quantityPickerItem}
              >
                {Array.from({ length: 191 }, (_, i) => i + 10).map(weight => (
                  <Picker.Item 
                    key={weight} 
                    label={`${weight} g`} 
                    value={weight}
                    color={BORDER_COLOR}
                  />
                ))}
              </Picker>
            ) : (
              <View style={styles.androidPickerContainer}>
                <FlatList
                  data={Array.from({ length: 191 }, (_, i) => i + 10)}
                  keyExtractor={(item) => item.toString()}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.androidPickerContent}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.androidPickerItem,
                        quantity === item && styles.androidPickerItemSelected
                      ]}
                      onPress={() => setQuantity(item)}
                    >
                      <Text style={[
                        styles.androidPickerText,
                        quantity === item && styles.androidPickerTextSelected
                      ]} allowFontScaling={false}>
                        {item} g
                      </Text>
                    </TouchableOpacity>
                  )}
                  getItemLayout={(data, index) => ({
                    length: 44,
                    offset: 44 * index,
                    index,
                  })}
                  initialScrollIndex={Math.max(0, quantity - 10)}
                />
              </View>
            )}

            {selectedProduct && (
              <View style={styles.pickerNutritionPreview}>
                <Text style={styles.pickerNutritionTitle} allowFontScaling={false}>Valori per {quantity}g:</Text>
                <View style={styles.pickerNutritionGrid}>
                  <View style={styles.pickerNutritionItem}>
                    <Text style={styles.pickerNutritionValue} allowFontScaling={false}>
                      {Math.round((selectedProduct.estimated_energy_kcal_100g || selectedProduct.energy_kcal_100g || 0) * quantity / 100)}
                    </Text>
                    <Text style={styles.pickerNutritionLabel} allowFontScaling={false}>kcal</Text>
                  </View>
                  <View style={styles.pickerNutritionItem}>
                    <Text style={styles.pickerNutritionValue} allowFontScaling={false}>
                      {Math.round((selectedProduct.estimated_proteins_100g || selectedProduct.proteins_100g || 0) * quantity / 100)}g
                    </Text>
                    <Text style={styles.pickerNutritionLabel} allowFontScaling={false}>proteine</Text>
                  </View>
                  <View style={styles.pickerNutritionItem}>
                    <Text style={styles.pickerNutritionValue} allowFontScaling={false}>
                      {Math.round((selectedProduct.estimated_carbs_100g || selectedProduct.carbohydrates_100g || 0) * quantity / 100)}g
                    </Text>
                    <Text style={styles.pickerNutritionLabel} allowFontScaling={false}>carb</Text>
                  </View>
                  <View style={styles.pickerNutritionItem}>
                    <Text style={styles.pickerNutritionValue} allowFontScaling={false}>
                      {Math.round((selectedProduct.estimated_fats_100g || selectedProduct.fat_100g || 0) * quantity / 100)}g
                    </Text>
                    <Text style={styles.pickerNutritionLabel} allowFontScaling={false}>grassi</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText} allowFontScaling={false}>Caricamento prodotti...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header semplificato - solo freccia indietro - DENTRO lo scroll */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={BORDER_COLOR} />
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
        </View>

        {/* Titolo sotto l'header - DENTRO lo scroll */}
        <View style={styles.titleContainer}>
          <Text style={styles.pageTitle} allowFontScaling={false}>Aggiungi al Diario</Text>
          <Text style={styles.pageSubtitle} allowFontScaling={false}>
            per {new Date(selectedDate).toLocaleDateString('it', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </Text>
        </View>

        {/* Pulsanti di azione rapida - Uno per riga con stile app */}
        <View style={styles.quickActionsContainer}>
          <View style={styles.quickActionWrapper}>
            <View style={[styles.quickActionShadow, { backgroundColor: '#4A90E2' }]} />
            <TouchableOpacity
              style={[styles.quickActionButton, { borderColor: '#4A90E2' }]}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Scanner' })}
              activeOpacity={1}
            >
              <View style={styles.quickActionContent}>
                <View style={styles.quickActionIconContainer}>
                  <Ionicons name="qr-code" size={24} color={BORDER_COLOR} />
                </View>
                <View style={styles.quickActionTextContainer}>
                  <Text style={styles.quickActionTitle} allowFontScaling={false}>Scansiona Codice a Barre</Text>
                  <Text style={styles.quickActionSubtitle} allowFontScaling={false}>Trova prodotti dal barcode</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666666" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.quickActionWrapper}>
            <View style={[styles.quickActionShadow, { backgroundColor: '#50C878' }]} />
            <TouchableOpacity
              style={[styles.quickActionButton, { borderColor: '#50C878' }]}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Foto' })}
              activeOpacity={1}
            >
              <View style={styles.quickActionContent}>
                <View style={styles.quickActionIconContainer}>
                  <Ionicons name="camera" size={24} color={BORDER_COLOR} />
                </View>
                <View style={styles.quickActionTextContainer}>
                  <Text style={styles.quickActionTitle} allowFontScaling={false}>Analizza con Foto</Text>
                  <Text style={styles.quickActionSubtitle} allowFontScaling={false}>Scatta e analizza il cibo</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666666" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu tab e filtri - Design pulito e moderno */}
        <View style={styles.filtersContainer}>
          {/* Tab semplici */}
          <View style={styles.simpleTabsContainer}>
            <TouchableOpacity
              style={[styles.simpleTab, activeTab === 'recent' && styles.simpleTabActive]}
              onPress={() => setActiveTab('recent')}
              activeOpacity={1}
            >
              <Text style={[styles.simpleTabText, activeTab === 'recent' && styles.simpleTabTextActive]} allowFontScaling={false}>
                Recenti
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.simpleTab, activeTab === 'saved' && styles.simpleTabActive]}
              onPress={() => setActiveTab('saved')}
              activeOpacity={1}
            >
              <Text style={[styles.simpleTabText, activeTab === 'saved' && styles.simpleTabTextActive]} allowFontScaling={false}>
                Salvati
              </Text>
            </TouchableOpacity>
          </View>

          {/* Filtri punteggio salute */}
          <View style={styles.healthFiltersContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.healthFiltersScroll}>
              <TouchableOpacity
                style={[styles.healthFilter, healthFilter === 'all' && styles.healthFilterActive]}
                onPress={() => setHealthFilter('all')}
              >
                <Text style={[styles.healthFilterText, healthFilter === 'all' && styles.healthFilterTextActive]} allowFontScaling={false}>
                  Tutti
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.healthFilter, healthFilter === 'eccellente' && styles.healthFilterActive]}
                onPress={() => setHealthFilter('eccellente')}
              >
                <Ionicons name="heart" size={16} color={healthFilter === 'eccellente' ? '#FFFFFF' : '#4A90E2'} />
                <Text style={[styles.healthFilterText, healthFilter === 'eccellente' && styles.healthFilterTextActive]} allowFontScaling={false}>
                  Eccellente
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.healthFilter, healthFilter === 'ottimo' && styles.healthFilterActive]}
                onPress={() => setHealthFilter('ottimo')}
              >
                <Ionicons name="heart" size={16} color={healthFilter === 'ottimo' ? '#FFFFFF' : '#1E8F4E'} />
                <Text style={[styles.healthFilterText, healthFilter === 'ottimo' && styles.healthFilterTextActive]} allowFontScaling={false}>
                  Ottimo
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.healthFilter, healthFilter === 'buono' && styles.healthFilterActive]}
                onPress={() => setHealthFilter('buono')}
              >
                <Ionicons name="heart" size={16} color={healthFilter === 'buono' ? '#FFFFFF' : '#7AC547'} />
                <Text style={[styles.healthFilterText, healthFilter === 'buono' && styles.healthFilterTextActive]} allowFontScaling={false}>
                  Buono
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.healthFilter, healthFilter === 'discreto' && styles.healthFilterActive]}
                onPress={() => setHealthFilter('discreto')}
              >
                <Ionicons name="heart" size={16} color={healthFilter === 'discreto' ? '#FFFFFF' : '#E6A500'} />
                <Text style={[styles.healthFilterText, healthFilter === 'discreto' && styles.healthFilterTextActive]} allowFontScaling={false}>
                  Discreto
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.healthFilter, healthFilter === 'scarso' && styles.healthFilterActive]}
                onPress={() => setHealthFilter('scarso')}
              >
                <Ionicons name="heart" size={16} color={healthFilter === 'scarso' ? '#FFFFFF' : '#FF0000'} />
                <Text style={[styles.healthFilterText, healthFilter === 'scarso' && styles.healthFilterTextActive]} allowFontScaling={false}>
                  Scarso
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>

        {/* Contenuto che cambia in base al tab */}
        {activeTab === 'recent' ? (
          (() => {
            const filteredProducts = getFilteredProducts();
            return filteredProducts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={64} color="#CCCCCC" />
                <Text style={styles.emptyStateTitle} allowFontScaling={false}>
                  {healthFilter === 'all' ? 'Nessun prodotto recente' : 'Nessun prodotto trovato'}
                </Text>
                <Text style={styles.emptyStateDescription} allowFontScaling={false}>
                  {healthFilter === 'all' 
                    ? 'I prodotti che analizzi appariranno qui per un accesso rapido al tuo diario'
                    : 'Nessun prodotto corrisponde al filtro selezionato'
                  }
                </Text>
              </View>
            ) : (
              <View style={styles.productsContainer}>
                {filteredProducts.map(renderProduct)}
              </View>
            );
          })()
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="bookmark-outline" size={64} color="#CCCCCC" />
            <Text style={styles.emptyStateTitle} allowFontScaling={false}>Nessun prodotto salvato</Text>
            <Text style={styles.emptyStateDescription} allowFontScaling={false}>
              I prodotti che salverai appariranno qui per un accesso rapido
            </Text>
          </View>
        )}
      </ScrollView>

      {renderQuantityModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Regular',
    color: BORDER_COLOR,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 20,
  },
  backButton: {
    padding: 8,
  },
  headerSpacer: {
    width: 40,
  },
  titleContainer: {
    padding: 20,
  },
  pageTitle: {
    fontSize: scaleFont(24),
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
  },
  pageSubtitle: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  // Nuovo design filtri e tab
  filtersContainer: {
    marginHorizontal: 20,
    marginBottom: 16, // Ridotto da 28 a 16 per uniformare
  },
  simpleTabsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  simpleTab: {
    flex: 1, // Occupa metà dello spazio disponibile
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center', // Centra il testo
  },
  simpleTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: PRIMARY_GREEN,
    marginBottom: -1, // Sovrappone la riga grigia
  },
  simpleTabText: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
  },
  simpleTabTextActive: {
    color: PRIMARY_GREEN,
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  healthFiltersContainer: {
    marginTop: 8,
    marginBottom: 0, // Ridotto spacing verso le card
  },
  filtersLabel: {
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
    marginBottom: 12,
  },
  healthFiltersScroll: {
    paddingRight: 20,
  },
  healthFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 6,
  },
  healthFilterActive: {
    backgroundColor: PRIMARY_GREEN,
    borderColor: PRIMARY_GREEN,
  },
  healthFilterText: {
    fontSize: scaleFont(13),
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
  },
  healthFilterTextActive: {
    color: '#FFFFFF',
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  quickActionsContainer: {
    marginHorizontal: 16,
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  quickActionWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  quickActionShadow: {
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    backgroundColor: BORDER_COLOR,
    borderRadius: CARD_BORDER_RADIUS,
    zIndex: 0,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 20,
    position: 'relative',
    zIndex: 1,
  },
  quickActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  quickActionIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F8F4EC',
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  quickActionTextContainer: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    marginBottom: 4,
  },
  quickActionSubtitle: {
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120, // Padding per evitare sovrapposizione con navbar
  },
  productsContainer: {
    padding: 16,
  },
  
  // Entry Card Styles (dal CalorieTrackingScreen)
  entryCardWrapper: {
    position: 'relative',
    marginBottom: 24, // Aumentato leggermente da 20 a 24
  },
  entryCardWrapperExpanded: {
    position: 'relative',
    marginBottom: 28, // Ridotto da 40 a 28 per meno spazio
  },
  entryCardShadow: {
    backgroundColor: 'black',
    borderRadius: 16,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
  },
  entryCardContainer: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18, // Semplificato il padding come nel HomeScreen
    position: 'relative',
    zIndex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    height: 150, // Altezza fissa come nel HomeScreen invece di minHeight
    justifyContent: 'flex-start', // Sempre flex-start per posizione fissa
  },
  entryCardContainerExpanded: {
    height: 'auto', // Altezza automatica quando espansa
    justifyContent: 'flex-start', // Sempre flex-start per posizione fissa
    padding: 18, // Stesso padding per evitare spostamenti
    paddingBottom: 15, // Padding bottom diverso per il contenuto espanso
  },
  entryFirstRow: {
    flexDirection: 'row',
    alignItems: 'center', // Manteniamo questo per allineare immagine e contenuto
    marginTop: 4.5, // Margine top fisso per centrare nella card chiusa
    marginBottom: 0, // Ridotto da 12 a 0 per centratura perfetta
  },
  entryImageWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
    marginRight: 18,
  },
  entryImageShadow: {
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: 100,
    height: 100,
    backgroundColor: '#000000',
    borderRadius: 12,
    zIndex: 0,
  },
  entryImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#000000',
    position: 'relative',
    zIndex: 2,
    resizeMode: 'cover',
  },
  entryImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
  },
  entryInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 5,
  },
  expandIndicator: {
    paddingLeft: 12,
    justifyContent: 'center',
  },
  expandIndicatorBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -25,
    marginBottom: 14,
  },
  expandIndicatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  expandIndicatorIconContainer: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  entryName: {
    fontSize: scaleFont(19),
    fontFamily: 'BricolageGrotesque-Regular',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 5,
    lineHeight: 22,
  },
  entryBrand: {
    fontSize: scaleFont(15),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#333333',
    opacity: 0.7,
    marginBottom: 6,
  },
  entryScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 0, // Cambiato da 8 a 0 per allineamento perfetto come HomeScreen
  },
  entryScoreIcon: {
    marginRight: 5,
  },
  entryScoreValue: {
    fontSize: scaleFont(15),
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: '#000000',
  },
  
  // Nutrition Row Container - Dentro la card unificata
  nutritionRowContainer: {
    marginTop: 16, // Spazio dalla prima riga
    paddingTop: 24, // Aumentato da 16 a 24
    // Rimossa la riga grigia di separazione
    alignSelf: 'stretch', // Assicura che si estenda per tutta la larghezza
  },
  nutritionExpandedShadow: {
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    backgroundColor: BORDER_COLOR,
    borderRadius: CARD_BORDER_RADIUS,
    zIndex: 0,
  },
  nutritionExpandedContainer: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 20,
    position: 'relative',
    zIndex: 1,
  },
  nutritionGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  nutritionItemWrapper: {
    width: '48%', // Due colonne
    marginBottom: 28,
  },
  nutritionItemContent: {
    alignItems: 'center',
  },
  nutritionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  nutritionValueText: {
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    textAlign: 'center',
    marginBottom: 4,
  },
  nutritionLabelText: {
    fontSize: 13,
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
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
  
  // Dashed Buttons
  cardButtonsContainer: {
    flexDirection: 'row',
    marginTop: 4,
    justifyContent: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12, // Spazio tra i pulsanti
    width: '100%',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F8F8F8',
  },
  secondaryButtonText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'BricolageGrotesque-Medium',
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: PRIMARY_GREEN,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 70, 59, 0.05)',
  },
  primaryButtonText: {
    color: PRIMARY_GREEN,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  dashedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: 'rgba(0, 70, 59, 0.05)',
    width: '100%',
  },
  dashedButtonAdd: {
    borderColor: '#00A86B',
    backgroundColor: 'rgba(0, 168, 107, 0.05)',
  },
  dashedButtonText: {
    fontSize: 24,
    fontFamily: 'BricolageGrotesque-Bold',
    fontWeight: '900',
  },
  dashedButtonTextAdd: {
    color: '#00A86B',
  },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: '#666666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateDescription: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#888888',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },

  
  // Picker Modal Styles - copiati da NutritionProfileSetupScreen
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: CARD_BACKGROUND_COLOR, // Torna bianco per il container principale
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%', // Limita l'altezza massima
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: CARD_BACKGROUND_COLOR, // Header bianco
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  pickerModalTitle: {
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
  },
  pickerModalCancelText: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  pickerModalDoneText: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: PRIMARY_GREEN,
  },
  pickerModalDoneTextDisabled: {
    opacity: 0.5,
  },
  pickerProductInfo: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: CARD_BACKGROUND_COLOR, // Sezione prodotto bianca
  },
  pickerProductName: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    marginBottom: 4,
  },
  pickerProductBrand: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  pickerBottomSection: {
    backgroundColor: BACKGROUND_COLOR,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 15, // Ridotto il padding bottom
    minHeight: Platform.OS === 'ios' ? 350 : 280, // Più basso su Android per uniformare
  },
  quantityPicker: {
    height: 200,
    backgroundColor: BACKGROUND_COLOR, // Stesso colore della sezione
    marginHorizontal: 20,
  },
  quantityPickerItem: {
    color: BORDER_COLOR,
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-Regular',
  },
  // Stili per picker Android custom
  androidPickerContainer: {
    height: 200,
    marginHorizontal: 20,
    backgroundColor: BACKGROUND_COLOR,
    borderRadius: 12,
  },
  androidPickerContent: {
    paddingVertical: 78, // Padding per centrare l'elemento selezionato
  },
  androidPickerItem: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  androidPickerItemSelected: {
    backgroundColor: 'rgba(0, 70, 59, 0.1)', // Verde trasparente per selezione
  },
  androidPickerText: {
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  androidPickerTextSelected: {
    color: BORDER_COLOR,
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  pickerNutritionPreview: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent', // Trasparente per mantenere il grigio della sezione
  },
  pickerNutritionTitle: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerNutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  pickerNutritionItem: {
    alignItems: 'center',
    flex: 1,
  },
  pickerNutritionValue: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Bold',
    color: PRIMARY_GREEN,
  },
  pickerNutritionLabel: {
    fontSize: 12,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginTop: 2,
  },
  portionDescription: {
    fontSize: scaleFont(12),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  nutritionDiscretionNote: {
    fontSize: scaleFont(13),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    textAlign: 'center',
    marginBottom: 6,
    fontStyle: 'italic',
  },
  nutritionInfoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: -1,
    marginBottom: 4,
    borderWidth: 1,
  },
  nutritionInfoText: {
    fontSize: scaleFont(13),
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#555555',
    textAlign: 'center',
  },
  cardActionsHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    marginLeft: 8,
  },
  headerActionButton: {
    padding: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00463B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  boldText: {
    fontFamily: 'BricolageGrotesque-Bold',
    fontWeight: '700',
  },
  // Stili per i pulsanti dei punteggi (copiati da RecentProductsSection)
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