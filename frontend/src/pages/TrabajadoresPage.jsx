import React, { useEffect, useState, useCallback } from 'react';
import { UserPlus, Edit3, ShieldBan, ShieldCheck, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import { formatearFechaLima } from '../utils/formatters';

function ModalTrabajador({ trabajador, onClose, onSaved }) {
  const esEdicion = Boolean(trabajador);
  const [nombre, setNombre] = useState(trabajador?.nombre_completo || '');
  const [email, setEmail] = useState(trabajador?.email || '');
  const [cargo, setCargo] = useState(trabajador?.cargo || 'Operador Logístico');
  const [rol, setRol] = useState(trabajador?.rol || 'EMPLEADO');
  const [password, setPassword] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const payload = { nombre_completo: nombre, email, cargo, rol };
      if (!esEdicion || password.trim()) {
        payload.password = password;
      }
      if (esEdicion) {
        await api.put(`/api/admin/usuarios/${trabajador.id}`, payload);
      } else {
        await api.post('/api/admin/usuarios', payload);
      }
      onSaved();
      onClose();
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
          <h3 className="text-base font-semibold text-slate-900">
            {esEdicion ? 'Editar trabajador' : 'Agregar nuevo trabajador'}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={guardar} className="space-y-4">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nombre completo</label>
            <input
              type="text"
              required
              minLength={3}
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Correo electrónico</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Cargo</label>
              <input
                type="text"
                required
                value={cargo}
                onChange={e => setCargo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Rol del sistema</label>
              <select
                value={rol}
                onChange={e => setRol(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                <option value="EMPLEADO">EMPLEADO</option>
                <option value="GERENCIA">GERENCIA</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {esEdicion ? 'Nueva contraseña (opcional, dejar vacío para mantener)' : 'Contraseña temporal (mín. 6 caracteres)'}
            </label>
            <input
              type="password"
              required={!esEdicion}
              minLength={esEdicion ? 0 : 6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear trabajador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TrabajadoresPage() {
  const { usuario: usuarioActual } = useAuth();
  const [lista, setLista] = useState([]);
  const [resumen, setResumen] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await api.get('/api/admin/usuarios');
      setLista(res.data || []);
      setResumen(res.resumen || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiarAcceso(trabajador) {
    setError('');
    try {
      await api.patch(`/api/admin/usuarios/${trabajador.id}/acceso`, {
        activo: !trabajador.activo
      });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
            Total: {resumen.total ?? 0}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
            Activos: {resumen.activos ?? 0}
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-medium text-rose-700">
            Revocados: {resumen.revocados ?? 0}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditTarget(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
        >
          <UserPlus className="h-4 w-4" />
          <span>Agregar trabajador</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {cargando ? (
          <div className="p-10 text-center text-sm text-slate-500">Cargando personal registrado...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Trabajador</th>
                  <th className="px-5 py-3">Cargo</th>
                  <th className="px-5 py-3">Rol</th>
                  <th className="px-5 py-3">Estado de Acceso</th>
                  <th className="px-5 py-3">Último Acceso</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {lista.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{u.nombre_completo}</div>
                      <div className="text-[11px] text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">{u.cargo}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                          u.rol === 'GERENCIA'
                            ? 'border-teal-200 bg-teal-50 text-teal-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                          u.activo
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-rose-200 bg-rose-50 text-rose-700'
                        }`}
                      >
                        {u.activo ? 'Activo' : 'Acceso Revocado'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 tabular-nums">
                      {formatearFechaLima(u.ultimo_acceso)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditTarget(u);
                            setModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Editar</span>
                        </button>

                        {u.id !== usuarioActual?.id && (
                          <button
                            type="button"
                            onClick={() => cambiarAcceso(u)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                              u.activo
                                ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {u.activo ? (
                              <>
                                <ShieldBan className="h-3.5 w-3.5" />
                                <span>Quitar acceso</span>
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="h-3.5 w-3.5" />
                                <span>Restaurar</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <ModalTrabajador
          trabajador={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={cargar}
        />
      )}
    </Layout>
  );
}
