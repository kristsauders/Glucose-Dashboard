import { useState, useEffect } from 'react';

export function useResponsiveChartHeight(
  mobileHeight: number = 250,
  desktopHeight: number = 400
): number {
  const [height, setHeight] = useState(desktopHeight);

  useEffect(() => {
    const updateHeight = () => {
      // Use 768px as the breakpoint (md in Tailwind)
      setHeight(window.innerWidth < 768 ? mobileHeight : desktopHeight);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [mobileHeight, desktopHeight]);

  return height;
}
