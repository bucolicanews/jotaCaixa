import { useContext } from "react";
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
    throw new Error("useTheme must be used within ThemeProvider");
  }
  
  const { theme, setTheme, resolvedTheme } = context;
  
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