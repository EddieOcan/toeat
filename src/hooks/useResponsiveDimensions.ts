import { Dimensions, PixelRatio } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Dimensioni di riferimento (iPhone 13/14 standard)
const REFERENCE_WIDTH = 390;
const REFERENCE_HEIGHT = 844;

export const useResponsiveDimensions = () => {
  // Calcola il fattore di scala basato sulla larghezza dello schermo
  const widthScale = screenWidth / REFERENCE_WIDTH;
  const heightScale = screenHeight / REFERENCE_HEIGHT;
  
  // Usa il fattore più piccolo per mantenere le proporzioni
  const scale = Math.min(widthScale, heightScale);
  
  // Funzione per scalare le dimensioni dei font
  const scaleFont = (size: number): number => {
    const scaledSize = size * scale;
    // Limita il scaling per evitare testi troppo piccoli o grandi
    const minScale = 0.85;
    const maxScale = 1.15;
    const limitedScale = Math.max(minScale, Math.min(maxScale, scale));
    return Math.round(PixelRatio.roundToNearestPixel(size * limitedScale));
  };
  
  // Funzione per scalare dimensioni generiche (padding, margin, etc.)
  const scaleDimension = (size: number): number => {
    return Math.round(PixelRatio.roundToNearestPixel(size * scale));
  };
  
  return {
    screenWidth,
    screenHeight,
    scale,
    scaleFont,
    scaleDimension,
    isSmallScreen: screenWidth < 375, // iPhone SE e simili
    isLargeScreen: screenWidth > 414,  // iPhone Plus e simili
  };
};

export default useResponsiveDimensions; 