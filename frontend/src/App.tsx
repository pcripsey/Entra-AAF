import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/common/Toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import EntraConfig from './pages/EntraConfig';
import AAFConfig from './pages/AAFConfig';
import Sessions from './pages/Sessions';
import AttributeMapping from './pages/AttributeMapping';
import AuditLogs from './pages/AuditLogs';
import BackendLogs from './pages/BackendLogs';
import EntraRedirect from './pages/EntraRedirect';

function isAuthenticated(): boolean {
  return localStorage.getItem('isAuthenticated') === 'true';
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/entra-redirect" element={<EntraRedirect />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/config/entra" element={<ProtectedRoute><EntraConfig /></ProtectedRoute>} />
            <Route path="/config/aaf" element={<ProtectedRoute><AAFConfig /></ProtectedRoute>} />
            <Route path="/sessions" element={<ProtectedRoute><Sessions /></ProtectedRoute>} />
            <Route path="/attribute-mapping" element={<ProtectedRoute><AttributeMapping /></ProtectedRoute>} />
            <Route path="/audit-logs" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
            <Route path="/backend-logs" element={<ProtectedRoute><BackendLogs /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
