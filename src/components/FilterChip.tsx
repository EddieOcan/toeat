"use client"

import type React from "react"
import { TouchableOpacity, Text, StyleSheet } from "react-native"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"

interface FilterChipProps {
  label: string
  isActive: boolean
  onPress: () => void
  icon?: keyof typeof Ionicons.glyphMap
}

const FilterChip: React.FC<FilterChipProps> = ({ label, isActive, onPress, icon }) => {
  const { colors } = useTheme()

  const styles = StyleSheet.create({
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginRight: 8,
      marginBottom: 8,
      backgroundColor: isActive ? colors.primary : colors.card,
      borderWidth: 1,
      borderColor: isActive ? colors.primary : colors.border,
      flexDirection: "row",
      alignItems: "center",
    },
    label: {
      color: isActive ? "#FFFFFF" : colors.text,
      fontSize: 14,
      fontWeight: isActive ? "bold" : "normal",
      marginLeft: icon ? 4 : 0,
    },
    icon: {
      marginRight: 4,
    },
  })

  return (
    <TouchableOpacity style={styles.chip} onPress={onPress}>
      {icon && <Ionicons name={icon} size={14} color={isActive ? "#FFFFFF" : colors.text} style={styles.icon} />}
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  )
}

export default FilterChip
