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
    
    // CORRECCIÓN CLAVE: Garantizar que el elemento exista y que document.body esté disponible.
    if (!statusEl) {
        // Crea el elemento si no existe
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
        
        // Verificación de seguridad: Solo adjuntar si el <body> existe.
        if (document.body) {
            document.body.appendChild(statusEl);
        } else {
            console.error("No se pudo mostrar el mensaje de estado: El cuerpo del documento aún no está disponible.");
            return; // Salir para evitar el TypeError
        }
    }
    
    // Línea 156 (aproximadamente): Ahora statusEl está garantizado de existir y estar adjunto.
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
        auth = getAuth(app);
        
        // Autenticación: Intentar con token personalizado (solo en Canvas) o usar anónimo
        if (tokenToUse.length > 0) {
            await signInWithCustomToken(auth, tokenToUse);
        } else {
            // Autenticación anónima para GitHub Pages
            await signInAnonymously(auth);
        }
        
        // Esperar el cambio de estado de autenticación
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                console.log("Usuario autenticado. UID:", userId);
                // Una vez autenticado, se puede empezar a escuchar los datos
                setupRealtimeListener(appIdToUse);
            } else {
                console.error("No se pudo autenticar al usuario.");
                // Fallback para entornos sin autenticación
                userId = crypto.randomUUID(); 
                setupRealtimeListener(appIdToUse);
            }
        });

    } catch (e) {
        console.error("Error al inicializar Firebase:", e);
    }
}

/**
 * 3. ESCUCHA EN TIEMPO REAL (onSnapshot)
 * Configura la escucha en tiempo real para la colección de atletas.
 */
function setupRealtimeListener(appId) {
    // La ruta pública es: artifacts/{appId}/public/data/athletes
    const athletesColRef = collection(db, `artifacts/${appId}/public/data/athletes`);
    const q = query(athletesColRef);

    onSnapshot(q, (snapshot) => {
        console.log("Datos de Firestore actualizados. Sincronizando tabla...");
        const fetchedData = [];
        snapshot.forEach((doc) => {
            fetchedData.push({ 
                id: doc.id, // ID del documento
                ...doc.data() 
            });
        });
        
        // Reemplazamos los datos locales y forzamos el ordenamiento
        athletesData = fetchedData;
        
        if (athletesData.length > 0) {
            // Ordena sin cambiar la dirección (mantiene el estado)
            sortTable(currentSortKey, false); 
        } else {
             renderTable();
        }
    }, (error) => {
        // Si aparece "Permission Denied", la regla de seguridad de Firebase está incorrecta.
        console.error("Error en la escucha en tiempo real:", error);
    });
}

// FUNCIÓN ACTUALIZADA: Asegura que el formulario esté en el DOM antes de adjuntar el listener.
function setupFormListener() {
    const form = document.getElementById('athleteForm');
    if (form) {
        // Adjunta el manejador de envío asíncrono directamente. Esto evita la recarga.
        form.addEventListener('submit', handleFormSubmit);
        console.log("Listener de formulario de atleta adjunto.");
    } else {
        console.error("Error: No se encontró el formulario con ID 'athleteForm'. ¿Está cargado el index.html?");
    }
}


/**
 * 4. FUNCIÓN DE GUARDADO (handleFormSubmit)
 * Maneja el envío del formulario y guarda los datos en Firestore.
 */
async function handleFormSubmit(event) {
    // ESTA ES LA LÍNEA CRÍTICA: Detiene la recarga de la página (el comportamiento por defecto del formulario).
    event.preventDefault(); 

    if (!db) {
        console.error("Base de datos no inicializada. No se pudo guardar.");
        displayStatusMessage("Error: La base de datos no está inicializada.", 'error');
        return false;
    }

    const form = document.getElementById('athleteForm');

    // 1. Recolectar datos y preparar el objeto (documento)
    const tallaValue = form.talla.value;
    const pesoValue = form.peso.value;
    
    const newAthlete = {
        club: form.club.value,
        nombre: form.nombre.value,
        apellido: form.apellido.value,
        fechaNac: form.fechaNac.value,
        categoria: form.categoria.value, 
        tallaRaw: tallaValue, 
        pesoRaw: pesoValue,   
        tallaFormatted: tallaValue ? `${tallaValue} cm` : 'N/A',
        pesoFormatted: pesoValue ? `${pesoValue} kg` : 'N/A',
        correo: form.correo.value,
        telefono: form.telefono.value,
        timestamp: Date.now() 
    };
    
    try {
        // 2. OBTENER EL APP ID PARA LA RUTA DE GUARDADO
        let appIdToUse;
        if (typeof __app_id !== 'undefined') {
            appIdToUse = __app_id; // Si estamos en Canvas
        } else {
            appIdToUse = EXTERNAL_FIREBASE_CONFIG.projectId; // Si estamos en GitHub Pages
        }

        // 3. GUARDAR DATOS EN FIREST
