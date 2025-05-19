"use client";

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // Aggiunto per la freccia
import { useTheme } from "../contexts/ThemeContext";

// Interfaccia per le props del componente
interface ScoreIndicatorCardProps {
  title: string;
  value: string | number | null | undefined;
  description: string;
  scale: Array<string | number>;
  valueType: 'letter' | 'number';
  layoutStyle?: 'stacked' | 'inline'; // Nuovo: stacked (default) o inline
  size?: 'normal' | 'small'; // Nuovo: normal (default) o small
  borderless?: boolean; // Nuova prop per disabilitare i bordi quando il componente è già in un container con bordo
}

// Costanti per stile bordo direzionato in
const BORDER_COLOR = '#000000';
const CARD_BACKGROUND_COLOR = '#FFFFFF';
const CARD_BORDER_WIDTH = 1;  
const SHADOW_OFFSET_VALUE = 3;
// Aggiungo shadow offset specifico per i quadrati più piccolo dell'originale
const SQUARE_SHADOW_OFFSET_VALUE = 2;
// Aggiungo dimensioni fisse per i quadrati come costanti globali
const SQUARE_SIZE_NORMAL = 60; // Larghezza
const SQUARE_SIZE_SMALL = 45;  // Larghezza per versione small
const SQUARE_HEIGHT_RATIO = 1.2; // Rapporto altezza/larghezza per i quadrati
const SCALE_BORDER_WIDTH = 3; // Nuovo: Spessore bordo per la barra scala
const SCALE_BAR_ITEM_BORDER_COLOR = '#e9ecef'; // Colore per i bordi divisori tra gli item della barra
const SCALE_BAR_BACKGROUND_COLOR_INACTIVE = '#f8f9fa'; // Grigio molto chiaro per quadrati inattivi
const SCALE_BAR_TEXT_COLOR_INACTIVE = '#495057'; // Testo scuro per quadrati inattivi
const SCALE_BAR_BORDER_RADIUS = 12; // Raggio per la barra completa

// Costanti per i colori dei punteggi
const SCORE_COLORS: { [key: string]: { background: string; text: string } } = {
  'A+': { background: '#6ECFF6', text: '#000000' }, // Azzurro A+
  'A': { background: '#1E8F4E', text: '#FFFFFF' }, // Verde scuro
  'B': { background: '#7AC547', text: '#000000' }, // Verde chiaro
  'C': { background: '#FFC734', text: '#000000' }, // Giallo
  'D': { background: '#FF9900', text: '#000000' }, // Arancione
  'E': { background: '#FF0000', text: '#FFFFFF' }, // Rosso
  '1': { background: '#7AC547', text: '#000000' }, // Verde chiaro (NOVA 1)
  '2': { background: '#FFC734', text: '#000000' }, // Giallo (NOVA 2)
  '3': { background: '#FF9900', text: '#000000' }, // Arancione (NOVA 3)
  '4': { background: '#FF0000', text: '#FFFFFF' }, // Rosso (NOVA 4)
  'unknown': { background: '#e0e0e0', text: '#666666' },
};

const ScoreIndicatorCard: React.FC<ScoreIndicatorCardProps> = ({
  title,
  value,
  description,
  scale,
  valueType,
  layoutStyle = 'stacked', // Default a stacked
  size = 'normal', // Default a normal
  borderless = false, // Default a false per mantenere la retrocompatibilità
}) => {
  const { colors } = useTheme();
  const isSmall = size === 'small';
  const isInline = layoutStyle === 'inline';

  // Determina se il valore è effettivamente mancante o "unknown"
  const isValueTrulyMissing =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (typeof value === 'string' && value.trim().toLowerCase() === 'unknown');

  let normalizedValueForColor: string;
  let currentScoreColors;

  if (!isValueTrulyMissing) {
    // Se il valore è presente e non è una stringa vuota, normalizzalo.
    // Dobbiamo assicurarci che value non sia null/undefined prima di String()
    normalizedValueForColor = String(value!).toUpperCase(); 
    const valueForColorLookup = normalizedValueForColor === 'A+' ? 'A+' : normalizedValueForColor;
    currentScoreColors = SCORE_COLORS[valueForColorLookup] ?? SCORE_COLORS['unknown'];
  } else {
    // Se il valore è mancante, usiamo 'unknown' come placeholder per la logica dei colori,
    // anche se non verrà usato per colorare un item specifico della scala.
    normalizedValueForColor = 'unknown'; 
    currentScoreColors = SCORE_COLORS['unknown'];
  }

  // Aggiorno la parte del container per usare la proprietà borderless
  const mainContainerStyle = [
    styles.container,
    borderless && styles.borderless, // Applica stile borderless se richiesto
    isInline ? styles.inlineLayout : styles.stackedLayout // Uso nomi che esistono negli stili 
  ];

  // Dimensioni dei quadrati basate sulla dimensione (aumentate)
  const squareSize = isSmall ? SQUARE_SIZE_SMALL : SQUARE_SIZE_NORMAL;
  // Non usare la stessa dimensione per l'ombra
  const squareShadowOffsetX = SQUARE_SHADOW_OFFSET_VALUE;
  const squareShadowOffsetY = SQUARE_SHADOW_OFFSET_VALUE;

  // LOGICA DI RENDERING UNIFICATA
  return (
    <View 
      style={mainContainerStyle}
    >
      {/* Contenitore per testo - RENDERIZZATO SOLO SE titolo o descrizione sono presenti */}
      {(title.trim() !== '' || description.trim() !== '') && (
          <View style={[styles.textContainer, isInline && styles.textContainerInline]}>
          <Text style={[styles.titleText, isSmall && styles.titleTextSmall, isInline && styles.titleTextInline]}>
              {title}
          </Text>
          {isInline && (
              <Ionicons name="arrow-forward" size={isSmall ? 14 : 16} color={BORDER_COLOR} style={styles.inlineArrow} />
          )}
          </View>
      )}

      {/* NUOVA BARRA CON QUADRATI SEPARATI */}
      <View style={[styles.squaresContainer, isSmall && styles.squaresContainerSmall]}>
        {isValueTrulyMissing ? (
          <View style={styles.missingValueDisplay}>
            <Text style={[styles.missingValueText, isSmall && styles.missingValueTextSmall]}>
              Dato non disponibile
            </Text>
          </View>
        ) : (
          <View style={styles.squaresRow}>
            {scale.map((item, index) => {
              const itemStr = String(item).toUpperCase();
              const isSelected = itemStr === normalizedValueForColor;
              
              // Determino i colori per questo elemento
              let itemBackgroundColor = SCALE_BAR_BACKGROUND_COLOR_INACTIVE;
              let itemTextColor = SCALE_BAR_TEXT_COLOR_INACTIVE;
              
              if (isSelected) {
                const itemColors = SCORE_COLORS[itemStr] || SCORE_COLORS['unknown'];
                itemBackgroundColor = itemColors.background;
                itemTextColor = itemColors.text;
              }

              return (
                <View key={itemStr} style={[
                  styles.squareWrapper,
                  isSmall && styles.squareWrapperSmall
                ]}>
                  {/* Ombra direzionata */}
                  <View 
                    style={[
                      styles.squareShadow, 
                      {
                        borderRadius: 12,
                      }
                    ]} 
                  />
                  
                  {/* Contenitore principale con il bordo */}
                  <View
                    style={[
                      styles.squareItem,
                      {
                        backgroundColor: itemBackgroundColor,
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.squareItemText,
                        isSmall && styles.squareItemTextSmall,
                        { color: itemTextColor }
                      ]}
                    >
                      {item}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
      
      {/* Descrizione (separata dal titolo) */}
      {description.trim() !== '' && (
        <View style={styles.descriptionContainer}>
          <Text style={[styles.descriptionText, isSmall && styles.descriptionTextSmall]}>
            {description}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: BORDER_COLOR,
    padding: 10,
    overflow: 'hidden',
  },
  
  borderless: {
    borderWidth: 0, // Rimuove completamente il bordo
    borderRadius: 8, // Riduce il border radius per adattarsi al contenitore
    padding: 8, // Piccolo padding per non toccare i bordi del contenitore
  },
  cardWrapper: {
    position: 'relative',
    // Rimossa larghezza fissa per permettere stretching
    // width: '95%', // Adattato in LoadingScreen
    // alignSelf: 'center',
  },
  cardWrapperSmall: {
    // Eventuali modifiche specifiche al wrapper per la dimensione small
  },
  cardShadow: {
    // Rimosso stile ombra esterna
  },
  cardShadowSmall: {
    // Rimosso stile ombra esterna
  },
  cardContainer: {
    // Stile base del container, senza bordo né padding di default
    backgroundColor: CARD_BACKGROUND_COLOR, // Sfondo bianco di default
    borderRadius: 16, // Manteniamo arrotondamento esterno
    position: 'relative',
    overflow: 'hidden', 
    width: '100%', // Assicuriamoci che occupi la larghezza disponibile
  },
  cardContainerSmall: {
    borderRadius: 100, 
  },
  // Stili per quando c'è testo (padding e bordo precedente)
  cardContainerWithText: {
    paddingVertical: 18, // Aumentato da 12
    paddingHorizontal: 18, // Aumentato da 15
    borderWidth: CARD_BORDER_WIDTH, // Bordo per la card con testo
    borderColor: BORDER_COLOR,
  },
  cardContainerSmallWithText: {
    paddingVertical: 12, // Aumentato da 8
    paddingHorizontal: 12, // Aumentato da 10
    borderWidth: CARD_BORDER_WIDTH, 
    borderColor: BORDER_COLOR,
  },
  // Stili per quando è solo scala (senza padding e senza bordo sul container)
  cardContainerScaleOnly: {
    paddingVertical: 0,
    paddingHorizontal: 0, 
    borderWidth: 0, // Nessun bordo sul container esterno
    backgroundColor: 'transparent', // Sfondo trasparente, il colore viene dalla scala
  },
  cardContainerSmallScaleOnly: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  // FINE NUOVI STILI
  textContainer: { 
     marginBottom: 6, // Ridotto da 15 a 6
     alignItems: 'center', 
  },
  textContainerInline: { 
    flexDirection: 'row',
    alignItems: 'center', 
    justifyContent: 'flex-start', 
    marginBottom: 6, // Ridotto da 15 a 6
  },
  titleText: {
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    textAlign: 'center', // Default per stacked
    marginBottom: 2, // Ridotto spazio sotto il titolo
  },
  titleTextSmall: {
    fontSize: 15, // Testo più piccolo
    marginBottom: 1, // Spazio ridotto (solo stacked)
  },
  titleTextInline: {
    textAlign: 'left', // Allinea a sinistra per inline
    marginBottom: 0, // Nessun margine inferiore per inline
    marginRight: 8, // Aumentato da 5 a 8
    fontFamily: 'BricolageGrotesque-Bold', // Grassetto come richiesto
  },
  inlineArrow: {
     marginRight: 8, // Aumentato da 5 a 8
  },
  descriptionContainer: {
    marginTop: 6, // Ridotto spazio sopra la descrizione
  },
  descriptionText: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666',
    textAlign: 'center',
  },
  descriptionTextSmall: {
    fontSize: 12, // Testo più piccolo
  },
  scaleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between', // Manteniamo per modalità standard
    // Stili modalità standard (con padding e sfondo)
    backgroundColor: '#f0f0f0',
    borderRadius: 15, 
    padding: 5, 
    overflow: 'hidden',
  },
  scaleContainerSmall: {
     borderRadius: 10, 
     padding: 4, 
  },
  // NUOVI STILI PER MODALITÀ SOLO SCALA (BARRA CONTIGUA)
  scaleContainerScaleOnly: {
      backgroundColor: 'transparent',
      padding: 0, 
      borderRadius: 18, // Aumentato per renderlo più tondo tipo pillola
      overflow: 'hidden',
      justifyContent: 'center',
  },
  scaleContainerSmallScaleOnly: {
       borderRadius: 15, // Aumentato per renderlo più tondo tipo pillola
       padding: 0,
       overflow: 'hidden',
  },
  // NUOVO: Stile per aggiungere il bordo normale alla barra scala
  scaleContainerBordered: {
      borderWidth: SCALE_BORDER_WIDTH,
      borderColor: BORDER_COLOR,
  },
  scaleContainerBorderedSmall: {
       borderWidth: SCALE_BORDER_WIDTH * 0.8, // Bordo leggermente più sottile per small
  },
  // FINE NUOVI STILI
  scaleItem: {
    flex: 1, // Occupa spazio uguale
    alignItems: 'center',
    justifyContent: 'center',
    // Stili modalità standard (item separati e arrotondati)
    paddingVertical: 8,
    paddingHorizontal: 5, 
    borderRadius: 11, 
    marginHorizontal: 3, 
    minWidth: 40, 
  },
  scaleItemSmall: {
    paddingVertical: 5, 
    borderRadius: 8, 
    marginHorizontal: 2, 
    minWidth: 30, 
  },
  // NUOVI STILI PER MODALITÀ SOLO SCALA (BARRA CONTIGUA)
  scaleItemScaleOnly: {
      borderRadius: 0, 
      marginHorizontal: 0, 
      paddingVertical: 10, // AUMENTATO per più altezza
      paddingHorizontal: 5,
      minWidth: 0,
  },
  scaleItemSmallScaleOnly: {
       borderRadius: 0,
       marginHorizontal: 0,
       paddingVertical: 8, // AUMENTATO per più altezza (proporzionale)
       paddingHorizontal: 3, 
       minWidth: 0,
  },
  // FINE NUOVI STILI
  scaleItemSelected: {
    // Questo stile non serve più in modalità solo scala
    // borderWidth: 1.5, 
    // borderColor: BORDER_COLOR,
  },
   scaleItemSelectedSmall: {
      // Questo stile non serve più in modalità solo scala
      // borderWidth: 1, 
   },
  scaleItemText: {
    fontSize: 22, // Aumento anche la dimensione del testo
    fontFamily: 'BricolageGrotesque-SemiBold',
    textAlign: 'center',
  },
  scaleItemTextSmall: {
    fontSize: 18, // Aumento anche qui
  },
  // --- NUOVI STILI PER I QUADRATI SEPARATI ---
  squaresContainer: {
    paddingHorizontal: 0,
    paddingVertical: 2, // Ridotto da 10 a 2
    width: '100%',
  },
  
  squaresContainerSmall: {
    paddingVertical: 2, // Ridotto da 5 a 2
  },
  
  squaresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  
  squareWrapper: {
    position: 'relative',
    marginHorizontal: 3, // Aumentato leggermente da 2 a 3
    flex: 1,
    height: SQUARE_SIZE_NORMAL * SQUARE_HEIGHT_RATIO, // Aumentato sviluppo verticale
  },
  
  squareWrapperSmall: {
    height: SQUARE_SIZE_SMALL * SQUARE_HEIGHT_RATIO, // Aumentato sviluppo verticale versione small
  },
  
  squareShadow: {
    position: 'absolute',
    top: SQUARE_SHADOW_OFFSET_VALUE,
    left: SQUARE_SHADOW_OFFSET_VALUE,
    bottom: 0, // Fissiamo alla parte inferiore
    right: 0, // Fissiamo alla parte destra
    backgroundColor: '#000000',
    borderRadius: 12,
    zIndex: 1,
    // Rimuoviamo width: '100%' che causava problemi
  },
  
  squareItem: {
    position: 'absolute', // Un solo position
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.1, // Modificato da 0 a 0.5 per aggiungere un bordo sottile
    borderColor: BORDER_COLOR, // Mantenuto solo per riferimento
    borderRadius: 12,
    zIndex: 2,
    top: 0, // In alto
    left: 0, // A sinistra
    right: SQUARE_SHADOW_OFFSET_VALUE, // Spazio per l'ombra a destra
    bottom: SQUARE_SHADOW_OFFSET_VALUE, // Spazio per l'ombra in basso
  },
  
  squareItemText: {
    fontSize: 22, // Aumento anche la dimensione del testo
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  
  squareItemTextSmall: {
    fontSize: 18, // Aumento anche qui
  },
  
  // --- STILI PER VALORE MANCANTE ---
  missingValueDisplay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  
  missingValueText: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Medium',
    color: SCALE_BAR_TEXT_COLOR_INACTIVE,
    textAlign: 'center',
  },
  
  missingValueTextSmall: {
    fontSize: 14,
  },

  // --- LAYOUT STYLES ---
  inlineLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  stackedLayout: {
    flexDirection: 'column',
  },
});

export default ScoreIndicatorCard; 