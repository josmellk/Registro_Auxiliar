import { db } from './firebase.js';
import { 
    collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- REFERENCIAS AL DOM ---
const cursoSelect = document.getElementById("cursoSelect");
const cuerpoNotas = document.getElementById("cuerpoNotas");

// --- VARIABLES DE ESTADO ---
let configuracion = { u1_cc: 30, u1_cp: 40, u1_ca: 30, u2_cc: 30, u2_cp: 40, u2_ca: 30 };
let columnasExtra = { "u1-cc": 1, "u1-cp": 1, "u1-ca": 1, "u2-cc": 1, "u2-cp": 1, "u2-ca": 1 };

/**
 * 1. CARGAR CURSOS
 */
async function cargarCursos() {
    try {
        const querySnapshot = await getDocs(collection(db, "cursos"));
        cursoSelect.innerHTML = "<option value=''>Seleccione curso</option>";
        querySnapshot.forEach(docSnap => {
            const c = docSnap.data();
            cursoSelect.innerHTML += `<option value="${docSnap.id}">${c.codigo} - ${c.nombre}</option>`;
        });
    } catch (error) {
        console.error("Error al cargar cursos:", error);
    }
}

/**
 * 2. GESTIÓN DE COLUMNAS DINÁMICAS
 */
window.agregarColumna = (criterio) => {
    if (columnasExtra[criterio] < 3) {
        columnasExtra[criterio]++;
        mostrarNotas(); 
    }
};

window.quitarColumna = (criterio) => {
    if (columnasExtra[criterio] > 1) {
        columnasExtra[criterio]--;
        mostrarNotas();
    }
};

/**
 * 3. CÁLCULOS Y FORMATO
 */
function formatearPromedio(nota) {
    const clase = nota < 10.5 ? 'nota-roja' : 'nota-azul';
    return `<span class="${clase}">${nota.toFixed(2)}</span>`;
}

function calcularPromedioGrupo(fila, claseCriterio) {
    const inputs = fila.querySelectorAll(`.${claseCriterio}`);
    let suma = 0, cont = 0;
    inputs.forEach(inp => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) {
            suma += v;
            cont++;
        }
    });
    return cont > 0 ? suma / cont : 0;
}

function actualizarFila(estId) {
    const fila = document.querySelector(`tr[data-id="${estId}"]`);
    if(!fila) return;

    const pU1 = (calcularPromedioGrupo(fila, "u1-cc") * (configuracion.u1_cc || 0) / 100) + 
                (calcularPromedioGrupo(fila, "u1-cp") * (configuracion.u1_cp || 0) / 100) + 
                (calcularPromedioGrupo(fila, "u1-ca") * (configuracion.u1_ca || 0) / 100);

    const pU2 = (calcularPromedioGrupo(fila, "u2-cc") * (configuracion.u2_cc || 0) / 100) + 
                (calcularPromedioGrupo(fila, "u2-cp") * (configuracion.u2_cp || 0) / 100) + 
                (calcularPromedioGrupo(fila, "u2-ca") * (configuracion.u2_ca || 0) / 100);

    fila.querySelector(".p-u1").innerHTML = formatearPromedio(pU1);
    fila.querySelector(".p-u2").innerHTML = formatearPromedio(pU2);
    
    // Promedio Final
    const promedioFinal = (pU1 + pU2) / 2;
    fila.querySelector(".p-final").innerHTML = formatearPromedio(promedioFinal);
}

function generarInputs(criterio, data, estId, rowIndex) {
    let html = "";
    const notas = Array.isArray(data) ? data : (data !== undefined && data !== "" ? [data] : []);
    for (let i = 0; i < columnasExtra[criterio]; i++) {
        const val = notas[i] !== undefined ? notas[i] : "";
        html += `<input type="number" value="${val}" class="${criterio} nota-input" 
                  data-id="${estId}" data-row="${rowIndex}" data-crit="${criterio}" data-sub="${i}"
                  min="0" max="20" step="0.1">`;
    }
    return html;
}

/**
 * 4. MOSTRAR NOTAS (MODIFICADO PARA PERSISTENCIA)
 */
async function mostrarNotas() {
    const cursoId = cursoSelect.value;
    if (!cursoId) { cuerpoNotas.innerHTML = ""; return; }

    try {
        // 1. Obtener la configuración de pesos del curso
        const docCfg = await getDoc(doc(db, "configuracion", cursoId));
        if (docCfg.exists()) {
            configuracion = docCfg.data();
        } else {
            configuracion = { u1_cc: 30, u1_cp: 40, u1_ca: 30, u2_cc: 30, u2_cp: 40, u2_ca: 30 };
        }

        // 2. Obtener Estudiantes y Notas
        const snapEst = await getDocs(query(collection(db, "estudiantes"), where("cursoId", "==", cursoId)));
        const snapNotas = await getDocs(query(collection(db, "notas"), where("cursoId", "==", cursoId)));
        const notasData = snapNotas.docs.map(d => d.data());

        // --- MEJORA DE PERSISTENCIA: Ajustar columnasExtra según datos guardados ---
        notasData.forEach(n => {
            const u = `u${n.unidad}-`;
            if (n.cc && n.cc.length > columnasExtra[u+'cc']) columnasExtra[u+'cc'] = n.cc.length;
            if (n.cp && n.cp.length > columnasExtra[u+'cp']) columnasExtra[u+'cp'] = n.cp.length;
            if (n.ca && n.ca.length > columnasExtra[u+'ca']) columnasExtra[u+'ca'] = n.ca.length;
        });

        // 3. ACTUALIZAR ENCABEZADOS
        const criterios = ["u1-cc", "u1-cp", "u1-ca", "u2-cc", "u2-cp", "u2-ca"];
        criterios.forEach(c => {
            const key = c.replace("-", "_");
            const nombreBase = c.split("-")[1].toUpperCase();
            const porcentaje = configuracion[key] || 0;
            
            const thElement = document.getElementById(`th-${c}`);
            if (thElement) {
                thElement.innerHTML = `
                    ${nombreBase} ${porcentaje}% 
                    <div style="margin-top:5px">
                        <button class="btn-add" onclick="agregarColumna('${c}')">+</button>
                        <button class="btn-remove" onclick="quitarColumna('${c}')">-</button>
                    </div>
                `;
            }
        });

        cuerpoNotas.innerHTML = "";
        let index = 0;
        
        snapEst.forEach(docEst => {
            const e = { id: docEst.id, ...docEst.data() };
            const n1 = notasData.find(n => n.estudianteId === e.id && n.unidad === "1") || {};
            const n2 = notasData.find(n => n.estudianteId === e.id && n.unidad === "2") || {};

            cuerpoNotas.innerHTML += `
                <tr data-id="${e.id}" data-index="${index}">
                    <td style="font-weight:bold">${e.codigo}</td>
                    <td style="text-align:left; padding-left:10px">${e.apellidos}, ${e.nombres}</td>
                    <td>${generarInputs("u1-cc", n1.cc, e.id, index)}</td>
                    <td>${generarInputs("u1-cp", n1.cp, e.id, index)}</td>
                    <td>${generarInputs("u1-ca", n1.ca, e.id, index)}</td>
                    <td class="p-u1">--</td>
                    <td>${generarInputs("u2-cc", n2.cc, e.id, index)}</td>
                    <td>${generarInputs("u2-cp", n2.cp, e.id, index)}</td>
                    <td>${generarInputs("u2-ca", n2.ca, e.id, index)}</td>
                    <td class="p-u2">--</td>
                    <td class="p-final">--</td>
                </tr>`;
            actualizarFila(e.id);
            index++;
        });
    } catch (e) { console.error(e); }
}

/**
 * 5. NAVEGACIÓN TIPO EXCEL
 */
document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (!active.classList.contains("nota-input")) return;

    const row = parseInt(active.dataset.row);
    const crit = active.dataset.crit; 
    const sub = parseInt(active.dataset.sub);

    if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = document.querySelector(`input[data-row="${row + 1}"][data-crit="${crit}"][data-sub="${sub}"]`);
        if (next) { next.focus(); next.select(); }
    }
    if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = document.querySelector(`input[data-row="${row - 1}"][data-crit="${crit}"][data-sub="${sub}"]`);
        if (prev) { prev.focus(); prev.select(); }
    }

    if (e.key === "Tab" && !e.shiftKey) {
        const esUltimaSubCol = (sub === columnasExtra[crit] - 1);
        const unidadActual = crit.split("-")[0];

        if (crit.endsWith("-ca") && esUltimaSubCol) {
            e.preventDefault(); 
            const primeraCol = `${unidadActual}-cc`;
            const siguienteFila = document.querySelector(
                `input[data-row="${row + 1}"][data-crit="${primeraCol}"][data-sub="0"]`
            );
            if (siguienteFila) { siguienteFila.focus(); siguienteFila.select(); }
        }
    }
});

/**
 * 6. GUARDAR DATOS
 */
window.guardarNotas = async function() {
    const cursoId = cursoSelect.value;
    if (!cursoId) return alert("Seleccione curso");
    const batch = writeBatch(db);
    
    document.querySelectorAll("#cuerpoNotas tr").forEach(fila => {
        const estId = fila.dataset.id;
        ["1", "2"].forEach(u => {
            batch.set(doc(db, "notas", `${estId}_${cursoId}_${u}`), {
                estudianteId: estId, cursoId: cursoId, unidad: u,
                cc: Array.from(fila.querySelectorAll(`.u${u}-cc`)).map(i => Number(i.value) || 0),
                cp: Array.from(fila.querySelectorAll(`.u${u}-cp`)).map(i => Number(i.value) || 0),
                ca: Array.from(fila.querySelectorAll(`.u${u}-ca`)).map(i => Number(i.value) || 0),
                fecha: serverTimestamp()
            });
        });
    });

    try {
        await batch.commit();
        alert("¡Registro guardado exitosamente!");
        mostrarNotas();
    } catch (e) { console.error(e); }
};

/**
 * NUEVA FUNCIÓN: EXPORTAR A EXCEL (Integrada en el JS principal)
 */
window.exportarExcel = function() {
    const tabla = document.getElementById("tablaConsolidada");
    const cursoNombre = cursoSelect.options[cursoSelect.selectedIndex]?.text || "Registro";
    const datosExcel = [];

    tabla.querySelectorAll("tr").forEach((fila) => {
        const filaData = [];
        fila.querySelectorAll("th, td").forEach((celda) => {
            const inputs = celda.querySelectorAll("input");
            if (inputs.length > 0) {
                inputs.forEach(inp => filaData.push(inp.value || "0"));
            } else {
                let texto = celda.innerText.split('+')[0].split('-')[0].trim();
                filaData.push(texto);
            }
        });
        datosExcel.push(filaData);
    });

    const ws = XLSX.utils.aoa_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidado");
    XLSX.writeFile(wb, `Registro_Notas_${cursoNombre.replace(/\s+/g, '_')}.xlsx`);
};

// Listeners
document.addEventListener("input", (e) => {
    if (e.target.classList.contains("nota-input")) {
        if (e.target.value > 20) e.target.value = 20;
        if (e.target.value < 0) e.target.value = 0;
        actualizarFila(e.target.dataset.id);
    }
});

cursoSelect.addEventListener("change", () => {
    // Al cambiar de curso, reseteamos a 1 para que el nuevo curso autodetecte sus columnas
    columnasExtra = { "u1-cc": 1, "u1-cp": 1, "u1-ca": 1, "u2-cc": 1, "u2-cp": 1, "u2-ca": 1 };
    mostrarNotas();
});

cargarCursos();