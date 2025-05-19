import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, FadeIn, SlideInDown, runOnJS, useAnimatedProps, interpolateColor } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import ScoreIndicatorCard from './ScoreIndicatorCard'; // Riutilizziamo la card!
import { type ProductRecord, type RawProductData } from '../services/api'; // Corretto percorso import

// Costanti per stile bordo direzionato (duplicate da ProductDetail per indipendenza)
const BORDER_COLOR = '#000';
const CARD_BACKGROUND_COLOR = '#FFFFFF';
const CARD_BORDER_WIDTH = 2.5;
const SHADOW_OFFSET_VALUE = 3.5;
const IMAGE_SHADOW_OFFSET = 2.5; // Coerente con HomeScreen
const BACKGROUND_COLOR = '#f8f4ec';
const COMMON_BORDER_WIDTH = 2.5; // DEFINITA QUI mancava

type LoadingAnimationScreenProps = {
  productData: RawProductData | ProductRecord | null; // Nuova prop per i dati aggregati
  isAiStillLoading: boolean; 
  isPhotoAnalysis?: boolean; // Nuova prop per distinguere l'analisi foto
};

// Componente per i puntini animati 
const LoadingDots = ({ textSize = 16 }: { textSize?: number }) => {
  const [dots, setDots] = useState('.');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length < 3 ? prev + '.' : '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return <Text style={[styles.dotsText, { fontSize: textSize }]}>{dots}</Text>;
};

// Componente per il messaggio di valutazione in corso
const ScoreLoadingMessage = ({ type }: { type: 'nutri' | 'nova' | 'eco' }) => {
  let message = '';
  
  switch(type) {
    case 'nutri':
      message = 'Nutri-Score non trovato, valutazione nutrizionale in corso';
      break;
    case 'nova':
      message = 'NOVA non trovato, analisi del livello di lavorazione in corso';
      break;
    case 'eco':
      message = 'Eco-Score non trovato, valutazione dell\'impatto ambientale in corso';
      break;
  }
  
  return (
    <View style={styles.scoreLoadingContainer}>
      <Text style={styles.scoreLoadingText}>{message}</Text>
      <View style={styles.dotsContainer}>
        <LoadingDots textSize={14} />
      </View>
    </View>
  );
};

// Componente per il messaggio di analisi foto
const PhotoAnalysisMessage = ({ type }: { type: 'nutri' | 'nova' | 'eco' }) => {
  let message = '';
  
  switch(type) {
    case 'nutri':
      message = 'Analisi nutrizionale in corso dalla foto. L\'AI sta valutando gli ingredienti e i valori nutrizionali probabili...';
      break;
    case 'nova':
      message = 'Valutazione del livello di trasformazione in corso. L\'AI sta analizzando la composizione probabile del prodotto...';
      break;
    case 'eco':
      message = 'Analisi dell\'impatto ambientale in corso. L\'AI sta esaminando caratteristiche visibili del prodotto...';
      break;
  }
  
  return (
    <View style={photoAnalysisStyles.container}>
      <Text style={photoAnalysisStyles.title}>
        {type === 'nutri' ? 'Valutazione Nutrizionale' : 
         type === 'nova' ? 'Livello di Trasformazione' : 
         'Impatto Ambientale'}
      </Text>
      <Text style={photoAnalysisStyles.message}>{message}</Text>
      <View style={photoAnalysisStyles.dotsContainer}>
        <LoadingDots textSize={16} />
      </View>
    </View>
  );
};

const photoAnalysisStyles = StyleSheet.create({
  container: {
    padding: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'BricolageGrotesque-SemiBold',
    color: BORDER_COLOR,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
    color: '#555',
    fontFamily: 'BricolageGrotesque-Regular',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  }
});

const LoadingAnimationScreen: React.FC<LoadingAnimationScreenProps> = ({
  productData,
  isAiStillLoading,
  isPhotoAnalysis = false,
}) => {

  const progress = useSharedValue(0); // Valore animato per la barra progresso (0 a 1)
  const [step, setStep] = useState(0); // Stato per controllare la sequenza
  const [statusText, setStatusText] = useState(''); // Testo di stato (percentuale o messaggio)

  // Funzione per aggiornare il testo di stato (eseguita su JS thread)
  const updateStatusText = (text: string) => {
    setStatusText(text);
  };

  // Stile animato per la barra e colore
  const progressBarStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 0.5, 1],
      ['#FFC734', '#7AC547', '#1E8F4E'] // Giallo -> Verde Chiaro -> Verde Scuro
    );
    return {
      width: `${progress.value * 100}%`,
      backgroundColor: backgroundColor,
    };
  });

  // Props animate per il testo della percentuale (se usi AnimatedText)
  /* const animatedTextProps = useAnimatedProps(() => {
    return {
      text: `${Math.round(progress.value * 100)}%`
    };
  }); */

  useEffect(() => {
    const runAnimationSequence = async () => {
      console.log('[LoadingScreen] Inizio sequenza animazione. isPhotoAnalysis:', isPhotoAnalysis);
      
      // 0. Inizio animazione
      progress.value = 0;
      setStep(0);
      updateStatusText('0%');
      
      // Tempo di attesa iniziale maggiore per l'analisi foto
      await new Promise(resolve => setTimeout(resolve, isPhotoAnalysis ? 1500 : 800));
      
      // 1. Prima animazione: a 30%
      progress.value = withTiming(0.3, { duration: 800 });
      updateStatusText('30%');
      // setStep(2); // Non servono più i Dots, togliamo questo passaggio
      await new Promise(resolve => setTimeout(resolve, isPhotoAnalysis ? 1200 : 600));
      setStep(1); // Mostra Nutri
      updateStatusText(isPhotoAnalysis ? 'Analizzando contenuto nutrizionale...' : 'Mostrando Nutri-Score...');
      
      // 2. Pausa e altra barra a 60%
      await new Promise(resolve => setTimeout(resolve, isPhotoAnalysis ? 2000 : 1000)); // Tempo maggiore per analisi foto
      progress.value = withTiming(0.6, { duration: 800 });
      updateStatusText('60%');
      await new Promise(resolve => setTimeout(resolve, isPhotoAnalysis ? 1200 : 600));
      setStep(3); // Mostra Nova direttamente
      updateStatusText(isPhotoAnalysis ? 'Analizzando livello di trasformazione...' : 'Mostrando Gruppo NOVA...');

      // 3. Pausa e altra barra
      await new Promise(resolve => setTimeout(resolve, isPhotoAnalysis ? 2000 : 1000)); // Tempo maggiore per analisi foto
      progress.value = withTiming(0.8, { duration: 800 }); // Velocità aumentata
      updateStatusText('80%');
      // runOnJS(setStep)(4); // Non servono più i Dots
      await new Promise(resolve => setTimeout(resolve, isPhotoAnalysis ? 1200 : 600));
      setStep(5); // Mostra Eco
      updateStatusText(isPhotoAnalysis ? 'Valutando impatto ambientale...' : 'Mostrando Eco-Score...');

      // 4. Pausa e barra completa
      await new Promise(resolve => setTimeout(resolve, isPhotoAnalysis ? 2000 : 1000)); // Tempo maggiore per analisi foto
      progress.value = withTiming(1, { duration: 800 });
      updateStatusText('100% - Controllo finale...');
      await new Promise(resolve => setTimeout(resolve, isPhotoAnalysis ? 1500 : 600)); 
      setStep(6); // Step finale pre-controllo

      // 5. Attesa AI (se necessario)
      if (isAiStillLoading) {
        console.log('[LoadingScreen] AI ancora in corso, mostro messaggio di attesa.');
        updateStatusText(isPhotoAnalysis ? 'Analisi dell\'immagine in corso...' : 'Organizzazione della risposta...');
        // Per l'analisi foto aggiungiamo un ritardo ulteriore, anche se isAiStillLoading è false
        if (isPhotoAnalysis) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // Attesa extra per analisi foto
        }
        // Rimane in questo stato finché isAiStillLoading diventa false (gestito da ProductDetailScreen)
      } else {
        console.log('[LoadingScreen] AI pronta, animazione completata.');
        // Per l'analisi foto aggiungiamo comunque un ritardo minimo
        if (isPhotoAnalysis) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Attesa minima anche se AI già pronta
        }
        // Non chiamiamo più onAnimationComplete qui
        setStep(7); // Segna come completo (anche se non fa nulla di visibile ora)
      }
    };

    runAnimationSequence();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Esegui solo al mount

  // Questo effect reagisce a isAiStillLoading che cambia da true a false
  useEffect(() => {
    if (!isAiStillLoading && step === 6) {
      console.log('[LoadingScreen] isAiStillLoading è diventato false, animazione effettivamente completa.');
      // Potremmo voler forzare un re-render o semplicemente lasciare che ProductDetailScreen gestisca la scomparsa
      // setStep(7); // Opzionale: aggiorna lo stato interno se serve
    }
  }, [isAiStillLoading, step]);

  // Estraiamo i dati da productData qui
  let productName: string | null | undefined = "Caricamento nome...";
  let brandName: string | null | undefined = "Caricamento brand...";
  let imageUrl: string | null | undefined = undefined;
  let nutritionGrade: string | null | undefined = undefined;
  let novaGroup: string | number | null | undefined = undefined;
  let ecoScoreGrade: string | null | undefined = undefined;

  if (productData) {
    productName = 'product_name' in productData ? productData.product_name : (productData as ProductRecord).product_name;
    brandName = 'brands' in productData ? productData.brands : (productData as ProductRecord).brand;
    imageUrl = 'image_url' in productData && productData.image_url ? productData.image_url :
                 'product_image' in productData && productData.product_image ? productData.product_image : undefined;
    nutritionGrade = 'nutrition_grades' in productData ? productData.nutrition_grades : (productData as ProductRecord).nutrition_grade;
    ecoScoreGrade = 
        productData && 'ecoscore_grade' in productData ? productData.ecoscore_grade 
        : productData && 'data' in productData && (productData.data as any)?.ecoscore_grade // Raw in Record?
        ? (productData.data as any).ecoscore_grade
        : undefined;
    novaGroup = 
        productData && 'nova_group' in productData ? (productData as any).nova_group 
        : productData && 'data' in productData && (productData.data as any)?.nova_group // Raw in Record?
        ? (productData.data as any).nova_group
        : productData && 'nutriments' in productData && (productData as any).nutriments?.nova_group // Raw con nova in nutriments?
        ? (productData as any).nutriments.nova_group
        : undefined;
  }

  // Verifica se i valori sono effettivamente disponibili (non undefined, null o empty string)
  const hasNutriScore = nutritionGrade !== undefined && nutritionGrade !== null && nutritionGrade !== '';
  const hasNovaGroup = novaGroup !== undefined && novaGroup !== null && novaGroup !== '';
  const hasEcoScore = ecoScoreGrade !== undefined && ecoScoreGrade !== null && ecoScoreGrade !== '';

  const shouldShowNutri = step >= 1;
  const shouldShowNova = step >= 3;
  const shouldShowEco = step >= 5;

  // console.log('RENDER LoadingAnimationScreen:', { step, productName, nutritionGrade, novaGroup, ecoScoreGrade, shouldShowNutri, shouldShowNova, shouldShowEco });

  return (
    <View style={styles.container}>
      {/* Immagine del prodotto con bordo direzionato */}
      <View style={styles.productImageOuterWrapper}>
        <View style={styles.productImageInnerShadow} />
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.productDisplayImage} resizeMode="contain" />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Ionicons name="camera-outline" size={40} color="#ccc" />
          </View>
        )}
      </View>
      <Text style={styles.productName} numberOfLines={2}>{productName || "Caricamento nome..."}</Text>

      {/* Barra Progresso e Testo Stato */}
       <Animated.View entering={FadeIn.delay(200).duration(500)} style={styles.progressAreaContainer}>
          <View style={styles.progressBarContainer}>
            <Animated.View style={[styles.progressBarInner, progressBarStyle]} />
          </View>
          <Text style={styles.statusTextStyle}>{statusText}</Text>
       </Animated.View>

      {/* Punteggi Sequenziali */} 
      <View style={styles.scoresContainer}>
        {shouldShowNutri && (
          <Animated.View entering={SlideInDown.duration(400)} style={styles.scoreCardOuterWrapper}>
            <View style={styles.scoreCardShadowView} />
            <View style={styles.scoreCardContentWithBorder}>
              {isPhotoAnalysis ? (
                <PhotoAnalysisMessage type="nutri" />
              ) : hasNutriScore ? (
                <ScoreIndicatorCard
                  title="Nutri-Score"
                  value={nutritionGrade}
                  description="Valutazione nutrizionale"
                  scale={['A', 'B', 'C', 'D', 'E']}
                  valueType="letter"
                  layoutStyle="stacked"
                  size="small"
                  borderless={true} 
                />
              ) : (
                <ScoreLoadingMessage type="nutri" />
              )}
            </View>
          </Animated.View>
        )}
        
        {shouldShowNova && (
           <Animated.View entering={SlideInDown.duration(400)} style={styles.scoreCardOuterWrapper}>
            <View style={styles.scoreCardShadowView} />
            <View style={styles.scoreCardContentWithBorder}>
              {isPhotoAnalysis ? (
                <PhotoAnalysisMessage type="nova" />
              ) : hasNovaGroup ? (
                <ScoreIndicatorCard
                  title="Gruppo NOVA"
                  value={novaGroup}
                  description="Livello di lavorazione"
                  scale={[1, 2, 3, 4]}
                  valueType="number"
                  layoutStyle="stacked"
                  size="small"
                  borderless={true}
                />
              ) : (
                <ScoreLoadingMessage type="nova" />
              )}
            </View>
          </Animated.View>
        )}

        {shouldShowEco && (
           <Animated.View entering={SlideInDown.duration(400)} style={styles.scoreCardOuterWrapper}>
            <View style={styles.scoreCardShadowView} />
            <View style={styles.scoreCardContentWithBorder}>
              {isPhotoAnalysis ? (
                <PhotoAnalysisMessage type="eco" />
              ) : hasEcoScore ? (
                <ScoreIndicatorCard
                  title="Eco-Score"
                  value={ecoScoreGrade}
                  description="Impatto ambientale"
                  scale={['A', 'B', 'C', 'D', 'E']}
                  valueType="letter"
                  layoutStyle="stacked"
                  size="small"
                  borderless={true}
                />
              ) : (
                <ScoreLoadingMessage type="eco" />
              )}
            </View>
          </Animated.View>
        )}
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
    alignItems: 'center',
    paddingTop: 70, // Aumentato ulteriormente da 50 a 70
    paddingHorizontal: 20,
  },
  // Stili per nome prodotto
  productName: {
    fontSize: 22,
    fontFamily: 'BricolageGrotesque-SemiBold',
    textAlign: 'center',
    color: '#333',
    marginBottom: 15, // Ridotto da 25 a 15 per avvicinarlo alla barra
  },
  // Stili per l'immagine del prodotto con bordo direzionato
  productImageOuterWrapper: {
    position: 'relative',
    width: 130, // Mantengo dimensioni immagine precedente
    height: 130,
    marginBottom: 15, // Spazio sotto l'immagine
  },
  productImageInnerShadow: {
    position: 'absolute',
    top: IMAGE_SHADOW_OFFSET, // Usa la costante definita IMAGE_SHADOW_OFFSET
    left: IMAGE_SHADOW_OFFSET, // Usa la costante definita IMAGE_SHADOW_OFFSET
    width: '100%',
    height: '100%',
    backgroundColor: BORDER_COLOR, // Usa la costante BORDER_COLOR
    borderRadius: 12, // Stesso borderRadius dell'immagine
  },
  productDisplayImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    borderWidth: COMMON_BORDER_WIDTH, // Usa la costante COMMON_BORDER_WIDTH
    borderColor: BORDER_COLOR, // Usa la costante BORDER_COLOR
    backgroundColor: '#eee',
    position: 'relative', // Per stare sopra l'ombra
    zIndex: 1,
  },
  productImagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    borderWidth: COMMON_BORDER_WIDTH, // Usa la costante COMMON_BORDER_WIDTH
    borderColor: BORDER_COLOR, // Usa la costante BORDER_COLOR
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative', // Per stare sopra l'ombra
    zIndex: 1,
  },
  // Stili Barra Progresso e Testo Stato
  progressAreaContainer: { // Nuovo contenitore per barra e testo
    width: '95%', // Larghezza come la top card
    alignItems: 'center', // Centra la barra e il testo orizzontalmente
    marginBottom: 30,
  },
  progressBarContainer: {
    height: 14, // Leggermente più alta
    width: '100%', // Occupa tutta la larghezza del suo container
    backgroundColor: '#e0e0e0',
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 8, // Spazio tra barra e testo
    borderWidth: 1.5,
    borderColor: BORDER_COLOR,
  },
  progressBarInner: {
    height: '100%',
    // backgroundColor: '#28a745', // Colore gestito da useAnimatedStyle
    borderRadius: 7, // Stesso raggio
  },
  statusTextStyle: { // Stile per il testo percentuale/stato
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Medium',
    color: BORDER_COLOR,
    marginTop: 5,
  },
  // Stili Scores
  scoresContainer: {
    width: '95%', // Occupa larghezza come la top card
    alignItems: 'stretch', // Estende le card figlio
  },
  scoreCardWrapper: { // Aggiunto wrapper per dare margine tra le card
    marginBottom: 15, // Spazio tra le card
  },
  // NUOVI STILI PER BORDO DIREZIONATO DELLE SCORE CARD
  scoreCardOuterWrapper: {
    position: 'relative',
    width: '100%',
    marginBottom: 20, 
  },
  scoreCardShadowView: {
    backgroundColor: BORDER_COLOR, // Utilizza la costante BORDER_COLOR definita nel file
    borderRadius: 12, 
    position: 'absolute',
    top: SHADOW_OFFSET_VALUE, // Utilizza la costante SHADOW_OFFSET_VALUE definita nel file
    left: SHADOW_OFFSET_VALUE, // Utilizza la costante SHADOW_OFFSET_VALUE definita nel file
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  // Miglioramento dei bordi e posizionamento standard
  scoreCardContentWithBorder: {
    backgroundColor: CARD_BACKGROUND_COLOR, 
    borderRadius: 12, 
    borderWidth: CARD_BORDER_WIDTH, 
    borderColor: BORDER_COLOR,
    overflow: 'hidden', // Assicuro che il contenuto non esca dagli angoli arrotondati
    position: 'relative',
    zIndex: 1,
    padding: 10, // Aumento padding per dare più spazio ai contenuti
  },
  // Stili per i puntini animati e messaggi di score mancanti
  dotsContainer: {
    alignItems: 'center',
    marginTop: 6, // Spazio tra testo e puntini
  },
  dotsText: {
    fontFamily: 'BricolageGrotesque-Bold',
    color: BORDER_COLOR,
  },
  // Stili per il messaggio di loading dello score
  scoreLoadingContainer: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80, // Assicura che abbia un'altezza simile alla ScoreIndicatorCard
  },
  scoreLoadingText: {
    fontSize: 14,
    fontFamily: 'BricolageGrotesque-Medium',
    color: BORDER_COLOR,
    textAlign: 'center',
  },
  // Stili per il messaggio di analisi foto
  photoAnalysisContainer: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  photoAnalysisText: {
    fontSize: 16,
    fontFamily: 'BricolageGrotesque-Medium',
    color: BORDER_COLOR,
    textAlign: 'center',
  }
});

export default LoadingAnimationScreen; 