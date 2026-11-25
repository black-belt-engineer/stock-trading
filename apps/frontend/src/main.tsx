import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

// The stream provider sits inside the route guard (auth/RouteGuards.tsx), so it
// runs only with a session and still survives navigation between pages.
createRoot(root).render(
  <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </ThemeProvider>,
);
