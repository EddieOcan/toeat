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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getRecentProducts, ProductRecord } from '../../services/api';
import { addProductToDay } from '../../services/nutritionApi';

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
  const [quantity, setQuantity] = useState('100');
  const [adding, setAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'saved'>('recent');
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

  const getHealthScoreColor = (score: number | undefined | null): string => {
    if (score === undefined || score === null) return '#888888';
    if (score >= 81) return '#1E8F4E'; 
    if (score >= 61) return '#7AC547'; 
    if (score >= 41) return '#FFC734'; 
    if (score >= 21) return '#FF9900'; 
    if (score >= 0) return '#FF0000';   
    return '#888888';
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
    
    const quantityNum = parseFloat(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      Alert.alert('Errore', 'Inserisci una quantità valida');
      return;
    }

    setShowQuantityModal(false);
    const entryType = determineEntryType(selectedProduct);
    addProductToLog(selectedProduct, entryType, quantityNum);
  };

  const renderProduct = (product: ProductRecord) => {
    const entryType = determineEntryType(product);
    const isPhotoMeal = entryType === 'photo_meal';
    const showNutrition = entriesNutritionVisibility[product.id];
    
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
      <View key={product.id} style={{ marginBottom: 40 }}>
        {/* Card principale */}
        <View style={styles.entryCardWrapper}>
          <View style={styles.entryCardShadow} />
          <TouchableOpacity 
            style={styles.entryCardContainer}
            onPress={() => {/* Eventuale navigazione al dettaglio */}}
            activeOpacity={0.8}
          >
            {/* Prima riga: Immagine, Nome, Marchio, Punteggio */}
            <View style={styles.entryFirstRow}>
              <View style={styles.entryImageWrapper}>
                <View style={styles.entryImageShadow} />
                {product.product_image ? (
                  <Image 
                    source={{ uri: product.product_image }} 
                    style={styles.entryImage} 
                  />
                ) : (
                  <View style={styles.entryImagePlaceholder}>
                    <Ionicons name="image-outline" size={24} color="#666666" />
                  </View>
                )}
              </View>
              
              <View style={styles.entryInfo}>
                <Text style={styles.entryName} numberOfLines={2} ellipsizeMode="tail">
                  {product.product_name}
                </Text>
                {product.brand && (
                  <Text style={styles.entryBrand} numberOfLines={1} ellipsizeMode="tail">
                    {product.brand}
                  </Text>
                )}
                
                {/* Punteggio salute con cuore */}
                <View style={styles.entryScoreContainer}>
                  <Ionicons 
                    name="heart" 
                    size={18} 
                    color={getHealthScoreColor(product.health_score)} 
                    style={styles.entryScoreIcon} 
                  />
                  <Text style={styles.entryScoreValue}>
                    {product.health_score || '--'}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Valori nutrizionali espandibili - SOPRA i pulsanti */}
        {showNutrition && (
          <View style={styles.nutritionExpandedContainer}>
            <View style={styles.entryNutrition}>
              <View style={styles.nutritionItem}>
                <View style={[styles.nutritionIconCircle, { backgroundColor: '#FFA07A' }]}>
                  <Ionicons name="flame" size={16} color="#000000" />
                </View>
                <Text style={styles.nutritionLabel}>Calorie</Text>
                <Text style={styles.nutritionValue}>
                  {Math.round(nutritionValues.kcal)}
                </Text>
              </View>
              <View style={styles.nutritionItem}>
                <View style={[styles.nutritionIconCircle, { backgroundColor: '#CD5C5C' }]}>
                  <Ionicons name="barbell" size={16} color="#000000" />
                </View>
                <Text style={styles.nutritionLabel}>Proteine</Text>
                <Text style={styles.nutritionValue}>
                  {Math.round(nutritionValues.proteins)}g
                </Text>
              </View>
              <View style={styles.nutritionItem}>
                <View style={[styles.nutritionIconCircle, { backgroundColor: '#FFD700' }]}>
                  <Ionicons name="layers" size={16} color="#000000" />
                </View>
                <Text style={styles.nutritionLabel}>Carboidrati</Text>
                <Text style={styles.nutritionValue}>
                  {Math.round(nutritionValues.carbs)}g
                </Text>
              </View>
              <View style={styles.nutritionItem}>
                <View style={[styles.nutritionIconCircle, { backgroundColor: '#87CEEB' }]}>
                  <Ionicons name="cafe" size={16} color="#000000" />
                </View>
                <Text style={styles.nutritionLabel}>Grassi</Text>
                <Text style={styles.nutritionValue}>
                  {Math.round(nutritionValues.fats)}g
                </Text>
              </View>
            </View>
            
            {/* Descrizione della porzione */}
            {!isPhotoMeal && (
              <Text style={styles.portionDescription}>
                (Prodotto confezionato, valori per 100g)
              </Text>
            )}
            {isPhotoMeal && (
              <Text style={styles.portionDescription}>
                (Pasto fotografato, valori stimati)
              </Text>
            )}
          </View>
        )}
        
        {/* Pulsanti tratteggiati - SOTTO i valori nutrizionali */}
        <View style={[styles.cardButtonsContainer, { marginTop: showNutrition ? 12 : -8 }]}>
          <TouchableOpacity
            style={[styles.dashedButton, styles.dashedButtonNutrition]}
            onPress={() => toggleNutritionVisibility(product.id)}
          >
            <Ionicons 
              name={showNutrition ? "chevron-up" : "chevron-down"} 
              size={20} 
              color={PRIMARY_GREEN} 
            />
            <Text style={[styles.dashedButtonText, styles.dashedButtonTextNutrition]}>
              {showNutrition ? 'Nascondi' : 'Mostra'} Valori
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.dashedButton, styles.dashedButtonAdd]}
            onPress={() => handleProductSelect(product)}
          >
            <Ionicons name="add" size={18} color="#4ECDC4" />
            <Text style={[styles.dashedButtonText, styles.dashedButtonTextAdd]}>
              {isPhotoMeal ? 'Aggiungi' : 'Aggiungi'}
            </Text>
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalWrapper}>
          <View style={styles.modalShadow} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Inserisci Quantità</Text>
              <TouchableOpacity
                onPress={() => setShowQuantityModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {selectedProduct && (
              <View style={styles.modalProductInfo}>
                <Text style={styles.modalProductName}>{selectedProduct.product_name}</Text>
                {selectedProduct.brand && (
                  <Text style={styles.modalProductBrand}>{selectedProduct.brand}</Text>
                )}
              </View>
            )}

            <View style={styles.quantityInputContainer}>
              <Text style={styles.quantityLabel}>Quantità (grammi)</Text>
              <View style={styles.quantityInputWrapper}>
                <View style={styles.quantityInputShadow} />
                <View style={styles.quantityInputField}>
                  <TextInput
                    style={styles.quantityInput}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="numeric"
                    placeholder="100"
                    autoFocus
                  />
                  <Text style={styles.quantityUnit}>g</Text>
                </View>
              </View>
            </View>

            {selectedProduct && (
              <View style={styles.nutritionPreviewWrapper}>
                <View style={styles.nutritionPreviewShadow} />
                <View style={styles.nutritionPreview}>
                  <Text style={styles.nutritionPreviewTitle}>Valori nutrizionali per {quantity}g:</Text>
                  <View style={styles.nutritionPreviewGrid}>
                    <View style={styles.nutritionPreviewItem}>
                      <Text style={styles.nutritionPreviewValue}>
                        {Math.round((selectedProduct.estimated_energy_kcal_100g || selectedProduct.energy_kcal_100g || 0) * (parseFloat(quantity) || 0) / 100)}
                      </Text>
                      <Text style={styles.nutritionPreviewLabel}>kcal</Text>
                    </View>
                    <View style={styles.nutritionPreviewItem}>
                      <Text style={styles.nutritionPreviewValue}>
                        {Math.round((selectedProduct.estimated_proteins_100g || selectedProduct.proteins_100g || 0) * (parseFloat(quantity) || 0) / 100)}g
                      </Text>
                      <Text style={styles.nutritionPreviewLabel}>proteine</Text>
                    </View>
                    <View style={styles.nutritionPreviewItem}>
                      <Text style={styles.nutritionPreviewValue}>
                        {Math.round((selectedProduct.estimated_carbs_100g || selectedProduct.carbohydrates_100g || 0) * (parseFloat(quantity) || 0) / 100)}g
                      </Text>
                      <Text style={styles.nutritionPreviewLabel}>carb</Text>
                    </View>
                    <View style={styles.nutritionPreviewItem}>
                      <Text style={styles.nutritionPreviewValue}>
                        {Math.round((selectedProduct.estimated_fats_100g || selectedProduct.fat_100g || 0) * (parseFloat(quantity) || 0) / 100)}g
                      </Text>
                      <Text style={styles.nutritionPreviewLabel}>grassi</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.modalButtons}>
              <View style={styles.cancelButtonWrapper}>
                <View style={styles.cancelButtonShadow} />
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowQuantityModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Annulla</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.confirmButtonWrapper}>
                <View style={styles.confirmButtonShadow} />
                <TouchableOpacity
                  style={[styles.confirmButton, adding && styles.confirmButtonDisabled]}
                  onPress={handleQuantityConfirm}
                  disabled={adding}
                >
                  <Text style={styles.confirmButtonText}>
                    {adding ? 'Aggiungendo...' : 'Aggiungi'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Caricamento prodotti...</Text>
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
          <Text style={styles.pageTitle}>Aggiungi al Diario</Text>
          <Text style={styles.pageSubtitle}>
            per {new Date(selectedDate).toLocaleDateString('it', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </Text>
        </View>

        {/* Sistema di navigazione tab - DENTRO lo scroll */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'recent' && styles.activeTab]}
            onPress={() => setActiveTab('recent')}
          >
            <Text style={[styles.tabText, activeTab === 'recent' && styles.activeTabText]}>
              I Tuoi Recenti
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'saved' && styles.activeTab]}
            onPress={() => setActiveTab('saved')}
          >
            <Text style={[styles.tabText, activeTab === 'saved' && styles.activeTabText]}>
              Salvati
            </Text>
          </TouchableOpacity>
        </View>

        {/* Contenuto che cambia in base al tab */}
        {activeTab === 'recent' ? (
          recentProducts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="scan-outline" size={64} color="#CCCCCC" />
              <Text style={styles.emptyStateTitle}>Nessun prodotto recente</Text>
              <Text style={styles.emptyStateDescription}>
                Scansiona alcuni prodotti per vederli qui e aggiungerli rapidamente al tuo diario
              </Text>
              <View style={styles.scanButtonWrapper}>
                <View style={styles.scanButtonShadow} />
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={() => navigation.navigate('Foto')}
                >
                  <Ionicons name="camera" size={20} color="#FFFFFF" />
                  <Text style={styles.scanButtonText}>Scansiona Prodotto</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.productsContainer}>
              {recentProducts.map(renderProduct)}
            </View>
          )
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="bookmark-outline" size={64} color="#CCCCCC" />
            <Text style={styles.emptyStateTitle}>Nessun prodotto salvato</Text>
            <Text style={styles.emptyStateDescription}>
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
    fontSize: 24,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
  },
  pageSubtitle: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 8,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#4ECDC4',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: '#4ECDC4',
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: '#4ECDC4',
  },
  activeTabText: {
    color: '#FFFFFF',
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
    marginBottom: 24,
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
    paddingTop: 24,
    paddingBottom: 15,
    paddingHorizontal: 18,
    position: 'relative',
    zIndex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    minHeight: 150,
  },
  entryFirstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  entryName: {
    fontSize: 19,
    fontFamily: 'BricolageGrotesque-Regular',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 5,
    lineHeight: 22,
  },
  entryBrand: {
    fontSize: 15,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#333333',
    opacity: 0.7,
    marginBottom: 6,
  },
  entryScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  entryScoreIcon: {
    marginRight: 5,
  },
  entryScoreValue: {
    fontSize: 15,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: '#000000',
  },
  
  // Nutrition Expanded Styles
  nutritionExpandedContainer: {
    marginTop: -8,
    marginBottom: 0,
    padding: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  entryNutrition: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 0,
    paddingHorizontal: 0,
  },
  nutritionItem: {
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
  },
  nutritionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  nutritionLabel: {
    fontSize: 12,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginBottom: 4,
    textAlign: 'center',
  },
  nutritionValue: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Bold',
    color: '#000000',
    textAlign: 'center',
  },
  
  // Dashed Buttons
  cardButtonsContainer: {
    flexDirection: 'row',
    marginTop: 0,
    gap: 8,
  },
  dashedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: 'rgba(0, 70, 59, 0.05)',
  },
  dashedButtonNutrition: {
    borderColor: PRIMARY_GREEN,
  },
  dashedButtonAdd: {
    borderColor: '#4ECDC4',
    backgroundColor: 'rgba(78, 205, 196, 0.05)',
  },
  dashedButtonText: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-SemiBold',
    marginLeft: 6,
  },
  dashedButtonTextNutrition: {
    color: PRIMARY_GREEN,
  },
  dashedButtonTextAdd: {
    color: '#4ECDC4',
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
  scanButtonWrapper: {
    position: 'relative',
  },
  scanButtonShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  scanButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 20,
  },
  modalShadow: {
    backgroundColor: BORDER_COLOR,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  modalContent: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
    maxHeight: '80%',
    position: 'relative',
    zIndex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
    marginBottom: 24,
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
    marginBottom: 24,
  },
  quantityLabel: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    marginBottom: 8,
  },
  quantityInputWrapper: {
    position: 'relative',
  },
  quantityInputShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  quantityInputField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    paddingHorizontal: 16,
    position: 'relative',
    zIndex: 1,
  },
  quantityInput: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-Regular',
    paddingVertical: 16,
    color: BORDER_COLOR,
  },
  quantityUnit: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
    marginLeft: 8,
  },
  nutritionPreviewWrapper: {
    position: 'relative',
    marginBottom: 24,
  },
  nutritionPreviewShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  nutritionPreview: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 16,
    position: 'relative',
    zIndex: 1,
  },
  nutritionPreviewTitle: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    marginBottom: 12,
  },
  nutritionPreviewGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nutritionPreviewItem: {
    alignItems: 'center',
    flex: 1,
  },
  nutritionPreviewValue: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Bold',
    color: '#4ECDC4',
  },
  nutritionPreviewLabel: {
    fontSize: 12,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginTop: 2,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButtonWrapper: {
    flex: 1,
    position: 'relative',
  },
  cancelButtonShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  cancelButton: {
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    backgroundColor: CARD_BACKGROUND_COLOR,
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  cancelButtonText: {
    color: '#666666',
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  confirmButtonWrapper: {
    flex: 1,
    position: 'relative',
  },
  confirmButtonShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  confirmButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    paddingVertical: 16,
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  portionDescription: {
    fontSize: 12,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
}); 