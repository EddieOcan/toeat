"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { Ionicons } from "@expo/vector-icons"
import StatisticCard from "../../components/StatisticCard"
import SettingsItem from "../../components/SettingsItem"
import * as ImagePicker from "expo-image-picker"
import * as base64js from 'base64-js'
import { useNavigation } from "@react-navigation/native"
import { customFonts, typography } from "../../theme/typography"

interface Profile {
  id: string
  username: string | null
  email: string
  avatar_url: string | null
}

interface UserStats {
  totalScanned: number
  favoriteNutritionGrade: string
  mostScannedBrand: string
  lastScanDate: string
}

// Costanti per lo stile Card
const CARD_BORDER_WIDTH = 2.5;
const SHADOW_OFFSET_VALUE = 3;
const CARD_BORDER_RADIUS = 12;
const BORDER_COLOR_CONSTANT = '#000000'; // Nero fisso per i bordi delle card
const CARD_BACKGROUND_COLOR_CONSTANT = '#FFFFFF'; // Bianco fisso per lo sfondo delle card
const BACKGROUND_COLOR_PAGE = '#f8f4ec'; // Sfondo esplicito per test

const ProfileScreen: React.FC = () => {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const { user, signOut } = useAuth()
  const { colors } = useTheme() // colors.background sarà usato per lo sfondo generale
  const navigation = useNavigation()

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, "0")
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  useEffect(() => {
    if (user) {
      fetchProfile()
      fetchUserStats()
    }
  }, [user])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      if (!user) return

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, email, avatar_url")
        .eq("id", user.id)
        .single()

      if (error) {
        console.error("Errore nel recupero del profilo:", error)
      } else if (data) {
        setProfile(data)
        setUsername(data.username || "")
      }
    } catch (error) {
      console.error("Errore nel recupero del profilo:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserStats = async () => {
    try {
      if (!user) return
      const { count: totalScanned, error: countError } = await supabase
        .from("scanned_products")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
      if (countError) throw countError
      const { data: allData, error: allDataError } = await supabase
        .from("scanned_products")
        .select("nutrition_grade, brand")
        .eq("user_id", user.id)
      if (allDataError) throw allDataError
      const nutritionCounts: Record<string, number> = {}
      const brandCounts: Record<string, number> = {}
      allData?.forEach(item => {
        if (item.nutrition_grade) {
          nutritionCounts[item.nutrition_grade] = (nutritionCounts[item.nutrition_grade] || 0) + 1
        }
        if (item.brand) {
          brandCounts[item.brand] = (brandCounts[item.brand] || 0) + 1
        }
      })
      const sortedNutrition = Object.entries(nutritionCounts).sort((a, b) => b[1] - a[1])
      const sortedBrand = Object.entries(brandCounts).sort((a, b) => b[1] - a[1])
      const favoriteNutritionGrade = sortedNutrition.length > 0 ? sortedNutrition[0][0].toUpperCase() : "N/A"
      const mostScannedBrand = sortedBrand.length > 0 ? sortedBrand[0][0] : "N/A"
      const { data: lastScanData, error: lastScanError } = await supabase
        .from("scanned_products")
        .select("scanned_at")
        .eq("user_id", user.id)
        .order("scanned_at", { ascending: false })
        .limit(1)
      if (lastScanError) throw lastScanError
      setStats({
        totalScanned: totalScanned || 0,
        favoriteNutritionGrade,
        mostScannedBrand,
        lastScanDate: lastScanData && lastScanData.length > 0 ? lastScanData[0].scanned_at : "N/A",
      })
    } catch (error) {
      console.error("Errore nel recupero delle statistiche:", error)
    }
  }

  const updateProfile = async () => {
    try {
      setUpdating(true)
      if (!user) return
      const { error } = await supabase.from("profiles").update({ username }).eq("id", user.id)
      if (error) {
        Alert.alert("Errore", "Si è verificato un errore durante l'aggiornamento del profilo.")
      } else {
        Alert.alert("Successo", "Profilo aggiornato con successo.")
        fetchProfile()
        setEditModalVisible(false)
      }
    } catch (error) {
      console.error("Errore nell'aggiornamento del profilo:", error)
      Alert.alert("Errore", "Si è verificato un errore durante l'aggiornamento del profilo.")
    } finally {
      setUpdating(false)
    }
  }

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      })
      if (!result.canceled && result.assets && result.assets[0].base64) {
        const mimeType = result.assets[0].mimeType || 'image/jpeg';
        await uploadAvatar(result.assets[0].base64, mimeType)
      }
    } catch (error) {
      console.error("Errore nella selezione dell'immagine:", error)
      Alert.alert("Errore", "Si è verificato un errore durante la selezione dell'immagine.")
    }
  }

  const uploadAvatar = async (base64Image: string, mimeType: string) => {
    if (!user) return
    setUploadingAvatar(true)
    try {
      const fileExt = mimeType.split('/')[1] || 'jpg';
      const fileName = `${user.id}_${Date.now()}.${fileExt}`
      const filePath = `${user.id}/${fileName}`
      const actualBase64Data = base64Image.split(',')[1] || base64Image;
      const byteArray = base64js.toByteArray(actualBase64Data)
      const { data, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, byteArray, {
          contentType: mimeType,
          upsert: true,
        })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath) // filePath qui
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", user.id)
      if (updateError) throw updateError
      Alert.alert("Successo", "Immagine del profilo aggiornata con successo.")
      fetchProfile()
    } catch (error) {
      console.error("Errore nel caricamento dell'avatar:", error)
      Alert.alert("Errore", "Si è verificato un errore durante il caricamento dell'immagine.")
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSignOut = async () => {
    Alert.alert("Conferma logout", "Sei sicuro di voler uscire?", [
      { text: "Annulla", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: signOut },
    ])
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      "Elimina account",
      "Sei sicuro di voler eliminare il tuo account? Questa azione è irreversibile e tutti i tuoi dati verranno persi.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true)
              if (!user) return
              const { error } = await supabase.rpc('delete_user_account'); // Chiamata alla funzione SQL
              if (error) throw error
              await signOut()
              Alert.alert("Account eliminato", "Il tuo account è stato eliminato con successo.")
            } catch (error) {
              console.error("Errore nell'eliminazione dell'account:", error)
              Alert.alert("Errore", "Si è verificato un errore durante l'eliminazione dell'account.")
            } finally {
              setLoading(false)
            }
          },
        },
      ],
    )
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: BACKGROUND_COLOR_PAGE, // FORZA LO SFONDO QUI
    },
    scrollViewContent: {
      padding: 16,
      paddingTop: Platform.OS === 'ios' ? 120 : 100, // Aumentato DRASTICAMENTE padding superiore
      paddingBottom: 48, 
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    // Stili Card Generali
    cardWrapper: {
      position: 'relative',
      marginBottom: 32, // Aumentato spazio sotto ogni card principale
    },
    cardShadow: {
      backgroundColor: BORDER_COLOR_CONSTANT,
      borderRadius: CARD_BORDER_RADIUS,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    cardContainer: {
      backgroundColor: CARD_BACKGROUND_COLOR_CONSTANT,
      borderRadius: CARD_BORDER_RADIUS,
      borderWidth: CARD_BORDER_WIDTH,
      borderColor: BORDER_COLOR_CONSTANT,
      padding: 16,
      position: 'relative',
      zIndex: 1,
    },
    // Header Card
    headerCardContainer: { // Sovrascrive padding di cardContainer per più spazio verticale
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    avatarContainer: {
      position: "relative",
      marginBottom: 16,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.card, // Sfondo per l'immagine avatar
      borderWidth: 2,
      borderColor: BORDER_COLOR_CONSTANT, // Bordo nero per avatar
    },
    editAvatarButton: {
      position: "absolute",
      bottom: 0,
      right: 0,
      backgroundColor: colors.primary, // Colore primario per il bottone edit avatar
      width: 36, // Leggermente più grande
      height: 36, // Leggermente più grande
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: CARD_BACKGROUND_COLOR_CONSTANT, // Bordo per staccare dalla card avatar
    },
    avatarPlaceholder: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.card, // Sfondo per placeholder
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: BORDER_COLOR_CONSTANT,
    },
    username: {
      fontSize: 24, // Più grande
      fontFamily: customFonts.AppBold,
      color: BORDER_COLOR_CONSTANT, // Testo nero per coerenza
      marginBottom: 6,
      textAlign: 'center',
    },
    email: {
      fontSize: 16,
      fontFamily: customFonts.AppRegular,
      color: BORDER_COLOR_CONSTANT + "99", // Nero con opacità
      marginBottom: 16, // Più spazio prima del bottone modifica
      textAlign: 'center',
    },
    editProfileButtonWrapper: { // Wrapper per bottone modifica profilo
      position: 'relative',
      alignSelf: 'stretch', // Fa estendere il wrapper
      marginHorizontal: 16, // Margine per non toccare i bordi della card header
    },
    editProfileButtonShadow: {
      backgroundColor: BORDER_COLOR_CONSTANT,
      borderRadius: 8,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE,
      left: SHADOW_OFFSET_VALUE,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    editProfileButtonContainer: {
      backgroundColor: colors.primary, // Colore primario FoodScanner
      borderRadius: 8,
      borderWidth: CARD_BORDER_WIDTH -1, // Bordo più sottile per bottoni
      borderColor: BORDER_COLOR_CONSTANT,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: 'center',
      position: 'relative',
      zIndex: 1,
    },
    editProfileButtonText: {
      color: CARD_BACKGROUND_COLOR_CONSTANT, // Testo bianco/chiaro su primario
      fontSize: 16,
      fontFamily: customFonts.AppSemiBold,
    },
    // Titolo Sezione (fuori dalle card di sezione)
    sectionTitle: {
      fontSize: 22,
      fontFamily: customFonts.AppBold,
      color: colors.text,
      marginBottom: 16, // Aumentato spazio tra titolo sezione e card sottostante
      paddingLeft: 4,
    },
    // Contenitore per StatisticCard (dentro la sua card)
    statsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      // Le StatisticCard hanno già il loro stile, qui solo layout
    },
    // Settings (ogni SettingsItem è dentro la sua card di sezione)
    // settingsContainer non serve più come card autonoma,
    // ma per raggruppare gli item dentro la card di sezione
    settingsItemsGroup: {
      // Non serve backgroundColor o borderRadius qui, la card esterna li ha
    },
    // Modal
    modalOverlay: { // Sostituisce modalContainer per lo sfondo scuro
      flex: 1,
      justifyContent: "center",
      alignItems: "center", // Per centrare il modalContent
      backgroundColor: "rgba(0,0,0,0.7)", // Più scuro
    },
    modalCardWrapper: { // Per posizionare ombra e card del modal
      position: 'relative',
      width: '90%', // Larghezza del modal
      maxWidth: 400, // Max larghezza
    },
    // cardShadow è riutilizzato per il modal
    // cardContainer è riutilizzato per il modal con override padding
    modalCardContainer: { // Sovrascrive padding di cardContainer per il modal
      padding: 20,
    },
    modalTitle: {
      fontSize: 22,
      fontFamily: customFonts.AppBold,
      color: BORDER_COLOR_CONSTANT,
      marginBottom: 24,
      textAlign: 'center',
    },
    inputContainer: {
      marginBottom: 16,
    },
    label: {
      fontSize: 15,
      fontFamily: customFonts.AppMedium,
      color: BORDER_COLOR_CONSTANT + "AA", // Nero con opacità
      marginBottom: 8,
    },
    input: {
      backgroundColor: CARD_BACKGROUND_COLOR_CONSTANT, // Sfondo input bianco
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      fontSize: 16,
      fontFamily: customFonts.AppRegular,
      borderWidth: CARD_BORDER_WIDTH - 1,
      borderColor: BORDER_COLOR_CONSTANT,
      color: BORDER_COLOR_CONSTANT,
    },
    modalButtonsContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 24, // Più spazio sopra i bottoni
    },
    modalButtonWrapper: { // Wrapper per ogni bottone nel modal
      flex: 1,
      position: 'relative',
    },
    // Ombra e container per i bottoni del modal (Annulla e Salva)
    modalButtonShadow: {
      backgroundColor: BORDER_COLOR_CONSTANT,
      borderRadius: 8,
      position: 'absolute',
      top: SHADOW_OFFSET_VALUE -1, // Ombra più leggera per bottoni
      left: SHADOW_OFFSET_VALUE -1,
      width: '100%',
      height: '100%',
      zIndex: 0,
    },
    modalButtonContainer: { // Stile base per i bottoni del modal
      borderRadius: 8,
      borderWidth: CARD_BORDER_WIDTH -1,
      borderColor: BORDER_COLOR_CONSTANT,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: "center",
      position: 'relative',
      zIndex: 1,
    },
    cancelButtonContainer: { // Specifico per Annulla
      backgroundColor: CARD_BACKGROUND_COLOR_CONSTANT, // Sfondo bianco
      marginRight: 8, // Spazio tra i bottoni
    },
    cancelButtonText: {
      color: BORDER_COLOR_CONSTANT, // Testo nero
      fontSize: 16,
      fontFamily: customFonts.AppMedium,
    },
    saveButtonContainer: { // Specifico per Salva
      backgroundColor: colors.primary, // Colore primario
      marginLeft: 8, // Spazio tra i bottoni
    },
    saveButtonText: {
      color: CARD_BACKGROUND_COLOR_CONSTANT, // Testo bianco
      fontSize: 16,
      fontFamily: customFonts.AppSemiBold,
    },
  })

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollViewContent}>
      {/* Header Card */}
      <View style={styles.cardWrapper}>
        <View style={styles.cardShadow} />
        <View style={[styles.cardContainer, styles.headerCardContainer]}>
          <View style={styles.avatarContainer}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={50} color={BORDER_COLOR_CONSTANT + "99"} />
              </View>
            )}
            <TouchableOpacity style={styles.editAvatarButton} onPress={pickImage} disabled={uploadingAvatar}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={CARD_BACKGROUND_COLOR_CONSTANT} />
              ) : (
                <Ionicons name="camera" size={18} color={CARD_BACKGROUND_COLOR_CONSTANT} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.username}>{profile?.username || "Utente"}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
          <View style={styles.editProfileButtonWrapper}>
            <View style={styles.editProfileButtonShadow} />
            <TouchableOpacity 
              style={styles.editProfileButtonContainer} 
              onPress={() => setEditModalVisible(true)}
            >
              <Text style={styles.editProfileButtonText}>Modifica Profilo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Statistics Section Card */}
      {stats && (
        <>
          <Text style={styles.sectionTitle}>Le tue statistiche</Text>
          <View style={styles.cardWrapper}>
            <View style={styles.cardShadow} />
            <View style={styles.cardContainer}>
              <View style={styles.statsContainer}>
                <StatisticCard
                  title="Prodotti Scannerizzati"
                  value={stats.totalScanned.toString()} // Assicurati sia stringa
                  icon="barcode-outline"
                  color={colors.primary}
                />
                <StatisticCard
                  title="Nutri-Score Preferito"
                  value={stats.favoriteNutritionGrade}
                  icon="nutrition-outline"
                  color="#7AC547" // Colore specifico per Nutri-Score
                />
                <StatisticCard
                  title="Marca Più Scannerizzata"
                  value={stats.mostScannedBrand}
                  icon="pricetag-outline"
                  color="#FF9800" // Colore specifico
                />
                <StatisticCard
                  title="Ultima Scansione"
                  value={stats.lastScanDate !== "N/A" ? formatDate(stats.lastScanDate) : "N/A"}
                  icon="time-outline"
                  color="#2196F3" // Colore specifico
                />
              </View>
            </View>
          </View>
        </>
      )}

      {/* Settings Section Card 1 (Info, Termini, Privacy) */}
      <Text style={styles.sectionTitle}>Informazioni</Text>
      <View style={styles.cardWrapper}>
        <View style={styles.cardShadow} />
        <View style={[styles.cardContainer, {padding: 0}]}>
          <SettingsItem
            title="Informazioni App"
            icon="information-circle"
            type="link"
            onPress={() => Alert.alert("FoodScanner", "Versione 1.0.0\\n© 2024 FoodScanner")}
          />
          <SettingsItem
            title="Termini e Condizioni"
            icon="document-text"
            type="link"
            onPress={() => Alert.alert("Termini e Condizioni", "I termini e le condizioni dell'app verranno mostrati qui.")}
          />
          <SettingsItem
            title="Privacy Policy"
            icon="shield-checkmark"
            type="link"
            onPress={() => Alert.alert("Privacy Policy", "La privacy policy dell'app verrà mostrata qui.")}
          />
        </View>
      </View>
      
      {/* Settings Section Card 2 (Logout, Delete) */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.cardWrapper}>
        <View style={styles.cardShadow} />
        <View style={[styles.cardContainer, {padding: 0}]}>
          <SettingsItem
            title="Logout"
            icon="log-out"
            iconColor={colors.error} // Rosso per azioni distruttive/logout
            type="button"
            onPress={handleSignOut}
          />
          <SettingsItem
            title="Elimina Account"
            icon="trash"
            iconColor={colors.error} // Rosso
            type="button"
            onPress={handleDeleteAccount}
            destructive // Questo potrebbe cambiare il colore del testo in SettingsItem
          />
        </View>
      </View>

      {/* Modal per Modifica Profilo */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"} 
          style={styles.modalOverlay}
        >
          <View style={styles.modalCardWrapper}>
            <View style={styles.cardShadow} />
            <View style={[styles.cardContainer, styles.modalCardContainer]}>
              <Text style={styles.modalTitle}>Modifica Profilo</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Inserisci un username"
                  placeholderTextColor={BORDER_COLOR_CONSTANT + "80"}
                  value={username}
                  onChangeText={setUsername}
                />
              </View>
              <View style={styles.modalButtonsContainer}>
                <View style={[styles.modalButtonWrapper, {marginRight: 8}]}>
                  <View style={styles.modalButtonShadow} />
                  <TouchableOpacity
                    style={[styles.modalButtonContainer, styles.cancelButtonContainer]}
                    onPress={() => {
                      setUsername(profile?.username || "")
                      setEditModalVisible(false)
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Annulla</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.modalButtonWrapper, {marginLeft: 8}]}>
                  <View style={styles.modalButtonShadow} />
                  <TouchableOpacity 
                    style={[styles.modalButtonContainer, styles.saveButtonContainer]} 
                    onPress={updateProfile} 
                    disabled={updating}
                  >
                    {updating ? <ActivityIndicator color={CARD_BACKGROUND_COLOR_CONSTANT} /> : <Text style={styles.saveButtonText}>Salva</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  )
}

export default ProfileScreen
