// 1. IMPORTACIONES DE FIREBASE
// Se utiliza la versión 10.12.0 de Firebase para compatibilidad y estabilidad.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    query, 
    addDoc, 
    onSnapshot, 
    doc, 
    deleteDoc, 
    setLogLevel 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// VARIABLES DE ESTADO Y FIREBASE
let db;
let auth;
let userId = ''; 
let athletesData = []; // Array que contendrá los datos sincronizados de Firestore
let currentSortKey = 'apellido'; // Clave de ordenamiento inicial
let sortDirection = 'asc'; // Dirección de ordenamiento inicial

// Ajustar el nivel de log para depuración (opcional, ayuda a ver la actividad de Firebase)
setLogLevel('Debug');

// =========================================================================
// CONFIGURACIÓN DE FIREBASE
// =========================================================================
const EXTERNAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyA5u1whBdu_fVb2Kw7SDRZbuyiM77RXVDE",
  authDomain: "datalvmel.firebaseapp.com",
  projectId: "datalvmel",
  storageBucket: "datalvmel.appspot.com",
  messagingSenderId: "956385153245",
  appId: "1:956385153245:web:ec25950839f3737b629470",
  measurementId: "G-GRL4X6V300"
};

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : EXTERNAL_FIREBASE_CONFIG;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// =========================================================================
// 2. UTILIDADES
// =========================================================================

/**
 * Calcula la edad a partir de la fecha de nacimiento.
 */
function calculateAge(dateString) {
    const today = new Date();
    const birthDate = new Date(dateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const month = today.getMonth() - birthDate.getMonth();
    
    if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

/**
 * Determina la categoría de voleibol basada en la edad.
 */
function determineCategory(age) {
    if (age >= 19) return "Mayor";
    if (age >= 17) return "Juvenil";
    if (age >= 15) return "Cadete";
    if (age >= 13) return "Infantil";
    if (age >= 11) return "Minivol";
    return "Semillero";
}

/**
 * Muestra un mensaje al usuario en el recuadro personalizado.
 */
function showMessage(message, isError = false) {
    const messageBox = document.getElementById('messageBox');
    messageBox.textContent = message;
    messageBox.classList.remove('hidden', 'error', 'success');
    messageBox.classList.add(isError ? 'error' : 'success');
    setTimeout(() => {
        messageBox.classList.add('hidden');
    }, 5000);
}

// =========================================================================
// 3. FIREBASE Y AUTENTICACIÓN
// =========================================================================

async function initializeFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Intenta autenticar. Si hay token, lo usa. Si no, usa anónimo.
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        // Listener para obtener el UID después de la autenticación
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                console.log("Firebase Auth inicializado. UserID:", userId);
                setupAthleteListener();
            } else {
                console.log("Usuario desautenticado.");
                userId = crypto.randomUUID(); 
            }
        });
    } catch (error) {
        console.error("Error al inicializar Firebase o autenticar:", error);
        showMessage("Error al conectar con la base de datos.", true);
    }
}

// =========================================================================
// 4. DATOS Y SINCRONIZACIÓN (Firestore)
// =========================================================================

/**
 * Define la ruta de la colección para datos públicos compartidos.
 */
function getCollectionPath() {
    const collectionName = 'athletes'; 
    // Data pública: /artifacts/{appId}/public/data/{your_collection_name}
    return `/artifacts/${appId}/public/data/${collectionName}`;
}

/**
 * Configura el listener en tiempo real de Firestore (onSnapshot).
 */
function setupAthleteListener() {
    if (!db) return; 
    
    const athletesColRef = collection(db, getCollectionPath());
    const q = query(athletesColRef);

    onSnapshot(q, (snapshot) => {
        const tempAthletesData = [];
        snapshot.forEach((doc) => {
            tempAthletesData.push({ id: doc.id, ...doc.data() });
        });
        athletesData = tempAthletesData;
        
        // 1. Aplicar el ordenamiento después de obtener los datos
        // NOTA: Esta es la única llamada a sortTable que no es por un click del usuario.
        sortTable(currentSortKey, false); 
        
        // 2. Renderizar la tabla con los datos ya ordenados
        document.getElementById('totalAthletesCount').textContent = `${athletesData.length} Atletas registrados.`;
        renderTable(); 
        console.log("Datos de atletas actualizados desde Firestore.");
    }, (error) => {
        console.error("Error al escuchar cambios en Firestore:", error);
        showMessage("Error de sincronización con la base de datos.", true);
    });
}

/**
 * Guarda un nuevo atleta en Firestore.
 */
async function saveAthleteData(data) {
    if (!db) {
        showMessage("Error: La base de datos no está inicializada.", true);
        return;
    }
    try {
        const athletesColRef = collection(db, getCollectionPath());
        await addDoc(athletesColRef, data);
        showMessage("Atleta registrado exitosamente.");
        document.getElementById('athleteForm').reset();
    } catch (e) {
        console.error("Error adding document: ", e);
        showMessage("Error al guardar el atleta: " + e.message, true);
    }
}

/**
 * Elimina un atleta de Firestore.
 */
async function deleteAthleteData(docId) {
    if (!db) {
        showMessage("Error: La base de datos no está inicializada.", true);
        return;
    }
    try {
        const docRef = doc(db, getCollectionPath(), docId);
        await deleteDoc(docRef);
        showMessage("Atleta eliminado correctamente.", false);
    } catch (error) {
        console.error("Error al eliminar el documento: ", error);
        showMessage("Error al eliminar el atleta.", true);
    }
}


/**
 * Maneja la presentación del formulario, PREVIENE LA RECARGA.
 */
function handleFormSubmit(e) {
    e.preventDefault(); // CLAVE PARA EVITAR LA RECARGA

    const form = e.target;
    
    // Obtiene y valida los valores del formulario
    const club = form.club.value.trim();
    const cedula = form.cedula.value.trim().toUpperCase(); 
    const nombre = form.nombre.value.trim();
    const apellido = form.apellido.value.trim();
    const fechaNac = form.fechaNac.value;
    const posicion = form.posicion.value;
    const talla = parseFloat(form.talla.value);
    const peso = parseFloat(form.peso.value);
    const correo = form.correo.value.trim();
    const telefono = form.telefono.value.trim();
    const observaciones = form.observaciones.value.trim();

    if (isNaN(talla) || isNaN(peso)) {
        showMessage("La Talla y el Peso deben ser números válidos.", true);
        return;
    }

    const age = calculateAge(fechaNac);
    const categoria = determineCategory(age);

    const newAthlete = {
        club: club,
        cedula: cedula, 
        nombre: nombre,
        apellido: apellido,
        fechaNac: fechaNac,
        posicion: posicion,
        talla: talla,
        peso: peso,
        correo: correo,
        telefono: telefono,
        observaciones: observaciones,
        age: age,
        categoria: categoria,
        createdAt: new Date().toISOString(),
        registeredBy: userId 
    };

    saveAthleteData(newAthlete);
}

// =========================================================================
// 5. RENDERIZADO DE LA TABLA Y ORDENAMIENTO
// =========================================================================

/**
 * Ordena la lista de atletas.
 * Solo modifica el array global athletesData. NO llama a renderTable.
 */
function sortTable(key, toggleDirection = false) {
    if (currentSortKey === key && toggleDirection) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortKey = key;
        sortDirection = 'asc';
    }

    athletesData.sort((a, b) => {
        const valA = a[key] || '';
        const valB = b[key] || '';

        let comparison = 0;
        
        // Manejo de números (talla, peso, edad)
        if (key === 'talla' || key === 'peso' || key === 'age') {
            const numA = parseFloat(valA) || 0;
            const numB = parseFloat(valB) || 0;
            comparison = numA - numB;
        } 
        // Manejo de strings
        else {
            comparison = valA.toString().localeCompare(valB.toString());
        }

        return sortDirection === 'asc' ? comparison : comparison * -1;
    });

    // IMPORTANTE: No hay llamada a renderTable() aquí.
}


/**
 * Renderiza la tabla de atletas en el DOM.
 * Solo lee el array global athletesData. NO llama a sortTable.
 */
function renderTable() {
    const tableBody = document.getElementById('athleteTableBody');
    let html = '';

    // Asumimos que athletesData ya está ordenado
    athletesData.forEach(data => {
        // Formatear valores
        const tallaFormatted = data.talla ? `${data.talla.toFixed(2)} m` : 'N/A';
        const pesoFormatted = data.peso ? `${data.peso.toFixed(1)} kg` : 'N/A';
        const dateObject = new Date(data.fechaNac + 'T00:00:00'); 
        const fechaNacFormatted = dateObject.toLocaleDateString('es-VE', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }); 
        
        html += `<tr data-id="${data.id}">`;
        html += `
            <td data-label="Club" class="table-data">${data.club}</td>
            <td data-label="Cédula" class="table-data">${data.cedula}</td> 
            <td data-label="Nombre" class="table-data">${data.nombre}</td>
            <td data-label="Apellido" class="table-data">${data.apellido}</td>
            <td data-label="F. Nac." class="table-data table-hidden-mobile">${fechaNacFormatted} (${data.age} años)</td>
            <td data-label="Categoría" class="table-data">${data.categoria}</td>
            <td data-label="Talla" class="table-data table-hidden-mobile">${tallaFormatted}</td>
            <td data-label="Peso" class="table-data table-hidden-mobile">${pesoFormatted}</td>
            <td data-label="Correo" class="table-data table-hidden-desktop">${data.correo}</td>
            <td data-label="Teléfono" class="table-data table-hidden-desktop">${data.telefono}</td>
            <td data-label="Acciones" class="table-data actions-cell"><button class="delete-btn" data-id="${data.id}">Eliminar</button></td>
        `;
        html += `</tr>`;
    });

    tableBody.innerHTML = html;

    // Actualiza el indicador de ordenamiento
    document.querySelectorAll('#athleteTable th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.getAttribute('data-sort-key') === currentSortKey) {
            th.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

/**
 * Configura los event listeners para ordenar la tabla.
 */
function setupSorting() {
    document.querySelectorAll('#athleteTable th').forEach(header => {
        const key = header.getAttribute('data-sort-key');
        if (key) {
            header.style.cursor = 'pointer'; 
            
            // Asignamos la función de manejo de clic que ORDENA y luego RENDERIZA
            header.addEventListener('click', () => {
                sortTable(key, true); // 1. Ordena los datos
                renderTable(); // 2. Vuelve a dibujar la tabla con los datos ordenados
            }); 
        }
    });
}

// =========================================================================
// 6. INICIO Y EVENTOS
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializa Firebase y Auth (esto llama a setupAthleteListener cuando el usuario está listo)
    initializeFirebase(); 

    // 2. Configura el envío del formulario
    document.getElementById('athleteForm').addEventListener('submit', handleFormSubmit);

    // 3. Configura el ordenamiento de la tabla
    setupSorting();

    // 4. Configura el event listener para los botones de eliminar (delegación de eventos)
    document.getElementById('athleteTableBody').addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const docId = e.target.getAttribute('data-id');
            
            if (window.confirm(`¿Estás seguro que deseas eliminar permanentemente al atleta con ID ${docId}?`)) {
                 await deleteAthleteData(docId);
            } else {
                 showMessage("Eliminación cancelada.", false);
            }
        }
    });
});
