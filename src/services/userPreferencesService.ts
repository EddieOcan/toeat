import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  user_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface HealthGoalCategory {
  id: string;
  name: string;
  description?: string;
  icon_name?: string;
  color?: string;
  priority?: number;
  created_at?: string;
}

export interface UserHealthGoal {
  id: string;
  user_id: string;
  goal_category_id: string;
  priority?: number;
  created_at?: string;
}

export interface ProductCompatibilityScore {
  id: string;
  user_id: string;
  product_record_id: string;
  compatibility_percentage?: number;
  mood_level?: number;
  explanation?: string;
  user_profile_snapshot?: any;
  user_goals_snapshot?: any;
  created_at?: string;
  updated_at?: string;
}

// Funzioni per gestire il profilo utente
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Nessun profilo trovato
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Errore nel recupero del profilo utente:', error);
    throw error;
  }
};

export const createUserProfile = async (userId: string, profileData: Partial<UserProfile>): Promise<UserProfile> => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        user_id: userId,
        ...profileData,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Errore nella creazione del profilo utente:', error);
    throw error;
  }
};

export const updateUserProfile = async (userId: string, profileData: Partial<UserProfile>): Promise<UserProfile> => {
  try {
    // Prova prima a fare un update
    const { data: updateData, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        ...profileData,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        // Nessun record trovato, crea un nuovo profilo
        return await createUserProfile(userId, profileData);
      }
      throw updateError;
    }

    return updateData;
  } catch (error) {
    console.error('Errore nell\'aggiornamento del profilo utente:', error);
    throw error;
  }
};

// Funzioni per gestire gli obiettivi di salute
export const getHealthGoalsCategories = async (): Promise<HealthGoalCategory[]> => {
  try {
    const { data, error } = await supabase
      .from('health_goals_categories')
      .select('*')
      .order('priority', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Errore nel recupero delle categorie di obiettivi di salute:', error);
    throw error;
  }
};

export const getUserHealthGoals = async (userId: string): Promise<UserHealthGoal[]> => {
  try {
    const { data, error } = await supabase
      .from('user_health_goals')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Errore nel recupero degli obiettivi di salute dell\'utente:', error);
    throw error;
  }
};

export const updateUserHealthGoals = async (userId: string, goalCategoryIds: string[]): Promise<void> => {
  try {
    // Prima elimina tutti gli obiettivi esistenti dell'utente
    const { error: deleteError } = await supabase
      .from('user_health_goals')
      .delete()
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    // Poi inserisce i nuovi obiettivi
    if (goalCategoryIds.length > 0) {
      const newGoals = goalCategoryIds.map((goalCategoryId, index) => ({
        user_id: userId,
        goal_category_id: goalCategoryId,
        priority: index + 1,
      }));

      const { error: insertError } = await supabase
        .from('user_health_goals')
        .insert(newGoals);

      if (insertError) throw insertError;
    }
  } catch (error) {
    console.error('Errore nell\'aggiornamento degli obiettivi di salute dell\'utente:', error);
    throw error;
  }
};

// Funzioni per gestire i punteggi di compatibilità
export const saveProductCompatibilityScore = async (
  userId: string,
  productRecordId: string,
  compatibilityData: {
    compatibilityPercentage?: number;
    moodLevel?: number;
    explanation?: string;
    userProfileSnapshot?: any;
    userGoalsSnapshot?: any;
  }
): Promise<ProductCompatibilityScore> => {
  try {
    // Prima prova a fare un update se esiste già
    const { data: existingData, error: selectError } = await supabase
      .from('product_compatibility_scores')
      .select('id')
      .eq('user_id', userId)
      .eq('product_record_id', productRecordId)
      .single();

    if (existingData) {
      // Update esistente
      const { data, error } = await supabase
        .from('product_compatibility_scores')
        .update({
          compatibility_percentage: compatibilityData.compatibilityPercentage,
          mood_level: compatibilityData.moodLevel,
          explanation: compatibilityData.explanation,
          user_profile_snapshot: compatibilityData.userProfileSnapshot,
          user_goals_snapshot: compatibilityData.userGoalsSnapshot,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingData.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Crea nuovo record
      const { data, error } = await supabase
        .from('product_compatibility_scores')
        .insert({
          user_id: userId,
          product_record_id: productRecordId,
          compatibility_percentage: compatibilityData.compatibilityPercentage,
          mood_level: compatibilityData.moodLevel,
          explanation: compatibilityData.explanation,
          user_profile_snapshot: compatibilityData.userProfileSnapshot,
          user_goals_snapshot: compatibilityData.userGoalsSnapshot,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('Errore nel salvataggio del punteggio di compatibilità:', error);
    throw error;
  }
};

export const getProductCompatibilityScore = async (
  userId: string,
  productRecordId: string
): Promise<ProductCompatibilityScore | null> => {
  try {
    const { data, error } = await supabase
      .from('product_compatibility_scores')
      .select('*')
      .eq('user_id', userId)
      .eq('product_record_id', productRecordId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Errore nel recupero del punteggio di compatibilità:', error);
    throw error;
  }
};

// Funzione per ottenere un profilo completo dell'utente (profilo + obiettivi)
export const getCompleteUserProfile = async (userId: string) => {
  try {
    const [profile, goals, categories] = await Promise.all([
      getUserProfile(userId),
      getUserHealthGoals(userId),
      getHealthGoalsCategories(),
    ]);

    // Combina gli obiettivi con le loro categorie
    const goalCategories = categories.filter(category =>
      goals.some(goal => goal.goal_category_id === category.id)
    );

    return {
      profile,
      goals: goalCategories,
    };
  } catch (error) {
    console.error('Errore nel recupero del profilo completo:', error);
    throw error;
  }
}; 