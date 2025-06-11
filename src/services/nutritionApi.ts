import { supabase } from '../lib/supabase';

// Interfacce TypeScript
export interface UserNutritionProfile {
  id: string;
  user_id: string;
  weight_kg: number;
  height_cm: number;
  age: number;
  gender: 'male' | 'female' | 'other';
  activity_level: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
  goal: 'lose_weight' | 'maintain' | 'gain_weight' | 'gain_muscle';
  bmi: number;
  bmr_kcal: number;
  tdee_kcal: number;
  target_kcal: number;
  target_proteins_g: number;
  target_carbs_g: number;
  target_fats_g: number;
  created_at: string;
  updated_at: string;
}

export interface DailyNutritionLog {
  id: string;
  user_id: string;
  log_date: string;
  total_kcal: number;
  total_proteins_g: number;
  total_carbs_g: number;
  total_fats_g: number;
  target_kcal: number;
  target_proteins_g: number;
  target_carbs_g: number;
  target_fats_g: number;
  created_at: string;
  updated_at: string;
}

export interface DailyNutritionEntry {
  id: string;
  daily_log_id: string;
  product_id?: string;
  user_id: string;
  entry_type: 'barcode' | 'photo_packaged' | 'photo_meal';
  quantity_g?: number;
  portion_description?: string;
  kcal: number;
  proteins_g: number;
  carbs_g: number;
  fats_g: number;
  product_name: string;
  product_brand?: string;
  product_image?: string;
  added_at: string;
}

export interface NutritionProfileInput {
  weight_kg: number;
  height_cm: number;
  age: number;
  gender: 'male' | 'female' | 'other';
  activity_level: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
  goal: 'lose_weight' | 'maintain' | 'gain_weight' | 'gain_muscle';
}

// Coefficienti per il calcolo del metabolismo basale (Harris-Benedict)
const BMR_COEFFICIENTS = {
  male: { base: 88.362, weight: 13.397, height: 4.799, age: 5.677 },
  female: { base: 447.593, weight: 9.247, height: 3.098, age: 4.330 },
  other: { base: 447.593, weight: 9.247, height: 3.098, age: 4.330 } // Default a female
};

// Moltiplicatori per livello di attività (TDEE)
const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,          // Poco o nessun esercizio
  lightly_active: 1.375,   // Esercizio leggero 1-3 giorni/settimana
  moderately_active: 1.55, // Esercizio moderato 3-5 giorni/settimana  
  very_active: 1.725,      // Esercizio intenso 6-7 giorni/settimana
  extra_active: 1.9        // Esercizio molto intenso, lavoro fisico
};

// Modificatori per obiettivi calorici
const GOAL_MODIFIERS = {
  lose_weight: -500,    // -500 kcal per perdere ~0.5 kg/settimana
  maintain: 0,          // Mantenere peso attuale
  gain_weight: 300,     // +300 kcal per aumentare peso gradualmente
  gain_muscle: 200      // +200 kcal per costruire massa muscolare
};

/**
 * Calcola il metabolismo basale (BMR) usando la formula Harris-Benedict
 */
export function calculateBMR(weight_kg: number, height_cm: number, age: number, gender: 'male' | 'female' | 'other'): number {
  const coeff = BMR_COEFFICIENTS[gender];
  return Math.round(coeff.base + (coeff.weight * weight_kg) + (coeff.height * height_cm) - (coeff.age * age));
}

/**
 * Calcola il dispendio energetico totale giornaliero (TDEE)
 */
export function calculateTDEE(bmr: number, activity_level: string): number {
  const multiplier = ACTIVITY_MULTIPLIERS[activity_level as keyof typeof ACTIVITY_MULTIPLIERS] || 1.2;
  return Math.round(bmr * multiplier);
}

/**
 * Calcola le calorie target in base all'obiettivo
 */
export function calculateTargetCalories(tdee: number, goal: string): number {
  const modifier = GOAL_MODIFIERS[goal as keyof typeof GOAL_MODIFIERS] || 0;
  return Math.max(Math.round(tdee + modifier), 1200); // Minimo 1200 kcal per sicurezza
}

/**
 * Calcola i macronutrienti target (proteine, carboidrati, grassi)
 */
export function calculateMacroTargets(targetKcal: number, goal: string): {
  proteins_g: number;
  carbs_g: number;
  fats_g: number;
} {
  let proteinPercentage, carbPercentage, fatPercentage;

  switch (goal) {
    case 'lose_weight':
      proteinPercentage = 0.30; // 30% proteine per preservare massa muscolare
      carbPercentage = 0.35;    // 35% carboidrati
      fatPercentage = 0.35;     // 35% grassi
      break;
    case 'gain_muscle':
      proteinPercentage = 0.25; // 25% proteine per costruire muscoli
      carbPercentage = 0.45;    // 45% carboidrati per energia
      fatPercentage = 0.30;     // 30% grassi
      break;
    case 'gain_weight':
      proteinPercentage = 0.20; // 20% proteine
      carbPercentage = 0.50;    // 50% carboidrati
      fatPercentage = 0.30;     // 30% grassi
      break;
    default: // maintain
      proteinPercentage = 0.25; // 25% proteine
      carbPercentage = 0.45;    // 45% carboidrati
      fatPercentage = 0.30;     // 30% grassi
  }

  return {
    proteins_g: Math.round((targetKcal * proteinPercentage) / 4), // 4 kcal per grammo
    carbs_g: Math.round((targetKcal * carbPercentage) / 4),       // 4 kcal per grammo
    fats_g: Math.round((targetKcal * fatPercentage) / 9)          // 9 kcal per grammo
  };
}

/**
 * Crea o aggiorna il profilo nutrizionale dell'utente
 */
export async function createOrUpdateNutritionProfile(profileData: NutritionProfileInput): Promise<UserNutritionProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utente non autenticato');

  // Calcola i valori derivati
  const bmr = calculateBMR(profileData.weight_kg, profileData.height_cm, profileData.age, profileData.gender);
  const tdee = calculateTDEE(bmr, profileData.activity_level);
  const targetKcal = calculateTargetCalories(tdee, profileData.goal);
  const macros = calculateMacroTargets(targetKcal, profileData.goal);

  const completeProfile = {
    ...profileData,
    user_id: user.id,
    bmr_kcal: bmr,
    tdee_kcal: tdee,
    target_kcal: targetKcal,
    target_proteins_g: macros.proteins_g,
    target_carbs_g: macros.carbs_g,
    target_fats_g: macros.fats_g
  };

  const { data, error } = await supabase
    .from('user_nutrition_profiles')
    .upsert(completeProfile)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Ottiene il profilo nutrizionale dell'utente
 */
export async function getUserNutritionProfile(): Promise<UserNutritionProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utente non autenticato');

  const { data, error } = await supabase
    .from('user_nutrition_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
  return data;
}

/**
 * Ottiene o crea il log nutrizionale per una data specifica
 */
export async function getDailyNutritionLog(date: string): Promise<DailyNutritionLog> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utente non autenticato');

  // Prima cerca se esiste già
  let { data: existingLog, error } = await supabase
    .from('daily_nutrition_logs')
    .select('*')
    .eq('user_id', user.id)
    .eq('log_date', date)
    .single();

  if (existingLog && !error) {
    return existingLog;
  }

  // Se non esiste, lo crea con i target attuali dell'utente
  const profile = await getUserNutritionProfile();
  if (!profile) throw new Error('Profilo nutrizionale non trovato. Configuralo prima.');

  const { data: newLog, error: createError } = await supabase
    .from('daily_nutrition_logs')
    .insert({
      user_id: user.id,
      log_date: date,
      target_kcal: profile.target_kcal,
      target_proteins_g: profile.target_proteins_g,
      target_carbs_g: profile.target_carbs_g,
      target_fats_g: profile.target_fats_g
    })
    .select()
    .single();

  if (createError) throw createError;
  return newLog;
}

/**
 * Aggiunge un prodotto al log giornaliero
 */
export async function addProductToDay(
  date: string, 
  productId: string,
  entryType: 'barcode' | 'photo_packaged' | 'photo_meal',
  quantityG?: number,
  portionDescription?: string
): Promise<DailyNutritionEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utente non autenticato');

  // Ottieni il log giornaliero
  const dailyLog = await getDailyNutritionLog(date);

  // Ottieni i dati del prodotto
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (productError) throw productError;

  let kcal, proteins_g, carbs_g, fats_g;

  if (entryType === 'photo_meal') {
    // Per i pasti fotografati, estrai i valori totali dal breakdown degli ingredienti
    if (product.ingredients_breakdown) {
      try {
        // Il breakdown può essere già un array o una stringa JSON da parsare
        let breakdown;
        if (typeof product.ingredients_breakdown === 'string') {
          breakdown = JSON.parse(product.ingredients_breakdown);
        } else if (Array.isArray(product.ingredients_breakdown)) {
          breakdown = product.ingredients_breakdown;
        }
        
        if (Array.isArray(breakdown)) {
          kcal = breakdown.reduce((sum, item) => sum + (item.estimated_calories_kcal || 0), 0);
          proteins_g = breakdown.reduce((sum, item) => sum + (item.estimated_proteins_g || 0), 0);
          carbs_g = breakdown.reduce((sum, item) => sum + (item.estimated_carbs_g || 0), 0);
          fats_g = breakdown.reduce((sum, item) => sum + (item.estimated_fats_g || 0), 0);
        } else {
          // Fallback ai valori stimati per 100g se il breakdown non è un array valido
          kcal = product.estimated_energy_kcal_100g || product.energy_kcal_100g || 0;
          proteins_g = product.estimated_proteins_100g || product.proteins_100g || 0;
          carbs_g = product.estimated_carbs_100g || product.carbohydrates_100g || 0;
          fats_g = product.estimated_fats_100g || product.fat_100g || 0;
        }
      } catch (error) {
        console.error('Errore parsing ingredients_breakdown:', error);
        // Fallback ai valori stimati per 100g se c'è un errore di parsing
        kcal = product.estimated_energy_kcal_100g || product.energy_kcal_100g || 0;
        proteins_g = product.estimated_proteins_100g || product.proteins_100g || 0;
        carbs_g = product.estimated_carbs_100g || product.carbohydrates_100g || 0;
        fats_g = product.estimated_fats_100g || product.fat_100g || 0;
      }
    } else {
      // Fallback ai valori stimati per 100g se il breakdown non è disponibile
      kcal = product.estimated_energy_kcal_100g || product.energy_kcal_100g || 0;
      proteins_g = product.estimated_proteins_100g || product.proteins_100g || 0;
      carbs_g = product.estimated_carbs_100g || product.carbohydrates_100g || 0;
      fats_g = product.estimated_fats_100g || product.fat_100g || 0;
    }
  } else {
    // Per prodotti confezionati, calcola in base alla quantità
    if (!quantityG) throw new Error('Quantità richiesta per prodotti confezionati');
    
    const factor = quantityG / 100; // Converti da valori per 100g
    
    // Usa i valori stimati se disponibili (per prodotti analizzati visivamente), 
    // altrimenti usa i valori standard (per prodotti da barcode)
    const baseKcal = product.estimated_energy_kcal_100g || product.energy_kcal_100g || 0;
    const baseProteins = product.estimated_proteins_100g || product.proteins_100g || 0;
    const baseCarbs = product.estimated_carbs_100g || product.carbohydrates_100g || 0;
    const baseFats = product.estimated_fats_100g || product.fat_100g || 0;
    
    kcal = baseKcal * factor;
    proteins_g = baseProteins * factor;
    carbs_g = baseCarbs * factor;
    fats_g = baseFats * factor;
  }

  const { data: entry, error } = await supabase
    .from('daily_nutrition_entries')
    .insert({
      daily_log_id: dailyLog.id,
      product_id: productId,
      user_id: user.id,
      entry_type: entryType,
      quantity_g: quantityG,
      portion_description: portionDescription,
      kcal: Math.round(kcal * 100) / 100, // Arrotonda a 2 decimali
      proteins_g: Math.round(proteins_g * 100) / 100,
      carbs_g: Math.round(carbs_g * 100) / 100,
      fats_g: Math.round(fats_g * 100) / 100,
      product_name: product.product_name,
      product_brand: product.brand,
      product_image: product.product_image
    })
    .select()
    .single();

  if (error) throw error;
  return entry;
}

/**
 * Ottiene le entries di un log giornaliero
 */
export async function getDailyNutritionEntries(date: string): Promise<DailyNutritionEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utente non autenticato');

  const { data, error } = await supabase
    .from('daily_nutrition_entries')
    .select(`
      *,
      daily_nutrition_logs!inner(user_id, log_date)
    `)
    .eq('daily_nutrition_logs.user_id', user.id)
    .eq('daily_nutrition_logs.log_date', date)
    .order('added_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Rimuove una entry dal log giornaliero
 */
export async function removeNutritionEntry(entryId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utente non autenticato');

  const { error } = await supabase
    .from('daily_nutrition_entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', user.id);

  if (error) throw error;
}

/**
 * Ottiene i log nutrizionali per un range di date
 */
export async function getNutritionLogsRange(startDate: string, endDate: string): Promise<DailyNutritionLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utente non autenticato');

  const { data, error } = await supabase
    .from('daily_nutrition_logs')
    .select('*')
    .eq('user_id', user.id)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Esegue la pulizia automatica delle entries vecchie
 */
export async function cleanupOldEntries(): Promise<void> {
  const { error } = await supabase.rpc('cleanup_old_nutrition_entries');
  if (error) throw error;
} 