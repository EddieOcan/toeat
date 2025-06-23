import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { scaleFont } from '../../theme/typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { createOrUpdateNutritionProfile, NutritionProfileInput, calculateBMR, calculateTDEE, calculateTargetCalories, calculateMacroTargets } from '../../services/nutritionApi';

// Costanti di stile per uniformare con l'app
const BACKGROUND_COLOR = '#f8f4ec';
const CARD_BACKGROUND_COLOR = '#FFFFFF';
const BORDER_COLOR = '#000000';
const SHADOW_OFFSET_VALUE = 3.5;
const CARD_BORDER_WIDTH = 1.5;
const CARD_BORDER_RADIUS = 16;
const PRIMARY_GREEN = '#00463b'; // Verde scuro della navbar

interface Props {
  navigation: any;
  onProfileCreated?: () => void;
}

const ACTIVITY_LEVELS = [
  {
    key: 'sedentary',
    label: 'Sedentario',
    description: 'Nessun esercizio fisico',
    icon: 'bed-outline',
  },
  {
    key: 'lightly_active',
    label: 'Leggermente Attivo',
    description: 'Sport 1-3 volte a settimana',
    icon: 'walk-outline',
  },
  {
    key: 'moderately_active',
    label: 'Moderatamente Attivo',
    description: 'Sport 3-5 volte a settimana',
    icon: 'bicycle-outline',
  },
  {
    key: 'very_active',
    label: 'Molto Attivo',
    description: 'Sport 6-7 volte a settimana',
    icon: 'fitness-outline',
  },
  {
    key: 'extra_active',
    label: 'Estremamente Attivo',
    description: 'Sport intenso + lavoro fisico',
    icon: 'barbell-outline',
  },
];

const GOALS = [
  {
    key: 'lose_weight',
    label: 'Perdere Peso',
    description: 'Ridurre il peso corporeo',
    icon: 'trending-down-outline',
  },
  {
    key: 'maintain',
    label: 'Mantenere Peso',
    description: 'Mantenere il peso attuale',
    icon: 'remove-outline',
  },
  {
    key: 'gain_weight',
    label: 'Aumentare Peso',
    description: 'Aumentare il peso corporeo',
    icon: 'trending-up-outline',
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
  const [showWeightPicker, setShowWeightPicker] = useState(false);
  const [showHeightPicker, setShowHeightPicker] = useState(false);
  const [showAgePicker, setShowAgePicker] = useState(false);

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
    <View style={styles.stepContainer}>
      
      {/* Peso */}
      <View style={styles.dataFieldWrapper}>
        <View style={[styles.dataFieldShadow, { backgroundColor: '#FF6B35' }]} />
        <TouchableOpacity 
          style={[styles.dataFieldContainer, { borderColor: '#FF6B35' }]}
          onPress={() => setShowWeightPicker(true)}
          activeOpacity={1}
        >
          <View style={styles.dataFieldLeft}>
            <View style={[styles.dataFieldIcon, { backgroundColor: '#FF6B35' }]}>
              <Ionicons name="barbell" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.dataFieldInfo}>
              <Text style={styles.dataFieldLabel} allowFontScaling={false}>Peso corporeo</Text>
            </View>
          </View>
          <View style={styles.dataFieldRight}>
            <View style={styles.valueContainer}>
              <View style={[styles.valueBadge, { backgroundColor: '#FF6B3515' }]}>
                <Text style={[styles.valueNumber, { color: '#FF6B35' }]} allowFontScaling={false}>{formData.weight_kg}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999999" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Altezza */}
      <View style={styles.dataFieldWrapper}>
        <View style={[styles.dataFieldShadow, { backgroundColor: '#4ECDC4' }]} />
        <TouchableOpacity 
          style={[styles.dataFieldContainer, { borderColor: '#4ECDC4' }]}
          onPress={() => setShowHeightPicker(true)}
          activeOpacity={1}
        >
          <View style={styles.dataFieldLeft}>
            <View style={[styles.dataFieldIcon, { backgroundColor: '#4ECDC4' }]}>
              <Ionicons name="trending-up" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.dataFieldInfo}>
              <Text style={styles.dataFieldLabel} allowFontScaling={false}>Altezza</Text>
            </View>
          </View>
          <View style={styles.dataFieldRight}>
            <View style={styles.valueContainer}>
              <View style={[styles.valueBadge, { backgroundColor: '#4ECDC415' }]}>
                <Text style={[styles.valueNumber, { color: '#4ECDC4' }]} allowFontScaling={false}>{formData.height_cm}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999999" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Età */}
      <View style={styles.dataFieldWrapper}>
        <View style={[styles.dataFieldShadow, { backgroundColor: '#9B59B6' }]} />
        <TouchableOpacity 
          style={[styles.dataFieldContainer, { borderColor: '#9B59B6' }]}
          onPress={() => setShowAgePicker(true)}
          activeOpacity={1}
        >
          <View style={styles.dataFieldLeft}>
            <View style={[styles.dataFieldIcon, { backgroundColor: '#9B59B6' }]}>
              <Ionicons name="time" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.dataFieldInfo}>
              <Text style={styles.dataFieldLabel} allowFontScaling={false}>Età</Text>
            </View>
          </View>
          <View style={styles.dataFieldRight}>
            <View style={styles.valueContainer}>
              <View style={[styles.valueBadge, { backgroundColor: '#9B59B615' }]}>
                <Text style={[styles.valueNumber, { color: '#9B59B6' }]} allowFontScaling={false}>{formData.age}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999999" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Genere */}
      <View style={styles.dataFieldWrapper}>
        <View style={[styles.dataFieldShadow, { backgroundColor: '#E91E63' }]} />
        <TouchableOpacity 
          style={[styles.dataFieldContainer, { borderColor: '#E91E63' }]}
          activeOpacity={1}
        >
          <View style={styles.dataFieldLeft}>
            <View style={[styles.dataFieldIcon, { backgroundColor: '#E91E63' }]}>
              <Ionicons name="people" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.dataFieldInfo}>
              <Text style={styles.dataFieldLabel} allowFontScaling={false}>Genere</Text>
            </View>
          </View>
          <View style={styles.dataFieldRight}>
            <View style={styles.genderOptionsRow}>
              {[
                { key: 'male', label: 'Maschio', icon: 'male' },
                { key: 'female', label: 'Femmina', icon: 'female' },
                { key: 'other', label: 'Altro', icon: 'person' }
              ].map((gender) => {
                const isSelected = formData.gender === gender.key;
                return (
                  <TouchableOpacity
                    key={gender.key}
                    style={[
                      styles.genderOptionButton,
                      isSelected && styles.genderOptionButtonSelected
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, gender: gender.key as any }))}
                    activeOpacity={1}
                  >
                    <Ionicons
                      name={gender.icon as any}
                      size={14}
                      color={isSelected ? '#FFFFFF' : '#666666'}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      
      {ACTIVITY_LEVELS.map((level, index) => {
        const isSelected = formData.activity_level === level.key;
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57'];
        const color = colors[index % colors.length];
        
        return (
          <View key={level.key} style={styles.dataFieldWrapper}>
            <View style={[styles.dataFieldShadow, { backgroundColor: isSelected ? '#000000' : color }]} />
            <TouchableOpacity
              style={[
                styles.dataFieldContainer,
                { 
                  borderColor: isSelected ? '#000000' : color,
                  backgroundColor: isSelected ? color : CARD_BACKGROUND_COLOR
                }
              ]}
              onPress={() => setFormData(prev => ({ ...prev, activity_level: level.key as any }))}
              activeOpacity={1}
            >
              <View style={styles.dataFieldLeft}>
                <View style={[styles.dataFieldIcon, { backgroundColor: isSelected ? '#000000' : color }]}>
                  <Ionicons
                    name={level.icon as any}
                    size={16}
                    color="#FFFFFF"
                  />
                </View>
                <View style={styles.dataFieldInfo}>
                  <Text style={[
                    styles.dataFieldLabel,
                    isSelected && { color: '#FFFFFF' }
                  ]} allowFontScaling={false}>
                    {level.label}
                  </Text>
                  <Text style={[
                    styles.dataFieldDescription,
                    isSelected && { color: '#FFFFFF' }
                  ]} allowFontScaling={false}>
                    {level.description}
                  </Text>
                </View>
              </View>
              <View style={styles.dataFieldRight}>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      
      {GOALS.map((goal, index) => {
        const isSelected = formData.goal === goal.key;
        const colors = ['#E74C3C', '#2ECC71', '#3498DB'];
        const color = colors[index % colors.length];
        
        return (
          <View key={goal.key} style={styles.dataFieldWrapper}>
            <View style={[styles.dataFieldShadow, { backgroundColor: isSelected ? '#000000' : color }]} />
            <TouchableOpacity
              style={[
                styles.dataFieldContainer,
                { 
                  borderColor: isSelected ? '#000000' : color,
                  backgroundColor: isSelected ? color : CARD_BACKGROUND_COLOR
                }
              ]}
              onPress={() => setFormData(prev => ({ ...prev, goal: goal.key as any }))}
              activeOpacity={1}
            >
              <View style={styles.dataFieldLeft}>
                <View style={[styles.dataFieldIcon, { backgroundColor: isSelected ? '#000000' : color }]}>
                  <Ionicons
                    name={goal.icon as any}
                    size={16}
                    color="#FFFFFF"
                  />
                </View>
                <View style={styles.dataFieldInfo}>
                  <Text style={[
                    styles.dataFieldLabel,
                    isSelected && { color: '#FFFFFF' }
                  ]} allowFontScaling={false}>
                    {goal.label}
                  </Text>
                  <Text style={[
                    styles.dataFieldDescription,
                    isSelected && { color: '#FFFFFF' }
                  ]} allowFontScaling={false}>
                    {goal.description}
                  </Text>
                </View>
              </View>
              <View style={styles.dataFieldRight}>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

  const renderStep4 = () => {
    const estimates = getEstimates();
    
    return (
      <View style={styles.stepContainer}>
        <View style={styles.summaryWrapper}>
          <View style={styles.summaryShadow} />
          <View style={styles.summaryContainer}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryMainValue} allowFontScaling={false}>
                {estimates.targetKcal}
              </Text>
              <Text style={styles.summaryMainLabel} allowFontScaling={false}>
                kcal giornaliere
              </Text>
              <Text style={styles.summaryBmi} allowFontScaling={false}>
                BMI: {estimates.bmi.toFixed(1)}
              </Text>
            </View>

            <View style={styles.macroGrid}>
              <View style={styles.macroItem}>
                <View style={[styles.macroIcon, { backgroundColor: '#CD5C5C' }]}>
                  <Ionicons name="barbell" size={16} color="#000000" />
                </View>
                <Text style={styles.macroLabel} allowFontScaling={false}>Proteine</Text>
                <Text style={styles.macroValue} allowFontScaling={false}>
                  {estimates.macros.proteins_g}g
                </Text>
              </View>

              <View style={styles.macroItem}>
                <View style={[styles.macroIcon, { backgroundColor: '#FFD700' }]}>
                  <Ionicons name="layers" size={16} color="#000000" />
                </View>
                <Text style={styles.macroLabel} allowFontScaling={false}>Carboidrati</Text>
                <Text style={styles.macroValue} allowFontScaling={false}>
                  {estimates.macros.carbs_g}g
                </Text>
              </View>

              <View style={styles.macroItem}>
                <View style={[styles.macroIcon, { backgroundColor: '#87CEEB' }]}>
                  <Ionicons name="cafe" size={16} color="#000000" />
                </View>
                <Text style={styles.macroLabel} allowFontScaling={false}>Grassi</Text>
                <Text style={styles.macroValue} allowFontScaling={false}>
                  {estimates.macros.fats_g}g
                </Text>
              </View>
            </View>

            <Text style={styles.summaryNote} allowFontScaling={false}>
              Dispendio energetico totale: {estimates.tdee} kcal/giorno
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => step > 1 ? setStep(step - 1) : navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={BORDER_COLOR} />
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
      </View>

      {/* Section Title */}
      <View style={styles.sectionTitleContainer}>
        <Text style={styles.sectionTitle} allowFontScaling={false}>
          {step === 1 && 'Dati Personali'}
          {step === 2 && 'Livello di Attività'}
          {step === 3 && 'Obiettivo'}
          {step === 4 && 'Riepilogo'}
        </Text>
      </View>

      {/* Progress Bar Semplice */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]} />
        </View>
        <Text style={styles.progressText} allowFontScaling={false}>
          Passo {step} di 4
        </Text>
      </View>

      {/* Scrollable Content */}
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEnabled={true}
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </ScrollView>

      {/* Fixed Bottom Button */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity
          style={[styles.continueButton, loading && styles.buttonDisabled]}
          onPress={step < 4 ? () => setStep(step + 1) : handleSubmit}
          disabled={loading}
          activeOpacity={1}
        >
          <Text style={styles.continueButtonText} allowFontScaling={false}>
            {step < 4 ? 'Continua' : loading ? 'Salvataggio...' : 'Salva Profilo'}
          </Text>
          {!loading && (
            <Ionicons 
              name={step < 4 ? "arrow-forward" : "checkmark"} 
              size={20} 
              color="#FFFFFF" 
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Modal Peso */}
      <Modal
        visible={showWeightPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWeightPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowWeightPicker(false)}>
                <Text style={styles.modalCancelText} allowFontScaling={false}>Annulla</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle} allowFontScaling={false}>Seleziona Peso</Text>
              <TouchableOpacity onPress={() => setShowWeightPicker(false)}>
                <Text style={styles.modalDoneText} allowFontScaling={false}>Fatto</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={formData.weight_kg}
              onValueChange={(value) => setFormData(prev => ({ ...prev, weight_kg: value }))}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {Array.from({ length: 151 }, (_, i) => i + 30).map(weight => (
                <Picker.Item 
                  key={weight} 
                  label={`${weight} kg`} 
                  value={weight}
                  color={BORDER_COLOR}
                />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>

      {/* Modal Altezza */}
      <Modal
        visible={showHeightPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHeightPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowHeightPicker(false)}>
                <Text style={styles.modalCancelText} allowFontScaling={false}>Annulla</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle} allowFontScaling={false}>Seleziona Altezza</Text>
              <TouchableOpacity onPress={() => setShowHeightPicker(false)}>
                <Text style={styles.modalDoneText} allowFontScaling={false}>Fatto</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={formData.height_cm}
              onValueChange={(value) => setFormData(prev => ({ ...prev, height_cm: value }))}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {Array.from({ length: 131 }, (_, i) => i + 120).map(height => (
                <Picker.Item 
                  key={height} 
                  label={`${height} cm`} 
                  value={height}
                  color={BORDER_COLOR}
                />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>

      {/* Modal Età */}
      <Modal
        visible={showAgePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAgePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowAgePicker(false)}>
                <Text style={styles.modalCancelText} allowFontScaling={false}>Annulla</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle} allowFontScaling={false}>Seleziona Età</Text>
              <TouchableOpacity onPress={() => setShowAgePicker(false)}>
                <Text style={styles.modalDoneText} allowFontScaling={false}>Fatto</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={formData.age}
              onValueChange={(value) => setFormData(prev => ({ ...prev, age: value }))}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {Array.from({ length: 89 }, (_, i) => i + 12).map(age => (
                <Picker.Item 
                  key={age} 
                  label={`${age} anni`} 
                  value={age}
                  color={BORDER_COLOR}
                />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
  },
  backButton: {
    padding: 8,
  },
  headerSpacer: {
    width: 40,
  },
  
  // Section Title
  sectionTitleContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: scaleFont(22),
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    textAlign: 'center',
  },
  
  // Progress Bar Semplice
  progressContainer: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: PRIMARY_GREEN,
    borderRadius: 2,
  },
  progressText: {
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
    textAlign: 'center',
  },
  

  
  // Step Container
  stepContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: scaleFont(24),
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    marginBottom: 24,
    textAlign: 'center',
  },
  
  // Input Groups
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: scaleFont(16),
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
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 16,
    position: 'relative',
    zIndex: 1,
    gap: 12,
  },
  inputValue: {
    flex: 1,
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Medium',
    color: BORDER_COLOR,
  },
  
  // Gender Selector
  genderWrapper: {
    position: 'relative',
  },
  genderShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  genderContainer: {
    flexDirection: 'row',
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    position: 'relative',
    zIndex: 1,
    padding: 4,
  },
  genderOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 4,
  },
  genderOptionSelected: {
    backgroundColor: PRIMARY_GREEN,
    borderColor: PRIMARY_GREEN,
  },
  genderOptionText: {
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
  },
  genderOptionTextSelected: {
    color: '#FFFFFF',
  },
  
  // Option Cards (Activity & Goals)
  optionWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  optionShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  optionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 16,
    position: 'relative',
    zIndex: 1,
    gap: 12,
  },
  optionContainerSelected: {
    backgroundColor: PRIMARY_GREEN,
    borderColor: PRIMARY_GREEN,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    marginBottom: 2,
  },
  optionTitleSelected: {
    color: '#FFFFFF',
  },
  optionDescription: {
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  optionDescriptionSelected: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  
  // Summary
  summaryWrapper: {
    position: 'relative',
    marginTop: 8,
  },
  summaryShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  summaryContainer: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 20,
    position: 'relative',
    zIndex: 1,
  },
  summaryHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  summaryMainValue: {
    fontSize: scaleFont(36),
    fontFamily: 'BricolageGrotesque-Bold',
    color: PRIMARY_GREEN,
  },
  summaryMainLabel: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Medium',
    color: '#666666',
    marginBottom: 8,
  },
  summaryBmi: {
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  macroItem: {
    flex: 1,
    alignItems: 'center',
  },
  macroIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  macroLabel: {
    fontSize: scaleFont(12),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    marginBottom: 4,
    textAlign: 'center',
  },
  macroValue: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
    textAlign: 'center',
  },
  summaryNote: {
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 16,
  },
  
  // Button
  buttonWrapper: {
    position: 'relative',
    marginHorizontal: 16,
  },
  buttonShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  buttonContainer: {
    backgroundColor: PRIMARY_GREEN,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  modalTitle: {
    fontSize: scaleFont(18),
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
  },
  modalCancelText: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  modalDoneText: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: PRIMARY_GREEN,
  },
  picker: {
    height: 200,
    backgroundColor: CARD_BACKGROUND_COLOR,
  },
  pickerItem: {
    color: BORDER_COLOR,
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-Regular',
  },
  
  
  // New styles for the new step 1 layout
  dataFieldWrapper: {
    position: 'relative',
    marginBottom: 20,
  },
  dataFieldShadow: {
    backgroundColor: BORDER_COLOR,
    borderRadius: 12,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  dataFieldContainer: {
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  dataFieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dataFieldIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dataFieldInfo: {
    flexDirection: 'column',
  },
  dataFieldLabel: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
  },
  dataFieldDescription: {
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666666',
  },
  dataFieldValue: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
  },
  dataFieldRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },


  genderOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  genderOptionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  genderOptionButtonSelected: {
    backgroundColor: PRIMARY_GREEN,
    borderColor: PRIMARY_GREEN,
  },
  
  // Value Badge Styles
  valueContainer: {
    alignItems: 'center',
  },
  valueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  valueNumber: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Bold',
  },
  valueUnit: {
    fontSize: scaleFont(12),
    fontFamily: 'BricolageGrotesque-Medium',
  },
  
  // Fixed Bottom Button
  bottomButtonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 16,
    backgroundColor: BACKGROUND_COLOR,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  continueButton: {
    backgroundColor: PRIMARY_GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Bold',
  },
  
}); 