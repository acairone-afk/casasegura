# CasaSegura IoT — panel web (GitHub Pages + MQTT)

El panel se conecta al broker público **HiveMQ** (`broker.hivemq.com`) y el ESP32 también.
Por eso funcionan aunque estén en redes distintas. Todos los mensajes viajan cifrados con la contraseña.

## Publicarlo en GitHub Pages
1. Entrá a github.com → **New repository** → nombre `casasegura` → **Public** → Create.
2. **Add file → Upload files** → arrastrá TODO lo de esta carpeta (incluida `assets`) → Commit.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch `main` / `(root)` → Save.
4. En 1–2 minutos queda en `https://TU-USUARIO.github.io/casasegura/`.

## Usarlo
1. Cargá `casa_segura_mqtt.ino` en el ESP32 (con tu Wi‑Fi, contraseña e `ID_CASA`).
2. Abrí la página, en *Conectá tu ESP32* verificá el código de la casa y tocá **Conectar**.
3. Iniciá sesión con la contraseña (`CLAVE_ACCESO`) y vinculá el celu con el botón BOOT.

`ID_CASA` del `.ino` y `codigoCasa` de `config.js` tienen que ser iguales.
