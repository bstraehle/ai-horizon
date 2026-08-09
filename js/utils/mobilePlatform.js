export function detectMobilePlatform(env = {}) {
  /** @type {{userAgent?: string, userAgentData?: {mobile?: boolean, platform?: string}, maxTouchPoints?: number, matchMedia?: (query: string) => { matches: boolean }} | undefined} */
  const options = env;

  const ua = options?.userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const uaData =
    options?.userAgentData ||
    (typeof navigator !== "undefined" && "userAgentData" in navigator
      ? navigator.userAgentData
      : null);
  const maxTouchPoints =
    typeof options?.maxTouchPoints === "number"
      ? options.maxTouchPoints
      : typeof navigator !== "undefined"
        ? navigator.maxTouchPoints || 0
        : 0;
  const matchMedia =
    options?.matchMedia || (typeof window !== "undefined" ? window.matchMedia : null);

  const hasTouch = maxTouchPoints > 0;
  const supportsMq = typeof matchMedia === "function";
  const coarse = supportsMq && matchMedia("(any-pointer: coarse)").matches;
  const noHover = supportsMq && matchMedia("(any-hover: none)").matches;

  const uaDataMobile =
    uaData && typeof uaData === "object" && "mobile" in uaData && typeof uaData.mobile === "boolean"
      ? uaData.mobile
      : null;
  const uaDataPlatform =
    uaData &&
    typeof uaData === "object" &&
    "platform" in uaData &&
    typeof uaData.platform === "string"
      ? uaData.platform.toLowerCase()
      : "";
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
