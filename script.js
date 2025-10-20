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
 * @param {string} dateString - Fecha de nacimiento en formato YYYY-MM-DD.
 * @returns {number} Edad en años.
 */
function calculateAge(dateString) {
    const today = new Date();
    const birthDate = new Date(dateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const month = today.getMonth() - birthDate.getMonth();
    
    // Si aún no ha llegado el mes o el día de cumpleaños, resta 1 año
    if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

/**
 * Determina la categoría de voleibol basada en la edad.
 * Esto es un ejemplo, las categorías reales dependen de las normativas de la liga.
 * @param {number} age - Edad del atleta.
 * @returns {string} Categoría.
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
 * Muestra un mensaje al usuario.
 * @param {string} message - Mensaje a mostrar.
 * @param {boolean} isError - Si es un mensaje de error.
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

        // Intenta iniciar sesión con el token personalizado o anónimamente si no hay token
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        // Configura el listener de estado de autenticación
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // Si el usuario está autenticado (incluso anónimamente)
                userId = user.uid;
                console.log("Firebase Auth inicializado. UserID:", userId);
                // Una vez que tenemos el userId, podemos iniciar la sincronización de datos
                setupAthleteListener();
            } else {
                // Esto solo debería suceder si la sesión es cerrada manualmente (no esperado en este ambiente)
                console.log("Usuario desautenticado.");
                userId = crypto.randomUUID(); // Usar un ID aleatorio como fallback si no hay auth
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
    const collectionName = 'athletes'; // Nombre específico de la colección
    return `/artifacts/${appId}/public/data/${collectionName}`;
}

/**
 * Configura el listener en tiempo real de Firestore.
 */
function setupAthleteListener() {
    const athletesColRef = collection(db, getCollectionPath());
    const q = query(athletesColRef);

    // onSnapshot escucha los cambios en tiempo real
    onSnapshot(q, (snapshot) => {
        const tempAthletesData = [];
        snapshot.forEach((doc) => {
            tempAthletesData.push({ id: doc.id, ...doc.data() });
        });
        athletesData = tempAthletesData;
        document.getElementById('totalAthletesCount').textContent = `${athletesData.length} Atletas registrados.`;
        // Renderiza la tabla cada vez que los datos cambian
        renderTable();
        console.log("Datos de atletas actualizados desde Firestore.");
    }, (error) => {
        console.error("Error al escuchar cambios en Firestore:", error);
        showMessage("Error de sincronización con la base de datos.", true);
    });
}

/**
 * Guarda un nuevo atleta en Firestore.
 * @param {Object} data - Datos del atleta a guardar.
 */
async function saveAthleteData(data) {
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
 * Maneja la presentación del formulario.
 * @param {Event} e - Evento de envío del formulario.
 */
function handleFormSubmit(e) {
    e.preventDefault();

    const form = e.target;
    
    // Obtiene los valores del formulario
    const club = form.club.value.trim();
    const cedula = form.cedula.value.trim().toUpperCase(); // NUEVO CAMPO CEDULA
    const nombre = form.nombre.value.trim();
    const apellido = form.apellido.value.trim();
    const fechaNac = form.fechaNac.value;
    const posicion = form.posicion.value;
    const talla = parseFloat(form.talla.value);
    const peso = parseFloat(form.peso.value);
    const correo = form.correo.value.trim();
    const telefono = form.telefono.value.trim();
    const observaciones = form.observaciones.value.trim();

    // Validaciones básicas de negocio
    if (isNaN(talla) || isNaN(peso)) {
        showMessage("La Talla y el Peso deben ser números válidos.", true);
        return;
    }

    const age = calculateAge(fechaNac);
    const categoria = determineCategory(age);

    const newAthlete = {
        club: club,
        cedula: cedula, // AGREGAR CEDULA A LA DATA
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
        registeredBy: userId // Identificador del usuario que registró
    };

    saveAthleteData(newAthlete);
}

// =========================================================================
// 5. RENDERIZADO DE LA TABLA Y ORDENAMIENTO
// =========================================================================

/**
 * Ordena la lista de atletas.
 * @param {string} key - Clave para ordenar.
 * @param {boolean} toggleDirection - Si debe invertir la dirección si la clave es la misma.
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
        
        // Manejo de números (talla, peso, age)
        if (key === 'talla' || key === 'peso' || key === 'age') {
            const numA = parseFloat(valA) || 0;
            const numB = parseFloat(valB) || 0;
            comparison = numA - numB;
        } 
        // Manejo de strings (club, nombre, cedula, etc.)
        else {
            comparison = valA.toString().localeCompare(valB.toString());
        }

        return sortDirection === 'asc' ? comparison : comparison * -1;
    });

    renderTable();
}


/**
 * Renderiza la tabla de atletas en el DOM.
 */
function renderTable() {
    const tableBody = document.getElementById('athleteTableBody');
    let html = '';

    // Asegura que los datos se muestren ordenados por la clave actual antes de renderizar
    sortTable(currentSortKey, false);

    athletesData.forEach(data => {
        // Formatear valores numéricos y de fecha para la presentación
        const tallaFormatted = data.talla ? `${data.talla.toFixed(2)} m` : 'N/A';
        const pesoFormatted = data.peso ? `${data.peso.toFixed(1)} kg` : 'N/A';
        const dateObject = new Date(data.fechaNac + 'T00:00:00'); // Añadir T00:00:00 para evitar problemas de zona horaria
        const fechaNacFormatted = dateObject.toLocaleDateString('es-VE'); // Formato local de Venezuela
        
        html += `<tr data-id="${data.id}">`;
        html += `
            <td data-label="Club" class="table-data">${data.club}</td>
            <td data-label="Cédula" class="table-data">${data.cedula}</td> <!-- CÉDULA DE IDENTIDAD -->
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

    // Actualiza la visualización de la dirección de ordenamiento en los encabezados
    document.querySelectorAll('#athleteTable th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.getAttribute('data-sort-key') === currentSortKey) {
            th.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

/**
 * Configura los event listeners para ordenar la tabla al hacer clic en los encabezados.
 */
function setupSorting() {
    document.querySelectorAll('#athleteTable th').forEach(header => {
        const key = header.getAttribute('data-sort-key');
        if (key) {
            header.style.cursor = 'pointer'; 
            // Elimina listeners duplicados antes de añadir uno nuevo (si aplica)
            header.removeEventListener('click', header.clickHandler); 
            
            // Asigna una función con nombre para poder removerla después
            header.clickHandler = () => sortTable(key, true); 
            header.addEventListener('click', header.clickHandler); 
        }
    });
}

// =========================================================================
// 6. INICIO Y EVENTOS
// =========================================================================

// Configura los event listeners una vez que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializa Firebase y Auth (esto a su vez llama a setupAthleteListener)
    initializeFirebase(); 

    // 2. Configura el envío del formulario
    document.getElementById('athleteForm').addEventListener('submit', handleFormSubmit);

    // 3. Configura el ordenamiento de la tabla
    setupSorting();

    // 4. Configura el event listener para los botones de eliminar (delegación de eventos)
    document.getElementById('athleteTableBody').addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            // Implementación de la eliminación
            const docId = e.target.getAttribute('data-id');
            // Nota: Para la eliminación, se necesita importar 'deleteDoc' y 'doc'
            // del paquete 'firebase/firestore'. Esto es solo un placeholder,
            // ya que la funcionalidad de eliminación no se había solicitado previamente.
            console.log(`Intento de eliminar el documento con ID: ${docId}`);
            showMessage(`Funcionalidad de eliminación no implementada (ID: ${docId}).`, true);
        }
    });
});
