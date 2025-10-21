// 1. IMPORTACIONES DE FIREBASE
// Usamos versiones estables (10.12.0) para evitar errores 404 al cargar desde CDN.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, addDoc, onSnapshot, setLogLevel } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// VARIABLES DE ESTADO Y FIREBASE
let db;
let auth;
let userId = ''; 
let athletesData = []; // Array que contendrá los datos sincronizados de Firestore
let currentSortKey = 'apellido'; 
let sortDirection = 'asc'; 

// Ajustar el nivel de log para depuración (opcional)
setLogLevel('Debug');

// =========================================================================
// !!! ATENCIÓN: CONFIGURACIÓN PARA AMBIENTE EXTERNO (GitHub Pages) !!!
// Se usa tu configuración real para que funcione fuera del Canvas.
// =========================================================================
const EXTERNAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyA5u1whBdu_fVb2Kw7SDRZbuyiM77RXVDE",
  authDomain: "datalvmel.firebaseapp.com",
  projectId: "datalvmel",
  storageBucket: "datalvmel.firebasestorage.app",
  messagingSenderId: "733536533303",
  appId: "1:733536533303:web:3d2073504aefb2100378b2"
};

/**
 * Muestra un mensaje temporal de estado en la interfaz.
 * @param {string} message - El texto a mostrar.
 * @param {string} type - 'success' o 'error'.
 */
function displayStatusMessage(message, type) {
    let statusEl = document.getElementById('statusMessage');
    
    // CORRECCIÓN: Si el elemento NO existe, lo creamos y lo asignamos a statusEl
    if (!statusEl) {
        // Crea el elemento si no existe (lo inyectamos en el cuerpo)
        statusEl = document.createElement('div');
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
    
    // Línea donde ocurría el error: Ahora statusEl está garantizado de existir.
    statusEl.textContent = message; 
    statusEl.style.backgroundColor = type === 'success' ? '#10b981' : '#ef4444';
    statusEl.style.opacity = '1';

    // Ocultar después de 4 segundos
    setTimeout(() => {
        statusEl.style.opacity = '0';
    }, 4000);
}


/**
 * 2. INICIALIZACIÓN Y AUTENTICACIÓN
 * Inicializa Firebase, autentica al usuario y configura el listener en tiempo real.
 */
async function initFirebaseAndLoadData() {
    console.log("Iniciando Firebase y autenticación...");
    try {
        // Determinamos la configuración y el App ID
        let configToUse;
        let appIdToUse;
        let tokenToUse = '';

        // Priorizamos las variables globales si estamos en el entorno Canvas
        if (typeof __firebase_config !== 'undefined' && __firebase_config.length > 2) {
            configToUse = JSON.parse(__firebase_config);
            appIdToUse = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            tokenToUse = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : '';
        } else {
            // Usamos la configuración fija si estamos en un entorno externo (GitHub Pages)
            configToUse = EXTERNAL_FIREBASE_CONFIG;
            // Para la ruta de guardado, usamos el projectId como fallback para el appId
            appIdToUse = configToUse.projectId; 
            
            // Nota: En GitHub Pages, NO hay token inicial, así que solo usamos la autenticación anónima.
        }

        const app = initializeApp(configToUse);
        db = getFirestore(app);
        auth = getAuth
