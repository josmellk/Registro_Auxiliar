import { db, auth } from './firebase.js'; // Importamos auth desde tu archivo local
import { 
    collection, 
    getDocs, 
    doc, 
    getDoc, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- IMPORTACIONES PARA AUTENTICACIÓN Y CIERRE DE SESIÓN ---
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const cursoSelect = document.getElementById("cursoSelectConfig");
const mensajeConfig = document.getElementById("mensajeConfig");
const btnGuardar = document.getElementById("btnGuardarConfig");

const campos = ["u1_cc", "u1_cp", "u1_ca", "u2_cc", "u2_cp", "u2_ca"];

/**
 * 0. PROTECCIÓN DE RUTA
 * Si el usuario no está logueado, lo expulsa al index.html
 */
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace("index.html");
    }
});

/**
 * Carga los cursos disponibles en el select
 */
async function cargarCursos() {
    try {
        const querySnapshot = await getDocs(collection(db, "cursos"));
        cursoSelect.innerHTML = '<option value="">Seleccione un curso</option>';
        querySnapshot.forEach((docSnap) => {
            const curso = docSnap.data();
            const option = document.createElement("option");
            option.value = docSnap.id;
            option.textContent = `${curso.codigo} - ${curso.nombre}`;
            cursoSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error al cargar cursos:", error);
    }
}

/**
 * Carga la configuración del curso seleccionado o pone valores por defecto
 */
async function cargarConfiguracion() {
    const cursoId = cursoSelect.value;
    if (!cursoId) {
        setValoresDefault();
        return;
    }

    try {
        const docRef = doc(db, "configuracion", cursoId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const config = docSnap.data();
            campos.forEach(campo => {
                document.getElementById(campo).value = config[campo];
            });
            mensajeConfig.innerText = "Configuración cargada del curso.";
            mensajeConfig.className = "mensaje exito";
        } else {
            setValoresDefault();
            mensajeConfig.innerText = "Este curso no tiene configuración. Usando valores por defecto.";
            mensajeConfig.className = "mensaje info";
        }
    } catch (error) {
        console.error("Error al cargar configuración:", error);
    }
}

function setValoresDefault() {
    document.getElementById("u1_cc").value = 40;
    document.getElementById("u1_cp").value = 50;
    document.getElementById("u1_ca").value = 10;
    document.getElementById("u2_cc").value = 40;
    document.getElementById("u2_cp").value = 50;
    document.getElementById("u2_ca").value = 10;
}

/**
 * Guarda la configuración en Firestore usando el ID del curso como documento
 */
async function guardarConfiguracion() {
    const cursoId = cursoSelect.value;
    if (!cursoId) {
        alert("Debe seleccionar un curso para guardar su configuración.");
        return;
    }

    // Validar que la suma sea 100%
    const u1_cc = Number(document.getElementById("u1_cc").value);
    const u1_cp = Number(document.getElementById("u1_cp").value);
    const u1_ca = Number(document.getElementById("u1_ca").value);
    const u2_cc = Number(document.getElementById("u2_cc").value);
    const u2_cp = Number(document.getElementById("u2_cp").value);
    const u2_ca = Number(document.getElementById("u2_ca").value);

    if ((u1_cc + u1_cp + u1_ca) !== 100 || (u2_cc + u2_cp + u2_ca) !== 100) {
        mensajeConfig.innerText = "Error: La suma de los porcentajes en cada unidad debe ser 100%.";
        mensajeConfig.className = "mensaje error";
        return;
    }

    const config = {
        u1_cc, u1_cp, u1_ca,
        u2_cc, u2_cp, u2_ca,
        actualizado: new Date()
    };

    try {
        await setDoc(doc(db, "configuracion", cursoId), config);
        mensajeConfig.innerText = "Configuración guardada exitosamente.";
        mensajeConfig.className = "mensaje exito";
    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Hubo un error al guardar en la base de datos.");
    }
}

/**
 * FUNCIÓN DE CIERRE DE SESIÓN CORREGIDA
 */
window.logout = async function() {
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
        try {
            await signOut(auth);
            // Redirección manual por seguridad para limpiar el historial del navegador
            window.location.replace("index.html");
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            alert("No se pudo cerrar la sesión: " + error.message);
        }
    }
};

// Eventos
cursoSelect.addEventListener("change", cargarConfiguracion);
btnGuardar.addEventListener("click", guardarConfiguracion);

// Inicio
cargarCursos();