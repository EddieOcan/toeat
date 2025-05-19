"use client"

import type React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"

interface StatisticCardProps {
  title: string
  value: string | number
  icon: keyof typeof Ionicons.glyphMap
  color?: string
}

const StatisticCard: React.FC<StatisticCardProps> = ({ title, value, icon, color }) => {
  const { colors } = useTheme()
  const iconColor = color || colors.primary

  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      flex: 1,
      minWidth: "48%",
      marginBottom: 16,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: iconColor + "20",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 12,
    },
    title: {
      fontSize: 14,
      color: colors.text + "80",
      marginBottom: 4,
    },
    value: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.text,
    },
  })

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

export default StatisticCard
