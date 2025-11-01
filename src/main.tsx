import { createRoot } from "react-dom/client";
import { App } from "./App.tsx"; // Corrigido para named import
import "./globals.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
}