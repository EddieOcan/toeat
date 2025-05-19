"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, RefreshControl } from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import { useAuth } from "../../contexts/AuthContext"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { CompositeScreenProps } from "@react-navigation/native"
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { AppStackParamList, MainTabsParamList } from "../../navigation"
import {
  getScanHistory,
  type DisplayableHistoryProduct,
} from "../../services/api"
import ProductCard from "../../components/ProductCard"
import EmptyState from "../../components/EmptyState"
import SearchBar from "../../components/SearchBar"
import FilterChip from "../../components/FilterChip"

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, "History">,
  NativeStackScreenProps<AppStackParamList>
>

const HistoryScreen: React.FC<Props> = ({ navigation }) => {
  const [products, setProducts] = useState<DisplayableHistoryProduct[]>([])
  const [filteredProducts, setFilteredProducts] = useState<DisplayableHistoryProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const { colors } = useTheme()
  const { user } = useAuth()

  const loadProducts = useCallback(async () => {
    if (!user) return

    setLoading(true)
    try {
      console.log("[HISTORY] Caricamento cronologia per utente:", user.id);
      const historyProducts = await getScanHistory(user.id)
      console.log(`[HISTORY] Recuperati ${historyProducts.length} prodotti dalla cronologia.`);
      
      setProducts(historyProducts)
      setFilteredProducts(historyProducts)
    } catch (error) {
      console.error("Errore nel caricamento dei prodotti della cronologia:", error)
      Alert.alert("Errore", "Si è verificato un errore durante il caricamento della cronologia.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useEffect(() => {
    if (user) {
    loadProducts()
    }
  }, [loadProducts, user])

  const handleRefresh = () => {
    setRefreshing(true)
    loadProducts()
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    filterProducts(query, activeFilter)
  }

  const handleFilter = (filter: string | null) => {
    setActiveFilter(filter)
    filterProducts(searchQuery, filter)
  }

  const filterProducts = (query: string, filter: string | null) => {
    let tempFiltered = [...products]

    if (query) {
      const lowercaseQuery = query.toLowerCase()
      tempFiltered = tempFiltered.filter(
        (product) =>
          (product.product_name && product.product_name.toLowerCase().includes(lowercaseQuery)) ||
          (product.brand && product.brand.toLowerCase().includes(lowercaseQuery)) ||
          (product.barcode && product.barcode.toLowerCase().includes(lowercaseQuery))
      )
    }

    if (filter) {
      switch (filter) {
        case "health_high":
          tempFiltered = tempFiltered.filter((product) => product.health_score !== undefined && product.health_score >= 70)
          break
        case "health_low":
          tempFiltered = tempFiltered.filter((product) => product.health_score !== undefined && product.health_score < 30)
          break
        case "sustainability_high":
          tempFiltered = tempFiltered.filter((product) => product.sustainability_score !== undefined && product.sustainability_score >= 70)
          break
        case "sustainability_low":
          tempFiltered = tempFiltered.filter((product) => product.sustainability_score !== undefined && product.sustainability_score < 30)
          break
      }
    }
    setFilteredProducts(tempFiltered)
  }

  const renderItem = ({ item }: { item: DisplayableHistoryProduct }) => (
    <ProductCard
      productName={item.product_name || "Nome non disponibile"}
      brand={item.brand || "Marca non disponibile"}
      imageUrl={item.product_image}
      nutritionGrade={item.nutrition_grade}
      healthScore={item.health_score}
      sustainabilityScore={item.sustainability_score}
      onPress={() => navigation.navigate("ProductDetail", { productRecordId: item.id })}
      scannedAt={item.user_scan_time}
    />
  )

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!user) {
     return (
      <View style={[styles.container, { backgroundColor: colors.background, flex: 1}]}>
        <EmptyState
          title="Cronologia non disponibile"
          message="Effettua il login per visualizzare la tua cronologia di scansioni."
          icon="log-in-outline"
          onRetry={() => { /* Potrebbe navigare al login o non fare nulla */ }}
        />
      </View>
    );
  }

  if (products.length === 0 && !loading) {
  return (
      <View style={[styles.container, { backgroundColor: colors.background, flex: 1}]}>
        <SearchBar 
            searchQuery={searchQuery} 
            onSearch={handleSearch} 
            placeholder="Cerca nella cronologia..." 
        />
        <EmptyState
          title="Nessun prodotto scansionato"
          message="La tua cronologia è vuota. Inizia a scansionare prodotti!"
          icon="archive-outline"
          onRetry={loadProducts}
          />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
          <FlatList
            data={filteredProducts}
            renderItem={renderItem}
        keyExtractor={(item) => item.history_id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Cronologia Scansioni</Text>
            <SearchBar 
                searchQuery={searchQuery} 
                onSearch={handleSearch} 
                placeholder="Cerca per nome, marca, barcode..." 
            />
            <View style={styles.filtersContainer}>
              <FilterChip label="Tutti" onPress={() => handleFilter(null)} isActive={!activeFilter} />
              <FilterChip label="Salute Alta" onPress={() => handleFilter("health_high")} isActive={activeFilter === "health_high"} />
              <FilterChip label="Salute Bassa" onPress={() => handleFilter("health_low")} isActive={activeFilter === "health_low"} />
              <FilterChip label="Sost. Alta" onPress={() => handleFilter("sustainability_high")} isActive={activeFilter === "sustainability_high"} />
              <FilterChip label="Sost. Bassa" onPress={() => handleFilter("sustainability_low")} isActive={activeFilter === "sustainability_low"} />
            </View>
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary}/>}
        ListEmptyComponent={
          !loading && products.length > 0 ? (
             <View style={{marginTop: 20}}>
                <EmptyState
                title="Nessun risultato"
                message="Nessun prodotto corrisponde ai criteri di ricerca o filtro."
                icon="search-outline"
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
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 16,
  },
  filtersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
})

export default HistoryScreen
