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
import { scaleFont } from '../../theme/typography';
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
import { getScoreColor } from '../../utils/formatters';

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

// Funzione helper per formattare i numeri: mostra decimali solo se non sono .0
const formatNumber = (value: number): string => {
  const formatted = value.toFixed(1);
  return formatted.endsWith('.0') ? Math.round(value).toString() : formatted;
};

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

  // getHealthScoreColor rimossa - ora si usa getScoreColor globale

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
            <Text style={styles.todayButtonTopText} allowFontScaling={false}>← Torna a oggi</Text>
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
            <Text style={styles.calendarMainDate} allowFontScaling={false}>{dateLabel}</Text>
            <Text style={styles.calendarSubDate} allowFontScaling={false}>{dateSubtitle}</Text>
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
        <TouchableOpacity 
          style={styles.summaryCardContainer}
          onPress={() => navigation.navigate('NutritionProfileSetup')}
          activeOpacity={1}
        >
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle} allowFontScaling={false}>
              Calorie per {selectedDate.toLocaleDateString('it', { 
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              })}
            </Text>
            <Text style={[
              styles.summarySubtitle,
              kcalRemaining < 0 ? styles.summaryOver : styles.summaryRemaining
            ]} allowFontScaling={false}>
              {kcalRemaining >= 0 
                ? `${formatNumber(kcalRemaining)} kcal rimanenti`
                : `${formatNumber(Math.abs(kcalRemaining))} kcal oltre il target`
              }
            </Text>
          </View>

          {/* Grid 2x2 con i valori nutrizionali - STESSO STILE DELLE CARD ESPANSE */}
          <View style={styles.nutritionGridContainer}>
            {/* Calorie */}
            <View style={styles.nutritionItemWrapper}>
              <View style={styles.nutritionItemContent}>
                <View style={[
                  styles.nutritionIconContainer,
                  { backgroundColor: '#FFA07A' }
                ]}>
                  <Ionicons 
                    name="flame" 
                    size={22} 
                    color="#000000" 
                  />
                </View>
                
                <View style={styles.nutritionValueRow}>
                  <Text style={styles.nutritionValueText} allowFontScaling={false}>
                    {formatNumber(currentLog.total_kcal)} kcal
                  </Text>
                  <Text style={styles.nutritionTargetText} allowFontScaling={false}>
                    / {currentLog.target_kcal}
                  </Text>
                </View>
                
                <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                  Energia
                </Text>
                
                <View style={styles.nutritionProgressContainer}>
                  <View style={[
                    styles.nutritionProgressFill,
                    { 
                      width: `${kcalProgress}%`,
                      backgroundColor: '#FFA07A'
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
                  { backgroundColor: '#CD5C5C' }
                ]}>
                  <Ionicons 
                    name="barbell" 
                    size={22} 
                    color="#000000" 
                  />
                </View>
                
                <View style={styles.nutritionValueRow}>
                  <Text style={styles.nutritionValueText} allowFontScaling={false}>
                    {formatNumber(currentLog.total_proteins_g)}g
                  </Text>
                  <Text style={styles.nutritionTargetText} allowFontScaling={false}>
                    / {formatNumber(currentLog.target_proteins_g)}
                  </Text>
                </View>
                
                <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                  Proteine
                </Text>
                
                <View style={styles.nutritionProgressContainer}>
                  <View style={[
                    styles.nutritionProgressFill,
                    { 
                      width: `${proteinProgress}%`,
                      backgroundColor: '#CD5C5C'
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
                  { backgroundColor: '#FFD700' }
                ]}>
                  <Ionicons 
                    name="layers" 
                    size={22} 
                    color="#000000" 
                  />
                </View>
                
                <View style={styles.nutritionValueRow}>
                  <Text style={styles.nutritionValueText} allowFontScaling={false}>
                    {formatNumber(currentLog.total_carbs_g)}g
                  </Text>
                  <Text style={styles.nutritionTargetText} allowFontScaling={false}>
                    / {formatNumber(currentLog.target_carbs_g)}
                  </Text>
                </View>
                
                <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                  Carboidrati
                </Text>
                
                <View style={styles.nutritionProgressContainer}>
                  <View style={[
                    styles.nutritionProgressFill,
                    { 
                      width: `${carbProgress}%`,
                      backgroundColor: '#FFD700'
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
                  { backgroundColor: '#87CEEB' }
                ]}>
                  <Ionicons 
                    name="cafe" 
                    size={22} 
                    color="#000000" 
                  />
                </View>
                
                <View style={styles.nutritionValueRow}>
                  <Text style={styles.nutritionValueText} allowFontScaling={false}>
                    {formatNumber(currentLog.total_fats_g)}g
                  </Text>
                  <Text style={styles.nutritionTargetText} allowFontScaling={false}>
                    / {formatNumber(currentLog.target_fats_g)}
                  </Text>
                </View>
                
                <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                  Grassi
                </Text>
                
                <View style={styles.nutritionProgressContainer}>
                  <View style={[
                    styles.nutritionProgressFill,
                    { 
                      width: `${fatProgress}%`,
                      backgroundColor: '#87CEEB'
                    }
                  ]} />
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [currentLog, profile, selectedDate, navigation]);

  // Memoizza il pulsante aggiungi prodotto
  const renderAddProductButton = useCallback(() => (
    <View style={styles.addButtonWrapper}>
      <View style={styles.addButtonShadow} />
      <TouchableOpacity
        style={styles.addButtonContainer}
        onPress={() => navigation.navigate('SelectProductForDay', { 
          selectedDate: currentDateString 
        })}
        activeOpacity={1}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.addButtonText} allowFontScaling={false}>Aggiungi Prodotto</Text>
      </TouchableOpacity>
    </View>
  ), [navigation, currentDateString]);

  // Memoizza il rendering delle entries
  const renderEntries = useCallback(() => {
    if (entries.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="restaurant-outline" size={64} color="#CCCCCC" />
          <Text style={styles.emptyStateTitle} allowFontScaling={false}>Nessun prodotto aggiunto</Text>
          <Text style={styles.emptyStateDescription} allowFontScaling={false}>
            Inizia a tracciare la tua alimentazione aggiungendo i prodotti che consumi
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.entriesContainer}>
        <Text style={styles.entriesTitle} allowFontScaling={false}>
          I Tuoi Prodotti ({entries.length})
        </Text>
        
        {entries.map((entry) => {
          // Determina il colore della card basato sul punteggio salute
          const cardColor = entry.health_score !== undefined ? getScoreColor(entry.health_score) : '#000000';
          
          return (
            <View key={entry.id}>
              {/* Card unificata - stile copiato da SelectProductForDayScreen */}
              <View style={entry.showNutrition ? styles.entryCardWrapperExpanded : styles.entryCardWrapper}>
                <View style={[styles.entryCardShadow, { backgroundColor: cardColor }]} />
                <TouchableOpacity 
                  style={[
                    styles.entryCardContainer,
                    { borderColor: cardColor },
                    entry.showNutrition && styles.entryCardContainerExpanded
                  ]}
                  onPress={() => toggleNutritionVisibility(entry.id)}
                  activeOpacity={1}
                >
                            {/* Prima riga: Immagine, Nome, Marchio, Punteggio + Icone azioni se espansa */}
            <View style={styles.entryFirstRow}>
              <View style={styles.entryImageWrapper}>
                <View style={[styles.entryImageShadow, { backgroundColor: cardColor }]} />
                {entry.product_image ? (
                  <Image 
                    source={{ uri: entry.product_image }} 
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
                  {entry.product_name}
                </Text>
                
                {/* Punteggio salute con pulsante colorato */}
                <View style={styles.entryScoreContainer}>
                  <View style={[styles.scoreButton, { backgroundColor: getScoreColor(entry.health_score) }]}>
                    <Ionicons name="heart" size={14} color="#FFFFFF" />
                    <Text style={styles.scoreButtonText}>
                      {entry.health_score || '--'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Icone azioni - Visibili solo quando la card è espansa */}
              {entry.showNutrition && (
                <View style={styles.cardActionsHeader}>
                  <TouchableOpacity 
                    style={styles.headerActionButton}
                    onPress={() => {
                      if (entry.product_id) {
                        navigation.navigate('ProductDetail', {
                          productRecordId: entry.product_id,
                          openedFromDiary: true
                        });
                      }
                    }}
                  >
                    <Ionicons name="eye" size={22} color="#666666" />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.headerActionButton}
                    onPress={() => Alert.alert(
                      'Rimuovi dal Diario',
                      `Vuoi rimuovere "${entry.product_name}" dal tuo diario?`,
                      [
                        { text: 'Annulla', style: 'cancel' },
                        { text: 'Rimuovi', onPress: () => deleteEntry(entry.id), style: 'destructive' }
                      ]
                    )}
                  >
                    <Ionicons name="trash" size={22} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

                {/* Seconda riga: Valori nutrizionali (se espansi) */}
                {entry.showNutrition && (
                  <View style={styles.nutritionRowContainer}>

                    {/* Grid 2x2 con i valori nutrizionali */}
                    <View style={styles.nutritionGridContainer}>
                      {/* Calorie */}
                      <View style={styles.nutritionItemWrapper}>
                        <View style={styles.nutritionItemContent}>
                          <View style={[
                            styles.nutritionIconContainer,
                            { backgroundColor: '#FFA07A' }
                          ]}>
                            <Ionicons 
                              name="flame" 
                              size={22} 
                              color="#000000" 
                            />
                          </View>
                          
                          <Text style={styles.nutritionValueText} allowFontScaling={false}>
                            {formatNumber(entry.kcal)} kcal
                          </Text>
                          
                          <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                            Energia
                          </Text>
                          
                          <View style={styles.nutritionProgressContainer}>
                            <View style={[
                              styles.nutritionProgressFill,
                              { 
                                width: `${Math.min((entry.kcal / 900) * 100, 100)}%`,
                                backgroundColor: '#FFA07A'
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
                            { backgroundColor: '#CD5C5C' }
                          ]}>
                            <Ionicons 
                              name="barbell" 
                              size={22} 
                              color="#000000" 
                            />
                          </View>
                          
                          <Text style={styles.nutritionValueText} allowFontScaling={false}>
                            {formatNumber(entry.proteins_g)}g
                          </Text>
                          
                          <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                            Proteine
                          </Text>
                          
                          <View style={styles.nutritionProgressContainer}>
                            <View style={[
                              styles.nutritionProgressFill,
                              { 
                                width: `${Math.min((entry.proteins_g / 50) * 100, 100)}%`,
                                backgroundColor: '#CD5C5C'
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
                            { backgroundColor: '#FFD700' }
                          ]}>
                            <Ionicons 
                              name="layers" 
                              size={22} 
                              color="#000000" 
                            />
                          </View>
                          
                          <Text style={styles.nutritionValueText} allowFontScaling={false}>
                            {formatNumber(entry.carbs_g)}g
                          </Text>
                          
                          <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                            Carboidrati
                          </Text>
                          
                          <View style={styles.nutritionProgressContainer}>
                            <View style={[
                              styles.nutritionProgressFill,
                              { 
                                width: `${Math.min((entry.carbs_g / 100) * 100, 100)}%`,
                                backgroundColor: '#FFD700'
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
                            { backgroundColor: '#87CEEB' }
                          ]}>
                            <Ionicons 
                              name="cafe" 
                              size={22} 
                              color="#000000" 
                            />
                          </View>
                          
                          <Text style={styles.nutritionValueText} allowFontScaling={false}>
                            {formatNumber(entry.fats_g)}g
                          </Text>
                          
                          <Text style={styles.nutritionLabelText} allowFontScaling={false}>
                            Grassi
                          </Text>
                          
                          <View style={styles.nutritionProgressContainer}>
                            <View style={[
                              styles.nutritionProgressFill,
                              { 
                                width: `${Math.min((entry.fats_g / 50) * 100, 100)}%`,
                                backgroundColor: '#87CEEB'
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
                        backgroundColor: entry.health_score !== undefined 
                          ? `${getScoreColor(entry.health_score)}15` 
                          : '#F8F8F8',
                        borderColor: entry.health_score !== undefined 
                          ? `${getScoreColor(entry.health_score)}40` 
                          : '#E5E5E5',
                      }
                    ]}>
                      <Text style={styles.nutritionInfoText} allowFontScaling={false}>
                        {entry.entry_type === 'photo_meal' 
                          ? (
                              <Text>
                                Valori stimati per il <Text style={styles.boldText}>pasto</Text> fotografato
                              </Text>
                            )
                          : entry.quantity_g 
                            ? (
                              <Text>
                                Valori per <Text style={styles.boldText}>{formatNumber(entry.quantity_g)}g</Text> consumati
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
        })}
      </View>
    );
  }, [entries, toggleNutritionVisibility, deleteEntry]);

  // Componente skeleton per il caricamento
  const renderLoadingSkeleton = useCallback(() => (
    <View style={[styles.skeletonContainer, { paddingTop: Platform.OS === 'ios' ? 80 : 60 }]}>
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
      <View style={styles.container}>
        {renderLoadingSkeleton()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >


        {renderCalendar()}
        {renderNutritionSummary()}
        {renderAddProductButton()}
        {renderEntries()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'ios' ? 80 : 60, // Aumentato padding top come SalvatiScreen
    paddingBottom: 120, // Aumentato per evitare sovrapposizione con navbar
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
    fontSize: scaleFont(14),
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
    fontSize: scaleFont(22), // Aumentato per più impatto
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    marginBottom: 2,
  },
  calendarSubDate: {
    fontSize: scaleFont(14),
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
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 8,
    position: 'relative',
    zIndex: 1,
  },
  summaryHeader: {
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: scaleFont(18),
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: scaleFont(14),
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
    fontSize: scaleFont(32),
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
  },
  calorieTarget: {
    fontSize: scaleFont(16),
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
    flexDirection: 'column', // Cambiato a column per layout verticale
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
    marginTop: 4.5, // Margine top fisso per centrare nella card chiusa (150px - 100px immagine - 36px padding = 14px / 2 = 7px circa, usiamo 16px)
    marginBottom: 0, // Ridotto da 12 a 0 per centratura perfetta
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
    marginBottom: 0, // Cambiato da 8 a 0 per allineamento perfetto come HomeScreen
  },
  entryScoreIcon: {
    marginRight: 5, // Stesso margine delle card recenti
  },
  entryScoreValue: {
    fontSize: 15, // Stessa dimensione delle card recenti
    fontFamily: 'BricolageGrotesque-SemiBold', // Stesso font delle card recenti
    color: '#000000',
  },
  
  // Nutrition Row Container - Dentro la card unificata
  nutritionRowContainer: {
    marginTop: 16, // Spazio dalla prima riga
    paddingTop: 24, // Aumentato da 16 a 24
    // Rimossa la riga grigia di separazione
    alignSelf: 'stretch', // Assicura che si estenda per tutta la larghezza
  },
  nutritionGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: -8,
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
  nutritionValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  nutritionValueText: {
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    textAlign: 'center',
    marginBottom: 4,
  },
  nutritionTargetText: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    textAlign: 'center',
    marginLeft: 4,
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
    marginTop: 8,
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
  boldText: {
    fontFamily: 'BricolageGrotesque-Bold',
    fontWeight: '700',
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF6B6B',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 107, 0.05)',
  },
  deleteButtonText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  
  // Stili per i pulsanti sotto la card
  cardButtonsContainer: {
    flexDirection: 'row',
    marginTop: 15,
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