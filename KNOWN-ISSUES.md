# KNOWN-ISSUES.md — Issues Pendientes

> AI News Intelligence Platform  
> Última actualización: 17 de abril de 2026

---

## 1. Sin refresh manual de noticias en la página principal

No existe un botón ni mecanismo para que el usuario refresque el feed de noticias manualmente desde la página principal. La única forma de ver contenido nuevo es recargar la página del navegador.

**Impacto:** El usuario no tiene visibilidad de cuándo hay artículos nuevos disponibles sin recargar manualmente.

---

## 2. Suscripción de correos sin validación end-to-end

El endpoint `/api/email-subscribe` y el componente `EmailSubscribe` están implementados, pero no se ha validado completamente el flujo de entrega del weekly brief por correo electrónico. Requiere configurar `RESEND_API_KEY` y verificar que los emails se reciban correctamente.

**Impacto:** La funcionalidad de suscripción puede no estar operativa en producción.

---

## 3. Sin interfaz para agregar fuentes de información

Las 5 fuentes de datos (HuggingFace, OpenAI, DeepMind, Arxiv, Hacker News) están hardcodeadas en los scrapers. No hay UI ni API para agregar nuevas fuentes, APIs externas, o feeds RSS personalizados sin modificar código.

**Impacto:** Expandir la cobertura de noticias requiere intervención directa en el código fuente.

---

## 4. Tags dinámicos no generan noticias con tags nuevos

El pipeline LLM genera tags sugeridos por IA y estos aparecen correctamente en la interfaz, pero los artículos nuevos no se están clasificando con los tags generados dinámicamente. El filtro por tags nuevos no retorna resultados.

**Impacto:** Los tags dinámicos son visibles pero no funcionales como criterio de filtrado en el feed.
