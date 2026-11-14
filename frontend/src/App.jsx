import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import IncidenciasPage from './pages/IncidenciasPage';
import OrdenesPage from './pages/OrdenesPage';
import ProveedoresPage from './pages/ProveedoresPage';
import ReportesPage from './pages/ReportesPage';
import TrabajadoresPage from './pages/TrabajadoresPage';
import AuditoriaPage from './pages/AuditoriaPage';
import ConfiguracionPage from './pages/ConfiguracionPage';

function RutaProtegida({ children, requiereGerencia = false }) {
  const { usuario, cargando, esGerencia } = useAuth();

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Verificando sesión corporativa...
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (requiereGerencia && !esGerencia) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function RutasApp() {
  const { usuario } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route
        path="/"
        element={
          <RutaProtegida>
            <DashboardPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/incidencias"
        element={
          <RutaProtegida>
            <IncidenciasPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/ordenes-compra"
        element={
          <RutaProtegida>
            <OrdenesPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/proveedores"
        element={
          <RutaProtegida>
            <ProveedoresPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/reportes"
        element={
          <RutaProtegida>
            <ReportesPage />
          </RutaProtegida>
        }
      />

      {/* Rutas administrativas exclusivas para GERENCIA */}
      <Route
        path="/admin/trabajadores"
        element={
          <RutaProtegida requiereGerencia>
            <TrabajadoresPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/admin/auditoria"
        element={
          <RutaProtegida requiereGerencia>
            <AuditoriaPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/admin/configuracion"
        element={
          <RutaProtegida requiereGerencia>
            <ConfiguracionPage />
          </RutaProtegida>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RutasApp />
      </BrowserRouter>
    </AuthProvider>
  );
}
