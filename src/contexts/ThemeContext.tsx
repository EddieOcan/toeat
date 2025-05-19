"use client"

import type React from "react"
import { createContext, useContext } from "react"
import { lightColors, type Colors } from "../theme/colors"

type ThemeContextType = {
  colors: Colors
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const colors = lightColors

  return <ThemeContext.Provider value={{ colors }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme deve essere usato all'interno di un ThemeProvider")
  }
  return context
}
