import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from './AppText'; // Assumendo che AppText sia in ./AppText rispetto a /components
import { customFonts } from '../theme/typography'; // CORRETTO: Percorso dell'import corretto

// Colori e costanti aggiornati
const ACTIVE_TAB_COLOR = '#d9f35e';        // Giallo/verde per icona e testo attivi #d9f35e
const INACTIVE_TAB_COLOR = '#FFFFFF';            // Bianco per icona e testo inattivi
const TAB_BAR_BACKGROUND_COLOR = '#00463b'; // Verde scuro per sfondo TabBar #00463b
const BORDER_COLOR = '#000000'; // Nero per i bordi della TabBar
const SHADOW_COLOR = '#000000'; // Nero per l'ombra sottostante
const SHADOW_OFFSET_VALUE = 3.5;
const TAB_BAR_BORDER_WIDTH = 0; // Allineato a COMMON_BORDER_WIDTH modificato dall'utente

// Props che la CustomTabBar riceverà da React Navigation
type CustomTabBarProps = {
  state: any; // Contiene le rotte e l'indice della rotta attiva
  descriptors: any; // Contiene le opzioni per ogni rotta (es. nome icona)
  navigation: any; // Oggetto navigation per cambiare schermata
};

const CustomTabBar: React.FC<CustomTabBarProps> = ({ state, descriptors, navigation }) => {

  return (
    <View style={styles.tabBarOuterContainer}>
      {/* Elemento per l'ombra direzionata (nera) */}
      <View style={styles.tabBarShadow} />

      {/* Contenitore principale della TabBar (verde scuro, con bordi neri) */}
      <View style={styles.tabBarContentContainer}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          let iconName: any = 'alert-circle-outline'; 
          let tabLabel = label;

          if (route.name === 'Scanner') {
            iconName = isFocused ? 'barcode' : 'barcode-outline'; 
            tabLabel = "Scanner";
          } else if (route.name === 'Foto') {
            iconName = isFocused ? 'camera' : 'camera-outline';
            tabLabel = "Foto";
          } else if (route.name === 'Salvati') {
            iconName = isFocused ? 'heart' : 'heart-outline';
            tabLabel = "Salvati";
          } else if (route.name === 'Calorie') {
            iconName = isFocused ? 'fitness' : 'fitness-outline';
            tabLabel = "Calorie";
          } else if (route.name === 'Profile') {
            iconName = isFocused ? 'person' : 'person-outline';
            tabLabel = "Profilo";
          }

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabItem}
            >
              {/* Icona senza View contenitore circolare */}
              <Ionicons 
                name={iconName} 
                size={isFocused ? 22 : 22} // Icona attiva leggermente più grande
                color={isFocused ? ACTIVE_TAB_COLOR : INACTIVE_TAB_COLOR} 
                style={styles.iconStyle}
              />
              {/* Etichetta sempre visibile */}
              <AppText 
                style={[
                    styles.tabLabel, 
                    { color: isFocused ? ACTIVE_TAB_COLOR : INACTIVE_TAB_COLOR }
                ]}
              >
                {tabLabel}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBarOuterContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 30 : 20,
    left: 16,   // Aumentato da 20 a 25
    right: 16,  // Aumentato da 20 a 25
    // L'altezza è definita da tabBarContentContainer e dall'offset dell'ombra
  },
  tabBarShadow: {
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE,
    left: SHADOW_OFFSET_VALUE,
    width: '100%',
    height: Platform.OS === 'ios' ? 65 : 60, // Altezza del contenuto visibile della tab bar
    backgroundColor: SHADOW_COLOR, 
    borderRadius: 16, 
  },
  tabBarContentContainer: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 65 : 60, // Altezza effettiva della tab bar visibile
    backgroundColor: TAB_BAR_BACKGROUND_COLOR, 
    borderRadius: 16,
    borderTopWidth: TAB_BAR_BORDER_WIDTH,
    borderLeftWidth: TAB_BAR_BORDER_WIDTH,
    borderRightWidth: TAB_BAR_BORDER_WIDTH,
    borderBottomWidth: TAB_BAR_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    paddingHorizontal: 5,
    position: 'relative',
    zIndex: 1,
    alignItems: 'center', 
    justifyContent: 'space-around', 
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center', 
    paddingVertical: Platform.OS === 'ios' ? 6 : 4, // Ridotto padding per compattare
  },
  iconStyle: {
    marginBottom: 3, // Spazio tra icona e etichetta
  },
  tabLabel: {
    fontSize: 11, // Dimensione etichetta
    // marginTop non necessario se iconStyle ha marginBottom
    fontFamily: customFonts.AppSemiBold, // Usa BricolageGrotesque-SemiBold
  },
});

export default CustomTabBar; 