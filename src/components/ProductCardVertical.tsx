"use client"

import type React from "react"
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"

interface ProductCardVerticalProps {
  productName: string
  brand: string
  imageUrl?: string
  nutritionGrade?: string
  healthScore?: number
  sustainabilityScore?: number
  onPress: () => void
}

const ProductCardVertical: React.FC<ProductCardVerticalProps> = ({
  productName,
  brand,
  imageUrl,
  nutritionGrade,
  healthScore,
  sustainabilityScore,
  onPress,
}) => {
  const { colors, isDark } = useTheme()

  const getNutritionGradeColor = (grade: string) => {
    switch (grade?.toLowerCase()) {
      case "a":
        return "#1E8F4E"
      case "b":
        return "#7AC547"
      case "c":
        return "#FFC734"
      case "d":
        return "#FF9900"
      case "e":
        return "#FF0000"
      default:
        return isDark ? "#FFFFFF" : "#212121"
    }
  }

  const getScoreColor = (score?: number) => {
    if (!score) return "#888888" // Grigio per ecoscore mancante
    if (score >= 80) return "#1E8F4E"
    if (score >= 60) return "#7AC547"
    if (score >= 40) return "#FFC734"
    if (score >= 20) return "#FF9900"
    return "#FF0000"
  }

  const styles = StyleSheet.create({
    container: {
      backgroundColor: isDark ? "#1E1E1E" : "#FFFFFF",
      borderRadius: 12,
      marginBottom: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? "#333333" : "#EEEEEE",
    },
    content: {
      padding: 12,
    },
    header: {
      flexDirection: "row",
      marginBottom: 8,
    },
    imageContainer: {
      width: 60,
      height: 60,
      borderRadius: 8,
      overflow: "hidden",
      marginRight: 12,
      borderWidth: 1,
      borderColor: isDark ? "#333333" : "#EEEEEE",
    },
    image: {
      width: "100%",
      height: "100%",
    },
    noImageContainer: {
      width: 60,
      height: 60,
      backgroundColor: isDark ? "#1A1A1A" : "#F5F5F5",
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
      borderWidth: 1,
      borderColor: isDark ? "#333333" : "#EEEEEE",
    },
    infoContainer: {
      flex: 1,
      justifyContent: "center",
    },
    name: {
      fontSize: 16,
      fontWeight: "bold",
      color: isDark ? "#FFFFFF" : "#212121",
      marginBottom: 2,
    },
    brand: {
      fontSize: 14,
      color: isDark ? "#BDBDBD" : "#757575",
      marginBottom: 6,
    },
    scoresContainer: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
    },
    nutritionGradeContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginRight: 12,
      marginBottom: 4,
    },
    nutritionGradeLabel: {
      fontSize: 12,
      color: isDark ? "#BDBDBD" : "#757575",
      marginRight: 4,
    },
    nutritionGrade: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    nutritionGradeText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "bold",
    },
    scoreContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginRight: 12,
      marginBottom: 4,
    },
    scoreIcon: {
      marginRight: 2,
    },
    scoreText: {
      fontSize: 12,
      fontWeight: "bold",
    },
    footer: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: isDark ? "#333333" : "#F0F0F0",
    },
    detailsButton: {
      flexDirection: "row",
      alignItems: "center",
    },
    detailsText: {
      fontSize: 14,
      color: colors.primary,
      marginRight: 4,
    },
  })

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.content}>
        <View style={styles.header}>
          {imageUrl ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
            </View>
          ) : (
            <View style={styles.noImageContainer}>
              <Ionicons name="image-outline" size={24} color={isDark ? "#BDBDBD" : "#757575"} />
            </View>
          )}

          <View style={styles.infoContainer}>
            <Text style={styles.name} numberOfLines={2}>
              {productName}
            </Text>
            <Text style={styles.brand} numberOfLines={1}>
              {brand}
            </Text>
          </View>
        </View>

        <View style={styles.scoresContainer}>
          {nutritionGrade && (
            <View style={styles.nutritionGradeContainer}>
              <Text style={styles.nutritionGradeLabel}>Nutri:</Text>
              <View style={[styles.nutritionGrade, { backgroundColor: getNutritionGradeColor(nutritionGrade) }]}>
                <Text style={styles.nutritionGradeText}>{nutritionGrade.toUpperCase()}</Text>
              </View>
            </View>
          )}

          {healthScore && (
            <View style={styles.scoreContainer}>
              <Ionicons name="heart" size={14} color={getScoreColor(healthScore)} style={styles.scoreIcon} />
              <Text style={[styles.scoreText, { color: getScoreColor(healthScore) }]}>{healthScore}</Text>
            </View>
          )}

          {sustainabilityScore && (
            <View style={styles.scoreContainer}>
              <Ionicons name="leaf" size={14} color={getScoreColor(sustainabilityScore)} style={styles.scoreIcon} />
              <Text style={[styles.scoreText, { color: getScoreColor(sustainabilityScore) }]}>
                {sustainabilityScore}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.detailsButton}>
            <Text style={styles.detailsText}>Dettagli</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default ProductCardVertical
