import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Capacitor } from "@capacitor/core";

// Initialize Capacitor plugins on native platforms
async function initNative() {
  if (Capacitor.isNativePlatform()) {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const { SplashScreen } = await import("@capacitor/splash-screen");
    const { App: CapApp } = await import("@capacitor/app");

    // Style status bar
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#FDF2F8' }).catch(() => {});

    // Handle Android back button
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapApp.exitApp();
      }
    });

    // Hide splash screen after a short delay
    setTimeout(() => SplashScreen.hide(), 500);
  }
}

initNative();

createRoot(document.getElementById("root")!).render(<App />);
