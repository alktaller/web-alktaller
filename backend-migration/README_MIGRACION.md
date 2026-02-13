# Migración de Backend a Repositorio Privado

Para que los recordatorios de Google Calendar sigan funcionando tras mover tus datos a un repositorio privado, debes configurar la automatización en ese nuevo repositorio.

## Pasos

1.  **Copia archivos**:
    *   Copia la carpeta `.github` que hay junto a este archivo dentro de tu repositorio privado `mis-datos-coche`.
    *   Estructura final requerida en tu repo privado:
        ```text
        /
        ├── .github/
        │   ├── workflows/
        │   │   └── reminders.yml
        │   └── scripts/
        │       └── UpdateCalendar.js
        └── data/
            └── car-data.json  (este se crea solo al usar la web)
        ```

2.  **Configura el Secreto**:
    *   Ve a tu repositorio privado en GitHub > Settings > Secrets and variables > Actions.
    *   Crea un nuevo repositorio secret llamado `GOOGLE_CALENDAR_CREDENTIALS`.
    *   Pega el contenido JSON de tu cuenta de servicio de Google Cloud (el mismo que usabas antes).

3.  **Permisos**:
    *   Ve a Settings > Actions > General > Workflow permissions.
    *   Asegúrate de que está marcado "Read and write permissions".

¡Listo! Github Actions se ejecutará cada mañana a las 9:00 AM para comprobar tus datos protegidos.
