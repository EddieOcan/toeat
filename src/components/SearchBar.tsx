"use client"

import type React from "react"
import { View, TextInput, StyleSheet, TouchableOpacity } from "react-native"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"

interface SearchBarProps {
  value: string
  onChangeText: (text: string) => void
  onClear: () => void
  placeholder?: string
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  value = "", // Fornisci un valore predefinito
  onChangeText, 
  onClear, 
  placeholder = "Cerca..." 
}) => {
  const { colors } = useTheme()

  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      flex: 1,
      height: 44,
      fontSize: 16,
      color: colors.text,
    },
    icon: {
      marginRight: 8,
    },
    clearButton: {
      padding: 4,
    },
  })

  return (
    <View style={styles.container}>
      <Ionicons name="search-outline" size={20} color={colors.text + "80"} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text + "60"}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value && value.length > 0 && (
        <TouchableOpacity style={styles.clearButton} onPress={onClear}>
          <Ionicons name="close-circle" size={20} color={colors.text + "80"} />
        </TouchableOpacity>
      )}
    </View>
  )
}

export default SearchBar
