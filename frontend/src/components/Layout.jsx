import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  AlertTriangle,
  ClipboardList,
  BarChart3,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
  X,
  KeyRound,
  Activity
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import ApiStatusHeader from './ApiStatusHeader';

const NAV_OPERACION = [
  { to: '/', label: 'Panel General', icon: LayoutDashboard, exact: true },
  { to: '/incidencias', label: 'Incidencias Logísticas', icon: AlertTriangle },
  { to: '/ordenes-compra', label: 'Órdenes de Compra', icon: ClipboardList },
  { to: '/reportes', label: 'Rentabilidad y Reportes', icon: BarChart3 }
];

const NAV_ADMIN = [
  { to: '/admin/trabajadores', label: 'Gestión de Personal', icon: Users },
  { to: '/admin/auditoria', label: 'Auditoría del Sistema', icon: ShieldCheck },
  { to: '/admin/configuracion', label: 'Configuración ERP', icon: Settings }
];

const TITULOS_RUTA = {
  '/': 'Panel Ejecutivo de Trazabilidad Logística',
  '/incidencias': 'Gestión de Incidencias Logísticas',
  '/ordenes-compra': 'Órdenes de Compra e Ingresos Conciliados',
  '/reportes': 'Control de Rentabilidad, Fill Rate y Exportación',
  '/admin/trabajadores': 'Administración de Trabajadores y Accesos',
  '/admin/auditoria': 'Registro de Auditoría e Inmutabilidad del Sistema',
  '/admin/configuracion': 'Configuración del Motor ERP y Tolerancias'
};

function PasswordModal({ onClose }) {
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setExito('');
    setGuardando(true);
    try {
      await api.put('/api/auth/password', {
        password_actual: passwordActual,
        password_nueva: passwordNueva
      });
      setExito('Contraseña actualizada correctamente.');
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Actualizar contraseña</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
          {exito && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{exito}</div>}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Contraseña actual</label>
            <input
              type="password"
              required
              value={passwordActual}
              onChange={e => setPasswordActual(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nueva contraseña (mínimo 6 caracteres)</label>
            <input
              type="password"
              required
              minLength={6}
              value={passwordNueva}
              onChange={e => setPasswordNueva(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Layout({ children, statusExterno = null, onSyncComplete = null }) {
  const { usuario, esGerencia, cerrarSesion } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openPasswordModal, setOpenPasswordModal] = useState(false);
  const location = useLocation();

  const tituloPagina = TITULOS_RUTA[location.pathname] || 'Droguería Ebenel — Auditoría Logística';

  const renderLinks = items =>
    items.map(item => {
      const Icon = item.icon;
      return (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-600/15'
                : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
            }`
          }
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </NavLink>
      );
    });

  const sidebarBody = (
    <div className="flex h-full flex-col justify-between bg-white">
      <div>
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white shadow-sm">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900">Droguería Ebenel</div>
              <div className="text-[11px] font-medium text-slate-500">Auditoría Logística</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-6 px-3 py-5">
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Operación Logística
            </p>
            <div className="space-y-1">{renderLinks(NAV_OPERACION)}</div>
          </div>

          {esGerencia && (
            <div>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Gerencia y Control
              </p>
              <div className="space-y-1">{renderLinks(NAV_ADMIN)}</div>
            </div>
          )}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="rounded-lg border border-slate-200/80 bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{usuario?.nombre_completo}</p>
              <p className="truncate text-xs text-slate-500">{usuario?.cargo}</p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                esGerencia
                  ? 'border-teal-200 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {esGerencia ? 'Gerencia' : 'Empleado'}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-slate-200/80 pt-2.5">
            <button
              type="button"
              onClick={() => setOpenPasswordModal(true)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Clave</span>
            </button>
            <button
              type="button"
              onClick={cerrarSesion}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar fijo en escritorio */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 h-screen">{sidebarBody}</div>
      </aside>

      {/* Drawer móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/30" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 w-64 border-r border-slate-200 bg-white shadow-xl">{sidebarBody}</div>
        </div>
      )}

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ApiStatusHeader
          titulo={tituloPagina}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onSyncComplete={onSyncComplete}
          statusExterno={statusExterno}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {openPasswordModal && <PasswordModal onClose={() => setOpenPasswordModal(false)} />}
    </div>
  );
}
