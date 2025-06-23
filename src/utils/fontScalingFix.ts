// Utility per gestire il font scaling in modo centralizzato
import { TextStyle } from 'react-native';
import { scaleFont } from '../theme/typography';

// Props di default per tutti i componenti Text
export const defaultTextProps = {
  allowFontScaling: false,
};

// Funzione helper per creare stili di testo con scaling responsive
export const createTextStyle = (baseStyle: TextStyle): TextStyle => {
  return {
    ...baseStyle,
    fontSize: baseStyle.fontSize ? scaleFont(baseStyle.fontSize) : scaleFont(16),
  };
};

// Stili comuni per testi con scaling responsive
export const responsiveTextStyles = {
  title: {
    fontSize: scaleFont(18),
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
  subtitle: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-Medium',
  },
  body: {
    fontSize: scaleFont(14),
    fontFamily: 'BricolageGrotesque-Regular',
  },
  caption: {
    fontSize: scaleFont(12),
    fontFamily: 'BricolageGrotesque-Regular',
  },
  button: {
    fontSize: scaleFont(16),
    fontFamily: 'BricolageGrotesque-SemiBold',
  },
};

export default defaultTextProps; 