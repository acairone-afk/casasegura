function leer(clave, defecto = '') {
  try { return localStorage.getItem(clave) || defecto; } catch (e) { return defecto; }
}
function guardar(clave, valor) {
  try { if (valor) localStorage.setItem(clave, valor); else localStorage.removeItem(clave); } catch (e) {}
}

const CONFIG = window.CASASEGURA || {};
const DEMO_CLAVE = 'casa2026';

function idNuevo(largo) {
  const hex = '0123456789abcdef';
  const azar = crypto.getRandomValues(new Uint8Array(largo));
  return Array.from(azar, (b) => hex[b % 16]).join('');
}
// Id propio de este navegador (en MQTT no hay IP: el registro muestra este id).
let idNavegador = leer('casasegura-id');
if (!/^[a-z0-9]{4,24}$/.test(idNavegador)) { idNavegador = idNuevo(12); guardar('casasegura-id', idNavegador); }

const state = {
  mode: leer('casasegura-mode', 'demo'),
  ip: leer('casasegura-casa', CONFIG.codigoCasa || ''),
  llave: leer('casasegura-llave'),
  session: leer('casasegura-llave') ? leer('casasegura-sesion') : '',
  device: leer('casasegura-dispositivo'),
  paired: false,
  deviceName: '',
  lock: 'CERRADA',
  alarm: 'DESARMADA',
  distance: 68.4,
  lightLevel: 720,
  presence: false,
  lightDetected: false,
  alarmReason: 'Ninguno',
  lastEvent: 'Sistema listo para la demostración.',
  lastTime: 'Ahora',
  busy: false,
  demoTick: 0,
  log: [],
  // Simulación de seguridad en modo demostración
  demo: {session: false, paired: false, name: '', fails: 0, lockedUntil: 0, log: []}
};

const $ = (id) => document.getElementById(id);
const ipInput = $('espIp');
ipInput.value = state.ip;

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3600);
}

function setEvent(text) {
  state.lastEvent = text;
  state.lastTime = new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'});
}

function normalizedAlarm(value) {
  const alarm = String(value || '').toUpperCase();
  if (['DESARMADA', 'ARMADA', 'DISPARADA'].includes(alarm)) return alarm;
  if (alarm === 'ACTIVADA') return 'ARMADA';
  if (alarm === 'DESACTIVADA') return 'DESARMADA';
  return state.alarm;
}

function hasSession() {
  return state.mode === 'demo' ? state.demo.session : Boolean(state.session);
}

function setMessage(id, text, kind = '') {
  $(id).textContent = text || '';
  $(id).className = `form-help ${kind}`;
}

function render() {
  $('lockState').textContent = state.lock;
  $('alarmState').textContent = state.alarm;
  $('alarmState').className = `big-state alarm-state ${state.alarm.toLowerCase()}`;
  $('lockHint').textContent = state.lock === 'ABIERTA' ? 'La entrada está desbloqueada.' : 'La puerta está protegida.';
  const alarmHints = {
    DESARMADA: 'No está vigilando; los sensores siguen informando.',
    ARMADA: 'Vigilancia silenciosa activa.',
    DISPARADA: '¡Alarma disparada! Solo se detiene al desarmar.'
  };
  $('alarmHint').textContent = alarmHints[state.alarm] || alarmHints.DESARMADA;
  $('lastEvent').textContent = state.lastEvent;
  $('lastTime').textContent = state.lastTime;
  $('actionState').textContent = state.busy ? 'Procesando orden…' : (hasSession() ? 'Listo para operar' : 'Iniciá sesión para operar');
  $('heroMode').textContent = state.mode === 'demo' ? 'MODO DEMOSTRACIÓN ACTIVO' : 'CONEXIÓN CON ESP32';
  $('connectionLabel').textContent = state.mode === 'demo' ? 'Modo demostración' : 'ESP32 configurado';
  $('connectionDetail').textContent = state.mode === 'demo' ? `Probá la interfaz sin hardware. Contraseña de prueba ${DEMO_CLAVE}` : `Casa ${state.ip || 'sin código'} · ${espOnline ? 'central en línea' : 'central desconectada'}`;
  if (state.mode === 'demo') $('connectionDot').className = 'connection-dot demo';
  $('modeToggle').textContent = state.mode === 'demo' ? 'Conectar ESP32' : 'Volver a demo';
  $('lockTrack').style.width = state.lock === 'ABIERTA' ? '100%' : '45%';
  const alarmTrack = $('alarmTrack');
  alarmTrack.style.width = state.alarm === 'DISPARADA' ? '100%' : state.alarm === 'ARMADA' ? '65%' : '18%';
  alarmTrack.className = state.alarm.toLowerCase();

  $('distanceValue').textContent = Number.isFinite(Number(state.distance)) && Number(state.distance) >= 0
    ? `${Number(state.distance).toFixed(1)} cm` : 'Sin lectura';
  $('lightValue').textContent = Number.isFinite(Number(state.lightLevel)) ? String(state.lightLevel) : '—';
  $('alarmReason').textContent = state.alarmReason || 'Ninguno';
  $('presenceAlert').hidden = !state.presence;
  $('lightAlert').hidden = !state.lightDetected;

  // Acceso seguro
  const logged = hasSession();
  const paired = state.mode === 'demo' ? state.demo.paired : state.paired;
  const name = state.mode === 'demo' ? state.demo.name : state.deviceName;
  $('loginCard').hidden = logged;
  $('sessionCard').hidden = !logged;
  $('sessionPill').textContent = logged ? 'Sesión iniciada' : 'Sin sesión';
  $('deviceBadge').textContent = paired ? 'Vinculado' : 'No vinculado';
  $('deviceBadge').className = `device-badge ${paired ? 'ok' : 'no'}`;
  $('deviceName').textContent = paired ? name : '';
  $('pairBox').hidden = paired;
  renderLog(state.mode === 'demo' ? state.demo.log : state.log);
}

function renderLog(entries) {
  const body = $('logBody');
  body.innerHTML = '';
  if (!entries.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = hasSession() ? 'Sin registros todavía.' : 'Iniciá sesión para ver el registro.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }
  entries.forEach((item) => {
    const row = document.createElement('tr');
    const result = String(item.resultado || '');
    row.className = result.startsWith('Rechazado') ? 'rejected' : result.startsWith('Aceptado') ? 'accepted' : '';
    const cells = [
      [item.momento, ''],
      [item.nombre, `${item.equipo} · ${item.ip}`],
      [item.accion, ''],
      [result, '']
    ];
    cells.forEach(([main, sub]) => {
      const cell = document.createElement('td');
      cell.textContent = main;
      if (sub) { const small = document.createElement('small'); small.textContent = sub; cell.appendChild(small); }
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
}

function setMode(mode) {
  state.mode = mode;
  guardar('casasegura-mode', mode);
  render();
}

// ------------------------------
// Conexión MQTT con el ESP32 (a través del broker público)
// ------------------------------
let cliente = null;
let espOnline = false;
const pendientes = {};

function base() { return `casasegura/${state.ip}`; }

function equipo() {
  const ua = navigator.userAgent;
  let sistema = 'Otro';
  if (ua.includes('Android')) sistema = 'Android';
  else if (ua.includes('iPhone')) sistema = 'iPhone';
  else if (ua.includes('iPad')) sistema = 'iPad';
  else if (ua.includes('Windows')) sistema = 'Windows';
  else if (ua.includes('Mac OS')) sistema = 'Mac';
  else if (ua.includes('Linux')) sistema = 'Linux';
  let nav = 'Otro';
  if (ua.includes('Edg/')) nav = 'Edge';
  else if (ua.includes('OPR/')) nav = 'Opera';
  else if (ua.includes('SamsungBrowser')) nav = 'Samsung Internet';
  else if (ua.includes('Chrome')) nav = 'Chrome';
  else if (ua.includes('Firefox')) nav = 'Firefox';
  else if (ua.includes('Safari')) nav = 'Safari';
  return `${sistema} · ${nav}`;
}

function conectarBroker() {
  if (cliente) { cliente.end(true); cliente = null; }
  espOnline = false;
  if (!state.ip) return;
  cliente = mqtt.connect(CONFIG.broker, {clientId: `casasegura-web-${idNavegador}`, clean: true, reconnectPeriod: 3000, connectTimeout: 8000});
  cliente.on('connect', () => {
    cliente.subscribe([`${base()}/resp/${idNavegador}`, `${base()}/online`]);
    render();
  });
  cliente.on('close', () => { $('connectionDot').className = 'connection-dot offline'; });
  cliente.on('message', async (tema, mensaje) => {
    const texto = mensaje.toString();
    if (tema === `${base()}/online`) { espOnline = texto === '1'; render(); actualizarPunto(); return; }
    let sobre;
    try { sobre = JSON.parse(texto); } catch (e) { return; }
    const p = pendientes[sobre.r];
    if (!p) return;
    let datos = null;
    if (sobre.plano) datos = sobre.plano;  // Error sin cifrar (por ejemplo, contraseña incorrecta).
    else {
      const plano = await Cifrado.descifrar(p.llave, sobre.iv, sobre.ct, `${idNavegador}|${sobre.r}|R`);
      if (plano === null) return;  // No vino de nuestra central: se ignora.
      try { datos = JSON.parse(plano); } catch (e) { return; }
    }
    delete pendientes[sobre.r];
    clearTimeout(p.timer);
    p.resolver(datos);
  });
}

function actualizarPunto() {
  if (state.mode === 'demo') return;
  $('connectionDot').className = `connection-dot ${cliente && cliente.connected && espOnline ? 'online' : 'offline'}`;
}

// Error con el código que devolvió el ESP32 (401 sin sesión, 403 dispositivo, 423 bloqueo).
class EspError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Manda una orden cifrada y espera la respuesta (como antes un fetch al ESP32).
async function fetchEsp(cmd, extra = {}, llave = state.llave) {
  if (!state.ip) throw new Error('Falta el código de la casa');
  if (!cliente || !cliente.connected) throw new Error('Sin conexión con el broker');
  if (!llave) throw new EspError(401, 'Iniciá sesión para continuar.');
  const r = idNuevo(16);
  const orden = JSON.stringify({cmd, t: Math.floor(Date.now() / 1000), s: state.session, d: state.device, eq: equipo(), ...extra});
  const cifrado = await Cifrado.cifrar(llave, orden, `${idNavegador}|${r}`);
  const respuesta = new Promise((resolver, rechazar) => {
    pendientes[r] = {llave, resolver, timer: setTimeout(() => { delete pendientes[r]; rechazar(new Error('La central no respondió')); }, 7000)};
  });
  cliente.publish(`${base()}/cmd`, JSON.stringify({id: idNavegador, r, iv: cifrado.iv, ct: cifrado.ct}), {qos: 1});
  const data = await respuesta;
  if (data.codigo && data.codigo !== 200) throw new EspError(data.codigo, data.mensaje || `Error ${data.codigo}`);
  return data;
}

function dropSession(message) {
  state.session = '';
  state.llave = '';
  state.log = [];
  guardar('casasegura-sesion', '');
  guardar('casasegura-llave', '');
  if (message) setMessage('loginMsg', message);
}

// Devuelve true si el error vino del ESP32 (respondió, pero rechazó el pedido).
function handleEspError(error) {
  if (!(error instanceof EspError)) return false;
  if (error.status === 401) {
    dropSession(error.message);
    showToast(error.message);
  } else {
    showToast(error.message);
    if (error.status === 423) setMessage('loginMsg', error.message, 'error');
  }
  render();
  return true;
}

// ------------------------------
// Simulación de seguridad (modo demostración)
// ------------------------------
function demoLog(accion, resultado, nombre) {
  const momento = new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  state.demo.log.unshift({momento, ip: 'demo', equipo: 'Este navegador', nombre: nombre || (state.demo.paired ? state.demo.name : 'No vinculado'), accion, resultado});
  state.demo.log = state.demo.log.slice(0, 20);
}

function demoLocked() {
  return Date.now() < state.demo.lockedUntil;
}

function demoFail() {
  state.demo.fails++;
  if (state.demo.fails >= 3) {
    state.demo.fails = 0;
    state.demo.lockedUntil = Date.now() + 5 * 60 * 1000;
    demoLog('Bloqueo', 'Rechazado: IP bloqueada por intentos fallidos');
    showToast('Acceso bloqueado 5 minutos. En la maqueta suena un aviso en el buzzer.');
    return true;
  }
  return false;
}

const actionNames = {open: 'Abrir cerradura', close: 'Cerrar cerradura', alarmOn: 'Armar alarma', alarmOff: 'Desarmar alarma'};
const needsDevice = {open: true, alarmOff: true};

function simulate(action) {
  const accion = actionNames[action];
  if (demoLocked()) { demoLog(accion, 'Rechazado: IP bloqueada'); showToast('Demasiados intentos rechazados. Esperá 5 min.'); render(); return; }
  if (!state.demo.session) {
    demoLog(accion, 'Rechazado: sin sesión iniciada');
    if (!demoFail()) showToast('Iniciá sesión para continuar.');
    render(); return;
  }
  if (needsDevice[action] && !state.demo.paired) {
    demoLog(accion, 'Rechazado: dispositivo no vinculado');
    setEvent(`Intento de ${accion.toLowerCase()} desde un dispositivo no vinculado.`);
    if (!demoFail()) showToast('Dispositivo no autorizado. Solo un dispositivo vinculado puede realizar esta acción.');
    render(); return;
  }
  if (action === 'open') { state.lock = 'ABIERTA'; setEvent('Cerradura abierta en modo demostración.'); }
  if (action === 'close') { state.lock = 'CERRADA'; setEvent('Cerradura cerrada en modo demostración.'); }
  if (action === 'alarmOn') {
    if (state.alarm === 'DESARMADA') {
      state.alarm = 'ARMADA';
      state.alarmReason = 'Ninguno';
      setEvent('Alarma armada en modo demostración.');
    } else {
      setEvent(`La alarma ya está ${state.alarm.toLowerCase()} en modo demostración.`);
    }
  }
  if (action === 'alarmOff') {
    state.alarm = 'DESARMADA';
    state.alarmReason = 'Ninguno';
    setEvent('Alarma desarmada en modo demostración.');
  }
  demoLog(accion, 'Aceptado');
  render();
  showToast('Acción simulada. No hay hardware conectado.');
}

// ------------------------------
// Acciones
// ------------------------------
const routes = {open: 'abrir', close: 'cerrar', alarmOn: 'armar', alarmOff: 'desarmar'};

async function runAction(action) {
  if (state.busy) return;
  if (state.mode === 'demo') return simulate(action);
  state.busy = true; render();
  try {
    const data = await fetchEsp(routes[action]);
    setEvent(data.mensaje || 'Orden ejecutada en el ESP32.');
    showToast(data.mensaje || 'Orden ejecutada.');
    await syncState(false);
  } catch (error) {
    if (!handleEspError(error)) {
      setEvent('No se pudo completar la orden en el ESP32.');
      showToast(`Conexión fallida: ${error.message}.`);
    }
  } finally {
    state.busy = false; render();
  }
}

async function login() {
  const clave = $('password').value;
  $('password').value = '';
  if (state.mode === 'demo') {
    if (demoLocked()) { demoLog('Inicio de sesión', 'Rechazado: IP bloqueada'); setMessage('loginMsg', 'Demasiados intentos rechazados. Esperá 5 min.', 'error'); render(); return; }
    if (clave === DEMO_CLAVE) {
      state.demo.session = true; state.demo.fails = 0;
      demoLog('Inicio de sesión', 'Aceptado');
      setMessage('loginMsg', '');
      showToast('Sesión iniciada en modo demostración.');
    } else {
      demoLog('Inicio de sesión', 'Rechazado: contraseña incorrecta');
      const locked = demoFail();
      setMessage('loginMsg', locked ? 'Contraseña incorrecta. El acceso quedó bloqueado durante 5 min.' : 'Contraseña incorrecta.', 'error');
    }
    render(); return;
  }
  try {
    setMessage('loginMsg', 'Verificando…');
    const llave = await Cifrado.derivarLlave(clave, state.ip);
    const data = await fetchEsp('login', {}, llave);
    state.session = data.sesion;
    state.llave = llave;
    guardar('casasegura-sesion', state.session);
    guardar('casasegura-llave', llave);
    setMessage('loginMsg', '');
    showToast('Sesión iniciada.');
    await syncState(false);
    await syncLog();
  } catch (error) {
    if (error instanceof EspError) setMessage('loginMsg', error.message, 'error');
    else setMessage('loginMsg', `No se pudo conectar con el ESP32: ${error.message}.`, 'error');
  }
  render();
}

async function logout() {
  if (state.mode === 'demo') {
    state.demo.session = false;
    setMessage('loginMsg', 'Sesión cerrada.');
    render(); return;
  }
  try { await fetchEsp('logout'); } catch (e) {}
  dropSession('Sesión cerrada.');
  render();
}

async function pair() {
  const nombre = $('deviceInput').value.trim();
  if (!nombre) { setMessage('pairMsg', 'Escribí un nombre para el dispositivo.', 'error'); return; }
  if (!hasSession()) { setMessage('pairMsg', 'Primero iniciá sesión.', 'error'); return; }
  if (state.mode === 'demo') {
    setMessage('pairMsg', 'Esperando el botón BOOT de la central… En la demostración se aprueba solo en 3 segundos.');
    setTimeout(() => {
      state.demo.paired = true; state.demo.name = nombre.slice(0, 20);
      demoLog('Vincular dispositivo', 'Aceptado: aprobado con el botón de la central', state.demo.name);
      setMessage('pairMsg', 'Dispositivo vinculado correctamente.', 'ok');
      render();
    }, 3000);
    return;
  }
  try {
    const data = await fetchEsp('vincular', {n: nombre});
    setMessage('pairMsg', data.mensaje);
  } catch (error) {
    if (!handleEspError(error)) setMessage('pairMsg', 'No se pudo conectar con el ESP32.', 'error');
    else setMessage('pairMsg', error.message, 'error');
    return;
  }
  const limit = Date.now() + 32000;
  const timer = setInterval(async () => {
    try {
      const data = await fetchEsp('vincular_estado');
      if (data.estado === 'listo') {
        clearInterval(timer);
        state.device = data.dispositivo;
        guardar('casasegura-dispositivo', state.device);
        setMessage('pairMsg', 'Dispositivo vinculado correctamente.', 'ok');
        await syncState(false);
        await syncLog();
      } else if (data.estado === 'vencido' || data.estado === 'ninguno' || Date.now() > limit) {
        clearInterval(timer);
        setMessage('pairMsg', 'Se venció el tiempo. Volvé a intentarlo.', 'error');
      }
    } catch (error) {
      if (Date.now() > limit) { clearInterval(timer); setMessage('pairMsg', 'Se venció el tiempo. Volvé a intentarlo.', 'error'); }
    }
  }, 1000);
}

// ------------------------------
// Sincronización con el ESP32
// ------------------------------
function applyStatus(data) {
  state.lock = data.cerradura || state.lock;
  state.alarm = normalizedAlarm(data.alarma);
  if (data.distancia !== undefined && data.distancia !== null) state.distance = Number(data.distancia);
  if (data.nivel_luz !== undefined && data.nivel_luz !== null) state.lightLevel = Number(data.nivel_luz);
  state.presence = Boolean(data.presencia);
  state.lightDetected = Boolean(data.luz_detectada);
  state.alarmReason = data.motivo_disparo || 'Ninguno';
  state.paired = Boolean(data.vinculado);
  state.deviceName = data.dispositivo || '';
  if (data.ultimo_evento && data.ultimo_evento !== state.lastEvent) setEvent(data.ultimo_evento);
}

async function syncState(showMessage = false) {
  if (state.mode === 'demo') { simulateSensors(); render(); return; }
  if (!state.session) {
    render();
    $('connectionDetail').textContent = `Casa ${state.ip} · ${espOnline ? 'central en línea' : 'central desconectada'}. Iniciá sesión para ver el estado.`;
    return;
  }
  if (syncState.ocupado) return;
  syncState.ocupado = true;
  try {
    const data = await fetchEsp('estado');
    applyStatus(data);
    if (showMessage) showToast('ESP32 conectado correctamente.');
  } catch (error) {
    if (!handleEspError(error)) {
      if (showMessage) showToast(`No se pudo conectar: ${error.message}.`);
    }
  } finally {
    syncState.ocupado = false;
  }
  render();
  actualizarPunto();
}

async function syncLog() {
  if (state.mode === 'demo' || !state.session || syncLog.ocupado) return;
  syncLog.ocupado = true;
  try {
    const data = await fetchEsp('registro');
    state.log = Array.isArray(data.registros) ? data.registros : [];
    renderLog(state.log);
  } catch (error) {
    handleEspError(error);
  } finally {
    syncLog.ocupado = false;
  }
}

function simulateSensors() {
  // Ciclo reproducible para presentar las lecturas con y sin alertas.
  state.demoTick++;
  const phase = Math.floor(state.demoTick / 3) % 4;
  if (phase === 0) {
    state.distance = 68.4; state.lightLevel = 720;
    state.presence = false; state.lightDetected = false;
  } else if (phase === 1) {
    state.distance = 15.8; state.lightLevel = 760;
    state.presence = true; state.lightDetected = false;
  } else if (phase === 2) {
    state.distance = 54.2; state.lightLevel = 2310;
    state.presence = false; state.lightDetected = true;
  } else {
    state.distance = 42.6; state.lightLevel = 960;
    state.presence = false; state.lightDetected = false;
  }

  if (state.alarm === 'ARMADA' && (state.presence || state.lightDetected)) {
    state.alarm = 'DISPARADA';
    state.alarmReason = state.presence ? 'Presencia en la puerta' : 'Luz detectada en la habitación';
    setEvent(`Alarma disparada en demostración: ${state.alarmReason}.`);
  }
}

async function connectEsp() {
  const ip = ipInput.value.trim().toLowerCase().replace(/^casasegura\//, '');
  if (!/^[a-z0-9-]{4,40}$/.test(ip)) { showToast('Escribí el código de la casa (ID_CASA del ESP32).'); ipInput.focus(); return; }
  if (ip !== state.ip) dropSession('');
  state.ip = ip;
  guardar('casasegura-casa', state.ip);
  setMode('real');
  conectarBroker();
  if (!state.session) {
    showToast('Conectando con la casa. Ingresá la contraseña para iniciar sesión.');
    $('access').scrollIntoView({behavior: 'smooth'});
    setTimeout(() => $('password').focus(), 450);
    render(); return;
  }
  setTimeout(() => { syncState(true); syncLog(); }, 1500);
}

$('modeToggle').addEventListener('click', () => {
  if (state.mode === 'demo') {
    $('connection').scrollIntoView({behavior: 'smooth'});
    setTimeout(() => ipInput.focus(), 450);
    showToast('Revisá el código de la casa y tocá Conectar.');
  } else {
    setMode('demo');
    showToast('Volviste al modo demostración.');
  }
});
$('connectBtn').addEventListener('click', connectEsp);
$('refreshBtn').addEventListener('click', () => { syncState(true); syncLog(); });
ipInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') connectEsp(); });
$('loginBtn').addEventListener('click', login);
$('password').addEventListener('keydown', (event) => { if (event.key === 'Enter') login(); });
$('logoutBtn').addEventListener('click', logout);
$('pairBtn').addEventListener('click', pair);
$('deviceInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') pair(); });
document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => runAction(button.dataset.action)));
document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => $(button.dataset.scroll).scrollIntoView({behavior: 'smooth'})));

render();
if (state.mode === 'real') conectarBroker();
setInterval(() => syncState(false), 2000);
setInterval(() => syncLog(), 4000);
