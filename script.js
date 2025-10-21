// ... funciones y lógica superior ...

/**
 * RENDERIZADO DE LA TABLA
 */
function renderTable() {
    // ... código de verificación de datos ...

    if (!table) {
        registeredDataContainer.innerHTML = `
            <div class="table-responsive-wrapper"> 
                <table id="athleteTable" class="athlete-data-table">
                    <thead>
                        <tr class="table-header-row">
                                                    </tr>
                    </thead>
                    <tbody id="athleteTableBody">
                    </tbody>
                </table>
            </div>
            <p class="table-note-message">Haz clic en cualquier encabezado de la tabla para ordenar los resultados.</p>
        `;
        // ...
    } 
    // ...
}

// ...
