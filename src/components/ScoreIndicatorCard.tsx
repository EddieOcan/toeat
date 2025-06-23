"use client";

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { scaleFont } from '../theme/typography'; // Aggiunto per la freccia
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

// Costanti per i colori dei punteggi - DESIGN COMPLETAMENTE NUOVO
const SCORE_COLORS: { [key: string]: { background: string; text: string; border: string } } = {
  'A+': { background: '#E8F5E8', text: '#2E7D32', border: '#4CAF50' },
  'A': { background: '#E8F5E8', text: '#2E7D32', border: '#4CAF50' },
  'B': { background: '#F1F8E9', text: '#558B2F', border: '#8BC34A' },
  'C': { background: '#FFF3E0', text: '#F57C00', border: '#FF9800' },
  'D': { background: '#FFF3E0', text: '#E65100', border: '#FF5722' },
  'E': { background: '#FFEBEE', text: '#C62828', border: '#F44336' },
  '1': { background: '#E8F5E8', text: '#2E7D32', border: '#4CAF50' },
  '2': { background: '#F1F8E9', text: '#558B2F', border: '#8BC34A' },
  '3': { background: '#FFF3E0', text: '#F57C00', border: '#FF9800' },
  '4': { background: '#FFEBEE', text: '#C62828', border: '#F44336' },
  'unknown': { background: '#F5F5F5', text: '#757575', border: '#BDBDBD' },
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
          <Text 
            style={[styles.titleText, isSmall && styles.titleTextSmall, isInline && styles.titleTextInline]}
            allowFontScaling={false}
          >
              {title}
          </Text>
          {isInline && (
              <Ionicons name="arrow-forward" size={isSmall ? 14 : 16} color={BORDER_COLOR} style={styles.inlineArrow} />
          )}
          </View>
      )}

      {/* NUOVO DESIGN COMPLETAMENTE DIVERSO */}
      <View style={styles.modernContainer}>
        {isValueTrulyMissing ? (
          <View style={styles.missingValueDisplay}>
            <Text 
              style={[styles.missingValueText, isSmall && styles.missingValueTextSmall]}
              allowFontScaling={false}
            >
              Dato non disponibile
            </Text>
          </View>
        ) : (
          <View style={styles.modernScoreDisplay}>
            {/* Header con il valore principale evidenziato */}
            <View style={styles.scoreValueWrapper}>
              <View style={[
                styles.scoreCircle,
                isSmall && styles.scoreCircleSmall,
                { backgroundColor: (SCORE_COLORS[normalizedValueForColor] || SCORE_COLORS['unknown']).background }
              ]}>
                <Text 
                  style={[
                    styles.scoreValueText,
                    isSmall && styles.scoreValueTextSmall,
                    { color: (SCORE_COLORS[normalizedValueForColor] || SCORE_COLORS['unknown']).text }
                  ]}
                  allowFontScaling={false}
                >
                  {normalizedValueForColor}
                </Text>
              </View>
              <View style={styles.scoreProgressBar}>
                {scale.map((item, index) => {
                  const itemStr = String(item).toUpperCase();
                  const isSelected = itemStr === normalizedValueForColor;
                  const itemColors = SCORE_COLORS[itemStr] || SCORE_COLORS['unknown'];
                  
                  return (
                    <View
                      key={itemStr}
                      style={[
                        styles.progressDot,
                        isSmall && styles.progressDotSmall,
                        {
                          backgroundColor: isSelected ? itemColors.border : '#E0E0E0',
                        }
                      ]}
                    />
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </View>
      
      {/* Descrizione (separata dal titolo) */}
      {description.trim() !== '' && (
        <View style={styles.descriptionContainer}>
          <Text 
            style={[styles.descriptionText, isSmall && styles.descriptionTextSmall]}
            allowFontScaling={false}
          >
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
    fontSize: scaleFont(18),
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
    textAlign: 'center', // Default per stacked
    marginBottom: 2, // Ridotto spazio sotto il titolo
  },
  titleTextSmall: {
    fontSize: scaleFont(15), // Testo più piccolo
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
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Regular',
    color: '#666',
    textAlign: 'center',
  },
  descriptionTextSmall: {
    fontSize: scaleFont(12), // Testo più piccolo
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

  
  // --- STILI PER VALORE MANCANTE ---
  missingValueDisplay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  
  missingValueText: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Medium',
    color: SCALE_BAR_TEXT_COLOR_INACTIVE,
    textAlign: 'center',
  },
  
  missingValueTextSmall: {
    fontSize: scaleFont(14),
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

  

  pillsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingVertical: 2,
    width: '100%',
    gap: 6,
  },

  pillItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    minHeight: 40,
    position: 'relative',
  },

  pillItemSmall: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 16,
    minHeight: 32,
  },

  pillText: {
    fontSize: 18,
    fontFamily: 'BricolageGrotesque-Bold',
    textAlign: 'center',
  },

  pillTextSmall: {
    fontSize: 15,
  },

  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
    position: 'absolute',
    bottom: 4,
    left: '50%',
    marginLeft: -3,
  },

  modernContainer: {
    paddingVertical: 10,
    paddingHorizontal: 5,
    width: '100%',
  },

  modernScoreDisplay: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 15,
  },

  scoreValueWrapper: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },

  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.1)',
  },

  scoreCircleSmall: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },

  scoreValueText: {
    fontSize: scaleFont(28),
    fontFamily: 'BricolageGrotesque-Bold',
  },

  scoreValueTextSmall: {
    fontSize: scaleFont(22),
  },

  scoreProgressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  progressDotSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },


});

export default ScoreIndicatorCard; 