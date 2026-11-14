# Sistema Web de Auditoría y Trazabilidad Logística — Droguería Ebenel

Sistema web externo y desacoplado con arquitectura cliente-servidor para la auditoría automática de Órdenes de Compra (OC), conciliación contra Ingresos a Almacén, gestión de incidencias logísticas, control de rentabilidad y auditoría de usuarios para **Droguería Ebenel (HNOS DIAZ & ASOCIADOS S.A.C. — RUC 20602460470)**.

## Arquitectura y Módulos Implementados

1. **Módulo 1 — Integración y Extracción de Datos (Backend):**
   - Motor desacoplado de **solo lectura (`GET`)** que consulta la API de `simulador-erp-ebenel` cada **5 minutos** mediante `node-cron` (`/api/v1/erp/sincronizar` con ventana incremental y solapamiento de 10 minutos, recuperación tras reinicio `last_reset_at` y paginación completa automática en carga inicial).
2. **Módulo 2 — Auditoría y Conciliación Algorítmica:**
   - Cruce automático línea por línea de cantidades solicitadas vs. recibidas (`ENTREGA_INCOMPLETA` ~48%), precios pactados vs. facturados / retención (`PRODUCTO_INMOVILIZADO_PRECIO` ~40%) y fechas pactadas vs. recepción / vencimiento en tránsito (`RETRASO_ENTREGA` ~12%).
3. **Módulo 3 — Panel de Indicadores Visuales (Dashboard General):**
   - Diseño claro, limpio, empresarial minimalista y funcional con auto-actualización cada 5 minutos, indicador superior global en vivo (`API ERP: ONLINE/OFFLINE` y `Última actualización`), Fill Rate, gráfico Pareto y ranking de laboratorios.
4. **Módulo 4 — Gestión de Incidencias Logísticas:**
   - Bandeja segmentada por tipo de falla (Faltantes, Inmovilizados, Retrasos). Tanto `GERENCIA` como `EMPLEADO` pueden cambiar estados, registrar documentos de respaldo (Nota de Crédito / Guía) y liberar capital retenido.
5. **Módulo 5 — Reportes y Control de Rentabilidad:**
   - Seguimiento de Capital Inmovilizado vs. Liberado (meta S/ 10,000/mes), Lucro Cesante Recuperado (meta S/ 2,000/mes), Fill Rate, despachos protegidos sobre línea base (400/mes, 45 afectados), ahorro operativo, exportación a **CSV con BOM UTF-8** e impresión **PDF**.
6. **Seguridad, Roles y Auditoría (`GERENCIA` / `EMPLEADO`):**
   - Autenticación JWT con `token_version` en vivo (revocar acceso invalida la sesión al instante).
   - Panel de trabajadores (`Agregar`, `Editar`, `Quitar / Restaurar acceso`), configuración de tolerancias y bitácora completa (`auditoria_sistema`) exclusivos de `GERENCIA`.

---

## Ejecución Local y Pruebas

### 1. Instalar dependencias
```bash
cd sistema-auditoria-ebenel
npm run install:all
```

### 2. Configurar variables de entorno del Backend
Copia `backend/.env.example` a `backend/.env` y coloca tu cadena de conexión PostgreSQL (`DATABASE_URL`) y `ERP_API_BASE_URL` (por defecto `https://simulador-erp-ebenel.onrender.com`).

> **Credenciales iniciales (solo desarrollo / seed inicial si la tabla `usuarios` está vacía):**
> - **Gerencia:** `gerencia@ebenel.com.pe` / `admin123` (cámbialas en producción mediante `SEED_GERENCIA_PASSWORD` o desde la plataforma).
> - **Empleado:** `logistica@ebenel.com.pe` / `logistica123`.

### 3. Ejecutar pruebas automatizadas del Backend (sin necesidad de BD externa)
```bash
npm run test:backend
```

### 4. Levantar Backend y Frontend en desarrollo
Terminal 1 (Backend en `http://localhost:4000`):
```bash
npm run dev:backend
```
Terminal 2 (Frontend en `http://localhost:5173`):
```bash
npm run dev:frontend
```

---

## Guía Paso a Paso para Despliegue en Producción (Gratis en PaaS)

Para mantener el sistema desacoplado del simulador ERP y evitar problemas de costos:

### Paso 1: Crear un proyecto nuevo en GitHub
1. Crea un nuevo repositorio privado o público en GitHub llamado `sistema-auditoria-ebenel`.
2. Sube el contenido de esta carpeta (`git remote add origin <URL>`, `git push -u origin main --all`).

### Paso 2: Crear una Base de Datos PostgreSQL gratuita en Supabase (separada del Simulador)
> Importante: aunque esté en la misma cuenta de Supabase, **crea un proyecto nuevo e independiente** (por ejemplo `ebenel-auditoria-db`) para demostrar la arquitectura desacoplada respecto al ERP.
1. Entra a [https://supabase.com](https://supabase.com) → **New Project** → nombre `ebenel-auditoria-db`.
2. Ve a **Project Settings → Database** (o botón **Connect** arriba) → copia la cadena del **Session Pooler** (puerto `5432`, compatible IPv4 con Render):
   `postgresql://postgres.[PROJECT_REF]:[TU_PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`
3. *No necesitas ejecutar SQL manualmente:* al arrancar el backend por primera vez, `src/db/init.js` creará todas las tablas, índices y los dos usuarios iniciales automáticamente.

### Paso 3: Desplegar el Backend en Render
1. Entra a [https://dashboard.render.com](https://dashboard.render.com) → **New + → Web Service**.
2. Conecta tu repositorio `sistema-auditoria-ebenel`.
3. Configura los parámetros del servicio:
   - **Name:** `sistema-auditoria-ebenel-api`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install --omit=dev`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
   - **Health Check Path:** `/health`
4. Agrega las siguientes **Environment Variables** en Render:
   - `NODE_ENV` = `production`
   - `PORT` = `4000`
   - `DATABASE_URL` = *(la URL de Session Pooler de Supabase del Paso 2)*
   - `JWT_SECRET` = *(una clave aleatoria larga de al menos 32 caracteres)*
   - `JWT_EXPIRES_IN` = `12h`
   - `ERP_API_BASE_URL` = `https://simulador-erp-ebenel.onrender.com`
   - `ERP_API_KEY` = *(el mismo valor que pusiste en `ERP_API_KEY` del simulador en Render, o déjalo vacío si el simulador no exige clave)*
   - `CORS_ORIGIN` = `http://localhost:5173` *(luego en el Paso 5 lo actualizaremos con la URL final de Vercel)*
   - `SEED_GERENCIA_PASSWORD` = *(tu contraseña segura para Gerencia)*
   - `SEED_EMPLEADO_PASSWORD` = *(tu contraseña segura para Empleado)*
5. Haz clic en **Create Web Service** y espera a que el log muestre `[EBENEL-AUDITORIA] Servidor backend escuchando...` y `Sync inicial completado`. Copia tu URL pública (ej. `https://sistema-auditoria-ebenel-api.onrender.com`).

### Paso 4: Desplegar el Frontend en Vercel
1. Entra a [https://vercel.com](https://vercel.com) → **Add New → Project** y selecciona tu repositorio `sistema-auditoria-ebenel`.
2. En la configuración del proyecto:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Haz clic en **Edit** y selecciona `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. En **Environment Variables**, agrega:
   - **Name:** `VITE_API_URL`
   - **Value:** `https://sistema-auditoria-ebenel-api.onrender.com` *(la URL de tu Backend en Render del Paso 3, SIN `/` al final)*
4. Haz clic en **Deploy**. Cuando termine, copia el dominio asignado por Vercel (ej. `https://sistema-auditoria-ebenel.vercel.app`).

### Paso 5: Vincular CORS en Render y verificar
1. Vuelve a Render → tu servicio `sistema-auditoria-ebenel-api` → **Environment**.
2. Edita `CORS_ORIGIN` con la URL exacta de Vercel (si deseas probar también en local: `https://sistema-auditoria-ebenel.vercel.app,http://localhost:5173`).
3. Guarda los cambios (Render reiniciará automáticamente el backend en unos segundos).
4. Abre tu URL de Vercel, inicia sesión y comprueba en la barra superior que aparezca **`API ERP: ONLINE`** y la **`Última act.`** reciente.

### Paso 6: Mantener activos los servicios gratuitos 24/7 (Keep-Alive para Cron cada 5 minutos)
Como el plan gratuito de Render suspende el servidor tras **15 minutos sin tráfico HTTP** (lo que detendría el `node-cron` de 5 minutos), configura un ping gratuito cada **10-14 minutos** usando **cron-job.org** (recomendado) o GitHub Actions:
1. Regístrate gratis en [https://cron-job.org](https://cron-job.org).
2. Crea dos cronjobs simples (`GET`):
   - Job 1: `https://sistema-auditoria-ebenel-api.onrender.com/health` cada **10 minutos**.
   - Job 2: `https://simulador-erp-ebenel.onrender.com/health` cada **10 minutos** (si aún no tiene ping activo).
3. Adicionalmente, en tu repositorio de GitHub `sistema-auditoria-ebenel`, puedes ir a **Settings → Secrets and variables → Actions** y crear el secret `RENDER_BACKEND_URL` con la URL de tu backend en Render como respaldo adicional (`.github/workflows/keep-alive.yml`).
