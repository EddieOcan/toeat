// src/theme/typography.ts

import { Dimensions, PixelRatio } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

// Dimensioni di riferimento (iPhone 13/14 standard)
const REFERENCE_WIDTH = 390;

// Calcola il fattore di scala
const scale = Math.min(screenWidth / REFERENCE_WIDTH, 1.15); // Limita il scaling massimo
const minScale = 0.85; // Limita il scaling minimo
const limitedScale = Math.max(minScale, Math.min(1.15, scale));

// Funzione per scalare le dimensioni dei font
const scaleFont = (size: number): number => {
  return Math.round(PixelRatio.roundToNearestPixel(size * limitedScale));
};

// Questi nomi devono corrispondere ai nomi dei file .ttf (senza estensione)
// o ai nomi dei font come registrati dal sistema dopo il linking.
// È una buona pratica usare nomi che riflettano la famiglia di font e il peso.
// Esempio: se hai 'OpenSans-Regular.ttf', il nome qui potrebbe essere 'OpenSans-Regular'.
// iOS spesso usa il "PostScript name" del font, Android usa il nome del file (senza estensione) o il nome del font definito nel file.
// Dopo aver aggiunto i .ttf e fatto il linking, potrebbe essere necessario verificare i nomi effettivi.

// Per Bricolage Grotesque, i nomi dei file sono diretti.
export const customFonts = {
  AppLight: 'BricolageGrotesque-Light',
  AppRegular: 'BricolageGrotesque-Regular',
  AppMedium: 'BricolageGrotesque-Medium',
  AppSemiBold: 'BricolageGrotesque-SemiBold',
  AppBold: 'BricolageGrotesque-Bold',
  // Aggiungi altri stili/pesi se necessario (es. AppItalic, AppLight)
};

// Esempio di come potresti definire delle varianti di testo standard con scaling responsive
export const typography = {
  h1: {
    fontFamily: customFonts.AppBold,
    fontSize: scaleFont(32),
    // fontWeight: 'bold', // Rimosso fallback
  },
  h2: {
    fontFamily: customFonts.AppBold,
    fontSize: scaleFont(24),
    // fontWeight: 'bold', // Rimosso fallback
  },
  h3: {
    fontFamily: customFonts.AppSemiBold, // Usiamo SemiBold per h3 per un po' di varietà
    fontSize: scaleFont(20),
    // fontWeight: 'bold', // Rimosso fallback
  },
  body: {
    fontFamily: customFonts.AppRegular,
    fontSize: scaleFont(16),
  },
  bodyMedium: {
    fontFamily: customFonts.AppMedium,
    fontSize: scaleFont(16),
    // fontWeight: '500', // Rimosso fallback
  },
  caption: {
    fontFamily: customFonts.AppRegular,
    fontSize: scaleFont(12),
  },
  button: { // Aggiunto stile per i bottoni, per esempio
    fontFamily: customFonts.AppSemiBold,
    fontSize: scaleFont(16),
  },
  label: { // Aggiunto stile per etichette o testo più piccolo e leggero
    fontFamily: customFonts.AppLight,
    fontSize: scaleFont(14),
  }
  // ... altre varianti
};

// Esporta anche la funzione di scaling per uso diretto
export { scaleFont };

// Nota: Ora che i fontFamily sono impostati, il prossimo passo CRUCIALE
// è eseguire `npx react-native-asset` e ricompilare l'app. 