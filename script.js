/**
 * Muestra un mensaje temporal de estado en la interfaz.
 * @param {string} message - El texto a mostrar.
 * @param {string} type - 'success' o 'error'.
 */
function displayStatusMessage(message, type) {
    // Intenta encontrar el elemento existente.
    let statusEl = document.getElementById('statusMessage');

    if (!statusEl) {
        // Crea el elemento si NO existe (e inyectamos en el cuerpo)
        statusEl = document.createElement('div'); // *** ASIGNACIÓN DE statusEl A UN NUEVO ELEMENTO ***
        statusEl.id = 'statusMessage';
        statusEl.style.position = 'fixed';
        statusEl.style.top = '10px';
        statusEl.style.right = '10px';
        statusEl.style.padding = '10px 20px';
        statusEl.style.borderRadius = '8px';
        statusEl.style.zIndex = '1000';
        statusEl.style.color = '#fff';
        statusEl.style.transition = 'opacity 0.5s ease-in-out';
        statusEl.style.opacity = '0';
        document.body.appendChild(statusEl);
    }
    
    // Aquí, statusEl NUNCA será null. Si existía, lo encontró arriba; si no, lo creamos.
    statusEl.textContent = message; // ESTA ES LA LÍNEA 156
    // ... el resto del código ...
}
