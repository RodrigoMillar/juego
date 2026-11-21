# Despliegue

## Por que Netlify no crea salas

Netlify solo publica archivos estaticos (`dist`). El juego necesita ademas el
servidor Node con Socket.IO que esta en `server/index.js`. Ese servidor no se
ejecuta en Netlify, por eso al crear una sala aparece **"El servidor no
respondio"**.

La solucion es publicar el servidor Node en un hosting con WebSockets (Render,
Railway, Fly.io o un VPS) y decirle al frontend de Netlify cual es su URL.

## Opcion recomendada: backend en Render + frontend en Netlify

### 1. Subir el proyecto a GitHub

Render necesita un repositorio Git. Sube la carpeta `neon-racer` a GitHub.

### 2. Crear el backend en Render

1. Entra a <https://render.com> y crea una cuenta.
2. **New > Blueprint** y elige el repositorio.
3. Render detecta `render.yaml` y crea el servicio.
4. Espera a que termine el deploy y copia la URL, por ejemplo:
   `https://puente-alto-street-racing.onrender.com`
5. Abre esa URL: debe cargar el juego. Si carga, el backend y el frontend
   estan funcionando juntos.

> El plan gratuito de Render duerme el servicio tras un rato sin uso. La
> primera conexion puede tardar hasta un minuto; despues funciona normal.

### 3. Conectar Netlify con el backend

1. En Netlify abre **Site configuration > Environment variables**.
2. Agrega:
   - **Key:** `VITE_SERVER_URL`
   - **Value:** la URL de Render, sin `/` al final.
3. Ve a **Deploys > Trigger deploy > Clear cache and deploy site**.
4. Prueba crear una sala desde la URL de Netlify.

El servidor ya tiene CORS habilitado, asi que el frontend de Netlify puede
conectarse directamente al backend de Render.

## Opcion simple: todo en Render

Si no quieres mantener dos sitios, usa directamente la URL de Render. El
servidor Express sirve `dist` y Socket.IO en el mismo dominio, sin variables
de entorno ni CORS.

## Variables

| Variable | Donde | Valor |
| --- | --- | --- |
| `PORT` | Render | Lo asigna el hosting automaticamente |
| `VITE_SERVER_URL` | Netlify | URL publica del backend en Render |
