import { useTheme as useNextTheme } from "next-themes";

interface ThemeContextType {
  theme: string | undefined;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
}

// Hook para acessar o tema facilmente
export function useTheme(): ThemeContextType {
  const context = useNextTheme();
  
  if (!context) {
    // Isso só deve acontecer se o hook for chamado fora do ThemeProvider
    throw new Error("useTheme must be used within ThemeProvider");
  }
  
  const { theme, setTheme, resolvedTheme } = context;
  
  // Determina o tema atual (se for 'system', usa o resolvedTheme)
  const currentTheme = theme === 'system' ? resolvedTheme : theme;

  const toggleTheme = () => {
    setTheme(currentTheme === "dark" ? "light" : "dark");
  };

  return { 
    theme: currentTheme, 
    setTheme, 
    toggleTheme 
  };
}