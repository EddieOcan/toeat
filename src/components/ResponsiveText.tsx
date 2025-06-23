import React from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { scaleFont } from '../theme/typography';

interface ResponsiveTextProps extends TextProps {
  style?: TextStyle | TextStyle[];
  allowFontScaling?: boolean;
  scaleSize?: boolean; // Se true, scala automaticamente il fontSize
}

const ResponsiveText: React.FC<ResponsiveTextProps> = ({
  style,
  allowFontScaling = false,
  scaleSize = true,
  children,
  ...props
}) => {
  // Processa lo stile per applicare il scaling se richiesto
  const processedStyle = React.useMemo(() => {
    if (!scaleSize || !style) return style;
    
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
    
    if (flatStyle.fontSize && typeof flatStyle.fontSize === 'number') {
      return {
        ...flatStyle,
        fontSize: scaleFont(flatStyle.fontSize),
      };
    }
    
    return style;
  }, [style, scaleSize]);

  return (
    <RNText
      style={processedStyle}
      allowFontScaling={allowFontScaling}
      {...props}
    >
      {children}
    </RNText>
  );
};

export default ResponsiveText; 