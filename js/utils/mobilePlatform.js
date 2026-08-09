export function detectMobilePlatform(env = {}) {
  const ua = env.userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const uaData =
    env.userAgentData || (typeof navigator !== "undefined" ? navigator.userAgentData : null);
  const maxTouchPoints =
    typeof env.maxTouchPoints === "number" ? env.maxTouchPoints : navigator?.maxTouchPoints || 0;
  const matchMedia = env.matchMedia || (typeof window !== "undefined" ? window.matchMedia : null);

  const hasTouch = maxTouchPoints > 0;
  const supportsMq = typeof matchMedia === "function";
  const coarse = supportsMq && matchMedia("(any-pointer: coarse)").matches;
  const noHover = supportsMq && matchMedia("(any-hover: none)").matches;

  const uaDataMobile = uaData && typeof uaData.mobile === "boolean" ? uaData.mobile : null;
  const uaDataPlatform =
    uaData && typeof uaData.platform === "string" ? uaData.platform.toLowerCase() : "";
  const androidFromUaData = uaDataPlatform.includes("android");
  const androidFromUa = /android/i.test(ua);
  const isAndroid = androidFromUaData || androidFromUa;

  const isMobile =
    uaDataMobile === true ||
    (hasTouch && (coarse || noHover)) ||
    /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua) ||
    isAndroid;

  return { isMobile, isAndroid };
}
