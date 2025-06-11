"use client"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useAuth } from "../contexts/AuthContext"
import { useTheme } from "../contexts/ThemeContext"
import { ActivityIndicator, View, Platform } from "react-native"
import { Ionicons } from "@expo/vector-icons"

// Schermate di autenticazione
import LoginScreen from "../screens/auth/LoginScreen"
import RegisterScreen from "../screens/auth/RegisterScreen"

// Schermate dell'app
import HomeScreen from "../screens/app/HomeScreen"
import FotoScreen from "../screens/app/FotoScreen"
import ProfileScreen from "../screens/app/ProfileScreen"
import SalvatiScreen from "../screens/app/SalvatiScreen"
import ProductDetailScreen from "../screens/app/ProductDetailScreen"
import UserPreferencesScreen from "../screens/app/UserPreferencesScreen"
import CalorieTrackingScreen from "../screens/app/CalorieTrackingScreen"
import NutritionProfileSetupScreen from "../screens/app/NutritionProfileSetupScreen"
import SelectProductForDayScreen from "../screens/app/SelectProductForDayScreen"

// Importa la CustomTabBar
import CustomTabBar from '../components/CustomTabBar';

// Importa i tipi necessari
import type { RawProductData } from "../services/api"
import type { GeminiAnalysisResult } from "../services/gemini"

// Definizione dei tipi per la navigazione
export type AuthStackParamList = {
  Login: undefined
  Register: undefined
}

export type AppStackParamList = {
  MainTabs: undefined
  ProductDetail: {
    productRecordId: string
    initialProductData?: RawProductData | null
    aiAnalysisResult?: GeminiAnalysisResult | null
    isPhotoAnalysis?: boolean
  }
  UserPreferences: undefined
  CalorieTracking: undefined
  NutritionProfileSetup: undefined
  SelectProductForDay: {
    selectedDate: string
  }
}

export type MainTabsParamList = {
  Scanner: undefined
  Foto: undefined
  Calorie: undefined
  Salvati: undefined
  Profile: undefined
}

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const AppStack = createNativeStackNavigator<AppStackParamList>()
const MainTabs = createBottomTabNavigator<MainTabsParamList>()

const MainTabsNavigator = () => {
  const { colors } = useTheme()

  return (
    <MainTabs.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
      }}
    >
      <MainTabs.Screen
        name="Scanner"
        component={HomeScreen}
        options={{
          title: "Scanner",
          headerShown: false,
        }}
      />
      <MainTabs.Screen
        name="Foto"
        component={FotoScreen}
        options={{
          title: "Foto",
          headerShown: false,
        }}
      />
      <MainTabs.Screen
        name="Calorie"
        component={CalorieTrackingScreen}
        options={{
          title: "Calorie",
          headerShown: false,
        }}
      />
      <MainTabs.Screen
        name="Salvati"
        component={SalvatiScreen}
        options={{
          title: "Salvati",
          headerShown: false,
        }}
      />
      <MainTabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Profilo",
          headerShown: false,
        }}
      />
    </MainTabs.Navigator>
  )
}

const Navigation = () => {
  const { user, loading } = useAuth()
  const { colors } = useTheme()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return user ? (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <AppStack.Screen name="MainTabs" component={MainTabsNavigator} options={{ headerShown: false }} />
      <AppStack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ headerShown: false }} />
      <AppStack.Screen name="UserPreferences" component={UserPreferencesScreen} options={{ headerShown: false }} />
      <AppStack.Screen name="CalorieTracking" component={CalorieTrackingScreen} options={{ headerShown: false }} />
      <AppStack.Screen name="NutritionProfileSetup" component={NutritionProfileSetupScreen} options={{ headerShown: false }} />
      <AppStack.Screen name="SelectProductForDay" component={SelectProductForDayScreen} options={{ headerShown: false }} />
    </AppStack.Navigator>
  ) : (
    <AuthStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  )
}

export default Navigation
