import { View, ViewStyle } from 'react-native';
import { useColors } from '../../constants/colors';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  const Colors = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: Colors.card,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.cardBorder,
          padding: 16,
          marginBottom: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
