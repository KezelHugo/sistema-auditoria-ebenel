# Sistema Web de Auditoría y Trazabilidad Logística — Droguería Ebenel

Sistema web externo y desacoplado para la auditoría automática de Órdenes de Compra (OC), detección de incidencias logísticas, gestión de liberación de capital y control de rentabilidad (Fill Rate y ROI) para **Droguería Ebenel (HNOS DIAZ & ASOCIADOS S.A.C. — RUC 20602460470)**.

## Stack Tecnológico Confirmado
- **Frontend:** React + Vite + Tailwind CSS + Recharts
- **Backend:** Node.js + Express + `node-cron` (sincronización cada 5 minutos) + JWT (`bcryptjs`, `jsonwebtoken`)
- **Base de Datos:** PostgreSQL (Supabase / Neon)
- **Integración ERP:** Consumo estricto de solo lectura (`GET`) hacia `simulador-erp-ebenel`
