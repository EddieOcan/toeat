"use client"

import type React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"

interface SustainabilityScoreIndicatorProps {
  score: number
  size?: "small" | "medium" | "large"
  showLabel?: boolean
}

const SustainabilityScoreIndicator: React.FC<SustainabilityScoreIndicatorProps> = ({
  score,
  size = "medium",
  showLabel = true,
}) => {
  const { colors } = useTheme()

  // Determina il colore in base al punteggio
  const getScoreColor = (score: number) => {
    if (score >= 80) return "#1E8F4E" // Verde (eccellente)
    if (score >= 60) return "#7AC547" // Verde chiaro (buono)
    if (score >= 40) return "#FFC734" // Giallo (medio)
    if (score >= 20) return "#FF9900" // Arancione (scarso)
    return "#FF0000" // Rosso (pessimo)
  }

  // Determina l'icona in base al punteggio
  const getScoreIcon = (score: number) => {
    if (score >= 80) return "leaf"
    if (score >= 60) return "leaf-outline"
    if (score >= 40) return "earth"
    if (score >= 20) return "warning-outline"
    return "close-circle"
  }

  // Determina la dimensione in base al parametro size
  const getSize = () => {
    switch (size) {
      case "small":
        return { circle: 40, text: 14, icon: 16, label: 12 }
      case "large":
        return { circle: 80, text: 24, icon: 32, label: 16 }
      default:
        return { circle: 60, text: 18, icon: 24, label: 14 }
    }
  }

  const sizeValues = getSize()
  const scoreColor = getScoreColor(score)
  const scoreIcon = getScoreIcon(score)

  const styles = StyleSheet.create({
    container: {
      alignItems: "center",
    },
    scoreCircle: {
      width: sizeValues.circle,
      height: sizeValues.circle,
      borderRadius: sizeValues.circle / 2,
      backgroundColor: scoreColor,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: showLabel ? 8 : 0,
    },
    scoreText: {
      color: "#FFFFFF",
      fontSize: sizeValues.text,
      fontWeight: "bold",
    },
    labelText: {
      fontSize: sizeValues.label,
      color: colors.text,
      textAlign: "center",
    },
    iconContainer: {
      position: "absolute",
      top: -5,
      right: -5,
      backgroundColor: colors.background,
      borderRadius: sizeValues.icon / 2,
      padding: 2,
    },
  })

  return (
    <View style={styles.container}>
      <View style={{ position: "relative" }}>
        <View style={styles.scoreCircle}>
          <Text style={styles.scoreText}>{score}</Text>
        </View>
        <View style={styles.iconContainer}>
          <Ionicons name={scoreIcon} size={sizeValues.icon} color={scoreColor} />
        </View>
      </View>
      {showLabel && <Text style={styles.labelText}>Sostenibilità</Text>}
    </View>
  )
}

export default SustainabilityScoreIndicator

