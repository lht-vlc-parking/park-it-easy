# Changelog

Todos los cambios importantes de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
y este proyecto sigue el [Versionado Semántico](https://semver.org/spec/v2.0.0.html).

## [Sin publicar]

### Por agregar

- Notificaciones push para recordatorios de reservas
- Exportación de estadísticas a CSV/PDF
- Integración con calendarios externos (Google Calendar, Outlook)
- Panel de administración para gestión de espacios

---

## [2.1.1] - 2026-01-04

### Arreglado

- Optimización del rendimiento en el panel de estadísticas
- Corrección de errores menores en la validación de formularios
- Mejoras en la experiencia de usuario en dispositivos móviles

---

## [2.1.0] - 2026-01-03

### Agregado

- Panel de estadísticas mejorado con métricas significativas
- Vistas de base de datos optimizadas para consultas de estadísticas
- Métricas de equidad y distribución de reservas
- Análisis de demanda y disponibilidad con mapas de calor
- Estadísticas personales del usuario
- Indicadores de tendencias y predicciones
- Gráficos de utilización de capacidad mensual
- Leaderboard de usuarios más activos

### Cambiado

- Refactorización completa del componente de estadísticas
- Optimización de consultas a la base de datos
- Mejoras en la interfaz de usuario del dashboard

---

## [2.0.0] - 2026-01-03

### Agregado

- **Sistema de Perfiles de Usuario** (`user_profiles`)
  - Perfiles extendidos con información adicional
  - Preferencias de departamento y vehículo predeterminado
  - Configuración de notificaciones personalizadas
  - Avatares y nombres para mostrar

- **Sistema de Auditoría de Reservas** (`booking_audit`)
  - Registro completo de todas las operaciones de reserva
  - Seguimiento de creaciones, cancelaciones y modificaciones
  - Historial de cambios con datos antiguos y nuevos
  - Captura de IP y user agent para seguridad

- **Reservas Recurrentes** (`recurring_bookings`)
  - Patrón semanal de reservas automáticas
  - Días de la semana configurables
  - Fechas de inicio y fin personalizables
  - Generación automática de reservas futuras

- **Sistema de Lista de Espera** (`booking_waitlist`)
  - Cola para espacios completamente reservados
  - Notificaciones automáticas de disponibilidad
  - Sistema de posicionamiento en la cola
  - Estados de espera: esperando, notificado, expirado, cumplido

- **Vistas de Estadísticas en Base de Datos**
  - `user_booking_stats`: Estadísticas por usuario
  - `spot_utilization_stats`: Utilización por espacio
  - `daily_booking_stats`: Estadísticas diarias agregadas
  - `peak_hours_analysis`: Análisis de horas pico

- **Hooks Personalizados**
  - `useBookingAudit`: Gestión del historial de auditoría
  - `useRecurringBookings`: Manejo de reservas recurrentes
  - `useUserProfile`: Gestión de perfiles de usuario
  - `useWaitlist`: Sistema de lista de espera
  - `useStatistics`: Estadísticas mejoradas desde vistas de BD
  - `useParkingSpots`: Gestión de espacios de estacionamiento

- **Modo Oscuro**
  - Implementación completa de tema oscuro
  - Componente `ThemeToggle` en todas las páginas
  - Persistencia de preferencia de tema
  - Soporte para preferencia del sistema

### Cambiado

- Migración a arquitectura V2 con mejoras en la base de datos
- Refactorización de la capa de servicios
- Mejoras en la seguridad con políticas RLS actualizadas
- Optimización de índices de base de datos para mejor rendimiento

### Seguridad

- Corrección de problemas de seguridad en políticas RLS
- Implementación de validación de `search_path` en funciones
- Eliminación de funciones legacy `durations_overlap`
- Mejoras en la protección contra SQL injection
- Validación mejorada de permisos de usuario

---

## [1.0.0] - 2025-10-10

### Agregado

- **Lanzamiento inicial de Park It Easy Office**
- Sistema completo de reservas de estacionamiento para entornos de oficina
- Soporte para automóviles y motocicletas con gestión de capacidad
  - Capacidad de 4 motocicletas por espacio
  - Validación automática de capacidad
- Franjas horarias flexibles: mañana, tarde o día completo
- Estado de reservas y disponibilidad en tiempo real
- Panel de estadísticas para utilización del estacionamiento
- Diseño responsivo con Tailwind CSS
- Implementación con tipos seguros usando TypeScript 5.8
- Validación con Zod schemas
- Suite completa de pruebas (65 tests pasando)
- Entorno de desarrollo con Docker Compose
- Pruebas end-to-end con Playwright
- Documentación completa:
  - README.md con instrucciones de instalación
  - CONTRIBUTING.md con guías de contribución
  - CODE_OF_CONDUCT.md
  - SECURITY.md con política de seguridad
- Autenticación segura con Supabase Auth
- Restricción de dominio de email (@bsmart.com.py)

### Detalles Técnicos

- **Frontend**: React 18.3 con TypeScript 5.8
- **Herramienta de Build**: Vite 7.2
- **Estilos**: Tailwind CSS 3.4 con componentes shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Real-time)
- **Gestión de Estado**: TanStack Query (React Query)
- **Testing**: Vitest + Playwright + Testing Library
- **Linting**: ESLint 9 con reglas estrictas
- **Validación**: Zod para esquemas de datos

### Seguridad

- Políticas de seguridad a nivel de fila (RLS) implementadas
- Protección contra ataques de inyección SQL
- Validación de entrada en cliente y servidor
- Manejo seguro de sesiones de usuario
- Restricción de acceso por dominio de email corporativo

---

## Tipos de cambios

- `Agregado` para nuevas funcionalidades
- `Cambiado` para cambios en funcionalidades existentes
- `Deprecado` para funcionalidades que se eliminarán pronto
- `Eliminado` para funcionalidades ya eliminadas
- `Arreglado` para corrección de bugs
- `Seguridad` en caso de vulnerabilidades

---

## Contribuir al Changelog

Al contribuir a este proyecto, por favor actualiza el changelog con tus cambios en la sección [Sin publicar]. Sigue el formato indicado y categoriza tus cambios apropiadamente.

Para más información sobre cómo contribuir, consulta [CONTRIBUTING.md](CONTRIBUTING.md).

---

_Formato de changelog inspirado en [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)_
