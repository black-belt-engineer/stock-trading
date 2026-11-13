import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { StreamProvider } from "./stream/StreamProvider";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

// The stream provider sits outside the routes so the connection survives navigation.
createRoot(root).render(
  <BrowserRouter>
    <StreamProvider>
      <App />
    </StreamProvider>
  </BrowserRouter>,
);
