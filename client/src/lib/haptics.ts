import { Capacitor } from "@capacitor/core";

type Kind = "light" | "medium" | "success";

/**
 * Small tactile confirmation for taps that change something (save, alert, buy).
 * Uses the native haptic engine inside the app and does nothing on the web.
 */
export async function haptic(kind: Kind = "light"): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
    else await Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {
    // Haptics are a nicety; never let them break an action.
  }
}
