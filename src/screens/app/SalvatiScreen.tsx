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
import { getScoreColor } from "../../utils/formatters"
import { scaleFont } from "../../theme/typography"

// Funzioni helper rimosse - ora si usa getScoreColor globale

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

  // Funzione getScoreColor locale rimossa - ora si usa quella globale

  const renderFavoriteItem = ({ item }: { item: FavoriteProduct }) => {
    // Determina il colore della card basato sul punteggio salute
    const cardColor = item.health_score !== undefined ? getScoreColor(item.health_score) : '#000000';

    return (
      <View style={styles.productCardWrapper}> 
        <View style={[styles.buttonSolidShadow, styles.productCardShadow, { backgroundColor: cardColor }]} />
        <TouchableOpacity
          style={[styles.productCardContainer, { borderColor: cardColor }]} 
          onPress={() => {
            if (item.id) { 
              navigation.navigate("ProductDetail", { productRecordId: item.id });
            } else {
              Alert.alert("Errore", "ID prodotto non valido per visualizzare i dettagli.");
            }
          }}
          activeOpacity={1}
        >
          <View style={styles.productImageWrapper}>
            <View style={[styles.productImageDirectedShadow, { borderRadius: styles.productCardImage.borderRadius, backgroundColor: cardColor }]} />
            <Image
              source={{ uri: item.product_image || undefined }}
              style={[styles.productCardImage, { borderColor: cardColor }]}
              defaultSource={require('../../../assets/icon.png')} 
            />
          </View>
          <View style={styles.productCardContent}>
            <AppText 
              style={[styles.productCardName, { color: "#000000" }]} 
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {item.product_name || "Nome non disponibile"}
            </AppText>
            
            <View style={styles.scoresRowContainer}> 
              <View style={styles.scoreButtonsContainer}>
                {item.health_score !== undefined && (
                  <View style={[styles.scoreButton, { backgroundColor: getScoreColor(item.health_score) }]}>
                    <Ionicons name="heart" size={14} color="#FFFFFF" />
                    <AppText style={styles.scoreButtonText}>
                      {item.health_score}
                    </AppText>
                  </View>
                )}
                {((item.sustainability_score !== undefined && item.sustainability_score > 0) || (item.ecoscore_score !== undefined && item.ecoscore_score > 0)) && (
                  <View style={[styles.scoreButton, { backgroundColor: getScoreColor(item.sustainability_score ?? item.ecoscore_score) }]}>
                    <Ionicons name="leaf" size={14} color="#FFFFFF" />
                    <AppText style={styles.scoreButtonText}>
                      {item.sustainability_score ?? item.ecoscore_score}
                    </AppText>
                  </View>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

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
    resizeMode: 'cover',
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
  // Nuovi stili per i pulsanti dei punteggi (copiati da RecentProductsSection)
  scoreButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    marginTop: 8,
  },
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

export default SalvatiScreen; // ESPORTA IL NUOVO NOME 