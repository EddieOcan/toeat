"use client"

import type React from "react"
import { createContext, useState, useEffect, useContext } from "react"
import { supabase } from "../lib/supabase"
import type { Session, User } from "@supabase/supabase-js"
import { Alert } from "react-native"

type AuthContextType = {
  user: User | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Controlla se c'è una sessione attiva
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Ascolta i cambiamenti di autenticazione
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        Alert.alert("Errore durante la registrazione", error.message)
      } else {
        Alert.alert("Registrazione completata", "Controlla la tua email per confermare la registrazione.")
      }
    } catch (error) {
      Alert.alert("Errore", "Si è verificato un errore durante la registrazione.")
      console.error("Errore di registrazione:", error)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        Alert.alert("Errore di accesso", error.message)
      }
    } catch (error) {
      Alert.alert("Errore", "Si è verificato un errore durante l'accesso.")
      console.error("Errore di accesso:", error)
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signOut()
      if (error) {
        Alert.alert("Errore", error.message)
      }
    } catch (error) {
      Alert.alert("Errore", "Si è verificato un errore durante la disconnessione.")
      console.error("Errore di disconnessione:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>{children}</AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth deve essere usato all'interno di un AuthProvider")
  }
  return context
}
