// src/theme/typography.ts

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

// Esempio di come potresti definire delle varianti di testo standard
export const typography = {
  h1: {
    fontFamily: customFonts.AppBold,
    fontSize: 32,
    // fontWeight: 'bold', // Rimosso fallback
  },
  h2: {
    fontFamily: customFonts.AppBold,
    fontSize: 24,
    // fontWeight: 'bold', // Rimosso fallback
  },
  h3: {
    fontFamily: customFonts.AppSemiBold, // Usiamo SemiBold per h3 per un po' di varietà
    fontSize: 20,
    // fontWeight: 'bold', // Rimosso fallback
  },
  body: {
    fontFamily: customFonts.AppRegular,
    fontSize: 16,
  },
  bodyMedium: {
    fontFamily: customFonts.AppMedium,
    fontSize: 16,
    // fontWeight: '500', // Rimosso fallback
  },
  caption: {
    fontFamily: customFonts.AppRegular,
    fontSize: 12,
  },
  button: { // Aggiunto stile per i bottoni, per esempio
    fontFamily: customFonts.AppSemiBold,
    fontSize: 16,
  },
  label: { // Aggiunto stile per etichette o testo più piccolo e leggero
    fontFamily: customFonts.AppLight,
    fontSize: 14,
  }
  // ... altre varianti
};

// Nota: Ora che i fontFamily sono impostati, il prossimo passo CRUCIALE
// è eseguire `npx react-native-asset` e ricompilare l'app. 