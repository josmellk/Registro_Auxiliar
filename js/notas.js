import { db, auth } from './firebase.js';
import { 
    collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const cursoSelect = document.getElementById("cursoSelect");
const cuerpoNotas = document.getElementById("cuerpoNotas");
const btnImprimir = document.getElementById("btnImprimir");

let configuracion = { u1_cc: 0, u1_cp: 0, u1_ca: 0, u2_cc: 0, u2_cp: 0, u2_ca: 0 };
let columnasExtra = { 
    "u1-cc": 1, "u1-cp": 1, "u1-ca": 1, 
    "u2-cc": 1, "u2-cp": 1, "u2-ca": 1 
};

onAuthStateChanged(auth, (user) => {
    if (user) { cargarCursos(); } 
    else { window.location.replace("index.html"); }
});

window.logout = async function() {
    if (confirm("¿Cerrar sesión?")) {
        await signOut(auth);
        window.location.replace("index.html");
    }
};

window.agregarColumna = (crit) => { if (columnasExtra[crit] < 3) { columnasExtra[crit]++; mostrarNotas(); } };
window.quitarColumna = (crit) => { if (columnasExtra[crit] > 1) { columnasExtra[crit]--; mostrarNotas(); } };

async function cargarCursos() {
    const snap = await getDocs(collection(db, "cursos"));
    cursoSelect.innerHTML = "<option value=''>Seleccione un curso...</option>";
    snap.forEach(d => {
        cursoSelect.innerHTML += `<option value="${d.id}">${d.data().codigo} - ${d.data().nombre}</option>`;
    });
}

async function cargarPesosConfigurados(cursoId) {
    const docSnap = await getDoc(doc(db, "configuracion", cursoId));
    if (docSnap.exists()) {
        configuracion = docSnap.data();
        ['u1-cc','u1-cp','u1-ca','u2-cc','u2-cp','u2-ca'].forEach(k => {
            const el = document.getElementById(`p-${k}`);
            if(el) el.textContent = configuracion[k.replace('-','_')] || 0;
        });
    }
}

async function mostrarNotas() {
    const cursoId = cursoSelect.value;
    if (!cursoId) { cuerpoNotas.innerHTML = ""; return; }
    
    try {
        await cargarPesosConfigurados(cursoId);
        const snapEst = await getDocs(query(collection(db, "estudiantes"), where("cursoId", "==", cursoId)));
        const snapNotas = await getDocs(query(collection(db, "notas"), where("cursoId", "==", cursoId)));
        const notasData = snapNotas.docs.map(d => d.data());

        let lista = [];
        snapEst.forEach(d => lista.push({ id: d.id, ...d.data() }));
        lista.sort((a, b) => `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`));

        cuerpoNotas.innerHTML = "";
        lista.forEach((e, index) => {
            const n1 = notasData.find(n => n.estudianteId === e.id && n.unidad === "1") || {};
            const n2 = notasData.find(n => n.estudianteId === e.id && n.unidad === "2") || {};

            cuerpoNotas.innerHTML += `
                <tr data-id="${e.id}">
                    <td class="pdf-n" style="text-align:center; font-weight:bold;">${index + 1}</td>
                    <td class="pdf-cod" style="text-align:center;">${e.codigo}</td>
                    <td class="pdf-nom" style="text-align:left; padding-left:10px;">${e.apellidos}, ${e.nombres}</td>
                    <td>${generarInputs("u1-cc", n1.cc, e.id, "u1")}</td>
                    <td>${generarInputs("u1-cp", n1.cp, e.id, "u1")}</td>
                    <td>${generarInputs("u1-ca", n1.ca, e.id, "u1")}</td>
                    <td class="p-u1 pdf-u1" style="font-weight:bold; background:#f8fafc">0.00</td>
                    <td>${generarInputs("u2-cc", n2.cc, e.id, "u2")}</td>
                    <td>${generarInputs("u2-cp", n2.cp, e.id, "u2")}</td>
                    <td>${generarInputs("u2-ca", n2.ca, e.id, "u2")}</td>
                    <td class="p-u2 pdf-u2" style="font-weight:bold; background:#f8fafc">0.00</td>
                    <td class="p-final pdf-fin" style="font-weight:800; background:#edf2f7">0.00</td>
                </tr>`;
            actualizarFila(e.id);
        });
    } catch (e) { console.error(e); }
}

function generarInputs(criterio, data, estId, unidad) {
    let html = "";
    const notas = Array.isArray(data) ? data : [];
    for (let i = 0; i < columnasExtra[criterio]; i++) {
        const val = (notas[i] !== undefined && notas[i] !== null) ? notas[i] : "";
        html += `<input type="text" value="${val}" class="${criterio} nota-input" 
                  data-id="${estId}" data-unidad="${unidad}" placeholder="0-20/NP">`;
    }
    return html;
}

function actualizarFila(estId) {
    const fila = document.querySelector(`tr[data-id="${estId}"]`);
    if(!fila) return;
    const calc = (u) => {
        const cc = promGrupo(fila, `${u}-cc`) * (configuracion[`${u}_cc`] || 0) / 100;
        const cp = promGrupo(fila, `${u}-cp`) * (configuracion[`${u}_cp`] || 0) / 100;
        const ca = promGrupo(fila, `${u}-ca`) * (configuracion[`${u}_ca`] || 0) / 100;
        return cc + cp + ca;
    };
    const u1 = calc('u1'), u2 = calc('u2');
    fila.querySelector(".p-u1").textContent = u1.toFixed(2);
    fila.querySelector(".p-u2").textContent = u2.toFixed(2);
    fila.querySelector(".p-final").textContent = ((u1 + u2) / 2).toFixed(2);
}

function promGrupo(fila, clase) {
    const inputs = fila.querySelectorAll(`.${clase}`);
    let suma = 0, cont = 0;
    inputs.forEach(inp => {
        let v = inp.value.toUpperCase().trim();
        // Validación en tiempo real
        if (v !== "" && v !== "NP" && (isNaN(v) || v < 0 || v > 20)) {
            inp.classList.add("input-error");
        } else {
            inp.classList.remove("input-error");
            if (v !== "") {
                suma += (v === "NP") ? 0 : parseFloat(v);
                cont++;
            }
        }
    });
    return cont > 0 ? suma / cont : 0;
}

/**
 * FUNCIÓN DE VALIDACIÓN GLOBAL (BLOQUEO)
 */
function validarTodaLaTabla() {
    const errores = document.querySelectorAll(".input-error");
    if (errores.length > 0) {
        alert(`¡Atención! Hay ${errores.length} nota(s) mal ingresada(s). Corrígelas (marcadas en rojo) antes de continuar.`);
        errores[0].focus(); // Enfocar el primer error
        return false;
    }
    return true;
}

// SALTO DE FILA CON TAB
document.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && e.target.classList.contains("nota-input")) {
        const input = e.target;
        const unidad = input.dataset.unidad;
        const fila = input.closest("tr");
        const inputsUnidad = fila.querySelectorAll(`.nota-input[data-unidad="${unidad}"]`);
        if (input === inputsUnidad[inputsUnidad.length - 1] && !e.shiftKey) {
            const sigFila = fila.nextElementSibling;
            if (sigFila) {
                e.preventDefault();
                sigFila.querySelector(`.nota-input[data-unidad="${unidad}"]`).focus();
            }
        }
    }
});

window.guardarNotas = async function() {
    if (!validarTodaLaTabla()) return; // BLOQUEO SI HAY ERRORES

    const cursoId = cursoSelect.value;
    if (!cursoId) return alert("Seleccione curso");
    const batch = writeBatch(db);

    document.querySelectorAll("#cuerpoNotas tr").forEach(fila => {
        const estId = fila.dataset.id;
        ["1", "2"].forEach(u => {
            const getValores = (c) => Array.from(fila.querySelectorAll(`.u${u}-${c}`)).map(i => {
                let v = i.value.toUpperCase().trim();
                return v === "" ? 0 : v;
            });
            batch.set(doc(db, "notas", `${estId}_${cursoId}_${u}`), {
                estudianteId: estId, cursoId, unidad: u,
                cc: getValores("cc"), cp: getValores("cp"), ca: getValores("ca"),
                fecha: serverTimestamp()
            });
        });
    });

    await batch.commit();
    alert("¡Registro Guardado con éxito!");
    mostrarNotas();
};

window.imprimirPDF = function() {
    if (!validarTodaLaTabla()) return; // BLOQUEO SI HAY ERRORES

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    const curso = cursoSelect.options[cursoSelect.selectedIndex].text;
    const rows = Array.from(document.querySelectorAll("#cuerpoNotas tr")).map(tr => [
        tr.querySelector(".pdf-n").innerText,
        tr.querySelector(".pdf-cod").innerText,
        tr.querySelector(".pdf-nom").innerText,
        tr.querySelector(".pdf-u1").innerText,
        tr.querySelector(".pdf-u2").innerText,
        tr.querySelector(".pdf-fin").innerText
    ]);
    doc.text("Reporte: " + curso, 14, 15);
    doc.autoTable({ startY: 20, head: [['N°', 'Cod', 'Estudiante', 'P.U1', 'P.U2', 'Final']], body: rows });
    doc.save(`Notas_${curso}.pdf`);
};

cursoSelect.addEventListener("change", mostrarNotas);
btnImprimir.addEventListener("click", window.imprimirPDF);
document.addEventListener("input", (e) => { if (e.target.classList.contains("nota-input")) actualizarFila(e.target.dataset.id); });