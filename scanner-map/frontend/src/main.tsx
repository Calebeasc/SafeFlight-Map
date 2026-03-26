import React from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./pages/Dashboard";
import "./styles/app.css";
createRoot(document.getElementById("root")!).render(<Dashboard />);
