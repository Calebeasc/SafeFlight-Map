import React from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import Dashboard from "./pages/Dashboard";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(<Dashboard />);
