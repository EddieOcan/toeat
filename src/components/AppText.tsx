import React from 'react';
import { Text as RNText, TextProps, StyleSheet, TextStyle } from 'react-native';
import { customFonts, typography } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';

type TypographyVariant = keyof typeof typography;

interface AppTextProps extends TextProps {
  variant?: TypographyVariant; // Es. 'h1', 'body', 'caption'
  fontType?: keyof typeof customFonts; // Es. 'AppRegular', 'AppBold' per override specifico
  color?: string; // Per permettere override del colore direttamente
  style?: TextStyle | TextStyle[];
}

const AppText: React.FC<AppTextProps> = ({
  style,
  variant,
  fontType,
  color: textColor,
  children,
  ...props
}) => {
  const { colors } = useTheme();

  // Determina lo stile base dal variant
  const baseStyle = variant ? typography[variant] : typography.body;

  // Permetti override del fontFamily specifico tramite fontType
  const fontFamily = fontType ? customFonts[fontType] : baseStyle.fontFamily;

  // Determina il colore del testo
  const finalColor = textColor || colors.text;

  // Combina gli stili: quelli di base/variante, fontFamily specifico, colore, e stili passati come prop
  const combinedStyle = StyleSheet.flatten([
    baseStyle, // Stile dalla variante (include fontSize, etc.)
    { fontFamily }, // fontFamily determinato
    { color: finalColor }, // Colore determinato
    style, // Stili aggiuntivi passati come prop
  ]);

  return (
    <RNText style={combinedStyle} {...props}>
      {children}
    </RNText>
  );
};

export default AppText; 