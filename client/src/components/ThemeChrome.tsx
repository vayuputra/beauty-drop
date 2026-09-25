import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Capacitor } from "@capacitor/core";

const CHROME = {
  light: { background: "#FFFFFF" },
  dark: { background: "#141013" },
} as const;

/** Keeps the browser theme-color and the native status bar in step with light/dark mode. */
export function ThemeChrome() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const mode = resolvedTheme === "dark" ? "dark" : "light";
    const { background } = CHROME[mode];
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);

    if (Capacitor.isNativePlatform()) {
      import("@capacitor/status-bar")
        .then(({ StatusBar, Style }) => {
          StatusBar.setStyle({ style: mode === "dark" ? Style.Dark : Style.Light }).catch(() => {});
          if (Capacitor.getPlatform() === "android") StatusBar.setBackgroundColor({ color: background }).catch(() => {});
        })
        .catch(() => {});
    }
  }, [resolvedTheme]);

  return null;
}
