import { db, auth } from './firebase.js';
import { 
    collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// --- REFERENCIAS ---
const cursoSelect = document.getElementById("cursoSelect");
const cuerpoNotas = document.getElementById("cuerpoNotas");
const btnImprimir = document.getElementById("btnImprimir");

let configuracion = { u1_cc: 30, u1_cp: 40, u1_ca: 30, u2_cc: 30, u2_cp: 40, u2_ca: 30 };
let columnasExtra = { "u1-cc": 1, "u1-cp": 1, "u1-ca": 1, "u2-cc": 1, "u2-cp": 1, "u2-ca": 1 };

// --- SEGURIDAD Y PERFIL ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('userEmailHeader').textContent = user.email;
        cargarCursos();
    } else {
        window.location.replace("index.html");
    }
});

window.logout = async function() {
    if (confirm("¿Cerrar sesión ahora?")) {
        try {
            await signOut(auth);
            window.location.replace("index.html");
        } catch (e) { alert("Error al salir"); }
    }
};

// --- LÓGICA DE DATOS ---
async function cargarCursos() {
    const snap = await getDocs(collection(db, "cursos"));
    cursoSelect.innerHTML = "<option value=''>Seleccione curso</option>";
    snap.forEach(d => {
        const c = d.data();
        cursoSelect.innerHTML += `<option value="${d.id}">${c.codigo} - ${c.nombre}</option>`;
    });
}

async function cargarPesosConfigurados(cursoId) {
    const docSnap = await getDoc(doc(db, "configuracion", cursoId));
    if (docSnap.exists()) {
        configuracion = docSnap.data();
        const keys = ['u1-cc','u1-cp','u1-ca','u2-cc','u2-cp','u2-ca'];
        keys.forEach(k => {
            const el = document.getElementById(`p-${k}`);
            if(el) el.textContent = configuracion[k.replace('-','_')] || 0;
        });
    }
}

async function mostrarNotas() {
    const cursoId = cursoSelect.value;
    if (!cursoId) return;
    await cargarPesosConfigurados(cursoId);

    const snapEst = await getDocs(query(collection(db, "estudiantes"), where("cursoId", "==", cursoId)));
    const snapNotas = await getDocs(query(collection(db, "notas"), where("cursoId", "==", cursoId)));
    const notasData = snapNotas.docs.map(d => d.data());

    cuerpoNotas.innerHTML = "";
    snapEst.forEach((docEst, index) => {
        const e = { id: docEst.id, ...docEst.data() };
        const n1 = notasData.find(n => n.estudianteId === e.id && n.unidad === "1") || {};
        const n2 = notasData.find(n => n.estudianteId === e.id && n.unidad === "2") || {};

        cuerpoNotas.innerHTML += `
            <tr data-id="${e.id}" data-row="${index}">
                <td class="pdf-cod">${e.codigo}</td>
                <td class="pdf-nom">${e.apellidos}, ${e.nombres}</td>
                <td>${generarInputs("u1-cc", n1.cc, e.id, index)}</td>
                <td>${generarInputs("u1-cp", n1.cp, e.id, index)}</td>
                <td>${generarInputs("u1-ca", n1.ca, e.id, index)}</td>
                <td class="p-u1 pdf-u1">--</td>
                <td>${generarInputs("u2-cc", n2.cc, e.id, index)}</td>
                <td>${generarInputs("u2-cp", n2.cp, e.id, index)}</td>
                <td>${generarInputs("u2-ca", n2.ca, e.id, index)}</td>
                <td class="p-u2 pdf-u2">--</td>
                <td class="p-final pdf-fin">--</td>
            </tr>`;
        actualizarFila(e.id);
    });
}

function generarInputs(crit, data, estId, row) {
    let html = "";
    const notas = Array.isArray(data) ? data : [];
    for (let i = 0; i < columnasExtra[crit]; i++) {
        const val = notas[i] !== undefined ? notas[i] : "";
        html += `<input type="number" value="${val}" class="${crit} nota-input" data-id="${estId}" data-row="${row}">`;
    }
    return html;
}

function actualizarFila(id) {
    const tr = document.querySelector(`tr[data-id="${id}"]`);
    const calc = (u) => (calcularPromedioGrupo(tr, `${u}-cc`) * configuracion[`${u}_cc`] / 100) +
                        (calcularPromedioGrupo(tr, `${u}-cp`) * configuracion[`${u}_cp`] / 100) +
                        (calcularPromedioGrupo(tr, `${u}-ca`) * configuracion[`${u}_ca`] / 100);
    
    const u1 = calc('u1'), u2 = calc('u2');
    tr.querySelector(".p-u1").textContent = u1.toFixed(2);
    tr.querySelector(".p-u2").textContent = u2.toFixed(2);
    tr.querySelector(".p-final").textContent = ((u1 + u2) / 2).toFixed(2);
}

function calcularPromedioGrupo(tr, cls) {
    const inps = tr.querySelectorAll(`.${cls}`);
    let s = 0, c = 0;
    inps.forEach(i => { if(i.value){ s += parseFloat(i.value); c++; } });
    return c > 0 ? s / c : 0;
}

// --- EXPORTAR PDF ---
window.imprimirPDF = function() {
    if (!cursoSelect.value) return alert("Seleccione un curso");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.text(`Registro de Notas - ${cursoSelect.options[cursoSelect.selectedIndex].text}`, 14, 15);
    
    const rows = [];
    document.querySelectorAll("#cuerpoNotas tr").forEach(tr => {
        rows.push([
            tr.querySelector(".pdf-cod").textContent,
            tr.querySelector(".pdf-nom").textContent,
            tr.querySelector(".pdf-u1").textContent,
            tr.querySelector(".pdf-u2").textContent,
            tr.querySelector(".pdf-fin").textContent
        ]);
    });

    doc.autoTable({
        startY: 25,
        head: [['Código', 'Estudiante', 'Prom. U1', 'Prom. U2', 'Prom. Final']],
        body: rows,
        theme: 'striped'
    });

    doc.save("Reporte_Notas.pdf");
};

// --- LISTENERS ---
cursoSelect.addEventListener("change", mostrarNotas);
btnImprimir.addEventListener("click", imprimirPDF);
document.addEventListener("input", e => {
    if(e.target.classList.contains("nota-input")) actualizarFila(e.target.dataset.id);
});