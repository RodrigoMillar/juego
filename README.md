# Puente Alto Street Racing

Juego de carreras 3D arcade para navegador con salas online en tiempo real y autos personalizables. El cliente está hecho con **Three.js** y el servidor de salas con **Socket.IO**.

## Qué incluye

- Carreras 3D con cámara persecutoria, 3 vueltas y hasta **6 pilotos** por sala.
- Salas privadas con código de 5 caracteres y enlace de invitación (`?sala=CODIGO`).
- Cuenta atrás sincronizada, HUD de posición/vuelta/tiempo/velocidad, aviso de fuera de pista y resultados finales.
- **Garage** con vista previa 3D: 14 autos (clásicos, camionetas, ambulancia, micro y van), color principal y de detalles, acabado (brillante/mate/metalizado), 3 kits de carrocería y reparto de **8 puntos** entre velocidad, aceleración y agarre.
- Audio: motor sintetizado que responde al acelerador y música de fondo (intenta cargar `public/music/return-of-the-tres.mp3`; si no existe, suena un synthwave original; también puedes cargar tu propio MP3).
- Física arcade: aceleración, frenada, marcha atrás, giro dependiente de la velocidad y roce contra las barreras.
- Pintura y mejoras se guardan en `localStorage`.
- Servidor autoritativo para salas, listos, inicio y resultados (las posiciones se sincronizan entre clientes a ~13 Hz).

## Requisitos

- Node.js 20 o superior (probado con Node 24).

## Ejecutar en local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. El servidor de salas escucha en `http://localhost:3001` y Vite le hace proxy para `/socket.io`.

Para probar el multijugador tú solo, abre dos pestañas o dos navegadores: crea una sala en una, copia el código y únete desde la otra. Marca «Estoy listo» en el invitado y pulsa «Iniciar carrera» en el anfitrión.

## Jugar con amigos

### En la misma red (LAN)

1. Ejecuta `npm run dev`.
2. Comparte la dirección `Network` que muestra Vite, por ejemplo `http://192.168.1.12:5173`.
3. Si no conecta, permite Node.js en el Firewall de Windows para redes privadas.

### En internet (deploy)

```bash
npm run build
npm start
```

El servidor Express sirve la carpeta `dist` y Socket.IO en el mismo puerto (`PORT`, por defecto `3001`). Súbelo a cualquier hosting que ejecute Node y permita WebSockets (Render, Railway, Fly.io, un VPS con Nginx…).

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Variables: `PORT` (la asigna el hosting)

## Controles

| Acción | Tecla |
| --- | --- |
| Acelerar | `W` / `↑` |
| Frenar / marcha atrás | `S` / `↓` |
| Girar | `A` / `D` o `←` / `→` |
| Freno de mano | `Espacio` |
| Volver a la pista | `R` |
| Salir de la carrera | Botón «Salir» |

## Estructura

```
neon-racer/
├─ index.html            Interfaz (menú, lobby, garage, HUD, resultados)
├─ server/index.js       Express + Socket.IO: salas, estados, resultados
├─ src/
│  ├─ main.ts            Orquestación de UI, socket y ciclo de partida
│  ├─ net.ts             Cliente Socket.IO
│  ├─ types.ts           Tipos compartidos y normalización del auto
│  ├─ carModel.ts        Construcción procedural del auto 3D
│  ├─ game/
│  │  ├─ Game.ts         Escena, física, vueltas, cámara y red
│  │  └─ track.ts        Pista, barreras, decorado y cielo
│  └─ ui/
│     └─ GaragePreview.ts Vista previa 3D del garage
└─ vite.config.ts        Proxy de Socket.IO en desarrollo
```

## Cómo funciona la personalización

Cada nivel de mejora va de 0 a 5 y hay un presupuesto total de 8 puntos, así que no se puede maximizar todo:

- **Velocidad punta:** 46 + 3 × nivel unidades/s.
- **Aceleración:** 20 + 2,4 × nivel.
- **Agarre:** sube la velocidad de giro y reduce la pérdida fuera de pista.

El servidor valida colores, estilos y presupuesto antes de aceptar el auto de cada jugador.

## Siguiente pasos recomendados

1. **Audio:** motor, derrapes y cuenta atrás (Web Audio API).
2. **Controles táctiles** para móvil y mando/gamepad.
3. **Más pistas** y un selector antes de la carrera.
4. **Reconexión** a la sala y limpieza de autos de jugadores que se desconectan a mitad de carrera.
5. **Servidor más autoritativo / anti-cheat:** validar vueltas y tiempos en el servidor (ahora la simulación es de confianza del cliente para que vaya fluido).
6. **Persistencia:** cuentas, récords, monedas y piezas desbloqueables.
7. **Chat de sala y espectadores** para los que llegan tarde.

## Notas

- El tráfico de posiciones es de ~13 mensajes por segundo por jugador; con 6 jugadores es muy ligero.
- El código de sala se genera sin caracteres ambiguos (`0/O`, `1/I`) para dictarlo por voz.
- En desarrollo se expone `window.__neon` (socket, sala y juego) para depurar desde la consola.
