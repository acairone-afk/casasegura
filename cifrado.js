// Cifrado de los mensajes entre el panel y el ESP32.
// Tiene que hacer exactamente lo mismo que el código del ESP32:
//  - Llave: PBKDF2 con HMAC-SHA256, 10000 repeticiones, sal "casasegura:" + código de la casa.
//  - Cifrado: AES-256-GCM, 12 bytes de IV al azar, etiqueta de 16 bytes al final.
(function (g) {
  const ITERACIONES = 10000;
  const texto = new TextEncoder();
  const lector = new TextDecoder();

  function aBase64(bytes) {
    let s = '';
    bytes.forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s);
  }

  function desdeBase64(b64) {
    const s = atob(b64);
    const r = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) r[i] = s.charCodeAt(i);
    return r;
  }

  // Devuelve la llave en base64 (se guarda para que la sesión siga abierta).
  async function derivarLlave(clave, codigoCasa) {
    const base = await g.crypto.subtle.importKey('raw', texto.encode(clave), 'PBKDF2', false, ['deriveBits']);
    const bits = await g.crypto.subtle.deriveBits(
      {name: 'PBKDF2', hash: 'SHA-256', salt: texto.encode('casasegura:' + codigoCasa), iterations: ITERACIONES},
      base, 256);
    return aBase64(new Uint8Array(bits));
  }

  async function importar(llaveB64) {
    return g.crypto.subtle.importKey('raw', desdeBase64(llaveB64), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async function cifrar(llaveB64, mensaje, asociado) {
    const llave = await importar(llaveB64);
    const iv = g.crypto.getRandomValues(new Uint8Array(12));
    const datos = await g.crypto.subtle.encrypt(
      {name: 'AES-GCM', iv, additionalData: texto.encode(asociado), tagLength: 128},
      llave, texto.encode(mensaje));
    return {iv: aBase64(iv), ct: aBase64(new Uint8Array(datos))};
  }

  // Devuelve el texto, o null si no se pudo descifrar.
  async function descifrar(llaveB64, ivB64, ctB64, asociado) {
    try {
      const llave = await importar(llaveB64);
      const datos = await g.crypto.subtle.decrypt(
        {name: 'AES-GCM', iv: desdeBase64(ivB64), additionalData: texto.encode(asociado), tagLength: 128},
        llave, desdeBase64(ctB64));
      return lector.decode(datos);
    } catch (e) {
      return null;
    }
  }

  g.Cifrado = {derivarLlave, cifrar, descifrar};
})(typeof window !== 'undefined' ? window : globalThis);
