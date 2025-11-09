import * as React from "react";
import { ThemeProvider as ShadcnThemeProvider } from "@/components/theme-provider";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: string;
  storageKey?: string;
}

export function ThemeProvider({ children, defaultTheme = "dark", storageKey = "vite-ui-theme" }: ThemeProviderProps) {
  return (
    <ShadcnThemeProvider defaultTheme={defaultTheme} storageKey={storageKey}>
      {children}
    </ShadcnThemeProvider>
  );
}