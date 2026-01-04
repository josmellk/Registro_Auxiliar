import { db, auth } from "./firebase.js"; // Se agrega 'auth' a la importación
import { 
    collection, addDoc, getDocs, query, where, deleteDoc, doc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- IMPORTACIONES PARA AUTENTICACIÓN Y CIERRE DE SESIÓN ---
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// Referencias al DOM
const cursoSelect = document.getElementById("cursoSelect");
const archivoExcel = document.getElementById("archivoExcel");
const tablaEstudiantes = document.getElementById("tablaEstudiantes");

// Inputs manuales
const addCodigo = document.getElementById("addCodigo");
const addApellidos = document.getElementById("addApellidos");
const addNombres = document.getElementById("addNombres");
const addCorreo = document.getElementById("addCorreo");
const btnManual = document.getElementById("btnManual");

const estudiantesRef = collection(db, "estudiantes");
const cursosRef = collection(db, "cursos");

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
 * Carga los cursos en el selector inicial
 */
async function cargarCursos() {
    try {
        const snapshot = await getDocs(cursosRef);
        cursoSelect.innerHTML = "<option value=''>Seleccione un curso</option>";
        snapshot.forEach(docSnap => {
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
 * Muestra estudiantes ordenados de A-Z por apellido con numeración
 */
async function mostrarEstudiantes() {
    const cursoId = cursoSelect.value;
    tablaEstudiantes.innerHTML = "";
    if (!cursoId) return;

    try {
        const q = query(estudiantesRef, where("cursoId", "==", cursoId));
        const snapshot = await getDocs(q);

        let listaEstudiantes = [];
        snapshot.forEach(docSnap => {
            listaEstudiantes.push({ id: docSnap.id, ...docSnap.data() });
        });

        listaEstudiantes.sort((a, b) => {
            const apellidoA = (a.apellidos || "").toLowerCase();
            const apellidoB = (b.apellidos || "").toLowerCase();
            return apellidoA.localeCompare(apellidoB);
        });

        listaEstudiantes.forEach((e, index) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight: bold; text-align: center; color: #7f8c8d;">${index + 1}</td>
                <td>${e.codigo}</td>
                <td>${e.apellidos}</td>
                <td>${e.nombres}</td>
                <td>${e.correo}</td>
                <td>
                    <button class="btn-danger" data-id="${e.id}">Eliminar</button>
                </td>
            `;
            tablaEstudiantes.appendChild(tr);
        });

        document.querySelectorAll(".btn-danger").forEach(btn => {
            btn.onclick = async () => {
                if (confirm("¿Está seguro de eliminar a este estudiante?")) {
                    await deleteDoc(doc(db, "estudiantes", btn.dataset.id));
                    mostrarEstudiantes();
                }
            };
        });
    } catch (error) {
        console.error("Error al mostrar estudiantes:", error);
    }
}

/**
 * Registro manual de estudiante
 */
btnManual.onclick = async () => {
    const cursoId = cursoSelect.value;
    if (!cursoId || !addCodigo.value || !addApellidos.value) {
        alert("Seleccione un curso y complete los apellidos y código.");
        return;
    }

    try {
        await addDoc(estudiantesRef, {
            cursoId,
            codigo: addCodigo.value,
            apellidos: addApellidos.value.trim(),
            nombres: addNombres.value.trim(),
            correo: addCorreo.value,
            creado: serverTimestamp()
        });
        
        addCodigo.value = ""; addApellidos.value = ""; 
        addNombres.value = ""; addCorreo.value = "";
        mostrarEstudiantes();
        alert("Estudiante registrado con éxito.");
    } catch (error) {
        console.error("Error al registrar:", error);
    }
};

/**
 * Procesar archivo Excel
 */
async function cargarExcel() {
    const archivo = archivoExcel.files[0];
    const cursoId = cursoSelect.value;

    if (!archivo || !cursoId) {
        alert("Seleccione el curso y el archivo Excel.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const hoja = workbook.Sheets[workbook.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja);

        for (const fila of filas) {
            await addDoc(estudiantesRef, {
                cursoId,
                codigo: String(fila.codigo || fila.Código || ""),
                apellidos: (fila.apellidos || fila.Apellidos || "").trim(),
                nombres: (fila.nombres || fila.Nombres || "").trim(),
                correo: fila.correo || fila.Correo || "",
                creado: serverTimestamp()
            });
        }
        alert("Carga desde Excel completada.");
        mostrarEstudiantes();
    };
    reader.readAsArrayBuffer(archivo);
}

/**
 * FUNCIÓN DE CIERRE DE SESIÓN CORREGIDA
 */
window.logout = async function() {
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
        try {
            await signOut(auth);
            // Forzamos redirección manual
            window.location.replace("index.html");
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            alert("No se pudo cerrar la sesión técnica: " + error.message);
        }
    }
};

// Eventos de cambio y carga
cursoSelect.addEventListener("change", mostrarEstudiantes);
document.getElementById("btnCargar").addEventListener("click", cargarExcel);

// Inicialización
cargarCursos();