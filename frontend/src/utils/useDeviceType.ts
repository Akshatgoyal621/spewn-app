// utils/useDeviceType.ts
"use client";
import { useEffect, useState } from "react";

export function useDeviceType() {
  const [device, setDevice] = useState({
    isMobile: false,
    isTablet: false,
  });

  useEffect(() => {
    function handleResize() {
      const width = window.innerWidth;
      setDevice({
        isMobile: width <= 768,
        isTablet: width > 768 && width <= 1024,
      });
    }

    handleResize(); // initial check
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return device;
}
