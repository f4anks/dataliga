// 1. IMPORTACIONES DE FIREBASE
// Usamos versiones estables para evitar errores 404 al cargar desde CDN.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// VARIABLES DE ESTADO Y FIREBASE
let app;
let db;
let auth;
let userId = ''; 
let athletesData = []; // Array que contendrá los datos sincronizados de Firestore
let clubsData = []; // Array que contendrá los clubes sincronizados de Firestore
let currentSortKey = 'apellido'; 
let sortDirection = 'asc'; 

// Ajustar el nivel de log para depuración (útil para ver actividad de Firestore)
setLogLevel('Debug');

// Variables globales proporcionadas por el entorno (Canvas)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// =========================================================================
// 2. UTILIDADES
// =========================================================================

/**
 * Calcula la categoría del atleta basada en su fecha de nacimiento.
 * @param {string} dateString Fecha de nacimiento en formato YYYY-MM-DD.
 * @returns {string} Categoría (ej: Sub-13).
 */
function calculateCategory(dateString) {
    if (!dateString) return 'N/A';
    
    const birthDate = new Date(dateString);
    const today = new Date();
    
    let age = today.getFullYear() - birthDate.getFullYear();
    
    // Ajuste por mes y día
    const monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    if (age <= 12) return 'Mini Voleibol (Sub-13)';
    if (age <= 14) return 'Infantil (Sub-15)';
    if (age <= 16) return 'Menor (Sub-17)';
    if (age <= 18) return 'Juvenil (Sub-19)';
    return 'Adulto';
}

/**
 * Muestra mensajes de estado en la UI.
 * @param {string} message Mensaje a mostrar.
 * @param {boolean} isError Si es true, el mensaje se muestra en rojo.
 */
function showStatus(message, isError = false) {
    const statusMessageEl = document.getElementById('statusMessage');
    statusMessageEl.textContent = message;
    statusMessageEl.classList.remove('hidden', 'text-vinotinto-primary', 'text-red-600');
    statusMessageEl.classList.add(isError ? 'text-red-600' : 'text-vinotinto-primary');
    
    // Ocultar después de 5 segundos
    setTimeout(() => {
        statusMessageEl.classList.add('hidden');
    }, 5000);
}


// =========================================================================
// 3. FIREBASE Y AUTENTICACIÓN
// =========================================================================

async function initFirebaseAndAuth() {
    if (!firebaseConfig) {
        console.error("Firebase config is missing. Cannot initialize app.");
        return;
    }

    // 1. Inicializar
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
    } catch (e) {
        console.error("Error al inicializar Firebase:", e);
        return;
    }

    // 2. Autenticación (con token si está disponible, sino anónima)
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Firebase Auth Error:", error);
    }
    
    // 3. Obtener el userId e iniciar la escucha de datos
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            console.log("Usuario autenticado. UID:", userId);
            setupDataListeners(); 
            setupEventListeners(); 
        } else {
            // Esto solo debería pasar si la autenticación anónima falla
            userId = crypto.randomUUID();
            document.getElementById('loadingMessage').textContent = "Error de autenticación. No se pueden cargar los datos.";
        }
    });
}

// =========================================================================
// 4. GESTIÓN DE CLUBES (DINÁMICO)
// =========================================================================

/**
 * Renderiza dinámicamente las opciones de clubes en el selector.
 */
function renderClubs(clubs) {
    const clubSelect = document.getElementById('club');
    const addClubContainer = document.getElementById('addClubContainer');
    
    clubSelect.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.textContent = clubs.length > 0 ? "Seleccione un Club" : "Añadiendo Clubes...";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    clubSelect.appendChild(defaultOption);

    clubs.forEach(club => {
        const option = document.createElement('option');
        option.value = club.name; 
        option.textContent = club.name;
        clubSelect.appendChild(option);
    });

    // Controlar la visibilidad y estado del selector
    if (clubs.length === 0) {
        clubSelect.disabled = true;
        addClubContainer.classList.remove('hidden');
        showStatus("¡Necesitas añadir un club antes de registrar un atleta!", true);
    } else {
        clubSelect.disabled = false;
        addClubContainer.classList.add('hidden');
    }
}

/**
 * Configura la escucha en tiempo real para la colección de clubes (públicos).
 */
function loadClubs() {
    // Colección pública: artifacts/{appId}/public/data/clubs
    const clubsCollectionRef = collection(db, `artifacts/${appId}/public/data/clubs`);
    
    onSnapshot(clubsCollectionRef, (snapshot) => {
        clubsData = [];
        snapshot.forEach((doc) => {
            clubsData.push({ id: doc.id, ...doc.data() });
        });
        
        renderClubs(clubsData);
        console.log("Clubes cargados:", clubsData);
    }, (error) => {
        console.error("Error al cargar clubes:", error);
        showStatus("Error al cargar la lista de clubes.", true);
    });
}

/**
 * Añade un nuevo club a la base de datos.
 */
async function addClub() {
    const newClubInput = document.getElementById('newClubName');
    const clubName = newClubInput.value.trim();
    
    if (!clubName) {
        showStatus("Ingresa un nombre para el club.", true);
        return;
    }

    if (clubsData.some(club => club.name.toLowerCase() === clubName.toLowerCase())) {
        showStatus(`El club '${clubName}' ya existe.`, true);
        newClubInput.value = '';
        return;
    }

    try {
        const clubsCollectionRef = collection(db, `artifacts/${appId}/public/data/clubs`);
        await addDoc(clubsCollectionRef, {
            name: clubName,
            createdAt: new Date().toISOString(),
            registeredBy: userId 
        });
        
        newClubInput.value = '';
        showStatus(`¡Club '${clubName}' añadido exitosamente!`);
    } catch (e) {
        console.error("Error al añadir club:", e);
        showStatus("Error al guardar el club. Intenta de nuevo.", true);
    }
}


// =========================================================================
// 5. GESTIÓN DE ATLETAS (EL BLOQUE CON EL FALLO REPORTADO)
// =========================================================================

/**
 * Configura la escucha en tiempo real para la colección de atletas (privada).
 */
function loadAthletes() {
    // Colección privada para el usuario: artifacts/{appId}/users/{userId}/athletes
    const athletesCollectionPath = `artifacts/${appId}/users/${userId}/athletes`;
    const athletesCollectionRef = collection(db, athletesCollectionPath);
    
    const loadingMessageEl = document.getElementById('loadingMessage');
    const noDataMessageEl = document.getElementById('noDataMessage');

    onSnapshot(athletesCollectionRef, (snapshot) => {
        athletesData = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            data.categoria = calculateCategory(data.fechaNac);
            athletesData.push({ id: doc.id, ...data });
        });
        
        // ** PUNTO CRÍTICO: Disparar el renderizado con ordenamiento **
        sortTable(currentSortKey, false); 
        
        // Actualizar mensajes de estado
        loadingMessageEl.classList.add('hidden');
        noDataMessageEl.classList.toggle('hidden', athletesData.length > 0);
        console.log("Atletas cargados:", athletesData);
        
    }, (error) => {
        console.error("Error al cargar atletas:", error);
        loadingMessageEl.textContent = "Error al cargar los datos.";
        noDataMessageEl.classList.add('hidden');
    });
}

/**
 * Renderiza la tabla de atletas en el DOM.
 * @param {Array<Object>} dataToRender Array de atletas a mostrar.
 */
function renderTable(dataToRender) {
    const tableBody = document.getElementById('athleteTableBody');
    tableBody.innerHTML = ''; // Limpia la tabla COMPLETAMENTE

    dataToRender.forEach(data => {
        // Aseguramos que los valores sean seguros para mostrar
        const peso = data.peso || 0;
        const talla = data.talla || 0;
        
        data.pesoFormatted = `${peso} kg`;
        data.tallaFormatted = `${talla} cm`;
        
        const row = tableBody.insertRow();
        row.className = 'bg-card-light hover:bg-yellow-100 transition duration-150';
        row.innerHTML = `
            <td data-label="Club" class="table-data">${data.club || 'N/A'}</td>
            <td data-label="Nombre" class="table-data">${data.nombre || 'N/A'}</td>
            <td data-label="Apellido" class="table-data">${data.apellido || 'N/A'}</td>
            <td data-label="F. Nac." class="table-data table-hidden-mobile">${data.fechaNac || 'N/A'}</td>
            <td data-label="Categoría" class="table-data">${data.categoria || 'N/A'}</td>
            <td data-label="Talla" class="table-data table-hidden-mobile">${data.tallaFormatted}</td>
            <td data-label="Peso" class="table-data table-hidden-mobile">${data.pesoFormatted}</td>
            <td data-label="Correo" class="table-data table-hidden-desktop">${data.correo || 'N/A'}</td>
            <td data-label="Teléfono" class="table-data table-hidden-desktop">${data.telefono || 'N/A'}</td>
        `;
    });

    // Actualiza la clase CSS para indicar el ordenamiento actual
    document.querySelectorAll('#athleteTable th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.getAttribute('data-sort-key') === currentSortKey) {
            th.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

/**
 * Ordena la tabla de atletas por una clave específica.
 */
function sortTable(key, toggleDirection) {
    const currentData = athletesData.slice(); 

    if (toggleDirection) {
        if (currentSortKey === key) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortKey = key;
            sortDirection = 'asc';
        }
    }

    currentData.sort((a, b) => {
        let valA = a[key] || '';
        let valB = b[key] || '';
        
        if (key === 'talla' || key === 'peso') {
            valA = parseFloat(valA);
            valB = parseFloat(valB);
        }
        
        // Usamos localeCompare para ordenamiento de strings robusto
        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    renderTable(currentData);
}


// =========================================================================
// 6. SETUP DE EVENTOS Y FORMULARIO
// =========================================================================

/**
 * Configura los listeners de datos de Firebase (Clubes y Atletas).
 */
function setupDataListeners() {
    loadClubs();
    loadAthletes(); // Inicia la escucha de atletas
}


/**
 * Configura todos los event listeners del DOM.
 */
function setupEventListeners() {
    document.getElementById('athleteForm').addEventListener('submit', handleFormSubmit);

    document.querySelectorAll('#athleteTable th').forEach(header => {
        const key = header.getAttribute('data-sort-key');
        if (key) {
            header.style.cursor = 'pointer'; 
            header.addEventListener('click', () => sortTable(key, true)); 
        }
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
        filterTable(e.target.value);
    });
    
    document.getElementById('addClubButton').addEventListener('click', addClub);
}

/**
 * Maneja el envío del formulario de registro de atletas.
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (clubsData.length === 0 || !document.getElementById('club').value) {
        showStatus("Por favor, selecciona o añade un club antes de registrar.", true);
        return;
    }
    
    const form = e.target;
    const formData = {
        club: form.club.value.trim(),
        nombre: form.nombre.value.trim(),
        apellido: form.apellido.value.trim(),
        fechaNac: form.fechaNac.value,
        genero: form.genero.value,
        talla: parseFloat(form.talla.value),
        peso: parseFloat(form.peso.value),
        correo: form.correo.value.trim() || null, 
        telefono: form.telefono.value.trim() || null,
        posicion: form.posicion.value || null,
        timestamp: new Date().toISOString()
    };
    
    try {
        const athletesCollectionPath = `artifacts/${appId}/users/${userId}/athletes`;
        await addDoc(collection(db, athletesCollectionPath), formData);
        
        form.reset();
        form.club.selectedIndex = 0; 
        showStatus('¡Atleta registrado exitosamente!');
    } catch (error) {
        console.error("Error al añadir documento:", error);
        showStatus('Error al registrar el atleta. Verifica la consola.', true);
    }
}

function filterTable(searchTerm) {
    const lowerCaseSearch = searchTerm.toLowerCase();
    
    const filteredData = athletesData.filter(athlete => {
        const searchableText = `${athlete.nombre} ${athlete.apellido} ${athlete.club} ${athlete.categoria} ${athlete.correo}`.toLowerCase();
        return searchableText.includes(lowerCaseSearch);
    });

    renderTable(filteredData);
    document.getElementById('noDataMessage').classList.toggle('hidden', filteredData.length > 0);
}


// =========================================================================
// 7. INICIO DE LA APLICACIÓN
// =========================================================================
initFirebaseAndAuth();
