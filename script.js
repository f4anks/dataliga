function handleFormSubmit(event) {
    // 1. Prevenir el comportamiento por defecto del formulario.
    event.preventDefault();

    // 2. Obtener los valores de cada campo del formulario.
    // Usamos .replace(/-/g, '') para eliminar todos los guiones '-'.
    const cedula = document.getElementById('cedula').value.replace(/-/g, '');
    const nombre = document.getElementById('nombre').value;
    const apellido = document.getElementById('apellido').value;
    const club = document.getElementById('club').value;
    const fechaNac = document.getElementById('fechaNac').value;
    const categoria = document.getElementById('categoria').value;
    const talla = document.getElementById('talla').value;
    const peso = document.getElementById('peso').value;
    const correo = document.getElementById('correo').value;
    const telefono = document.getElementById('telefono').value.replace(/-/g, '');
    
    // 3. Obtener el contenedor donde se mostrarán los datos.
    const registeredDataDiv = document.getElementById('registeredData');
    
    // 4. Ocultar el mensaje "No hay atletas registrados".
    const noDataMessage = registeredDataDiv.querySelector('.no-data-message');
    if (noDataMessage) {
        noDataMessage.style.display = 'none';
    }

    // 5. Crear una nueva tarjeta (div) para el atleta.
    const athleteCard = document.createElement('div');
    athleteCard.classList.add('athlete-card'); 

    // 6. Llenar la tarjeta con la información del atleta.
    athleteCard.innerHTML = `
        <p><strong>Cédula:</strong> ${cedula}</p>
        <p><strong>Nombre completo:</strong> ${nombre} ${apellido}</p>
        <p><strong>Club:</strong> ${club}</p>
        <p><strong>Categoría:</strong> ${categoria}</p>
        <p><strong>Fecha de Nac.:</strong> ${fechaNac}</p>
        <p><strong>Talla:</strong> ${talla ? talla + ' cm' : 'No especificada'}</p>
        <p><strong>Peso:</strong> ${peso ? peso + ' kg' : 'No especificado'}</p>
        <p><strong>Correo:</strong> ${correo}</p>
        <p><strong>Teléfono:</strong> ${telefono}</p>
    `;

    // 7. Añadir la nueva tarjeta de atleta al contenedor de resultados.
    registeredDataDiv.appendChild(athleteCard);

    // 8. Limpiar el formulario para un nuevo registro.
    document.getElementById('athleteForm').reset();
}
