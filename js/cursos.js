import { db, auth } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- IMPORTACIONES PARA AUTENTICACIÓN Y CIERRE DE SESIÓN ---
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// --- REFERENCIAS AL DOM ---
const nombreCurso = document.getElementById("nombreCurso");
const codigoCurso = document.getElementById("codigoCurso");
const semestreInput = document.getElementById("semestre");
const tablaCursos = document.getElementById("tablaCursos");
const btnAgregarCurso = document.getElementById("btnAgregarCurso");
const btnCancelarEdicion = document.getElementById("btnCancelarEdicion");
const formTitle = document.getElementById("formTitle");

// REFERENCIA A LA COLECCIÓN
const cursosRef = collection(db, "cursos");

// Variable de estado para edición
let editId = null;

/**
 * 0. PROTECCIÓN DE RUTA Y SESIÓN
 */
onAuthStateChanged(auth, (user) => {
    if (!user) {
        // Si no hay usuario, redirigir al login inmediatamente
        window.location.replace("index.html");
    }
});

/**
 * 1. PROCESAR CURSO (AGREGAR O ACTUALIZAR)
 */
async function procesarCurso() {
  const nombre = nombreCurso.value.trim();
  const codigo = codigoCurso.value.trim();
  const semestre = semestreInput.value.trim();

  if (!nombre || !codigo || !semestre) {
    alert("Por favor, complete todos los campos.");
    return;
  }

  try {
    if (editId) {
      // Lógica de Actualización
      const docRef = doc(db, "cursos", editId);
      await updateDoc(docRef, {
        nombre,
        codigo,
        semestre,
        actualizado: serverTimestamp()
      });
      alert("Curso actualizado correctamente.");
    } else {
      // Lógica de Inserción
      await addDoc(cursosRef, {
        nombre,
        codigo,
        semestre,
        creado: serverTimestamp()
      });
      alert("Curso agregado correctamente.");
    }

    resetearFormulario();
    mostrarCursos();
  } catch (error) {
    console.error("Error al procesar curso:", error);
    alert("Error al intentar guardar los cambios.");
  }
}

/**
 * 2. MOSTRAR CURSOS CON BOTONES DE ACCIÓN
 */
async function mostrarCursos() {
  if(!tablaCursos) return;
  tablaCursos.innerHTML = "<tr><td colspan='4'>Cargando cursos...</td></tr>";

  try {
    const snapshot = await getDocs(cursosRef);
    tablaCursos.innerHTML = "";

    if (snapshot.empty) {
      tablaCursos.innerHTML = "<tr><td colspan='4'>No hay cursos registrados.</td></tr>";
      return;
    }

    snapshot.forEach(docSnap => {
      const curso = docSnap.data();
      const id = docSnap.id;

      const tr = document.createElement("tr");
      tr.innerHTML = `
            <td>${curso.codigo}</td>
            <td>${curso.nombre}</td>
            <td>${curso.semestre}</td>
            <td>
                <button class="btn-primary btn-edit" data-id="${id}" 
                        data-nombre="${curso.nombre}" 
                        data-codigo="${curso.codigo}" 
                        data-semestre="${curso.semestre}">Editar</button>
                <button class="btn-danger btn-delete" data-id="${id}">Eliminar</button>
            </td>
        `;
      tablaCursos.appendChild(tr);
    });

    // Eventos para Editar
    document.querySelectorAll(".btn-edit").forEach(btn => {
      btn.onclick = () => prepararEdicion(btn.dataset);
    });

    // Eventos para Eliminar
    document.querySelectorAll(".btn-delete").forEach(btn => {
      btn.onclick = () => eliminarCursoCompleto(btn.getAttribute("data-id"));
    });

  } catch (error) {
    console.error("Error al obtener cursos:", error);
  }
}

/**
 * 3. PREPARAR INTERFAZ PARA EDICIÓN
 */
function prepararEdicion(datos) {
  editId = datos.id;
  nombreCurso.value = datos.nombre;
  codigoCurso.value = datos.codigo;
  semestreInput.value = datos.semestre;

  // Cambiar textos de la interfaz
  formTitle.textContent = "Editar curso";
  btnAgregarCurso.textContent = "Actualizar curso";
  btnCancelarEdicion.style.display = "inline-block";
  nombreCurso.focus();
}

/**
 * 4. RESETEAR FORMULARIO A ESTADO INICIAL
 */
function resetearFormulario() {
  editId = null;
  nombreCurso.value = "";
  codigoCurso.value = "";
  semestreInput.value = "";
  formTitle.textContent = "Nuevo curso";
  btnAgregarCurso.textContent = "Agregar curso";
  btnCancelarEdicion.style.display = "none";
}

/**
 * 5. ELIMINAR EN CASCADA
 */
async function eliminarCursoCompleto(idCurso) {
  const confirmacion = confirm("¿Estás seguro de eliminar este curso? Se borrarán estudiantes, notas y configuraciones asociadas.");
  if (!confirmacion) return;

  try {
    const batch = writeBatch(db);

    // Borrar Estudiantes asociados
    const qEst = query(collection(db, "estudiantes"), where("cursoId", "==", idCurso));
    const snapEst = await getDocs(qEst);
    snapEst.forEach(docEst => batch.delete(docEst.ref));

    // Borrar Notas asociadas
    const qNotas = query(collection(db, "notas"), where("cursoId", "==", idCurso));
    const snapNotas = await getDocs(qNotas);
    snapNotas.forEach(docNota => batch.delete(docNota.ref));

    // Borrar Configuración y Curso
    batch.delete(doc(db, "configuracion", idCurso));
    batch.delete(doc(db, "cursos", idCurso));

    await batch.commit();
    alert("Curso y datos relacionados eliminados correctamente.");
    mostrarCursos();
  } catch (error) {
    console.error("Error en borrado en cascada:", error);
  }
}

/**
 * 6. FUNCIÓN DE CIERRE DE SESIÓN
 */
window.logout = async function() {
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
        try {
            await signOut(auth);
            // Redirección manual por seguridad
            window.location.replace("index.html");
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            alert("No se pudo cerrar la sesión.");
        }
    }
};

// --- LISTENERS ---
if(btnAgregarCurso) btnAgregarCurso.addEventListener("click", procesarCurso);
if(btnCancelarEdicion) btnCancelarEdicion.addEventListener("click", resetearFormulario);

// Carga inicial
mostrarCursos();