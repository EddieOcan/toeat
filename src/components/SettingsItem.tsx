"use client"

import type React from "react"
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"
import { customFonts } from "../theme/typography"

interface SettingsItemProps {
  title: string
  icon: keyof typeof Ionicons.glyphMap
  iconColor?: string
  type: "toggle" | "button" | "link"
  value?: boolean
  onPress: () => void
  onToggle?: (value: boolean) => void
  destructive?: boolean
}

const SettingsItem: React.FC<SettingsItemProps> = ({
  title,
  icon,
  iconColor,
  type,
  value,
  onPress,
  onToggle,
  destructive = false,
}) => {
  const { colors } = useTheme()
  const finalIconColor = destructive ? colors.error : (iconColor || colors.primary)
  const textColor = destructive ? colors.error : colors.text

  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    iconStyle: {
      marginRight: 16,
      width: 24,
      alignItems: 'center',
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      color: textColor,
      fontFamily: customFonts.AppMedium,
    },
    rightContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
  })

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} disabled={type === "toggle" && onToggle !== undefined}>
      <View style={styles.iconStyle}>
        <Ionicons name={icon} size={22} color={finalIconColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.rightContainer}>
        {type === "toggle" && onToggle && (
          <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: colors.border, true: colors.primary + "80" }}
            thumbColor={value ? colors.primary : "#f4f3f4"}
          />
        )}
        {type === "link" && <Ionicons name="chevron-forward" size={20} color={colors.text + "99"} />}
      </View>
    </TouchableOpacity>
  )
}

export default SettingsItem
