import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import UserSettings from './pages/UserSettings';
import MilkSettings from './pages/MilkSettings';
import "./styles.css";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/Signup" element={<Signup />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/user-settings" element={<UserSettings />} />
            <Route path="/milk-settings" element={<MilkSettings />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
