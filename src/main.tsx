import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { surveillerMisesAJour } from "@/lib/miseAJour";
// @ts-ignore
import "@fontsource/inter/400.css";
// @ts-ignore
import "@fontsource/inter/500.css";
// @ts-ignore
import "@fontsource/inter/600.css";
// @ts-ignore
import "@fontsource/inter/700.css";
// @ts-ignore
import "@fontsource-variable/plus-jakarta-sans/wght.css";
// @ts-ignore
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

surveillerMisesAJour();

// Retire le paramètre ajouté par « Mettre à jour maintenant »
if (new URLSearchParams(location.search).has("maj")) {
  const url = new URL(location.href);
  url.searchParams.delete("maj");
  history.replaceState(history.state, "", url.toString());
}
