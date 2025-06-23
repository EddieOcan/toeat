# Fix per il Font Scaling su iPhone XR

## Problema
Su iPhone XR i testi apparivano più grandi rispetto ai simulatori di iPhone 16 o 13 a causa del font scaling automatico di React Native che si adatta alle impostazioni di accessibilità del dispositivo.

## Soluzioni Implementate

### 1. Disabilitazione del Font Scaling Automatico
- Aggiunta la proprietà `allowFontScaling={false}` ai componenti Text principali
- Aggiornato il componente `AppText` per disabilitare il font scaling di default
- Creato il componente `ResponsiveText` per gestire automaticamente il scaling

### 2. Sistema di Scaling Responsive
- Aggiornato `src/theme/typography.ts` con scaling responsive basato sulle dimensioni dello schermo
- Creato hook `useResponsiveDimensions` per gestire le dimensioni responsive
- Implementata funzione `scaleFont()` che scala le dimensioni in base al dispositivo

### 3. Componenti Aggiornati
- `ScoreIndicatorCard`: Aggiunto `allowFontScaling={false}` e scaling responsive
- `RecentProductsSection`: Aggiornate le dimensioni dei font con `scaleFont()`
- `CalorieTrackingScreen`: Aggiunto `allowFontScaling={false}` ai testi principali

## Come Testare

### Su iPhone XR (Expo Go)
1. Apri l'app con Expo Go su iPhone XR
2. Verifica che i testi abbiano dimensioni consistenti con i simulatori
3. Controlla che non ci siano testi troppo grandi o piccoli

### Su Simulatori
1. Testa su iPhone 13, 16 e XR per confrontare le dimensioni
2. Verifica che il layout sia consistente tra i dispositivi

### Test delle Impostazioni di Accessibilità
1. Vai in Impostazioni > Accessibilità > Schermo e dimensioni del testo
2. Modifica la dimensione del testo
3. Verifica che l'app mantenga dimensioni consistenti (non dovrebbe cambiare)

## File Modificati

### Nuovi File
- `src/hooks/useResponsiveDimensions.ts` - Hook per dimensioni responsive
- `src/utils/fontScalingFix.ts` - Utility per gestione font scaling
- `src/components/ResponsiveText.tsx` - Componente Text wrapper

### File Aggiornati
- `src/theme/typography.ts` - Aggiunto scaling responsive
- `src/components/AppText.tsx` - Disabilitato font scaling di default
- `src/components/ScoreIndicatorCard.tsx` - Aggiunto allowFontScaling={false}
- `src/components/RecentProductsSection.tsx` - Aggiornate dimensioni font
- `src/screens/app/CalorieTrackingScreen.tsx` - Aggiunto allowFontScaling={false}
- `src/screens/app/ProductDetailScreen.tsx` - Aggiunto allowFontScaling={false} a tutti i Text
- `src/screens/app/NutritionProfileSetupScreen.tsx` - Aggiunto allowFontScaling={false} a tutti i Text
- `src/screens/app/SelectProductForDayScreen.tsx` - Aggiunto allowFontScaling={false} a tutti i Text

## Configurazione di Riferimento
- **Dispositivo di riferimento**: iPhone 13/14 (390x844px)
- **Scaling minimo**: 0.85x
- **Scaling massimo**: 1.15x
- **Font scaling**: Disabilitato (`allowFontScaling={false}`)

## Prossimi Passi
Per completare la migrazione, aggiorna i rimanenti componenti Text aggiungendo:
```tsx
<Text allowFontScaling={false} style={styles.yourStyle}>
  Your text
</Text>
```

Oppure usa il nuovo componente `ResponsiveText`:
```tsx
<ResponsiveText style={styles.yourStyle}>
  Your text
</ResponsiveText>
``` 