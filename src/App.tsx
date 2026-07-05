import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import NewForm from "./pages/NewForm";
import ConnectGoogle from "./pages/ConnectGoogle";
import GoogleCallback from "./pages/GoogleCallback";
import AIQuiz from "./pages/AIQuiz";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import FormAnalytics from "./pages/FormAnalytics";
import FormPreview from "./pages/FormPreview";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-quiz"
        element={
          <ProtectedRoute>
            <AIQuiz />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/new"
        element={
          <ProtectedRoute>
            <NewForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/analytics/:formId"
        element={
          <ProtectedRoute>
            <FormAnalytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/connect-google"
        element={
          <ProtectedRoute>
            <ConnectGoogle />
          </ProtectedRoute>
        }
      />
      <Route path="/google/callback" element={<GoogleCallback />} />
      <Route path="/preview/:formId" element={<FormPreview />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/app" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}