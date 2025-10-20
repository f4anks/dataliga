import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    onSnapshot, 
    collection, 
    query, 
    getDoc, 
    deleteDoc,
    setLogLevel
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ===============================================
// Variables Globales de Firebase (PROPORCIONADAS)
// ===============================================
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * Función segura para parsear __firebase_config.
 * Soluciona el error si la variable no está definida o contiene JSON inválido.
 */
const parseFirebaseConfig = () => {
    try {
        if (typeof __firebase_config === 'string' && __firebase_config.length > 0) {
            return JSON.parse(__firebase_config);
        }
    } catch (e) {
        console.error("Error parsing __firebase_config JSON:", e);
    }
    return {};
};

// Se llama a la función para obtener la configuración de forma segura
const firebaseConfig = parseFirebaseConfig(); 

const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Variables de estado global
let db;
let auth;
let userId = null;
let isAuthReady = false;
let isEditMode = false;
let currentAthleteId = null; // ID del atleta si estamos en modo edición

// Elementos del DOM
const athleteForm = document.getElementById('athleteForm');
const registeredDataContainer = document.getElementById('registeredData');
const submitButton = document.getElementById('submitButton');
const searchButton = document.getElementById('searchButton');
const cedulaInput = document.getElementById('cedula');
const messageBox = document.getElementById('messageBox');

// Utilerías
const showMessage = (message, type = 'info') => {
    messageBox.textContent = message;
    messageBox.style.display = 'block';
    messageBox.style.backgroundColor = type === 'error' ? '#fecaca' : (type === 'success' ? '#dcfce7' : '#e0f2fe');
    messageBox.style.color = type === 'error' ? '#b91c1c' : (type === 'success' ? '#16a34a' : '#0369a1');
    setTimeout(() => {
        messageBox.style.display = 'none';
    }, 5000);
};

// ===============================================
// FIREBASE INICIALIZACIÓN Y AUTENTICACIÓN (REFORZADO)
// ===============================================
const initializeFirebase = async () => {
    // REFUERZO: Verificar si firebaseConfig es un objeto válido y contiene la clave esencial 'projectId'.
    // Si esta verificación falla, no llamamos a initializeApp.
    if (!firebaseConfig || !firebaseConfig.projectId || Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase Initialization Error: firebaseConfig is missing or invalid.");
        showMessage("Error: La configuración de la base de datos no está disponible. No se puede guardar ni leer data.", 'error');
        return;
    }
    
    try {
        // Habilitar logs para depuración (opcional)
        setLogLevel('Debug');
        
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Intenta autenticar con el token o de forma anónima
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                isAuthReady = true;
                console.log("Firebase Auth Ready. User ID:", userId);
                // Una vez autenticado, comenzamos a escuchar la data
                setupRealtimeListener();
            } else {
                console.error("No user signed in.");
            }
        });
    } catch (error) {
        console.error("Error initializing Firebase:", error);
        // Si el error persiste, mostrar un mensaje al usuario
        showMessage("Error al conectar con la base de datos.", 'error');
    }
};

// ===============================================
// LÓGICA DE BÚSQUEDA Y EDICIÓN
// ===============================================

/**
 * Normaliza la cédula para usarla como ID de documento (ej: v12345678).
 * @param {string} cedula 
 * @returns {string} Cédula normalizada.
 */
const normalizeCedula = (cedula) => {
    return cedula.toUpperCase().replace(/[^VE0-9]/g, '');
};

/**
 * Cambia la UI al modo Edición/Actualización.
 * @param {boolean} isEditing 
 * @param {string} buttonText 
 */
const toggleEditMode = (isEditing, buttonText = "Registrar Atleta") => {
    isEditMode = isEditing;
    submitButton.textContent = buttonText;
    // La cédula es clave, se desactiva en modo edición para evitar cambios accidentales de ID
    cedulaInput.disabled = isEditing;
    cedulaInput.readOnly = isEditing; 
};

/**
 * Busca un atleta en Firestore usando la Cédula.
 */
const buscarAtletaPorCedula = async () => {
    if (!db || !isAuthReady) {
        showMessage("El sistema no está listo. Espere la conexión a la base de datos.", 'error');
        return;
    }

    const cedulaRaw = cedulaInput.value;
    if (!cedulaRaw) {
        showMessage("Por favor, ingrese una Cédula para buscar.", 'info');
        return;
    }

    const cedulaId = normalizeCedula(cedulaRaw);
    
    // Ruta del documento: /artifacts/{appId}/public/data/athletes/{cedulaId}
    const athleteDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'athletes', cedulaId);

    try {
        const docSnap = await getDoc(athleteDocRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            currentAthleteId = cedulaId;
            
            // Cargar datos al formulario
            document.getElementById('club').value = data.club || '';
            document.getElementById('nombre').value = data.nombre || '';
            document.getElementById('apellido').value = data.apellido || '';
            document.getElementById('categoria').value = data.categoria || '';
            document.getElementById('talla').value = data.talla || '';
            document.getElementById('peso').value = data.peso || '';
            document.getElementById('fechaNac').value = data.fechaNac || '';
            document.getElementById('correo').value = data.correo || '';
            document.getElementById('telefono').value = data.telefono || '';

            toggleEditMode(true, "Actualizar Atleta");
            showMessage(`Atleta con Cédula ${cedulaId} encontrado. Listo para actualizar.`, 'success');

        } else {
            // Si no se encuentra, limpiar el formulario (excepto la cédula) y prepararse para un nuevo registro
            athleteForm.reset(); 
            cedulaInput.value = cedulaRaw; // Mantiene la cédula ingresada
            currentAthleteId = null;
            toggleEditMode(false, "Registrar Atleta");
            showMessage(`Cédula ${cedulaId} no encontrada. Continúe para registrar un nuevo atleta.`, 'info');
        }
    } catch (error) {
        console.error("Error al buscar atleta:", error);
        showMessage("Error al buscar atleta en la base de datos.", 'error');
    }
};

searchButton.addEventListener('click', buscarAtletaPorCedula);

// ===============================================
// LÓGICA DEL FORMULARIO (CRUD)
// ===============================================

athleteForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!isAuthReady || !db) {
        showMessage("El sistema de base de datos no está listo. Intente de nuevo en un momento.", 'error');
        return;
    }

    const formData = new FormData(athleteForm);
    const athleteData = {};
    for (const [key, value] of formData.entries()) {
        athleteData[key] = value;
    }

    // Normalizar la Cédula como ID del documento
    const cedulaId = normalizeCedula(athleteData.cedula);
    const mode = isEditMode ? 'actualizar' : 'registrar';

    try {
        // Ruta: /artifacts/{appId}/public/data/athletes/{cedulaId}
        const athleteDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'athletes', cedulaId);

        // setDoc con merge: true permite crear o actualizar el documento
        await setDoc(athleteDocRef, athleteData, { merge: true });

        // Limpiar formulario y modo
        athleteForm.reset();
        toggleEditMode(false, "Registrar Atleta");
        currentAthleteId = null;
        
        showMessage(`Atleta con Cédula ${cedulaId} ${mode === 'registrar' ? 'registrado' : 'actualizado'} con éxito.`, 'success');

    } catch (error) {
        console.error(`Error al ${mode} atleta:`, error);
        showMessage(`Error al ${mode} atleta: ${error.message}`, 'error');
    }
});

/**
 * Función para borrar un atleta.
 */
const deleteAthlete = async (cedulaId) => {
    if (!isAuthReady || !db) return;

    // TODO: Implementar un modal de confirmación aquí, NO USAR window.confirm()
    // Usaremos un simple 'confirm' por ahora, pero se recomienda una solución UI personalizada.
    if (!window.confirm(`¿Está seguro que desea eliminar al atleta con Cédula ${cedulaId}?`)) {
        return;
    }
    
    try {
        // Ruta: /artifacts/{appId}/public/data/athletes/{cedulaId}
        const athleteDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'athletes', cedulaId);
        await deleteDoc(athleteDocRef);
        showMessage(`Atleta con Cédula ${cedulaId} eliminado.`, 'success');
        // Si el atleta eliminado era el que se estaba editando, resetear el formulario
        if (currentAthleteId === cedulaId) {
            athleteForm.reset();
            toggleEditMode(false);
            currentAthleteId = null;
        }
    } catch (error) {
        console.error("Error al eliminar atleta:", error);
        showMessage("Error al eliminar atleta en la base de datos.", 'error');
    }
};

// ===============================================
// LECTURA DE DATOS EN TIEMPO REAL (onSnapshot)
// ===============================================

let currentSortField = 'cedula';
let currentSortDirection = 'asc';

/**
 * Dibuja la tabla con los datos recibidos.
 * @param {Array} data - Array de objetos atletas.
 */
const renderTable = (data) => {
    if (data.length === 0) {
        registeredDataContainer.innerHTML = '<p class="no-data-message">No hay atletas registrados aún. ¡Registra el primero!</p>';
        return;
    }
    
    // Ordenar los datos en memoria
    data.sort((a, b) => {
        const aValue = a[currentSortField] || '';
        const bValue = b[currentSortField] || '';

        if (aValue < bValue) return currentSortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const tableHTML = `
        <table class="athlete-data-table">
            <thead>
                <tr>
                    <th data-field="cedula" class="${currentSortField === 'cedula' ? 'sorted-' + currentSortDirection : ''}">Cédula</th>
                    <th data-field="club" class="${currentSortField === 'club' ? 'sorted-' + currentSortDirection : ''}">Club</th>
                    <th data-field="nombre" class="${currentSortField === 'nombre' ? 'sorted-' + currentSortDirection : ''}">Nombre</th>
                    <th data-field="apellido" class="${currentSortField === 'apellido' ? 'sorted-' + currentSortDirection : ''}">Apellido</th>
                    <th data-field="categoria" class="${currentSortField === 'categoria' ? 'sorted-' + currentSortDirection : ''}">Categoría</th>
                    <th data-field="talla" class="${currentSortField === 'talla' ? 'sorted-' + currentSortDirection : ''}">Talla (cm)</th>
                    <th data-field="peso" class="${currentSortField === 'peso' ? 'sorted-' + currentSortDirection : ''}">Peso (kg)</th>
                    <th data-field="fechaNac" class="table-hidden-mobile ${currentSortField === 'fechaNac' ? 'sorted-' + currentSortDirection : ''}">Fecha Nac.</th>
                    <th data-field="correo" class="table-hidden-mobile ${currentSortField === 'correo' ? 'sorted-' + currentSortDirection : ''}">Correo</th>
                    <th data-field="telefono" class="${currentSortField === 'telefono' ? 'sorted-' + currentSortDirection : ''}">Teléfono</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(athlete => `
                    <tr>
                        <td data-label="Cédula" class="table-data">${athlete.cedula}</td>
                        <td data-label="Club" class="table-data">${athlete.club}</td>
                        <td data-label="Nombre" class="table-data">${athlete.nombre}</td>
                        <td data-label="Apellido" class="table-data">${athlete.apellido}</td>
                        <td data-label="Categoría" class="table-data">${athlete.categoria}</td>
                        <td data-label="Talla" class="table-data">${athlete.talla}</td>
                        <td data-label="Peso" class="table-data">${athlete.peso}</td>
                        <td data-label="Fecha Nac." class="table-hidden-mobile table-data">${athlete.fechaNac}</td>
                        <td data-label="Correo" class="table-hidden-mobile table-data">${athlete.correo}</td>
                        <td data-label="Teléfono" class="table-data">${athlete.telefono}</td>
                        <td class="table-data" style="width: 120px;">
                            <div style="display: flex; gap: 8px;">
                                <button data-id="${athlete.cedula}" class="edit-btn" title="Editar">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#720025;">
                                        <path d="M12 20h9"></path>
                                        <path d="M16.5 3.5l4 4L7 21l-4 1 1-4L16.5 3.5z"></path>
                                    </svg>
                                </button>
                                <button data-id="${athlete.cedula}" class="delete-btn" title="Eliminar">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#ef4444;">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    registeredDataContainer.innerHTML = tableHTML;
    
    // Añadir listeners para los botones de acción y ordenamiento
    addTableListeners();
};

/**
 * Maneja el clic en los encabezados para ordenar la tabla.
 * @param {string} field - El campo por el que se debe ordenar.
 */
const handleSort = (field) => {
    if (currentSortField === field) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    // Forzamos el re-renderizado de los datos actuales con el nuevo orden
    setupRealtimeListener(); 
};

const addTableListeners = () => {
    // Escuchar clics en los botones de editar/eliminar
    registeredDataContainer.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', () => deleteAthlete(button.getAttribute('data-id')));
    });

    // Escuchar clics en los botones de editar (carga el atleta al formulario)
    registeredDataContainer.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const cedulaId = button.getAttribute('data-id');
            // Cargar datos al formulario para edición
            cedulaInput.value = cedulaId;
            await buscarAtletaPorCedula();
        });
    });

    // Escuchar clics en los encabezados para ordenar
    registeredDataContainer.querySelectorAll('th[data-field]').forEach(header => {
        header.addEventListener('click', (e) => {
            const field = e.currentTarget.getAttribute('data-field');
            handleSort(field);
        });
    });
};

/**
 * Configura el listener de datos en tiempo real de Firestore.
 */
const setupRealtimeListener = () => {
    if (!db || !isAuthReady) return;
    
    // Obtener referencia a la colección de atletas (Public Data)
    // Ruta: /artifacts/{appId}/public/data/athletes
    const athletesColRef = collection(db, 'artifacts', appId, 'public', 'data', 'athletes');
    
    // Query simple (sin orderBy para evitar errores de índice en Canvas)
    const q = query(athletesColRef); 

    onSnapshot(q, (snapshot) => {
        const athletes = [];
        snapshot.forEach((doc) => {
            athletes.push({
                cedula: doc.id, // Usamos el ID del documento (la cédula)
                ...doc.data()
            });
        });
        
        renderTable(athletes);
        console.log("Data de atletas actualizada en tiempo real.");
    }, (error) => {
        console.error("Error en el listener de Firestore:", error);
        showMessage("Error de conexión en tiempo real.", 'error');
    });
};

// ===============================================
// INICIO DE LA APLICACIÓN
// ===============================================

initializeFirebase();
