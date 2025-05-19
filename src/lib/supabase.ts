import "react-native-url-polyfill/auto"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { createClient } from "@supabase/supabase-js"
import { AppState } from "react-native"

// Sostituisci con i tuoi valori di Supabase
const supabaseUrl = "https://ejgnsgjvnvsrizyjpjzv.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZ25zZ2p2bnZzcml6eWpwanp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY1NDg4NzIsImV4cCI6MjA2MjEyNDg3Mn0.cCw8mcyYeSkbdVdiYXmhx14CXeidQC9MkrHfaBgMjMw"

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Gestisce il refresh automatico del token quando l'app è in foreground
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
