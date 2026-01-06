import { db, auth } from './firebase.js';
import { collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const cursoSelect = document.getElementById("cursoSelect");
const cuerpoNotas = document.getElementById("cuerpoNotas");
const btnImprimir = document.getElementById("btnImprimir");

let configuracion = { u1_cc: 0, u1_cp: 0, u1_ca: 0, u2_cc: 0, u2_cp: 0, u2_ca: 0 };
let columnasExtra = { "u1-cc": 1, "u1-cp": 1, "u1-ca": 1, "u2-cc": 1, "u2-cp": 1, "u2-ca": 1 };

onAuthStateChanged(auth, (user) => {
    if (user) { cargarCursos(); } 
    else { window.location.replace("index.html"); }
});

window.logout = async () => { if (confirm("¿Cerrar sesión?")) { await signOut(auth); window.location.replace("index.html"); } };
window.agregarColumna = (c) => { if (columnasExtra[c] < 3) { columnasExtra[c]++; mostrarNotas(); } };
window.quitarColumna = (c) => { if (columnasExtra[c] > 1) { columnasExtra[c]--; mostrarNotas(); } };

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

        let estudiantesLista = [];
        snapEst.forEach(docSnap => {
            estudiantesLista.push({ id: docSnap.id, ...docSnap.data() });
        });

        // ORDEN ALFABÉTICO
        estudiantesLista.sort((a, b) => {
            const nombreA = `${a.apellidos} ${a.nombres}`.toLowerCase();
            const nombreB = `${b.apellidos} ${b.nombres}`.toLowerCase();
            return nombreA.localeCompare(nombreB);
        });

        cuerpoNotas.innerHTML = "";
        
        estudiantesLista.forEach((e, index) => {
            const n1 = notasData.find(n => n.estudianteId === e.id && n.unidad === "1") || {};
            const n2 = notasData.find(n => n.estudianteId === e.id && n.unidad === "2") || {};

            cuerpoNotas.innerHTML += `
                <tr data-id="${e.id}">
                    <td class="pdf-n" style="text-align:center; font-weight:bold;">${index + 1}</td>
                    <td class="pdf-cod" style="text-align:center;">${e.codigo}</td>
                    <td class="pdf-nom" style="text-align:left; padding-left:10px;">${e.apellidos}, ${e.nombres}</td>
                    
                    <td>${generarInputs("u1-cc", n1.cc, e.id)}</td>
                    <td>${generarInputs("u1-cp", n1.cp, e.id)}</td>
                    <td>${generarInputs("u1-ca", n1.ca, e.id)}</td>
                    <td class="p-u1 pdf-u1" style="font-weight:bold; background:#f9f9f9;">0.00</td>
                    
                    <td>${generarInputs("u2-cc", n2.cc, e.id)}</td>
                    <td>${generarInputs("u2-cp", n2.cp, e.id)}</td>
                    <td>${generarInputs("u2-ca", n2.ca, e.id)}</td>
                    <td class="p-u2 pdf-u2" style="font-weight:bold; background:#f9f9f9;">0.00</td>
                    
                    <td class="p-final pdf-fin" style="font-weight:bold; background:#f0f0f0;">0.00</td>
                </tr>`;
            actualizarFila(e.id);
        });
    } catch (e) { console.error(e); }
}

function generarInputs(criterio, data, estId) {
    let html = "";
    const notas = Array.isArray(data) ? data : [];
    for (let i = 0; i < columnasExtra[criterio]; i++) {
        const val = notas[i] !== undefined ? notas[i] : "";
        html += `<input type="number" value="${val}" class="${criterio} nota-input" data-id="${estId}" min="0" max="20" step="0.1">`;
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
    const pU1 = calc('u1'), pU2 = calc('u2');
    fila.querySelector(".p-u1").textContent = pU1.toFixed(2);
    fila.querySelector(".p-u2").textContent = pU2.toFixed(2);
    fila.querySelector(".p-final").textContent = ((pU1 + pU2) / 2).toFixed(2);
}

function promGrupo(fila, clase) {
    const inputs = fila.querySelectorAll(`.${clase}`);
    let s = 0, c = 0;
    inputs.forEach(i => { if (i.value !== "") { s += parseFloat(i.value); c++; } });
    return c > 0 ? s / c : 0;
}

// FUNCIÓN DE IMPRESIÓN CORREGIDA
window.imprimirPDF = function() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    const cursoNombre = cursoSelect.options[cursoSelect.selectedIndex].text;

    const rows = [];
    document.querySelectorAll("#cuerpoNotas tr").forEach(tr => {
        rows.push([
            tr.querySelector(".pdf-n").innerText,
            tr.querySelector(".pdf-cod").innerText,
            tr.querySelector(".pdf-nom").innerText,
            tr.querySelector(".pdf-u1").innerText,
            tr.querySelector(".pdf-u2").innerText,
            tr.querySelector(".pdf-fin").innerText
        ]);
    });

    doc.text("Registro de Notas: " + cursoNombre, 14, 15);
    doc.autoTable({
        startY: 20,
        head: [['N°', 'Código', 'Estudiante', 'Prom U1', 'Prom U2', 'Final']],
        body: rows,
        theme: 'grid'
    });
    doc.save(`Notas_${cursoNombre}.pdf`);
};

cursoSelect.addEventListener("change", mostrarNotas);
btnImprimir.addEventListener("click", window.imprimirPDF);
document.addEventListener("input", (e) => {
    if (e.target.classList.contains("nota-input")) {
        actualizarFila(e.target.dataset.id);
    }
});