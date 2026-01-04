import { db, auth } from './firebase.js'; // Asegúrate de que firebase.js exporte 'auth'
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// IMPORTACIÓN NECESARIA PARA CERRAR SESIÓN
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const filtroCurso = document.getElementById("filtroCurso");

// Funciones de validación y promedio
const esNotaValida = (v) => {
    const n = parseFloat(v);
    return !isNaN(n) && v !== "" && v !== null && v !== " ";
};

const procesarCriterio = (valor) => {
    if (!valor || !Array.isArray(valor)) return { promedio: 0, tieneNota: false };
    const notasReales = valor.filter(esNotaValida);
    if (notasReales.length === 0) return { promedio: 0, tieneNota: false };
    const suma = notasReales.reduce((a, b) => a + Number(b), 0);
    return { promedio: suma / notasReales.length, tieneNota: true };
};

async function cargarAnaliticas() {
    try {
        const [snapEst, snapNotas, snapCursos, snapConfig] = await Promise.all([
            getDocs(collection(db, "estudiantes")),
            getDocs(collection(db, "notas")),
            getDocs(collection(db, "cursos")),
            getDocs(collection(db, "configuracion"))
        ]);

        const estudiantes = snapEst.docs.map(d => ({ id: d.id, ...d.data() }));
        const notas = snapNotas.docs.map(d => d.data());
        const cursos = snapCursos.docs.map(d => ({ id: d.id, ...d.data() }));
        const configsMap = snapConfig.docs.reduce((acc, d) => ({ ...acc, [d.id]: d.data() }), {});

        // Llenar selector de cursos
        if (filtroCurso.options.length === 1) {
            cursos.forEach(c => {
                const opt = document.createElement("option");
                opt.value = c.id;
                opt.textContent = c.nombre;
                filtroCurso.appendChild(opt);
            });
        }

        const cursoSeleccionado = filtroCurso.value;

        // Estructura de datos para promedios
        let resultados = {
            u1: { riesgo: [], regular: [], honor: [], totalEstIds: new Set() },
            u2: { riesgo: [], regular: [], honor: [], totalEstIds: new Set() }
        };

        notas.forEach(notaDoc => {
            // Filtrar por curso si no es "todos"
            if (cursoSeleccionado !== "todos" && notaDoc.cursoId !== cursoSeleccionado) return;

            const est = estudiantes.find(e => e.id === notaDoc.estudianteId);
            if (!est) return;

            const u = notaDoc.unidad; 
            const pref = `u${u}`;
            const config = configsMap[notaDoc.cursoId] || { u1_cc: 30, u1_cp: 40, u1_ca: 30, u2_cc: 30, u2_cp: 40, u2_ca: 30 };

            const resCC = procesarCriterio(notaDoc.cc);
            const resCP = procesarCriterio(notaDoc.cp);
            const resCA = procesarCriterio(notaDoc.ca);

            if (resCC.tieneNota || resCP.tieneNota || resCA.tieneNota) {
                const promedioU = (resCC.promedio * (config[`${pref}_cc`] / 100)) + 
                                  (resCP.promedio * (config[`${pref}_cp`] / 100)) + 
                                  (resCA.promedio * (config[`${pref}_ca`] / 100));

                const info = { nombre: `${est.apellidos}, ${est.nombres}`, promedio: promedioU };
                const unidadKey = `u${u}`;

                resultados[unidadKey].totalEstIds.add(est.id);

                if (promedioU < 10.5) resultados[unidadKey].riesgo.push(info);
                else if (promedioU >= 14.5) resultados[unidadKey].honor.push(info);
                else resultados[unidadKey].regular.push(info);
            }
        });

        renderizarUnidad("u1", resultados.u1);
        renderizarUnidad("u2", resultados.u2);

    } catch (e) { console.error(e); }
}

function renderizarUnidad(uId, data) {
    // Actualizar Widgets de la unidad
    const container = document.getElementById(`stats-${uId}`);
    container.innerHTML = `
        <div class="stat-card" style="background: #e74c3c; color: white; padding: 15px; border-radius: 8px; text-align: center;">
            <h2>${data.riesgo.length}</h2><p>En Riesgo</p>
        </div>
        <div class="stat-card" style="background: #f1c40f; color: white; padding: 15px; border-radius: 8px; text-align: center;">
            <h2>${data.regular.length}</h2><p>Regulares</p>
        </div>
        <div class="stat-card" style="background: #2ecc71; color: white; padding: 15px; border-radius: 8px; text-align: center;">
            <h2>${data.honor.length}</h2><p>Sobresalientes</p>
        </div>
        <div class="stat-card" style="background: #34495e; color: white; padding: 15px; border-radius: 8px; text-align: center;">
            <h2>${data.totalEstIds.size}</h2><p>Total Evaluados</p>
        </div>
    `;

    // Renderizar tablas
    const renderTable = (id, lista, color) => {
        const tb = document.getElementById(id);
        tb.innerHTML = lista.length ? "" : "<tr><td colspan='2' style='text-align:center;'>Sin datos</td></tr>";
        lista.sort((a,b) => b.promedio - a.promedio).forEach(e => {
            tb.innerHTML += `<tr><td style="padding:8px;">${e.nombre}</td><td style="font-weight:bold; color:${color}">${e.promedio.toFixed(2)}</td></tr>`;
        });
    };

    renderTable(`${uId}-riesgo`, data.riesgo, "#e74c3c");
    renderTable(`${uId}-regular`, data.regular, "#f39c12");
    renderTable(`${uId}-honor`, data.honor, "#27ae60");
}
window.logout = async function() {
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
        try {
            await signOut(auth); // Ahora auth y signOut están correctamente vinculados
            window.location.replace("index.html"); // Redirección manual por seguridad
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            alert("No se pudo cerrar la sesión: " + error.message);
        }
    }
};

filtroCurso.addEventListener("change", cargarAnaliticas);
cargarAnaliticas();