import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createOrUpdateNutritionProfile, NutritionProfileInput, calculateBMR, calculateTDEE, calculateTargetCalories, calculateMacroTargets } from '../../services/nutritionApi';

// Costanti di stile per uniformare con l'app
const BACKGROUND_COLOR = '#f8f4ec';
const CARD_BACKGROUND_COLOR = '#FFFFFF';
const BORDER_COLOR = '#000000';
const SHADOW_OFFSET_VALUE = 3.5;
const CARD_BORDER_WIDTH = 1.5;
const CARD_BORDER_RADIUS = 16;

interface Props {
  navigation: any;
  onProfileCreated?: () => void;
}

const ACTIVITY_LEVELS = [
  {
    key: 'sedentary',
    label: 'Sedentario',
    description: 'Poco o nessun esercizio',
    icon: 'bed-outline',
  },
  {
    key: 'lightly_active',
    label: 'Leggermente Attivo',
    description: 'Esercizio leggero 1-3 giorni/settimana',
    icon: 'walk-outline',
  },
  {
    key: 'moderately_active',
    label: 'Moderatamente Attivo',
    description: 'Esercizio moderato 3-5 giorni/settimana',
    icon: 'bicycle-outline',
  },
  {
    key: 'very_active',
    label: 'Molto Attivo',
    description: 'Esercizio intenso 6-7 giorni/settimana',
    icon: 'fitness-outline',
  },
  {
    key: 'extra_active',
    label: 'Estremamente Attivo',
    description: 'Esercizio molto intenso, lavoro fisico',
    icon: 'barbell-outline',
  },
];

const GOALS = [
  {
    key: 'lose_weight',
    label: 'Perdere Peso',
    description: 'Deficit calorico per dimagrimento',
    icon: 'trending-down-outline',
    color: '#FF6B6B',
  },
  {
    key: 'maintain',
    label: 'Mantenere Peso',
    description: 'Mantenere il peso attuale',
    icon: 'remove-outline',
    color: '#4ECDC4',
  },
  {
    key: 'gain_weight',
    label: 'Aumentare Peso',
    description: 'Surplus calorico per aumento peso',
    icon: 'trending-up-outline',
    color: '#45B7D1',
  },
  {
    key: 'gain_muscle',
    label: 'Costruire Muscoli',
    description: 'Aumento massa muscolare',
    icon: 'fitness',
    color: '#96CEB4',
  },
];

export default function NutritionProfileSetupScreen({ navigation, onProfileCreated }: Props) {
  const [formData, setFormData] = useState<NutritionProfileInput>({
    weight_kg: 70,
    height_cm: 170,
    age: 30,
    gender: 'other',
    activity_level: 'moderately_active',
    goal: 'maintain',
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const handleSubmit = async () => {
    try {
      setLoading(true);

      // Validazione
      if (formData.weight_kg < 30 || formData.weight_kg > 300) {
        Alert.alert('Errore', 'Il peso deve essere tra 30 e 300 kg');
        return;
      }
      if (formData.height_cm < 120 || formData.height_cm > 250) {
        Alert.alert('Errore', 'L\'altezza deve essere tra 120 e 250 cm');
        return;
      }
      if (formData.age < 12 || formData.age > 120) {
        Alert.alert('Errore', 'L\'età deve essere tra 12 e 120 anni');
        return;
      }

      const profile = await createOrUpdateNutritionProfile(formData);
      
      Alert.alert(
        'Profilo Creato!',
        `Il tuo fabbisogno calorico giornaliero è di ${profile.target_kcal} kcal`,
        [{
          text: 'Continua',
          onPress: () => {
            onProfileCreated?.();
            navigation.goBack();
          }
        }]
      );
    } catch (error) {
      console.error('Errore creazione profilo:', error);
      Alert.alert('Errore', 'Impossibile creare il profilo nutrizionale');
    } finally {
      setLoading(false);
    }
  };

  const getEstimates = () => {
    const bmr = calculateBMR(formData.weight_kg, formData.height_cm, formData.age, formData.gender);
    const tdee = calculateTDEE(bmr, formData.activity_level);
    const targetKcal = calculateTargetCalories(tdee, formData.goal);
    const macros = calculateMacroTargets(targetKcal, formData.goal);
    const bmi = formData.weight_kg / Math.pow(formData.height_cm / 100, 2);

    return { bmr, tdee, targetKcal, macros, bmi };
  };

  const renderStep1 = () => (
    <View style={styles.stepCardWrapper}>
      <View style={styles.stepCardShadow} />
      <View style={styles.stepCardContainer}>
        <Text style={styles.stepTitle}>Dati Personali</Text>
        
        {/* Peso */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Peso (kg)</Text>
          <View style={styles.inputWrapper}>
            <View style={styles.inputShadow} />
            <View style={styles.inputWithUnit}>
              <TextInput
                style={styles.numericInput}
                value={formData.weight_kg.toString()}
                onChangeText={(text) => setFormData(prev => ({
                  ...prev,
                  weight_kg: parseFloat(text) || 0
                }))}
                keyboardType="numeric"
                placeholder="70"
              />
              <Text style={styles.inputUnit}>kg</Text>
            </View>
          </View>
        </View>

        {/* Altezza */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Altezza (cm)</Text>
          <View style={styles.inputWrapper}>
            <View style={styles.inputShadow} />
            <View style={styles.inputWithUnit}>
              <TextInput
                style={styles.numericInput}
                value={formData.height_cm.toString()}
                onChangeText={(text) => setFormData(prev => ({
                  ...prev,
                  height_cm: parseInt(text) || 0
                }))}
                keyboardType="numeric"
                placeholder="170"
              />
              <Text style={styles.inputUnit}>cm</Text>
            </View>
          </View>
        </View>

        {/* Età */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Età</Text>
          <View style={styles.inputWrapper}>
            <View style={styles.inputShadow} />
            <View style={styles.inputWithUnit}>
              <TextInput
                style={styles.numericInput}
                value={formData.age.toString()}
                onChangeText={(text) => setFormData(prev => ({
                  ...prev,
                  age: parseInt(text) || 0
                }))}
                keyboardType="numeric"
                placeholder="30"
              />
              <Text style={styles.inputUnit}>anni</Text>
            </View>
          </View>
        </View>

        {/* Genere */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Genere</Text>
          <View style={styles.genderSelector}>
            {[
              { key: 'male', label: 'Maschio', icon: 'male' },
              { key: 'female', label: 'Femmina', icon: 'female' },
              { key: 'other', label: 'Altro', icon: 'person' }
            ].map((gender) => (
              <View key={gender.key} style={styles.genderOptionWrapper}>
                <View style={styles.genderOptionShadow} />
                <TouchableOpacity
                  style={[
                    styles.genderOption,
                    formData.gender === gender.key && styles.genderOptionSelected
                  ]}
                  onPress={() => setFormData(prev => ({ ...prev, gender: gender.key as any }))}
                >
                  <Ionicons
                    name={gender.icon as any}
                    size={24}
                    color={formData.gender === gender.key ? '#FFFFFF' : BORDER_COLOR}
                  />
                  <Text style={[
                    styles.genderOptionText,
                    formData.gender === gender.key && styles.genderOptionTextSelected
                  ]}>
                    {gender.label}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepCardWrapper}>
      <View style={styles.stepCardShadow} />
      <View style={styles.stepCardContainer}>
        <Text style={styles.stepTitle}>Livello di Attività</Text>
        <Text style={styles.stepDescription}>
          Seleziona il tuo livello di attività fisica medio
        </Text>
        
        {ACTIVITY_LEVELS.map((level) => (
          <View key={level.key} style={styles.activityOptionWrapper}>
            <View style={styles.activityOptionShadow} />
            <TouchableOpacity
              style={[
                styles.activityOption,
                formData.activity_level === level.key && styles.activityOptionSelected
              ]}
              onPress={() => setFormData(prev => ({ ...prev, activity_level: level.key as any }))}
            >
              <View style={styles.activityOptionIcon}>
                <Ionicons
                  name={level.icon as any}
                  size={28}
                  color={formData.activity_level === level.key ? '#4ECDC4' : '#666666'}
                />
              </View>
              <View style={styles.activityOptionContent}>
                <Text style={[
                  styles.activityOptionTitle,
                  formData.activity_level === level.key && styles.activityOptionTitleSelected
                ]}>
                  {level.label}
                </Text>
                <Text style={styles.activityOptionDescription}>
                  {level.description}
                </Text>
              </View>
              <View style={styles.activityOptionCheck}>
                {formData.activity_level === level.key && (
                  <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepCardWrapper}>
      <View style={styles.stepCardShadow} />
      <View style={styles.stepCardContainer}>
        <Text style={styles.stepTitle}>Obiettivo</Text>
        <Text style={styles.stepDescription}>
          Qual è il tuo obiettivo nutrizionale?
        </Text>
        
        {GOALS.map((goal) => (
          <View key={goal.key} style={styles.goalOptionWrapper}>
            <View style={styles.goalOptionShadow} />
            <TouchableOpacity
              style={[
                styles.goalOption,
                formData.goal === goal.key && styles.goalOptionSelected
              ]}
              onPress={() => setFormData(prev => ({ ...prev, goal: goal.key as any }))}
            >
              <View style={[styles.goalOptionIcon, { backgroundColor: goal.color }]}>
                <Ionicons
                  name={goal.icon as any}
                  size={28}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.goalOptionContent}>
                <Text style={[
                  styles.goalOptionTitle,
                  formData.goal === goal.key && styles.goalOptionTitleSelected
                ]}>
                  {goal.label}
                </Text>
                <Text style={styles.goalOptionDescription}>
                  {goal.description}
                </Text>
              </View>
              <View style={styles.goalOptionCheck}>
                {formData.goal === goal.key && (
                  <Ionicons name="checkmark-circle" size={24} color={goal.color} />
                )}
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );

  const renderStep4 = () => {
    const estimates = getEstimates();
    
    return (
      <View style={styles.stepCardWrapper}>
        <View style={styles.stepCardShadow} />
        <View style={styles.stepCardContainer}>
          <Text style={styles.stepTitle}>Riepilogo</Text>
          <Text style={styles.stepDescription}>
            Ecco il tuo profilo nutrizionale calcolato
          </Text>

          <View style={styles.summaryCardWrapper}>
            <View style={styles.summaryCardShadow} />
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Ionicons name="person-circle" size={48} color="#4ECDC4" />
                <View style={styles.summaryHeaderText}>
                  <Text style={styles.summaryName}>Il Tuo Profilo</Text>
                  <Text style={styles.summaryBmi}>BMI: {estimates.bmi.toFixed(1)}</Text>
                </View>
              </View>

              <View style={styles.summaryStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{estimates.targetKcal}</Text>
                  <Text style={styles.statLabel}>Calorie Target</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{estimates.macros.proteins_g}g</Text>
                  <Text style={styles.statLabel}>Proteine</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{estimates.macros.carbs_g}g</Text>
                  <Text style={styles.statLabel}>Carboidrati</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{estimates.macros.fats_g}g</Text>
                  <Text style={styles.statLabel}>Grassi</Text>
                </View>
              </View>

              <View style={styles.summaryDetails}>
                <Text style={styles.summaryDetailText}>
                  Metabolismo basale: {estimates.bmr} kcal/giorno
                </Text>
                <Text style={styles.summaryDetailText}>
                  Dispendio totale: {estimates.tdee} kcal/giorno
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => step > 1 ? setStep(step - 1) : navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={BORDER_COLOR} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profilo Nutrizionale</Text>
          <View style={styles.stepIndicatorWrapper}>
            <View style={styles.stepIndicatorShadow} />
            <View style={styles.stepIndicator}>
              <Text style={styles.stepIndicatorText}>{step}/4</Text>
            </View>
          </View>
        </View>

        <View style={styles.progressBarWrapper}>
          <View style={styles.progressBarShadow} />
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]} />
          </View>
        </View>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}

        <View style={styles.buttonContainer}>
          {step < 4 ? (
            <View style={styles.nextButtonWrapper}>
              <View style={styles.nextButtonShadow} />
              <TouchableOpacity
                style={styles.nextButton}
                onPress={() => setStep(step + 1)}
              >
                <Text style={styles.nextButtonText}>Continua</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.nextButtonWrapper}>
              <View style={styles.nextButtonShadow} />
              <TouchableOpacity
                style={[styles.nextButton, loading && styles.nextButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.nextButtonText}>
                  {loading ? 'Salvataggio...' : 'Salva Profilo'}
                </Text>
                {!loading && <Ionicons name="checkmark" size={20} color="#FFFFFF" />}
              </TouchableOpacity>
            </View>
          )}
        </View>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  stepIndicatorWrapper: {
    position: 'relative',
  },
  stepIndicatorShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  stepIndicator: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 4,
    position: 'relative',
    zIndex: 1,
  },
  stepIndicatorText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  progressBarWrapper: {
    position: 'relative',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  progressBarShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 4,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ECDC4',
    borderRadius: 3,
  },
  
  // Step Cards
  stepCardWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 20,
  },
  stepCardShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: CARD_BORDER_RADIUS,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  stepCardContainer: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 20,
    position: 'relative',
    zIndex: 1,
  },
  stepTitle: {
    fontSize: 24,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginBottom: 24,
  },
  
  // Input Groups
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    marginBottom: 8,
  },
  inputWrapper: {
    position: 'relative',
  },
  inputShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    paddingHorizontal: 16,
    position: 'relative',
    zIndex: 1,
  },
  numericInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Regular',
    paddingVertical: 16,
    color: BORDER_COLOR,
  },
  inputUnit: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
    marginLeft: 8,
  },
  
  // Gender Selector
  genderSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  genderOptionWrapper: {
    flex: 1,
    position: 'relative',
  },
  genderOptionShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  genderOption: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  genderOptionSelected: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  genderOptionText: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
  },
  genderOptionTextSelected: {
    color: '#FFFFFF',
  },
  
  // Activity Options
  activityOptionWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  activityOptionShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  activityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 16,
    position: 'relative',
    zIndex: 1,
  },
  activityOptionSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#F0FDFC',
  },
  activityOptionIcon: {
    marginRight: 16,
  },
  activityOptionContent: {
    flex: 1,
  },
  activityOptionTitle: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    marginBottom: 4,
  },
  activityOptionTitleSelected: {
    color: '#4ECDC4',
  },
  activityOptionDescription: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  activityOptionCheck: {
    marginLeft: 16,
  },
  
  // Goal Options
  goalOptionWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  goalOptionShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  goalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 16,
    position: 'relative',
    zIndex: 1,
  },
  goalOptionSelected: {
    backgroundColor: '#F8F9FF',
  },
  goalOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  goalOptionContent: {
    flex: 1,
  },
  goalOptionTitle: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    marginBottom: 4,
  },
  goalOptionTitleSelected: {
    color: BORDER_COLOR,
  },
  goalOptionDescription: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  goalOptionCheck: {
    marginLeft: 16,
  },
  
  // Summary Card
  summaryCardWrapper: {
    position: 'relative',
    marginTop: 16,
  },
  summaryCardShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 16,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE - 1,
    left: SHADOW_OFFSET_VALUE - 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  summaryCard: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 16,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 20,
    position: 'relative',
    zIndex: 1,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  summaryHeaderText: {
    marginLeft: 16,
  },
  summaryName: {
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
  },
  summaryBmi: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginTop: 2,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'BricolageGrotesque-Bold',
    color: '#4ECDC4',
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginTop: 4,
  },
  summaryDetails: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingTop: 16,
    gap: 8,
  },
  summaryDetailText: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  
  // Button Container
  buttonContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  nextButtonWrapper: {
    position: 'relative',
  },
  nextButtonShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  nextButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
}); 