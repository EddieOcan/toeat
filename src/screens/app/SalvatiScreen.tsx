"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, RefreshControl, TouchableOpacity, Image, Platform, StatusBar as ReactNativeStatusBar } from "react-native"
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { useTheme } from "../../contexts/ThemeContext"
import { useAuth } from "../../contexts/AuthContext"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { CompositeScreenProps } from "@react-navigation/native"
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { AppStackParamList, MainTabsParamList } from "../../navigation"
import {
  // getScanHistory, // Non più usato
  getFavoriteProducts, // NUOVA FUNZIONE DA IMPLEMENTARE IN API.TS
  type ProductRecord,
} from "../../services/api"
import EmptyState from "../../components/EmptyState"
import { useFocusEffect } from '@react-navigation/native'
import AppText from "../../components/AppText"
import { Ionicons } from "@expo/vector-icons"

// --- NUOVA FUNZIONE HELPER PER COLORE DA PUNTEGGIO NUMERICO ---
const getColorFromNumericScore = (score: number | undefined | null, themeColors: any): string => {
  const defaultColor = themeColors.textMuted || '#888888'; 
  if (score === undefined || score === null) return defaultColor;

  if (score >= 81) return '#1E8F4E'; // Verde Scuro (Nutri-A)
  if (score >= 61) return '#7AC547'; // Verde Chiaro (Nutri-B)
  if (score >= 41) return '#FFC734'; // Giallo (Nutri-C)
  if (score >= 21) return '#FF9900'; // Arancione (Nutri-D)
  if (score >= 0) return '#FF0000';   // Rosso (Nutri-E)
  return defaultColor; // Fallback se score < 0 (improbabile)
};
// --- FINE NUOVA FUNZIONE HELPER ---

// Sposto le costanti globali del modulo qui, prima del loro primo utilizzo
const CARD_BORDER_WIDTH = 1.5;
const SHADOW_OFFSET_VALUE = 2.5;
const BACKGROUND_COLOR = '#f8f4ec';

interface FavoriteProduct extends ProductRecord {
  // Aggiungere eventuali campi specifici dei preferiti se non sono in ProductRecord
}

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, "Salvati">, // AGGIORNATO DA History A Salvati
  NativeStackScreenProps<AppStackParamList>
>

// RINOMINATO COMPONENTE
const SalvatiScreen: React.FC<Props> = ({ navigation }) => {
  const [favoriteProducts, setFavoriteProducts] = useState<FavoriteProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { colors } = useTheme()
  const { user } = useAuth()

  const loadFavoriteProducts = useCallback(async () => {
    if (!user) {
      setFavoriteProducts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true)
    try {
      console.log("[FAVORITES] Caricamento prodotti preferiti per utente:", user.id);
      // USARE LA VERA FUNZIONE API UNA VOLTA IMPLEMENTATA
      const favProducts = await getFavoriteProducts(user.id); 
      // const favProducts: FavoriteProduct[] = []; // Placeholder rimosso
      console.log(`[FAVORITES] Recuperati ${favProducts.length} prodotti preferiti.`);
      
      setFavoriteProducts(favProducts as FavoriteProduct[]) // Aggiunto cast per sicurezza
    } catch (error) {
      console.error("Errore nel caricamento dei prodotti preferiti:", error)
      Alert.alert("Errore", "Si è verificato un errore durante il caricamento dei prodotti salvati.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      if (user) {
        console.log("[FAVORITES] Schermata Salvati in focus, ricarico prodotti preferiti.");
        loadFavoriteProducts();
      }
      return () => {
        // Cleanup se necessario
      };
    }, [user, loadFavoriteProducts])
  );

  const handleRefresh = () => {
    setRefreshing(true)
    loadFavoriteProducts()
  }

  const getScoreColor = (grade: string | undefined | null, type: 'nutri' | 'eco', numericScore?: number | undefined | null) => {
    // Priorità al grade letterale se disponibile e valido
    if (grade && typeof grade === 'string' && grade.toLowerCase() !== 'unknown') {
      if (type === 'nutri') {
        switch (grade.toLowerCase()) {
          case "a": return '#2ECC71'; 
          case "b": return '#82E0AA'; 
          case "c": return '#F4D03F'; 
          case "d": return '#E67E22'; 
          case "e": return '#EC7063'; 
          default: break; 
        }
      } else { // eco
        switch (grade.toLowerCase()) {
          case "a": return '#1D8348'; 
          case "b": return '#28B463'; 
          case "c": return '#F5B041'; 
          case "d": return '#DC7633'; 
          case "e": return '#BA4A00'; 
          default: break; 
        }
      }
    }
    
    // Caso speciale per ecoscore mancante
    if (type === 'eco' && (!grade || !numericScore)) {
      return '#888888'; // Grigio per ecoscore mancante
    }
    
    // Se il grade non è valido o non c'è, usa il punteggio numerico
    return getColorFromNumericScore(numericScore, colors); // Passa colors per defaultColor
  };

  const renderFavoriteItem = ({ item }: { item: FavoriteProduct }) => (
    <View style={styles.productCardWrapper}> 
      <View style={[styles.buttonSolidShadow, styles.productCardShadow]} />
      <TouchableOpacity
        style={styles.productCardContainer} 
        onPress={() => {
          if (item.id) { 
            navigation.navigate("ProductDetail", { productRecordId: item.id });
          } else {
            Alert.alert("Errore", "ID prodotto non valido per visualizzare i dettagli.");
          }
        }}
        activeOpacity={0.8}
      >
        <View style={styles.productImageWrapper}>
          <View style={[styles.productImageDirectedShadow, { borderRadius: styles.productCardImage.borderRadius }]} />
          <Image
            source={{ uri: item.product_image || undefined }}
            style={styles.productCardImage}
            defaultSource={require('../../../assets/icon.png')} 
          />
        </View>
        <View style={styles.productCardContent}>
          <AppText style={[styles.productCardName, { color: "#000000" /* colors.text */ }]} numberOfLines={2}>
            {item.product_name || "Nome non disponibile"}
          </AppText>
          <AppText style={[styles.productCardBrand, { color: "#333333" /* colors.textMuted */  }]}>
            {item.brand || "Marca non disponibile"}
          </AppText>
          
          <View style={styles.scoresRowContainer}> 
            {item.health_score !== undefined && (
              <View style={[styles.scoreIconTextContainer, { marginLeft: 0 }]}>
                <Ionicons 
                  name="heart" 
                  size={18} 
                  color={getScoreColor(item.nutrition_grade, 'nutri', item.health_score)} 
                  style={styles.scoreIcon} 
                />
                <AppText style={[styles.scoreValueText, { color: "#000000" /* colors.text */ }]}>
                  {item.health_score}
                </AppText>
              </View>
            )}

            {/* Mostro sempre l'icona ecoscore, anche se mancante */}
                <View style={[styles.scoreIconTextContainer, { marginLeft: item.health_score !== undefined ? 15 : 0} ]}>
                    <Ionicons 
                        name="leaf" 
                        size={18} 
                        color={getScoreColor(item.ecoscore_grade, 'eco', item.sustainability_score ?? item.ecoscore_score)} 
                        style={styles.scoreIcon}
                    />
                    <AppText style={[styles.scoreValueText, 
                        (item.sustainability_score === undefined && item.ecoscore_score === undefined) 
                            ? {color: "#888888"} 
                            : {color: "#000000"}]}>
                        {(item.sustainability_score !== undefined || item.ecoscore_score !== undefined)
                            ? (item.sustainability_score !== undefined ? item.sustainability_score : item.ecoscore_score)
                            : "--"}
                    </AppText>
                </View>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", backgroundColor: BACKGROUND_COLOR }]}>
        <ExpoStatusBar style="dark" backgroundColor="transparent" translucent={true} />
        <ActivityIndicator size="large" color={"#00463b" /* colors.primary */} />
      </View>
    )
  }

  if (!user) {
     return (
      <View style={[styles.container, { backgroundColor: BACKGROUND_COLOR, flex: 1}]}>
        <ExpoStatusBar style="dark" backgroundColor="transparent" translucent={true} />
        <EmptyState
          title="Prodotti Salvati" // Già corretto
          message="Effettua il login per visualizzare i tuoi prodotti salvati."
          icon="log-in-outline"
          actionLabel="Login"
          onAction={() => navigation.navigate("Profile")} // Va a Profilo se non loggato, corretto
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.safeAreaStyle]}>
      <ExpoStatusBar style="dark" backgroundColor="transparent" translucent={true} />
          <FlatList
            data={favoriteProducts}
            renderItem={renderFavoriteItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={(
              <View style={styles.sectionHeader}>
                <AppText 
                  style={styles.sectionTitle}
                >
                  I tuoi Salvati 
                </AppText>
              </View>
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#00463b" /*colors.primary*/]} tintColor={"#00463b" /*colors.primary*/}/>}
            ListEmptyComponent={
              !loading && !refreshing ? (
                <View style={{marginTop: 20}}>
                    <EmptyState
                    title="Nessun prodotto salvato"
                    message="Non hai ancora salvato nessun prodotto. Inizia aggiungendo i tuoi preferiti!"
                    icon="heart-outline" // Icona cuore per empty state, corretto
                    />
                </View>
              ) : null
            }
          />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  safeAreaStyle: {
    paddingTop: Platform.OS === 'ios' ? 0 : (ReactNativeStatusBar.currentHeight || 0),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 25,
    color: "#000000",
    fontFamily: 'BricolageGrotesque-Bold',
    marginBottom: 12,
    paddingLeft: 5,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
  },
  productCardWrapper: { 
    position: 'relative',
    marginBottom: 20, 
    marginHorizontal: 4,
  },
  buttonSolidShadow: {
    backgroundColor: 'black',
    borderRadius: 16,
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: '100%',
  },
  productCardShadow: { },
  productCardContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF', 
    borderRadius: 16,
    padding: 18,
    position: 'relative', 
    zIndex: 1,
    minHeight: 150, 
    alignItems: 'center',
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: '#000000',
  },
  productImageWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
    marginRight: 18, 
  },
  productImageDirectedShadow: {
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE-1,
    left: SHADOW_OFFSET_VALUE-1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  productCardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12, 
    backgroundColor: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#000000',
    position: 'relative',
    zIndex: 1, 
    resizeMode: 'contain',
  },
  productCardContent: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 5,
  },
  productCardName: {
    fontSize: 19, 
    fontWeight: '600',
    fontFamily: "BricolageGrotesque-Regular",
    marginBottom: 5,
  },
  productCardBrand: {
    fontSize: 15, 
    fontFamily: "BricolageGrotesque-Regular",
    opacity: 0.7,
    marginBottom: 6,
  },
  scoresRowContainer: { 
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 0,
    flexWrap: 'nowrap',
  },
  scoreIconTextContainer: { 
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreIcon: {
    marginRight: 5,
  },
  scoreValueText: {
    fontSize: 15,
    fontFamily: "BricolageGrotesque-SemiBold",
  },
});

export default SalvatiScreen; // ESPORTA IL NUOVO NOME 