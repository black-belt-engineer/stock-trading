import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { keycloakify } from "keycloakify/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    keycloakify({
      themeName: "stock-platform",
      // The app has no account console of its own: users manage their profile through
      // Keycloak actions (K5), so only the login theme is built.
      accountThemeImplementation: "none",
      // One JAR for Keycloak 25 and above; the stack runs 26.x.
      keycloakVersionTargets: {
        "22-to-25": false,
        "all-other-versions": "keycloak-theme.jar"
      }
    })
  ]
});
