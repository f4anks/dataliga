// ... (Funciones y código de inicialización no modificados) ...

/**
 * RENDERIZADO DE LA TABLA (SE REORGANIZA EL ORDEN DE LAS COLUMNAS)
 */
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
                            <th data-sort-key="apellido">Apellido</th>
                            <th data-sort-key="nombre">Nombre</th>
                            <th data-sort-key="cedula">Cédula</th>
                            <th data-sort-key="division">División</th>
                            <th data-sort-key="club">Club</th> 
                            <th data-sort-key="fechaNac" class="table-hidden-mobile">F. Nac.</th>
                            <th data-sort-key="tallaRaw" class="table-hidden-mobile">Talla (m)</th>
                            <th data-sort-key="pesoRaw" class="table-hidden-mobile">Peso (kg)</th>
                            <th data-sort-key="correo" class="table-hidden-desktop">Correo</th>
                            <th data-sort-key="telefono" class="table-hidden-desktop">Teléfono</th>
                        </tr>
                    </thead>
                    <tbody id="athleteTableBody">
                    </tbody>
                </table>
            </div>
            <p class="table-note-message">Haz clic en cualquier encabezado de la tabla para ordenar los resultados.</p>
        `;
        tableBody = document.getElementById('athleteTableBody');
        setupSorting(); 
    } else {
        tableBody.innerHTML = '';
    }
    
    athletesData.forEach(data => {
        const newRow = tableBody.insertRow(-1); 
        newRow.classList.add('athlete-table-row');
        
        // ASEGURAR QUE CADA TD COINCIDA CON EL ORDEN DEL TH ANTERIOR
        newRow.innerHTML = `
            <td data-label="Apellido" class="table-data">${data.apellido}</td>
            <td data-label="Nombre" class="table-data">${data.nombre}</td>
            <td data-label="Cédula" class="table-data">${data.cedula}</td>
            <td data-label="División" class="table-data">${data.division}</td>
            <td data-label="Club" class="table-data">${data.club}</td>
            <td data-label="F. Nac." class="table-data table-hidden-mobile">${data.fechaNac}</td>
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

// ... (Resto del código no modificado) ...
