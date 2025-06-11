import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Text,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../../navigation';
import {
  getHealthGoalsCategories,
  getUserHealthGoals,
  updateUserHealthGoals,
  type HealthGoalCategory,
} from '../../services/userPreferencesService';
import { StatusBar } from 'expo-status-bar';
import { StatusBar as RNStatusBar } from 'react-native';

type Props = NativeStackScreenProps<AppStackParamList, 'UserPreferences'>;

interface SelectedGoal extends HealthGoalCategory {
  isSelected: boolean;
  animatedValue: Animated.Value;
  pulseAnim: Animated.Value;
}

// Costanti di stile con ombre direzionali
const SHADOW_OFFSET_VALUE = 2.5;
const BORDER_COLOR = "#000";
const BACKGROUND_COLOR = "#f8f4ec";
const CARD_BACKGROUND_COLOR = "#FFFFFF";
const { width: screenWidth } = Dimensions.get('window');

// Descrizioni sintetiche per tutti gli obiettivi
const GOAL_DESCRIPTIONS: { [key: string]: string } = {
  'Aumentare massa muscolare': 'Ottimizza l\'apporto proteico e supporta la crescita muscolare con nutrienti specifici per il recupero e lo sviluppo.',
  'Migliorare salute cardiovascolare': 'Favorisce alimenti ricchi di omega-3, antiossidanti e fibre per proteggere il cuore e migliorare la circolazione.',
  'Migliorare qualità del sonno': 'Identifica cibi che favoriscono il rilassamento ed evita stimolanti per un riposo notturno più profondo e rigenerante.',
  'Aumentare energia e vitalità': 'Privilegia carboidrati complessi e vitamine del gruppo B per mantenere livelli energetici stabili durante la giornata.',
  'Supportare sistema immunitario': 'Promuove alimenti ricchi di vitamina C, zinco e antiossidanti per rafforzare le difese naturali dell\'organismo.',
  'Migliorare digestione': 'Favorisce cibi ricchi di fibre, probiotici e enzimi digestivi per ottimizzare la salute intestinale e l\'assorbimento.',
  'Mantenere peso forma': 'Bilancia macro e micronutrienti per sostenere un peso corporeo sano attraverso scelte alimentari equilibrate.',
  'Migliorare concentrazione': 'Identifica nutrienti che supportano le funzioni cognitive come omega-3, antiossidanti e vitamine del gruppo B.',
  'Ridurre infiammazione': 'Privilegia alimenti anti-infiammatori naturali come curcuma, pesce azzurro e verdure a foglia verde per il benessere.',
  'Supportare salute ossea': 'Promuove cibi ricchi di calcio, vitamina D e magnesio per mantenere ossa forti e prevenire problemi articolari.'
};

const UserPreferencesScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const { user } = useAuth();

  // Stati per obiettivi di salute
  const [healthGoals, setHealthGoals] = useState<SelectedGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHealthGoals();
  }, []);

  const loadHealthGoals = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Carica categorie di obiettivi e obiettivi utente dal database
      const [categories, userGoals] = await Promise.all([
        getHealthGoalsCategories(),
        getUserHealthGoals(user.id),
      ]);

      const userGoalIds = new Set(userGoals.map(goal => goal.goal_category_id));
      
      const goalsWithSelection = categories.map(category => ({
        ...category,
        isSelected: userGoalIds.has(category.id),
        animatedValue: new Animated.Value(userGoalIds.has(category.id) ? 1 : 0),
        pulseAnim: new Animated.Value(1),
      }));

      setHealthGoals(goalsWithSelection);
    } catch (error) {
      console.error('Errore nel caricamento degli obiettivi di salute:', error);
      Alert.alert('Errore', 'Impossibile caricare gli obiettivi di salute');
    } finally {
      setLoading(false);
    }
  };

  // Salvataggio automatico silenzioso
  const autoSaveGoals = useCallback(async (goals: SelectedGoal[]) => {
    if (!user) return;

    try {
      const selectedGoalIds = goals
        .filter(goal => goal.isSelected)
        .map(goal => goal.id);

      await updateUserHealthGoals(user.id, selectedGoalIds);
    } catch (error) {
      console.error('Errore nel salvataggio automatico:', error);
    }
  }, [user]);

  const toggleGoal = (goalId: string) => {
    const updatedGoals = healthGoals.map(goal => {
      if (goal.id === goalId) {
        const newSelected = !goal.isSelected;
        
        // Animazione di selezione
        Animated.parallel([
          Animated.spring(goal.animatedValue, {
            toValue: newSelected ? 1 : 0,
            useNativeDriver: false,
            tension: 120,
            friction: 7,
          }),
          // Pulse effect quando selezionato
          Animated.sequence([
            Animated.timing(goal.pulseAnim, {
              toValue: 1.1,
              duration: 150,
              useNativeDriver: false,
            }),
            Animated.timing(goal.pulseAnim, {
              toValue: 1,
              duration: 150,
              useNativeDriver: false,
            }),
          ])
        ]).start();
        
        return { ...goal, isSelected: newSelected };
      }
      return goal;
    });
    
    setHealthGoals(updatedGoals);
    
    // Salvataggio automatico silenzioso con debounce
    setTimeout(() => {
      autoSaveGoals(updatedGoals);
    }, 500);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <StatusBar style="dark" backgroundColor={BACKGROUND_COLOR} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10, color: colors.text, fontFamily: 'BricolageGrotesque-Regular' }}>
          Caricamento obiettivi...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={BACKGROUND_COLOR} />
      <ScrollView contentContainerStyle={styles.scrollViewContent} showsVerticalScrollIndicator={false}>
        {/* Header con solo freccia indietro */}
        <View style={styles.headerActionsContainer}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={28} color={BORDER_COLOR} />
          </TouchableOpacity>
        </View>

        {/* Titolo semplice come "I tuoi recenti" */}
        <View style={styles.titleContainer}>
          <Text style={styles.mainTitle}>I tuoi obiettivi</Text>
          <Text style={styles.subtitle}>Guidano l'analisi AI dei prodotti che scansioni</Text>
        </View>

        {/* Lista obiettivi con design pulito */}
        <View style={styles.goalsSection}>
          {healthGoals.map((goal, index) => {
            const shortDescription = GOAL_DESCRIPTIONS[goal.name] || goal.description;
            
            return (
              <Animated.View 
                key={goal.id} 
                style={[
                  styles.goalCardWrapper,
                  {
                    transform: [{ scale: goal.pulseAnim }]
                  }
                ]}
              >
                {/* Ombra direzionale esterna */}
                <View style={styles.goalCardShadow} />
                
                <TouchableOpacity
                  style={styles.goalCardContainer}
                  onPress={() => toggleGoal(goal.id)}
                  activeOpacity={0.8}
                >
                  {/* Layout verticale elegante */}
                  <View style={styles.goalCardLayout}>
                    
                    {/* Header della card - icona e toggle */}
                    <View style={styles.goalCardHeader}>
                      <View style={[
                        styles.goalIconWrapper,
                        { borderColor: goal.color || colors.primary }
                      ]}>
                        <Animated.View
                          style={[
                            styles.goalIconBackground,
                            {
                              backgroundColor: goal.color || colors.primary,
                              opacity: goal.animatedValue.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.1, 1],
                              })
                            }
                          ]}
                        />
                        <Ionicons 
                          name={goal.icon_name as any || "fitness"} 
                          size={24} 
                          color={goal.isSelected ? '#fff' : (goal.color || colors.primary)}
                          style={{ zIndex: 2 }}
                        />
                      </View>
                      
                      {/* Toggle in alto a destra */}
                      <Animated.View
                        style={[
                          styles.toggleSwitch,
                          {
                            backgroundColor: goal.animatedValue.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['#E0E0E0', goal.color || colors.primary],
                            })
                          }
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.toggleKnob,
                            {
                              transform: [{
                                translateX: goal.animatedValue.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [2, 22],
                                })
                              }]
                            }
                          ]}
                        />
                      </Animated.View>
                    </View>
                    
                    {/* Contenuto principale */}
                    <View style={styles.goalCardContent}>
                      <Text style={styles.goalNameText}>{goal.name}</Text>
                      <Text style={styles.goalDescriptionText}>
                        {shortDescription}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollViewContent: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight || 20 : 70,
    paddingBottom: 40,
  },
  
  // Header pulito
  headerActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerButton: {
    padding: 10,
  },

  // Titolo semplice come HomeScreen
  titleContainer: {
    paddingHorizontal: 4,
    marginBottom: 32,
  },
  mainTitle: {
    fontSize: 24,
    color: "#000000",
    fontFamily: 'BricolageGrotesque-Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'BricolageGrotesque-Regular',
  },

  // Sezione obiettivi pulita
  goalsSection: {
    marginBottom: 24,
  },
  goalCardWrapper: {
    position: 'relative',
    marginBottom: 20,
  },
  goalCardShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 20,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  goalCardContainer: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: BORDER_COLOR,
    position: 'relative',
    zIndex: 1,
    overflow: 'hidden',
  },
  goalCardLayout: {
    padding: 20,
  },

  // Header della card - icona e toggle
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  goalIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  goalIconBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22,
  },

  // Contenuto principale
  goalCardContent: {
    marginBottom: 5,
  },
  goalNameText: {
    fontSize: 17,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    marginBottom: 8,
    lineHeight: 22,
  },
  goalDescriptionText: {
    fontSize: 13,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666',
    lineHeight: 18,
  },

  // Toggle switch
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    position: 'relative',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    position: 'absolute',
  },
});

export default UserPreferencesScreen; 