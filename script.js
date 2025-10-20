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
// !!! ATENCIÓN: CONFIGURACIÓN FIREBASE !!!
// Se usa la configuración inyectada por el ambiente (Canvas)
// En caso de que no exista, se usa una configuración de ejemplo (EXTERNAL_FIREBASE_CONFIG)
// =========================================================================
const EXTERNAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyA5u1whBdu_fVb2Kw7SDRZbuyiM77RXVDE",
    authDomain: "datalvmel.firebaseapp.com",
    projectId: "datalvmel",
    storageBucket: "datalvmel.appspot.com",
    messagingSenderId: "338955214041",
    appId: "1:338955214041:web:10e972f31d4516641e21b7"
};

// Intenta usar las variables globales provistas por el ambiente, si no existen, usa la configuración externa.
const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : EXTERNAL_FIREBASE_CONFIG;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;


// =========================================================================
// 2. UTILIDADES
// =========================================================================

/**
 * Muestra un mensaje de error o éxito en un modal (reemplazo de alert())
 * @param {string} message - Mensaje a mostrar.
 * @param {string} type - Tipo de mensaje ('error' o 'success').
 */
function showModalMessage(message, type = 'info') {
    const modal = document.createElement('div');
    modal.className = `custom-modal ${type}`;
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-button">&times;</span>
            <p>${message}</p>
        </div>
    `;
    
    document.body.appendChild(modal);

    // Cierra el modal al hacer clic en el botón de cierre
    modal.querySelector('.close-button').onclick = () => modal.remove();
    // Cierra el modal al hacer clic fuera del contenido
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };
    
    // Auto-cierre después de 5 segundos para mensajes de éxito
    if (type === 'success') {
        setTimeout(() => modal.remove(), 5000);
    }
}

// Estilos del Modal (Inyectados dinámicamente)
const modalStyle = document.createElement('style');
modalStyle.textContent = `
.custom-modal {
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgba(0,0,0,0.4);
    display: flex;
    justify-content: center;
    align-items: center;
    transition: opacity 0.3s;
}

.modal-content {
    background-color: white;
    padding: 30px;
    border-radius: 10px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.5);
    max-width: 90%;
    min-width: 300px;
    position: relative;
    font-family: 'Montserrat', sans-serif;
    text-align: center;
}

.custom-modal.error .modal-content {
    border: 3px solid #D32F2F;
}
.custom-modal.success .modal-content {
    border: 3px solid #388E3C;
}
.custom-modal.info .modal-content {
    border: 3px solid #1976D2;
}

.modal-content p {
    margin: 0;
    font-size: 1.1em;
    color: var(--gris-oscuro);
}

.close-button {
    color: #aaa;
    float: right;
    font-size: 28px;
    font-weight: bold;
    position: absolute;
    top: 5px;
    right: 10px;
    cursor: pointer;
    transition: color 0.2s;
}

.close-button:hover,
.close-button:focus {
    color: #000;
    text-decoration: none;
    cursor: pointer;
}
`;
document.head.appendChild(modalStyle);


// =========================================================================
// 3. LÓGICA DE LA APLICACIÓN
// =========================================================================

/**
 * Inicializa Firebase, autentica al usuario y comienza a escuchar los datos.
 */
async function initializeAppAndAuth() {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        // Autenticación: usa el token inyectado o inicia anónimamente
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            // Si el token no está definido, usamos signInAnonymously
            await signInAnonymously(auth);
        }

        // Listener de estado de autenticación
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                console.log("Usuario autenticado. UID:", userId);
                // Una vez autenticado, inicia la escucha de datos
                startDataListener(); 
                // Actualiza el UI con el ID de sesión
                const userIdElement = document.getElementById('currentUserId');
                if(userIdElement) {
                    userIdElement.textContent = `ID de Sesión: ${userId}`;
                }
            } else {
                userId = crypto.randomUUID(); // Usar un ID anónimo si falla la autenticación
                console.log("Usuario no autenticado o cerrado sesión. Usando ID aleatorio.");
                const userIdElement = document.getElementById('currentUserId');
                if(userIdElement) {
                    userIdElement.textContent = `ID de Sesión: ${userId} (Anónimo)`;
                }
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase o autenticar:", error);
        showModalMessage("Error crítico al iniciar la aplicación: " + error.message, 'error');
    }
}

/**
 * Define la referencia a la colección de Firestore.
 * Usamos una colección pública bajo /artifacts/{appId}/public/data/athletes
 */
function getAthletesCollectionRef() {
    if (!db) {
        console.error("Firestore no está inicializado.");
        return null;
    }
    // athletes es el nombre de la colección. Es público para que todos vean los registros.
    return collection(db, 'artifacts', appId, 'public', 'data', 'athletes');
}


/**
 * Escucha los datos de la colección en tiempo real.
 */
function startDataListener() {
    const collectionRef = getAthletesCollectionRef();
    if (!collectionRef) return;

    const q = query(collectionRef);

    onSnapshot(q, (snapshot) => {
        const tempAthletesData = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Calcula y formatea datos para mostrar en la tabla
            const formattedData = {
                id: doc.id,
                ...data,
                // Formateo de Talla y Peso (asumiendo que son números)
                tallaFormatted: `${data.talla || 0} cm`,
                pesoFormatted: `${data.peso || 0} kg`,
            };
            tempAthletesData.push(formattedData);
        });

        // Actualiza el estado y re-renderiza la tabla (manteniendo el orden actual)
        athletesData = tempAthletesData;
        sortTable(currentSortKey, false); // Re-renderiza manteniendo el orden actual
        
    }, (error) => {
        console.error("Error al escuchar datos de Firestore:", error);
        showModalMessage("Error al sincronizar datos en tiempo real.", 'error');
    });
}


/**
 * Valida y formatea los datos del formulario.
 * @param {HTMLFormElement} form - El formulario HTML.
 * @returns {Object|null} - Objeto de datos limpios o null si falla la validación.
 */
function validateAndFormatForm(form) {
    const data = {
        club: form.club.value.trim(),
        cedula: form.cedula.value.trim(),
        nombre: form.nombre.value.trim(),
        apellido: form.apellido.value.trim(),
        fechaNac: form.fechaNac.value.trim(),
        categoria: form.categoria.value,
        // Usamos Number() para asegurar que sean números (o NaN si es vacío)
        talla: Number(form.talla.value) || 0, 
        peso: Number(form.peso.value) || 0,   
        correo: form.correo.value.trim(),
        telefono: form.telefono.value.trim(),
        registradoPor: userId, // ID del usuario que registra
        timestamp: new Date().toISOString()
    };

    // Validación mínima para campos requeridos
    if (!data.club || !data.cedula || !data.nombre || !data.apellido || !data.fechaNac || !data.categoria) {
        showModalMessage("Por favor, complete todos los campos obligatorios (*).", 'error');
        return null;
    }
    
    // Validación de números
    if (isNaN(data.talla) || data.talla < 0 || isNaN(data.peso) || data.peso < 0) {
        showModalMessage("Talla y Peso deben ser números positivos válidos (si se ingresan).", 'error');
        return null;
    }
    
    return data;
}

/**
 * Maneja el envío del formulario para agregar un nuevo atleta.
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    
    const athleteData = validateAndFormatForm(form);
    if (!athleteData) {
        return; // Detiene el proceso si la validación falla
    }
    
    const collectionRef = getAthletesCollectionRef();
    if (!collectionRef) {
        showModalMessage("Error: La base de datos no está disponible. Intente recargar.", 'error');
        return;
    }

    try {
        const docRef = await addDoc(collectionRef, athleteData);
        console.log("Documento escrito con ID: ", docRef.id);
        
        // Mostrar mensaje de éxito y limpiar el formulario
        showModalMessage(`Atleta ${athleteData.nombre} ${athleteData.apellido} registrado exitosamente.`, 'success');
        form.reset(); 

    } catch (e) {
        console.error("Error al añadir el documento: ", e);
        showModalMessage("Error al registrar el atleta: " + e.message, 'error');
    }
}


// =========================================================================
// 4. LÓGICA DE TABLA (ORDENAMIENTO Y RENDERIZADO)
// =========================================================================

/**
 * Ordena el array de atletas y actualiza la vista.
 * @param {string} key - Clave del campo por el que ordenar.
 * @param {boolean} toggleDirection - Si es true, invierte la dirección si la clave es la misma.
 */
function sortTable(key, toggleDirection = true) {
    
    if (toggleDirection) {
        if (currentSortKey === key) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortKey = key;
            sortDirection = 'asc';
        }
    }

    const isNumeric = ['cedula', 'talla', 'peso'].includes(currentSortKey);

    athletesData.sort((a, b) => {
        let valA = a[currentSortKey];
        let valB = b[currentSortKey];
        
        // Manejo de valores nulos o indefinidos para evitar errores
        if (valA === undefined) valA = isNumeric ? 0 : '';
        if (valB === undefined) valB = isNumeric ? 0 : '';

        if (isNumeric) {
            valA = Number(valA);
            valB = Number(valB);
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }
        
        // Lógica de ordenamiento
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    renderTable();
}


/**
 * Renderiza la tabla de atletas en el DOM.
 */
function renderTable() {
    const tableBody = document.getElementById('athleteTableBody');
    const noDataMessage = document.getElementById('noDataMessage');
    
    if (!tableBody || !noDataMessage) {
        console.error("Elementos de tabla no encontrados.");
        return;
    }
    
    // Muestra/Oculta el mensaje de "no hay datos"
    if (athletesData.length === 0) {
        tableBody.innerHTML = '';
        noDataMessage.style.display = 'block';
        return;
    } else {
        noDataMessage.style.display = 'none';
    }

    // Genera el HTML de las filas
    let htmlContent = '';
    athletesData.forEach(data => {
        htmlContent += `
            <tr class="athlete-table-row">
                <td data-label="Club" class="table-data">${data.club}</td>
                <td data-label="Cédula" class="table-data">${data.cedula}</td>
                <td data-label="Nombre" class="table-data">${data.nombre}</td>
                <td data-label="Apellido" class="table-data">${data.apellido}</td>
                <td data-label="F. Nac." class="table-data table-hidden-mobile">${data.fechaNac}</td>
                <td data-label="Categoría" class="table-data">${data.categoria}</td>
                <td data-label="Talla" class="table-data table-hidden-mobile">${data.tallaFormatted}</td>
                <td data-label="Peso" class="table-data table-hidden-mobile">${data.pesoFormatted}</td>
                <td data-label="Correo" class="table-data table-hidden-desktop">${data.correo}</td>
                <td data-label="Teléfono" class="table-data table-hidden-desktop">${data.telefono}</td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = htmlContent;

    // Actualiza los indicadores de ordenamiento en los encabezados
    document.querySelectorAll('#athleteTable th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.getAttribute('data-sort-key') === currentSortKey) {
            th.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

/**
 * Configura los event listeners para el ordenamiento de la tabla.
 */
function setupSorting() {
    document.querySelectorAll('#athleteTable th').forEach(header => {
        const key = header.getAttribute('data-sort-key');
        if (key) {
            header.addEventListener('click', () => sortTable(key, true)); 
        }
    });
}


// =========================================================================
// 5. INICIALIZACIÓN
// =========================================================================

/**
 * Inicialización de la aplicación al cargar el DOM.
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializa Firebase y autenticación
    initializeAppAndAuth(); 

    // 2. Configura el listener del formulario
    const form = document.getElementById('athleteForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
    
    // 3. Configura el ordenamiento de la tabla
    setupSorting(); 
    
    // 4. Inicializa la tabla vacía
    renderTable(); 
});
