# AlkTaller 🚗

Gestión sencilla de vehículos, repostajes y recordatorios.

## Configuración Segura (Recomendada)

Para mantener tu web accesible pero tus datos **Privados**:

1.  **Crea un repositorio Privado** en GitHub (ej: `mis-datos-coche`).
2.  En la pantalla de Login de AlkTaller:
    *   **Usuario**: Tu usuario.
    *   **Repositorio de Datos**: `mis-datos-coche`.
    *   **Token**: Tu Personal Access Token (debe tener permisos sobre el repo privado).

De esta forma, la web (frontend) es pública, pero tus datos viajan encriptados desde tu navegador directamente a tu repositorio privado. Nadie más puede verlos.

## Estructura

*   `index.html`: Web App (Single Page).
*   `css/`: Estilos (Tema AlkTaller: Blanco/Azul/Naranja).
*   `js/`: Lógica de la aplicación y almacenamiento en GitHub API.
*   `.github/workflows`: Automatización para el calendario y despliegue.
