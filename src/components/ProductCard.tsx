"use client"

import type React from "react"
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"

interface ProductCardProps {
  productName: string
  brand: string
  imageUrl?: string
  nutritionGrade?: string
  healthScore?: number
  sustainabilityScore?: number
  onPress: () => void
}

const ProductCard: React.FC<ProductCardProps> = ({
  productName,
  brand,
  imageUrl,
  nutritionGrade,
  healthScore,
  sustainabilityScore,
  onPress,
}) => {
  const { colors } = useTheme()

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
        return colors.text
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
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 16,
      overflow: "hidden",
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    content: {
      flexDirection: "row",
      padding: 16,
    },
    imageContainer: {
      width: 80,
      height: 80,
      borderRadius: 8,
      overflow: "hidden",
      marginRight: 16,
    },
    image: {
      width: "100%",
      height: "100%",
    },
    noImageContainer: {
      width: 80,
      height: 80,
      backgroundColor: colors.background,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 16,
    },
    infoContainer: {
      flex: 1,
      justifyContent: "center",
    },
    name: {
      fontSize: 16,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 4,
    },
    brand: {
      fontSize: 14,
      color: colors.text + "80",
      marginBottom: 8,
    },
    scoresContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    nutritionGradeContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginRight: 12,
    },
    nutritionGradeLabel: {
      fontSize: 12,
      color: colors.text + "80",
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
      marginRight: 8,
    },
    scoreIcon: {
      marginRight: 2,
    },
    scoreText: {
      fontSize: 12,
      fontWeight: "bold",
    },
    arrowContainer: {
      justifyContent: "center",
      paddingLeft: 8,
    },
  })

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.content}>
        {imageUrl ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
          </View>
        ) : (
          <View style={styles.noImageContainer}>
            <Ionicons name="image-outline" size={30} color={colors.text} />
          </View>
        )}

        <View style={styles.infoContainer}>
          <Text style={styles.name} numberOfLines={2}>
            {productName}
          </Text>
          <Text style={styles.brand} numberOfLines={1}>
            {brand}
          </Text>
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

                      {sustainabilityScore && sustainabilityScore > 0 && (
              <View style={styles.scoreContainer}>
                <Ionicons name="leaf" size={14} color={getScoreColor(sustainabilityScore)} style={styles.scoreIcon} />
                <Text style={[styles.scoreText, { color: getScoreColor(sustainabilityScore) }]}>
                  {sustainabilityScore}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.arrowContainer}>
          <Ionicons name="chevron-forward" size={24} color={colors.text + "60"} />
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default ProductCard
