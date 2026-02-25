import { useEffect, useState } from 'react';

const mobileQuery = '(max-width: 639px)';
const tabletQuery = '(max-width: 1023px)';

export function useResponsiveGameLayout() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(mobileQuery).matches);
  const [isTablet, setIsTablet] = useState(() => window.matchMedia(tabletQuery).matches);

  useEffect(() => {
    const mobile = window.matchMedia(mobileQuery);
    const tablet = window.matchMedia(tabletQuery);

    const onMobile = () => setIsMobile(mobile.matches);
    const onTablet = () => setIsTablet(tablet.matches);

    onMobile();
    onTablet();

    mobile.addEventListener('change', onMobile);
    tablet.addEventListener('change', onTablet);

    return () => {
      mobile.removeEventListener('change', onMobile);
      tablet.removeEventListener('change', onTablet);
    };
  }, []);

  return {
    isMobile,
    isTablet,
    isDesktop: !isTablet
  };
}
