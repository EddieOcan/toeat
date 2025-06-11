import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Dimensions,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import {
  getUserNutritionProfile,
  getDailyNutritionLog,
  getDailyNutritionEntries,
  removeNutritionEntry,
  UserNutritionProfile,
  DailyNutritionLog,
  DailyNutritionEntry,
} from '../../services/nutritionApi';

// Costanti di stile per uniformare con l'app
const BACKGROUND_COLOR = '#f8f4ec';
const CARD_BACKGROUND_COLOR = '#FFFFFF';
const BORDER_COLOR = '#000000';
const PRIMARY_GREEN = '#00463b'; // Verde scuro della navbar
const SHADOW_OFFSET_VALUE = 3.5;
const CARD_BORDER_WIDTH = 1.5;
const CARD_BORDER_RADIUS = 16;

const { width } = Dimensions.get('window');

// Interfaccia estesa per includere health_score dal ProductRecord
interface EnhancedDailyNutritionEntry extends DailyNutritionEntry {
  health_score?: number;
  showNutrition?: boolean;
}

interface Props {
  navigation: any;
}

// Cache per evitare ricaricamenti inutili
const dataCache = new Map<string, {
  profile: UserNutritionProfile | null;
  log: DailyNutritionLog | null;
  entries: EnhancedDailyNutritionEntry[];
  timestamp: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minuti

export default function CalorieTrackingScreen({ navigation }: Props) {
  const [profile, setProfile] = useState<UserNutritionProfile | null>(null);
  const [currentLog, setCurrentLog] = useState<DailyNutritionLog | null>(null);
  const [entries, setEntries] = useState<EnhancedDailyNutritionEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Memoizza la formattazione della data
  const formatDate = useCallback((date: Date) => {
    return date.toISOString().split('T')[0];
  }, []);

  // Memoizza la data formattata corrente
  const currentDateString = useMemo(() => formatDate(selectedDate), [selectedDate, formatDate]);

  // Funzione ottimizzata per ottenere entries con health_score
  const getDailyNutritionEntriesWithHealthScore = useCallback(async (date: string): Promise<EnhancedDailyNutritionEntry[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utente non autenticato');

      // Torniamo alla query originale che funzionava, mantenendo solo le ottimizzazioni di cache
      const { data, error } = await supabase
        .from('daily_nutrition_entries')
        .select(`
          *,
          daily_nutrition_logs!inner(user_id, log_date),
          products(health_score)
        `)
        .eq('daily_nutrition_logs.user_id', user.id)
        .eq('daily_nutrition_logs.log_date', date)
        .order('added_at', { ascending: false });

      if (error) throw error;
      
      // Mappa i risultati per includere health_score
      return (data || []).map((entry: any) => ({
        ...entry,
        health_score: entry.products?.health_score
      }));
    } catch (error) {
      console.error('Errore caricamento entries con health_score:', error);
      return [];
    }
  }, []);

  // Funzione di caricamento ottimizzata con cache e caricamento parallelo
  const loadData = useCallback(async (showRefresh = false, forceRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      const cacheKey = currentDateString;
      const cachedData = dataCache.get(cacheKey);
      const now = Date.now();

      // Usa cache se disponibile e non scaduta, a meno che non sia forzato il refresh
      if (!forceRefresh && cachedData && (now - cachedData.timestamp) < CACHE_DURATION) {
        setProfile(cachedData.profile);
        setCurrentLog(cachedData.log);
        setEntries(cachedData.entries);
        return;
      }

      // Caricamento parallelo per migliorare le performance
      const [userProfile, dailyLog, dailyEntries] = await Promise.all([
        getUserNutritionProfile(),
        getDailyNutritionLog(currentDateString),
        getDailyNutritionEntriesWithHealthScore(currentDateString)
      ]);
      
      // Se non c'è profilo, reindirizza al setup
      if (!userProfile) {
        navigation.navigate('NutritionProfileSetup');
        return;
      }

      // Aggiorna stato
      setProfile(userProfile);
      setCurrentLog(dailyLog);
      setEntries(dailyEntries);

      // Salva in cache
      dataCache.set(cacheKey, {
        profile: userProfile,
        log: dailyLog,
        entries: dailyEntries,
        timestamp: now
      });

    } catch (error) {
      console.error('Errore caricamento dati:', error);
      Alert.alert('Errore', 'Impossibile caricare i dati nutrizionali');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentDateString, getDailyNutritionEntriesWithHealthScore, navigation]);

  // UseFocusEffect ottimizzato
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Callback ottimizzati
  const onRefresh = useCallback(() => {
    loadData(true, true); // Forza refresh quando l'utente fa pull-to-refresh
  }, [loadData]);

  const deleteEntry = useCallback(async (entryId: string) => {
    try {
      await removeNutritionEntry(entryId);
      // Invalida cache per la data corrente
      dataCache.delete(currentDateString);
      loadData(false, true); // Forza ricaricamento
    } catch (error) {
      console.error('Errore eliminazione entry:', error);
      Alert.alert('Errore', 'Impossibile eliminare l\'elemento');
    }
  }, [currentDateString, loadData]);

  const toggleNutritionVisibility = useCallback((entryId: string) => {
    setEntries(prevEntries => 
      prevEntries.map(entry => 
        entry.id === entryId 
          ? { ...entry, showNutrition: !entry.showNutrition }
          : entry
      )
    );
  }, []);

  // Memoizza il colore del health score
  const getHealthScoreColor = useCallback((score: number | undefined | null): string => {
    if (score === undefined || score === null) return '#888888';
    if (score >= 81) return '#1E8F4E'; 
    if (score >= 61) return '#7AC547'; 
    if (score >= 41) return '#FFC734'; 
    if (score >= 21) return '#FF9900'; 
    if (score >= 0) return '#FF0000';   
    return '#888888';
  }, []);

  // Memoizza il componente calendario
  const renderCalendar = useCallback(() => {
    const today = new Date();
    const isToday = formatDate(selectedDate) === formatDate(today);
    
    // Calcola la differenza in giorni
    const diffTime = selectedDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let dateLabel = '';
    let dateSubtitle = '';
    
    if (diffDays === 0) {
      dateLabel = 'Oggi';
      dateSubtitle = selectedDate.toLocaleDateString('it', { 
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
    } else if (diffDays === -1) {
      dateLabel = 'Ieri';
      dateSubtitle = selectedDate.toLocaleDateString('it', { 
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
    } else if (diffDays === -2) {
      dateLabel = "L'altro ieri";
      dateSubtitle = selectedDate.toLocaleDateString('it', { 
        day: 'numeric',
        month: 'long'
      });
    } else if (diffDays < 0) {
      dateLabel = `${Math.abs(diffDays)} giorni fa`;
      dateSubtitle = selectedDate.toLocaleDateString('it', { 
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
    }

    const goToPreviousDay = () => {
      const prevDay = new Date(selectedDate);
      prevDay.setDate(selectedDate.getDate() - 1);
      setSelectedDate(prevDay);
    };

    const goToNextDay = () => {
      const nextDay = new Date(selectedDate);
      nextDay.setDate(selectedDate.getDate() + 1);
      setSelectedDate(nextDay);
    };

    const goToToday = () => {
      setSelectedDate(new Date());
    };

    // Può andare al giorno precedente solo se non siamo già nel passato massimo
    const canGoBack = diffDays > -30; // Limite a 30 giorni fa
    // Può andare al giorno successivo solo se non siamo oggi
    const canGoForward = diffDays < 0; // Solo se siamo nel passato

    return (
      <View style={styles.calendarMinimal}>
        {!isToday && (
          <TouchableOpacity style={styles.todayButtonTop} onPress={goToToday}>
            <Text style={styles.todayButtonTopText}>← Torna a oggi</Text>
          </TouchableOpacity>
        )}
        
        <View style={styles.calendarRow}>
          <TouchableOpacity 
            style={[styles.calendarArrowMinimal, !canGoBack && styles.calendarArrowDisabled]} 
            onPress={canGoBack ? goToPreviousDay : undefined}
            disabled={!canGoBack}
          >
            <Ionicons 
              name="chevron-back" 
              size={24} 
              color={canGoBack ? BORDER_COLOR : '#CCCCCC'} 
            />
          </TouchableOpacity>
          
          <View style={styles.calendarCenter}>
            <Text style={styles.calendarMainDate}>{dateLabel}</Text>
            <Text style={styles.calendarSubDate}>{dateSubtitle}</Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.calendarArrowMinimal, !canGoForward && styles.calendarArrowDisabled]} 
            onPress={canGoForward ? goToNextDay : undefined}
            disabled={!canGoForward}
          >
            <Ionicons 
              name="chevron-forward" 
              size={24} 
              color={canGoForward ? BORDER_COLOR : '#CCCCCC'} 
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [selectedDate, formatDate]);

  // Memoizza il summary nutrizionale
  const renderNutritionSummary = useCallback(() => {
    if (!currentLog || !profile) return null;

    const kcalRemaining = currentLog.target_kcal - currentLog.total_kcal;
    const kcalProgress = Math.min((currentLog.total_kcal / currentLog.target_kcal) * 100, 100);
    
    const proteinProgress = Math.min((currentLog.total_proteins_g / currentLog.target_proteins_g) * 100, 100);
    const carbProgress = Math.min((currentLog.total_carbs_g / currentLog.target_carbs_g) * 100, 100);
    const fatProgress = Math.min((currentLog.total_fats_g / currentLog.target_fats_g) * 100, 100);

    return (
      <View style={styles.summaryCardWrapper}>
        <View style={styles.summaryCardShadow} />
        <View style={styles.summaryCardContainer}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>
              Calorie per {selectedDate.toLocaleDateString('it', { 
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              })}
            </Text>
            <Text style={[
              styles.summarySubtitle,
              kcalRemaining < 0 ? styles.summaryOver : styles.summaryRemaining
            ]}>
              {kcalRemaining >= 0 
                ? `${Math.round(kcalRemaining)} kcal rimanenti`
                : `${Math.round(Math.abs(kcalRemaining))} kcal oltre il target`
              }
            </Text>
          </View>

          <View style={styles.calorieProgress}>
            <View style={styles.calorieNumbers}>
              <Text style={styles.calorieConsumed}>
                {Math.round(currentLog.total_kcal)}
              </Text>
              <Text style={styles.calorieTarget}>
                / {currentLog.target_kcal} kcal
              </Text>
            </View>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${kcalProgress}%` }]} />
            </View>
          </View>

          <View style={styles.macroGrid}>
            <View style={styles.macroItem}>
              <View style={styles.macroIconContainer}>
                <View style={[styles.macroIconCircle, { backgroundColor: '#CD5C5C' }]}>
                  <Ionicons name="barbell" size={16} color="#000000" />
                </View>
              </View>
              <Text style={styles.macroLabel}>Proteine</Text>
              <Text style={styles.macroValue}>
                {Math.round(currentLog.total_proteins_g)}g
              </Text>
              <Text style={styles.macroTarget}>
                / {Math.round(currentLog.target_proteins_g)}g
              </Text>
              <View style={styles.macroProgressContainer}>
                <View style={[
                  styles.macroProgress,
                  { width: `${proteinProgress}%`, backgroundColor: '#CD5C5C' }
                ]} />
              </View>
            </View>

            <View style={styles.macroItem}>
              <View style={styles.macroIconContainer}>
                <View style={[styles.macroIconCircle, { backgroundColor: '#FFD700' }]}>
                  <Ionicons name="layers" size={16} color="#000000" />
                </View>
              </View>
              <Text style={styles.macroLabel}>Carboidrati</Text>
              <Text style={styles.macroValue}>
                {Math.round(currentLog.total_carbs_g)}g
              </Text>
              <Text style={styles.macroTarget}>
                / {Math.round(currentLog.target_carbs_g)}g
              </Text>
              <View style={styles.macroProgressContainer}>
                <View style={[
                  styles.macroProgress,
                  { width: `${carbProgress}%`, backgroundColor: '#FFD700' }
                ]} />
              </View>
            </View>

            <View style={styles.macroItem}>
              <View style={styles.macroIconContainer}>
                <View style={[styles.macroIconCircle, { backgroundColor: '#87CEEB' }]}>
                  <Ionicons name="cafe" size={16} color="#000000" />
                </View>
              </View>
              <Text style={styles.macroLabel}>Grassi</Text>
              <Text style={styles.macroValue}>
                {Math.round(currentLog.total_fats_g)}g
              </Text>
              <Text style={styles.macroTarget}>
                / {Math.round(currentLog.target_fats_g)}g
              </Text>
              <View style={styles.macroProgressContainer}>
                <View style={[
                  styles.macroProgress,
                  { width: `${fatProgress}%`, backgroundColor: '#87CEEB' }
                ]} />
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }, [currentLog, profile, selectedDate]);

  // Memoizza il pulsante aggiungi prodotto
  const renderAddProductButton = useCallback(() => (
    <View style={styles.addButtonWrapper}>
      <View style={styles.addButtonShadow} />
      <TouchableOpacity
        style={styles.addButtonContainer}
        onPress={() => navigation.navigate('SelectProductForDay', { 
          selectedDate: currentDateString 
        })}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.addButtonText}>Aggiungi Prodotto</Text>
      </TouchableOpacity>
    </View>
  ), [navigation, currentDateString]);

  // Memoizza il rendering delle entries
  const renderEntries = useCallback(() => {
    if (entries.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="restaurant-outline" size={64} color="#CCCCCC" />
          <Text style={styles.emptyStateTitle}>Nessun prodotto aggiunto</Text>
          <Text style={styles.emptyStateDescription}>
            Inizia a tracciare la tua alimentazione aggiungendo i prodotti che consumi
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.entriesContainer}>
        <Text style={styles.entriesTitle}>
          I Tuoi Prodotti ({entries.length})
        </Text>
        
        {entries.map((entry) => (
          <View key={entry.id} style={{ marginBottom: 40 }}>
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
                    {entry.product_image ? (
                      <Image 
                        source={{ uri: entry.product_image }} 
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
                      {entry.product_name}
                    </Text>
                    {entry.product_brand && (
                      <Text style={styles.entryBrand} numberOfLines={1} ellipsizeMode="tail">
                        {entry.product_brand}
                      </Text>
                    )}
                    
                    {/* Punteggio salute con cuore */}
                    <View style={styles.entryScoreContainer}>
                      <Ionicons 
                        name="heart" 
                        size={18} 
                        color={getHealthScoreColor(entry.health_score)} 
                        style={styles.entryScoreIcon} 
                      />
                      <Text style={styles.entryScoreValue}>
                        {entry.health_score || '--'}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
            
            {/* Valori nutrizionali espandibili - SOPRA i pulsanti */}
            {entry.showNutrition && (
              <View style={styles.nutritionExpandedContainer}>
                <View style={styles.entryNutrition}>
                  <View style={styles.nutritionItem}>
                    <View style={[styles.nutritionIconCircle, { backgroundColor: '#FFA07A' }]}>
                      <Ionicons name="flame" size={16} color="#000000" />
                    </View>
                    <Text style={styles.nutritionLabel}>Calorie</Text>
                    <Text style={styles.nutritionValue}>{Math.round(entry.kcal)}</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                    <View style={[styles.nutritionIconCircle, { backgroundColor: '#CD5C5C' }]}>
                      <Ionicons name="barbell" size={16} color="#000000" />
                    </View>
                    <Text style={styles.nutritionLabel}>Proteine</Text>
                    <Text style={styles.nutritionValue}>{Math.round(entry.proteins_g)}g</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                    <View style={[styles.nutritionIconCircle, { backgroundColor: '#FFD700' }]}>
                      <Ionicons name="layers" size={16} color="#000000" />
                    </View>
                    <Text style={styles.nutritionLabel}>Carboidrati</Text>
                    <Text style={styles.nutritionValue}>{Math.round(entry.carbs_g)}g</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                    <View style={[styles.nutritionIconCircle, { backgroundColor: '#87CEEB' }]}>
                      <Ionicons name="cafe" size={16} color="#000000" />
                    </View>
                    <Text style={styles.nutritionLabel}>Grassi</Text>
                    <Text style={styles.nutritionValue}>{Math.round(entry.fats_g)}g</Text>
                  </View>
                </View>
                
                {/* Descrizione della porzione */}
                {entry.entry_type !== 'photo_meal' && entry.quantity_g && (
                  <Text style={styles.portionDescription}>
                    (Prodotto confezionato, valori per {Math.round(entry.quantity_g)}g)
                  </Text>
                )}
                {entry.entry_type === 'photo_meal' && (
                  <Text style={styles.portionDescription}>
                    (Pasto fotografato, valori stimati)
                  </Text>
                )}
              </View>
            )}
            
            {/* Pulsanti tratteggiati - SOTTO i valori nutrizionali */}
            <View style={[styles.cardButtonsContainer, { marginTop: entry.showNutrition ? 12 : -8 }]}>
              <TouchableOpacity
                style={[styles.dashedButton, styles.dashedButtonNutrition]}
                onPress={() => toggleNutritionVisibility(entry.id)}
              >
                <Ionicons 
                  name={entry.showNutrition ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color={PRIMARY_GREEN} 
                />
                <Text style={[styles.dashedButtonText, styles.dashedButtonTextNutrition]}>
                  {entry.showNutrition ? 'Nascondi' : 'Mostra'} Valori
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.dashedButton, styles.dashedButtonDelete]}
                onPress={() => Alert.alert(
                  'Rimuovi prodotto',
                  'Sei sicuro di voler rimuovere questo prodotto dal tuo diario?',
                  [
                    { text: 'Annulla', style: 'cancel' },
                    { text: 'Rimuovi', onPress: () => deleteEntry(entry.id) }
                  ]
                )}
              >
                <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                <Text style={[styles.dashedButtonText, styles.dashedButtonTextDelete]}>
                  Elimina
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    );
  }, [entries, getHealthScoreColor, toggleNutritionVisibility, deleteEntry]);

  // Componente skeleton per il caricamento
  const renderLoadingSkeleton = useCallback(() => (
    <View style={styles.skeletonContainer}>
      {/* Header skeleton */}
      <View style={styles.skeletonHeader}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonCircle} />
      </View>
      
      {/* Calendar skeleton */}
      <View style={styles.skeletonCalendar}>
        <View style={styles.skeletonCalendarContent} />
      </View>
      
      {/* Summary skeleton */}
      <View style={styles.skeletonSummary}>
        <View style={styles.skeletonSummaryHeader} />
        <View style={styles.skeletonSummaryContent} />
      </View>
      
      {/* Add button skeleton */}
      <View style={styles.skeletonButton} />
      
      {/* Entries skeleton */}
      <View style={styles.skeletonEntries}>
        <View style={styles.skeletonEntriesTitle} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonEntry}>
            <View style={styles.skeletonEntryImage} />
            <View style={styles.skeletonEntryContent}>
              <View style={styles.skeletonEntryName} />
              <View style={styles.skeletonEntryBrand} />
            </View>
          </View>
        ))}
      </View>
    </View>
  ), []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {renderLoadingSkeleton()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tracking Calorie</Text>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('NutritionProfileSetup')}
          >
            <Ionicons name="person-circle-outline" size={28} color={BORDER_COLOR} />
          </TouchableOpacity>
        </View>

        {renderCalendar()}
        {renderNutritionSummary()}
        {renderAddProductButton()}
        {renderEntries()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'android' ? 20 : 0,
    paddingBottom: 120, // Aumentato per evitare sovrapposizione con navbar
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
  },
  profileButton: {
    padding: 4,
  },
  
  // Calendar - Design minimal
  calendarMinimal: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  todayButtonTop: {
    alignSelf: 'flex-end',
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  todayButtonTopText: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Medium',
    color: PRIMARY_GREEN,
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarArrowMinimal: {
    padding: 8,
    borderRadius: 6,
  },
  calendarArrowDisabled: {
    opacity: 0.3,
  },
  calendarCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  calendarMainDate: {
    fontSize: 22, // Aumentato per più impatto
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    marginBottom: 2,
  },
  calendarSubDate: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  
  // Summary Card - Migliorato con icone
  summaryCardWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 20,
  },
  summaryCardShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: CARD_BORDER_RADIUS,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  summaryCardContainer: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 20,
    position: 'relative',
    zIndex: 1,
  },
  summaryHeader: {
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Medium',
  },
  summaryRemaining: {
    color: PRIMARY_GREEN,
  },
  summaryOver: {
    color: '#FF6B6B',
  },
  calorieProgress: {
    marginBottom: 24,
  },
  calorieNumbers: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  calorieConsumed: {
    fontSize: 32,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
  },
  calorieTarget: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginLeft: 8,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: PRIMARY_GREEN,
    borderRadius: 4,
  },
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  macroItem: {
    flex: 1,
    alignItems: 'center',
  },
  macroIconContainer: {
    marginBottom: 8,
  },
  macroIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  macroLabel: {
    fontSize: 12,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginBottom: 4,
    textAlign: 'center',
  },
  macroValue: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    textAlign: 'center',
  },
  macroTarget: {
    fontSize: 12,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginBottom: 8,
    textAlign: 'center',
  },
  macroProgressContainer: {
    width: '100%',
    height: 4,
    backgroundColor: '#E5E5E5',
    borderRadius: 2,
    overflow: 'hidden',
  },
  macroProgress: {
    height: '100%',
    borderRadius: 2,
  },
  
  // Add Button - Con bordi verdi top e dx
  addButtonWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 60, // Aumentato ulteriormente il padding con la sezione sotto
  },
  addButtonShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  addButtonContainer: {
    backgroundColor: PRIMARY_GREEN,
    borderRadius: 12,
    borderWidth: 0,
    borderColor: BORDER_COLOR,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  
  // Entries - Card più spaziose
  entriesContainer: {
    paddingHorizontal: 16,
  },
  entriesTitle: {
    fontSize: 24,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    marginBottom: 20, // Aumentato da 16
    paddingLeft: 4,
  },
  entryCardWrapper: {
    position: 'relative',
    marginBottom: 24, // Aumentato da 16
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
    flexDirection: 'column', // Cambiato a column per layout verticale
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingTop: 24, // Padding superiore aumentato
    paddingBottom: 15, // Padding inferiore uguale a quello superiore
    paddingHorizontal: 18, // Padding orizzontale mantenuto
    position: 'relative',
    zIndex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    minHeight: 150, // Altezza minima per contenere tutto il contenuto
  },
  entryFirstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  entrySecondRow: {
    marginTop: 8,
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
    paddingLeft: 5, // Stesso padding delle card recenti
  },
  entryName: {
    fontSize: 19, // Stessa dimensione delle card recenti
    fontFamily: 'BricolageGrotesque-Regular', // Stesso font delle card recenti
    fontWeight: '600', // Stesso peso delle card recenti
    color: '#000000',
    marginBottom: 5, // Stesso margine delle card recenti
    lineHeight: 22,
  },
  entryBrand: {
    fontSize: 15, // Stessa dimensione delle card recenti
    fontFamily: 'BricolageGrotesque-Regular', // Stesso font delle card recenti
    color: '#333333',
    opacity: 0.7, // Stessa opacità delle card recenti
    marginBottom: 6, // Stesso margine delle card recenti
  },
  entryScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  entryScoreIcon: {
    marginRight: 5, // Stesso margine delle card recenti
  },
  entryScoreValue: {
    fontSize: 15, // Stessa dimensione delle card recenti
    fontFamily: 'BricolageGrotesque-SemiBold', // Stesso font delle card recenti
    color: '#000000',
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
  deleteButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    backgroundColor: '#FF6B6B',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  
  // Stili per i pulsanti sotto la card
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
  dashedButtonDelete: {
    borderColor: '#FF6B6B',
    backgroundColor: 'rgba(255, 107, 107, 0.05)',
  },
  dashedButtonText: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-SemiBold',
    marginLeft: 6,
  },
  dashedButtonTextNutrition: {
    color: PRIMARY_GREEN,
  },
  dashedButtonTextDelete: {
    color: '#FF6B6B',
  },
  
  // Stili per i valori nutrizionali espandibili
  nutritionExpandedContainer: {
    marginTop: -8,
    marginBottom: 0,
    padding: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  portionDescription: {
    fontSize: 12,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
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
  },
  
  // Skeleton styles
  skeletonContainer: {
    flex: 1,
    padding: 16,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  skeletonTitle: {
    flex: 1,
    height: 24,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
  },
  skeletonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
    marginLeft: 16,
  },
  skeletonCalendar: {
    marginBottom: 20,
  },
  skeletonCalendarContent: {
    height: 40,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
  },
  skeletonSummary: {
    marginBottom: 20,
  },
  skeletonSummaryHeader: {
    height: 24,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonSummaryContent: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
  },
  skeletonButton: {
    height: 40,
    backgroundColor: '#E0E0E0',
    borderRadius: 12,
    marginBottom: 20,
  },
  skeletonEntries: {
    marginBottom: 20,
  },
  skeletonEntriesTitle: {
    height: 24,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginBottom: 16,
  },
  skeletonEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  skeletonEntryImage: {
    width: 100,
    height: 100,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
    marginRight: 16,
  },
  skeletonEntryContent: {
    flex: 1,
  },
  skeletonEntryName: {
    height: 19,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginBottom: 5,
  },
  skeletonEntryBrand: {
    height: 15,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
  },
}); 