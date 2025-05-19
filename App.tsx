import { NavigationContainer } from "@react-navigation/native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { StatusBar } from "expo-status-bar"
import { AuthProvider } from "./src/contexts/AuthContext"
import Navigation from "./src/navigation"
import { ThemeProvider } from "./src/contexts/ThemeContext"
import { RecentProductsProvider } from "./src/contexts/RecentProductsContext"
import { useFonts } from 'expo-font'
import { View, ActivityIndicator } from 'react-native'

export default function App() {
  const [fontsLoaded] = useFonts({
    'BricolageGrotesque-Light': require('./assets/fonts/BricolageGrotesque-Light.ttf'),
    'BricolageGrotesque-Regular': require('./assets/fonts/BricolageGrotesque-Regular.ttf'),
    'BricolageGrotesque-Medium': require('./assets/fonts/BricolageGrotesque-Medium.ttf'),
    'BricolageGrotesque-SemiBold': require('./assets/fonts/BricolageGrotesque-SemiBold.ttf'),
    'BricolageGrotesque-Bold': require('./assets/fonts/BricolageGrotesque-Bold.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <RecentProductsProvider>
          <NavigationContainer>
            <StatusBar style="auto" />
            <Navigation />
          </NavigationContainer>
          </RecentProductsProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
