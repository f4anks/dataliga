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
 * 2. INICIALIZACIÓN Y AUTENTICACIÓN
 * Inicializa Firebase, autentica al usuario y configura el listener en tiempo real.
 */
async function initFirebaseAndLoadData() {
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
            sortTable(currentSortKey, false); // Ordena sin cambiar la dirección (mantiene el estado)
        } else {
             renderTable();
        }
    }, (error) => {
        // Si aparece "Permission Denied", la regla de seguridad de Firebase está incorrecta.
        console.error("Error en la escucha en tiempo real:", error);
    });
}

/**
 * 4. FUNCIÓN DE GUARDADO (handleFormSubmit)
 * Maneja el envío del formulario y guarda los datos en Firestore.
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    if (!db) {
        // Esto ocurriría si el archivo script.js no se cargó o si la inicialización falló.
        console.error("Base de datos no inicializada. No se pudo guardar. (Verifica si Firebase se inicializó)");
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
        timestamp: Date.now() // Marca de tiempo para orden (opcional)
    };
    
    try {
        // 2. OBTENER EL APP ID PARA LA RUTA DE GUARDADO
        let appIdToUse;
        if (typeof __app_id !== 'undefined') {
            appIdToUse = __app_id; // Si estamos en Canvas
        } else {
            appIdToUse = EXTERNAL_FIREBASE_CONFIG.projectId; // Si estamos en GitHub Pages
        }

        // 3. GUARDAR DATOS EN FIRESTORE
        const athletesColRef = collection(db, `artifacts/${appIdToUse}/public/data/athletes`);
        await addDoc(athletesColRef, newAthlete); 
        console.log("Atleta registrado y guardado en Firestore con éxito.");
        
    } catch(error) {
        // <<<< DEBUGGING AÑADIDO AQUI >>>>
        console.error("!!! ERROR CRÍTICO AL INTENTAR GUARDAR !!!", error.message);
        console.error("CAUSA PROBABLE: REGLAS DE SEGURIDAD. VERIFICA LA REGLA 'request.auth != null'");
        // <<<< FIN DEBUGGING >>>>

    } finally {
        // 4. Resetear el formulario.
        form.reset();
    }
    
    return false;
}

/**
 * LÓGICA DE ORDENAMIENTO Y RENDERIZADO (sin cambios)
 */
function sortTable(key, toggleDirection = true) {
    if (currentSortKey === key && toggleDirection) {
        sortDirection = (sortDirection === 'asc') ? 'desc' : 'asc';
    } else if (currentSortKey !== key) {
        currentSortKey = key;
        sortDirection = 'asc';
    }

    athletesData.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        if (key === 'tallaRaw' || key === 'pesoRaw') {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
        } else if (key === 'fechaNac') {
            valA = new Date(valA);
            valB = new Date(valB);
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }

        let comparison = 0;
        if (valA > valB) { comparison = 1; } 
        else if (valA < valB) { comparison = -1; }
        
        return (sortDirection === 'desc') ? (comparison * -1) : comparison;
    });

    renderTable();
}

function renderTable() {
    const registeredDataContainer = document.getElementById('registeredData');
    
    if (athletesData.length === 0) {
        registeredDataContainer.innerHTML = '<p class="no-data-message">No hay atletas registrados aún. ¡Registra el primero!</p>';
        return;
    }

    let table = document.getElementById('athleteTable');
    let tableBody = document.getElementById('athleteTableBody');

    if (!table) {
        registeredDataContainer.innerHTML = `
            <div class="table-responsive-wrapper">
                <table id="athleteTable" class="athlete-data-table">
                    <thead>
                        <tr class="table-header-row">
                            <th data-sort-key="club">Club</th>
                            <th data-sort-key="nombre">Nombre</th>
                            <th data-sort-key="apellido">Apellido</th>
                            <th data-sort-key="fechaNac" class="table-hidden-mobile">F. Nac.</th>
                            <th data-sort-key="categoria">Categoría</th>
                            <th data-sort-key="tallaRaw" class="table-hidden-mobile">Talla</th>
                            <th data-sort-key="pesoRaw" class="table-hidden-mobile">Peso</th>
                            <th data-sort-key="correo" class="table-hidden-desktop">Correo</th>
                            <th data-sort-key="telefono" class="table-hidden-desktop">Teléfono</th>
                        </tr>
                    </thead>
                    <tbody id="athleteTableBody">
                    </tbody>
                </table>
            </div>
            <p class="table-note-message">Haz clic en cualquier encabezado de la tabla para ordenar los resultados (por ejemplo, por Apellido o Categoría).</p>
        `;
        tableBody = document.getElementById('athleteTableBody');
        setupSorting(); 
    } else {
        tableBody.innerHTML = '';
    }
    
    athletesData.forEach(data => {
        const newRow = tableBody.insertRow(-1); 
        newRow.classList.add('athlete-table-row');
        newRow.innerHTML = `
            <td data-label="Club" class="table-data">${data.club}</td>
            <td data-label="Nombre" class="table-data">${data.nombre}</td>
            <td data-label="Apellido" class="table-data">${data.apellido}</td>
            <td data-label="F. Nac." class="table-data table-hidden-mobile">${data.fechaNac}</td>
            <td data-label="Categoría" class="table-data">${data.categoria}</td>
            <td data-label="Talla" class="table-data table-hidden-mobile">${data.tallaFormatted}</td>
            <td data-label="Peso" class="table-data table-hidden-mobile">${data.pesoFormatted}</td>
            <td data-label="Correo" class="table-data table-hidden-desktop">${data.correo}</td>
            <td data-label="Teléfono" class="table-data table-hidden-desktop">${data.telefono}</td>
        `;
    });

    document.querySelectorAll('#athleteTable th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.getAttribute('data-sort-key') === currentSortKey) {
            th.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

function setupSorting() {
    document.querySelectorAll('#athleteTable th').forEach(header => {
        const key = header.getAttribute('data-sort-key');
        if (key) {
            header.style.cursor = 'pointer'; 
            header.addEventListener('click', () => sortTable(key, true)); 
        }
    });
}

// Inicializar Firebase al cargar el contenido
document.addEventListener('DOMContentLoaded', initFirebaseAndLoadData);
