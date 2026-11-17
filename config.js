// Configuración del panel. Tiene que coincidir con el código del ESP32.
window.CASASEGURA = {
  // Igual que ID_CASA en casa_segura_mqtt.ino. Se puede cambiar también desde el panel.
  codigoCasa: 'casa-bw66isi0fz',
  // Broker MQTT público y gratuito (conexión segura por WebSocket, necesaria en GitHub Pages).
  broker: 'wss://broker.emqx.io:8084/mqtt'
};
