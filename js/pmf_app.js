"use strict";

let pmfProject = null;
let pmfHasUnsavedChanges = false;

document.addEventListener("DOMContentLoaded", () => {
    pmfProject = PMFStorage.createEmptyProject();
    pmfHasUnsavedChanges = false;
    buildVideoCountSelector();
    bindIdentification();
    bindProjectActions();
    bindUnsavedChangesWarning();
    renderProject();
});

function buildVideoCountSelector() {
    const container = document.getElementById("videoCountConfiguration");
    if (!container) return;

    container.innerHTML = "";
    for (let i = 1; i <= 12; i++) {
        const label = document.createElement("label");
        label.innerHTML = `<input type="radio" name="pmfVideoCount" value="${i}" ${i === 1 ? "checked" : ""}> ${i} vídeo${i === 1 ? "" : "s"}`;
        container.appendChild(label);
    }

    container.querySelectorAll('input[name="pmfVideoCount"]').forEach(input => {
        input.addEventListener("change", () => {
            const count = Number(document.querySelector('input[name="pmfVideoCount"]:checked')?.value || 1);
            pmfProject.configuration.videoCount = count;
            resizeKinoveaRecords(count);
            renderVideoInputs();
            touchProject();
        });
    });
}

function bindIdentification() {
    const fields = {
        projectCompany: "company",
        projectWorkstation: "workstation",
        projectTask: "task",
        projectAnalyst: "analyst",
        projectNotes: "notes"
    };

    Object.entries(fields).forEach(([id, key]) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.addEventListener("input", () => {
            pmfProject.identification[key] = element.value;
            touchProject(false);
        });
    });
}

function bindProjectActions() {
    document.getElementById("saveProjectButton")?.addEventListener("click", saveProject);
    document.getElementById("runPMFAnalysisButton")?.addEventListener("click", runPMFAnalysis);
    document.getElementById("simulationBtn")?.addEventListener("click", () => {
        renderSimulation();
        if (typeof goToPMFPage === "function") goToPMFPage("simulation");
    });
    document.getElementById("wordTablesBtn")?.addEventListener("click", () => {
        renderSimulation();
        renderWordTables();
        if (typeof goToPMFPage === "function") goToPMFPage("word_tables");
    });

    document.getElementById("loadProjectInput")?.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const json = await PMFStorage.readJsonFile(file);
            pmfProject = PMFStorage.normalizeProject(json);
            pmfHasUnsavedChanges = false;
            renderProject();

        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            event.target.value = "";
        }
    });
}

function resizeKinoveaRecords(count) {
    const existing = Array.isArray(pmfProject.kinoveaFiles) ? pmfProject.kinoveaFiles : [];
    pmfProject.kinoveaFiles = existing.filter(record => Number(record.videoIndex) < count);
}

function renderProject() {
    renderIdentification();
    renderVideoCount();
    renderVideoInputs();
    renderVideoJsonSummary();

    const ordered = [...(pmfProject.kinoveaFiles || [])].sort((a,b)=>Number(a.videoIndex)-Number(b.videoIndex));
    pmfProject.analysis = pmfProject.analysis || {};
    pmfProject.analysis.bodySections = classifyPMFSections(ordered);

    renderAnalysisResults();
    renderSimulation();
    renderWordTables();
}

function renderIdentification() {
    const mapping = {
        projectCompany: pmfProject.identification.company,
        projectWorkstation: pmfProject.identification.workstation,
        projectTask: pmfProject.identification.task,
        projectAnalyst: pmfProject.identification.analyst,
        projectNotes: pmfProject.identification.notes
    };
    Object.entries(mapping).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.value = value || "";
    });
}

function renderVideoCount() {
    const count = Math.max(1, Math.min(12, Number(pmfProject.configuration.videoCount) || 1));
    const radio = document.querySelector(`input[name="pmfVideoCount"][value="${count}"]`);
    if (radio) radio.checked = true;
}

function renderVideoInputs() {
    const container = document.getElementById("videoInputsContainer");
    if (!container) return;
    container.innerHTML = "";

    const count = Math.max(1, Math.min(12, Number(pmfProject.configuration.videoCount) || 1));

    for (let i = 0; i < count; i++) {
        const record = pmfProject.kinoveaFiles.find(item => Number(item.videoIndex) === i);
        const block = document.createElement("div");
        block.className = "video-input-block pmf-video-card";

        const originalVideoName = record?.source?.originalVideoFileName || record?.parsedKinovea?.originalFilename || null;
        const persistedText = record
            ? `<div class="pmf-persisted"><strong>Guardado en el estudio:</strong> ${escapeHtml(record.source?.fileName || "Kinovea sin nombre")}${originalVideoName ? ` · Vídeo original: <strong>${escapeHtml(originalVideoName)}</strong>` : ""} · ${formatFrames(record)} · SHA-256: ${escapeHtml(shortHash(record.source?.sha256))}</div>`
            : `<div class="pmf-empty">Todavía no hay datos Kinovea guardados para este vídeo.</div>`;

        block.innerHTML = `
            <h3>Vídeo ${i + 1}</h3>
            ${persistedText}
            <input type="file" id="pmfKinovea_${i}" accept=".json,application/json">
            <div class="pmf-inline-actions">
                ${record ? `<button type="button" data-remove-video="${i}">Eliminar datos guardados</button>` : ""}
            </div>
        `;
        container.appendChild(block);

        block.querySelector(`#pmfKinovea_${i}`)?.addEventListener("change", event => importKinovea(event, i));
        block.querySelector(`[data-remove-video="${i}"]`)?.addEventListener("click", () => removeKinovea(i));
    }
}

async function importKinovea(event, videoIndex) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        setStatus(`Leyendo Kinovea del vídeo ${videoIndex + 1}...`);
        const rawJson = await PMFStorage.readJsonFile(file);

        if (typeof parseKinoveaJSON !== "function") {
            throw new Error("No está disponible el conversor Kinovea.");
        }

        const parsedData = parseKinoveaJSON(rawJson);
        if (!parsedData || !Array.isArray(parsedData.frames) || parsedData.frames.length === 0) {
            throw new Error("El archivo no contiene frames Kinovea válidos.");
        }

        const record = await PMFStorage.buildKinoveaRecord(file, rawJson, parsedData, videoIndex);
        const pos = pmfProject.kinoveaFiles.findIndex(item => Number(item.videoIndex) === videoIndex);
        if (pos >= 0) pmfProject.kinoveaFiles[pos] = record;
        else pmfProject.kinoveaFiles.push(record);

        pmfProject.kinoveaFiles.sort((a, b) => Number(a.videoIndex) - Number(b.videoIndex));
        touchProject();
        renderVideoInputs();
        renderAnalysisSummary();
        setStatus(`Vídeo ${videoIndex + 1}: Kinovea incorporado al estudio. No será necesario volver a cargarlo al reabrir este JSON.`, "ok");
    } catch (error) {
        setStatus(error.message, "error");
    } finally {
        event.target.value = "";
    }
}

function removeKinovea(videoIndex) {
    pmfProject.kinoveaFiles = pmfProject.kinoveaFiles.filter(item => Number(item.videoIndex) !== videoIndex);
    touchProject();
    renderVideoInputs();
    renderAnalysisSummary();
    setStatus(`Se han eliminado del estudio los datos Kinovea del vídeo ${videoIndex + 1}.`);
}

function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n)) return '-';
    if (n < 1024) return n + ' bytes';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function renderVideoJsonSummary() {
    const container = document.getElementById('videoJsonSummary');
    if (!container) return;

    const records = [...(pmfProject.kinoveaFiles || [])].sort((a,b)=>Number(a.videoIndex)-Number(b.videoIndex));
    if (!records.length) {
        container.innerHTML = '<div class="placeholder">Todavía no hay datos importados.</div>';
        return;
    }

    const markerLabels = {
        head_front:'Punto anterior de cabeza',
        head_back:'Punto posterior de cabeza',
        right_ear:'Oreja derecha',
        left_ear:'Oreja izquierda',
        neck:'Cuello',
        right_shoulder:'Hombro derecho',
        left_shoulder:'Hombro izquierdo',
        right_hip:'Cadera derecha',
        left_hip:'Cadera izquierda',
        right_knee:'Rodilla derecha',
        left_knee:'Rodilla izquierda',
        right_ankle:'Tobillo derecho',
        left_ankle:'Tobillo izquierdo',
        right_foot:'Pie derecho',
        left_foot:'Pie izquierdo'
    };

    const rows = records.map((record,index) => {
        const mapping = record?.processing?.markerMapping || {};
        const selected = Object.entries(mapping)
            .filter(([,value]) => value !== null && value !== undefined && String(value).trim() !== '')
            .map(([key,value]) => (markerLabels[key] || key) + ': ' + value);

        const frames = Array.isArray(record?.extracted?.frames) ? record.extracted.frames : [];
        const times = frames.map(frame => Number(frame?.time)).filter(Number.isFinite);
        const duration = times.length ? Math.max(...times) - Math.min(...times) : 0;
        const cfg = record?.processing?.kinoveaConfig || {task:'',range:{mode:'all',start:0,end:duration,cycles:1}};
        const range = cfg.range || {mode:'all',start:0,end:duration,cycles:1};
        let period = 'Todo el vídeo · ' + duration.toFixed(2).replace('.', ',') + ' s';
        if (range.mode === 'interval') {
            const start = Math.max(0, Math.min(duration, Number(range.start) || 0));
            const end = Math.max(start, Math.min(duration, Number(range.end) || duration));
            period = start.toFixed(2).replace('.', ',') + '–' + end.toFixed(2).replace('.', ',') + ' s · ' + (end-start).toFixed(2).replace('.', ',') + ' s';
        } else if (range.mode === 'cycles') {
            const cycles = Math.max(1, Math.floor(Number(range.cycles) || 1));
            period = 'Todo · ' + cycles + ' ciclos · ' + (duration / cycles).toFixed(2).replace('.', ',') + ' s/ciclo';
        }
        const task = String(cfg.task || pmfProject.identification?.task || '—');

        return '<tr>' +
            '<td>JSON ' + (index + 1) + '</td>' +
            '<td>' + escapeHtml(record.source?.fileName || 'Sin nombre') + '</td>' +
            '<td>' + escapeHtml(task) + '</td>' +
            '<td>' + escapeHtml(period) + '</td>' +
            '<td>' + (selected.length ? selected.map(escapeHtml).join('<br>') : 'Ninguno') + '</td>' +
        '</tr>';
    }).join('');

    container.innerHTML = '<div class="result-table-wrap"><table class="compact-table"><thead><tr>' +
        '<th>Archivo</th><th>JSON</th><th>Tarea / fase</th><th>Periodo propio</th><th>Marcadores seleccionados</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="notice"><strong>Trazabilidad:</strong> cada JSON se conserva como una muestra independiente. Los tiempos de vídeos diferentes no se suman entre sí.</div>';
}

function renderAnalysisSummary() {
    const sections = pmfProject.analysis?.bodySections || {};
    const targets = {
        trunk: document.getElementById('results_trunk'),
        head_neck: document.getElementById('results_head_neck'),
        lower_right: document.getElementById('results_lower_right'),
        lower_left: document.getElementById('results_lower_left')
    };
    Object.entries(targets).forEach(([key, container]) => {
        if (!container) return;
        const section = sections[key];
        if (!section || !Array.isArray(section.results) || section.results.length === 0) {
            container.innerHTML = '<div class="pmf-summary"><p><strong>Pendiente de análisis.</strong></p><p>Cuando un vídeo aporte marcadores válidos para este segmento, aquí aparecerán sus resultados.</p></div>';
        }
    });
}

async function saveProject() {
    syncIdentificationFromUI();
    pmfProject.updatedAt = new Date().toISOString();

    const task = (pmfProject.identification.task || "Tarea")
        .trim()
        .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
    const suggestedName = `PMF_${task || "Estudio"}.json`;
    const clean = PMFStorage.deepClone(pmfProject);
    const jsonText = JSON.stringify(clean, null, 2);

    try {
        if (typeof window.showSaveFilePicker === "function") {
            const handle = await window.showSaveFilePicker({
                suggestedName,
                types: [{
                    description: "Archivo JSON del estudio",
                    accept: {"application/json": [".json"]}
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(jsonText);
            await writable.close();
        } else {
            const requestedName = window.prompt("Nombre del archivo JSON:", suggestedName);
            if (!requestedName) return;
            const finalName = requestedName.toLowerCase().endsWith(".json") ? requestedName : requestedName + ".json";
            PMFStorage.downloadProject(clean, finalName);
        }
        pmfHasUnsavedChanges = false;
    } catch (error) {
        if (error?.name === "AbortError") return;
        setStatus("No se pudo guardar el estudio.", "error");
        console.error(error);
    }
}

function syncIdentificationFromUI() {
    const get = id => document.getElementById(id)?.value || "";
    pmfProject.identification.company = get("projectCompany");
    pmfProject.identification.workstation = get("projectWorkstation");
    pmfProject.identification.task = get("projectTask");
    pmfProject.identification.analyst = get("projectAnalyst");
    pmfProject.identification.notes = get("projectNotes");
}

function touchProject(updateStatus = true) {
    pmfProject.updatedAt = new Date().toISOString();
    pmfHasUnsavedChanges = true;
    if (updateStatus) setStatus("Estudio modificado. Guarda el JSON para conservar los cambios.");
}

function bindUnsavedChangesWarning() {
    window.addEventListener("beforeunload", event => {
        if (!pmfHasUnsavedChanges) return;

        // Activa el diálogo nativo del navegador al cerrar, recargar
        // o abandonar la página con cambios pendientes de guardar.
        const message = "Hay cambios sin guardar en el estudio. ¿Desea salir sin guardarlos?";
        event.preventDefault();
        event.returnValue = message;
        return message;
    });
}

window.hasUnsavedPMFChanges = () => pmfHasUnsavedChanges;
window.discardUnsavedPMFChanges = () => { pmfHasUnsavedChanges = false; };

function setStatus(message, type = "") {
    const element = document.getElementById("projectStatus");
    if (!element) return;
    element.textContent = message;
    element.className = `pmf-status ${type ? "pmf-status-" + type : ""}`;
}

function formatFrames(record) {
    const count = Array.isArray(record?.extracted?.frames) ? record.extracted.frames.length : 0;
    return `${count} frames`;
}

function shortHash(hash) {
    return hash ? `${hash.slice(0, 10)}…` : "no disponible";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.getPMFProject = () => PMFStorage.deepClone(pmfProject);


async function runPMFAnalysis() {
    const count = Number(pmfProject.configuration.videoCount) || 1;
    if (pmfProject.kinoveaFiles.length < count) {
        setStatus("Debes cargar los Kinovea de todos los vídeos configurados antes de analizar.", "error");
        return;
    }

    try {
        setStatus("Asigna los marcadores anatómicos de los vídeos.");
        const ordered = [...pmfProject.kinoveaFiles].sort((a,b)=>Number(a.videoIndex)-Number(b.videoIndex));
        const markersByVideo = ordered.map(record => Array.isArray(record?.extracted?.markers) ? record.extracted.markers : []);
        window.PMFActiveKinoveaRecords = ordered;

        if (typeof createAllMarkerMappingUI !== "function") {
            throw new Error("No está disponible la interfaz de asignación de marcadores.");
        }

        const mappings = await createAllMarkerMappingUI(markersByVideo);

        for (let i = 0; i < ordered.length; i++) {
            const record = ordered[i];
            const mapping = mappings[i];
            record.processing.markerMapping = PMFStorage.deepClone(mapping);

            if (typeof adaptKinoveaFrames !== "function") {
                throw new Error("No está disponible el adaptador anatómico.");
            }

            const cfg = record.processing?.kinoveaConfig || {};
            const range = cfg.range || {mode:"all"};
            let sourceFrames = Array.isArray(record.extracted.frames) ? record.extracted.frames : [];
            if (range.mode === "interval") {
                const start = Number(range.start) || 0;
                const end = Number.isFinite(Number(range.end)) ? Number(range.end) : Infinity;
                sourceFrames = sourceFrames.filter(frame => {
                    const t = Number(frame?.time);
                    return Number.isFinite(t) && t >= start && t <= end;
                });
            }
            const anatomicalFrames = adaptKinoveaFrames(sourceFrames, mapping);
            record.processing.anatomicalFrames = PMFStorage.deepClone(anatomicalFrames);

            if (typeof PMFSignedBiomechanics === "undefined") {
                throw new Error("No está disponible la biomecánica signada PMF.");
            }

            const biomechanicalFrames = PMFSignedBiomechanics.analyze(anatomicalFrames);
            record.processing.biomechanicalFrames = PMFStorage.deepClone(biomechanicalFrames);
            record.processing.calculatedVariables = buildCalculatedVariables(biomechanicalFrames);
            record.processing.traceability = {
                generatedAt: new Date().toISOString(),
                source: "PMFSignedBiomechanics",
                selfTest: window.PMFSelfTestResult || null
            };
        }

        pmfProject.analysis.bodySections = classifyPMFSections(ordered);
        touchProject(false);
        renderAnalysisResults();
        setStatus("Análisis PMF completado: variables, frecuencia, tiempo crítico, estáticas y clasificación por sección guardadas en el estudio.", "ok");
        if (typeof goToPMFPage === "function") goToPMFPage("summary");
    } catch (error) {
        console.error(error);
        setStatus(error.message || "No se pudo completar el análisis PMF.", "error");
    }
}

function buildCalculatedVariables(measurements) {
    const names = [
        "trunk_flexion_signed",
        "trunk_lateral_signed",
        "trunk_axial_rotation_signed",
        "head_flexion_signed",
        "head_lateral_signed",
        "head_axial_rotation_signed",
        "knee_flexion_left",
        "knee_flexion_right",
        "ankle_angle_left",
        "ankle_angle_right",
        "knee_flexion_left_standing_flexion",
        "knee_flexion_right_standing_flexion",
        "knee_flexion_left_seated_excursion",
        "knee_flexion_right_seated_excursion",
        "ankle_angle_left_dorsi_plantar",
        "ankle_angle_right_dorsi_plantar"
    ];

    const out = {};
    names.forEach(name => {
        const series = PMFSignedBiomechanics.series(measurements, name);
        if (!series.length) return;
        const values = series.map(p => Number(p.value));
        out[name] = {
            min: Math.min(...values),
            max: Math.max(...values),
            mean: values.reduce((a,b)=>a+b,0)/values.length,
            firstTimestamp: series[0].timestamp,
            lastTimestamp: series[series.length-1].timestamp,
            samples: series.length,
            series
        };
    });
    return out;
}


function getSeriesFromRecord(record, name) {
    return record?.processing?.calculatedVariables?.[name]?.series || [];
}

function seriesExtreme(series) {
    const valid = (Array.isArray(series) ? series : []).filter(p => Number.isFinite(Number(p.value)));
    if (!valid.length) return null;
    return valid.reduce((worst, p) => Math.abs(Number(p.value)) > Math.abs(Number(worst.value)) ? p : worst, valid[0]);
}

function analyzeDynamicSeries(series, neutralPredicate, targetPredicate) {
    const movement = PMFEngine.countExcursions(series, neutralPredicate, targetPredicate);
    const critical = PMFEngine.criticalTime(series, targetPredicate);
    const extreme = seriesExtreme(series);
    return {
        movementCount: movement.count,
        frequencyPerMinute: movement.frequencyPerMinute,
        movementEvents: movement.events,
        incompleteExcursion: movement.incompleteExcursion || false,
        criticalSeconds: critical.criticalSeconds,
        totalSeconds: critical.totalSeconds,
        criticalPercent: critical.criticalPercent,
        extremeAngle: extreme ? Number(extreme.value) : null,
        extremeTimestamp: extreme ? Number(extreme.timestamp) : null
    };
}

function ankleWorstPoint(series) {
    const valid=(Array.isArray(series)?series:[]).filter(p=>Number.isFinite(Number(p.value)));
    if(!valid.length) return null;
    const severity=p=>{
        const v=Number(p.value);
        return v>=0 ? v/20 : Math.abs(v)/50;
    };
    return valid.reduce((worst,p)=>severity(p)>severity(worst)?p:worst,valid[0]);
}

function ankleWorstEpisode(episodes) {
    const valid=(Array.isArray(episodes)?episodes:[]).filter(e=>Number.isFinite(Number(e.averageAngle)));
    if(!valid.length) return null;
    const severity=e=>{
        const v=Number(e.averageAngle);
        return v>=0 ? v/20 : Math.abs(v)/50;
    };
    return valid.reduce((worst,e)=>severity(e)>severity(worst)?e:worst,valid[0]);
}

function analyzeStaticSeries(series, bandPredicate) {
    const episodes = PMFEngine.detectStaticEpisodes(series, bandPredicate, PMFCriteria.LIMITS.staticMinSeconds);
    return {
        episodes,
        totalStaticSeconds: episodes.reduce((sum, e) => sum + Number(e.duration || 0), 0),
        maxEpisodeSeconds: episodes.reduce((max, e) => Math.max(max, Number(e.duration || 0)), 0),
        worstEpisode: episodes.reduce((worst, e) => {
            if (!worst) return e;
            return Math.abs(Number(e.averageAngle || 0)) > Math.abs(Number(worst.averageAngle || 0)) ? e : worst;
        }, null)
    };
}

function trunkFlexionSupport() {
    const value = ensureSectionStudy("trunk")?.variables?.flexion?.fullSupport;
    return value === true ? true : value === false ? false : null;
}

function manualValue(key) {
    return pmfProject.analysis?.manualConfirmations?.[key]?.value ?? null;
}

function classifyMeasurement({record, section, mode, measurement, calculated, criterionResult, manualKey = null}) {
    const trace = PMFEngine.trace({
        section,
        mode,
        measurement,
        sourceVideos:[record.videoNumber],
        calculated,
        criterionResult,
        manual: manualKey ? (pmfProject.analysis?.manualConfirmations?.[manualKey] || {}) : {}
    });
    return {
        videoNumber: record.videoNumber,
        fileName: record.source?.fileName || null,
        section,
        mode,
        measurement,
        status: criterionResult.status,
        reason: criterionResult.reason,
        criterionId: criterionResult.criterionId,
        calculated,
        manualKey,
        traceability: trace
    };
}

function classifyRecord(record) {
    const out=[];

    // TRONCO DINÁMICO - flexión/extensión
    {
        const s=getSeriesFromRecord(record,"trunk_flexion_signed");
        if(s.length){
            const dyn=analyzeDynamicSeries(s, v=>v>=1&&v<=20, v=>v<=0||v>20);
            const support=trunkFlexionSupport();
            const criterion=PMFCriteria.dynamic.trunkFlexion({
                angle:dyn.extremeAngle,
                frequencyPerMinute:dyn.frequencyPerMinute,
                fullTrunkSupport:support
            });
            out.push(classifyMeasurement({record,section:"trunk",mode:"dynamic",measurement:"Flexión / extensión",calculated:dyn,criterionResult:criterion}));
        }
    }

    // TRONCO DINÁMICO - inclinación lateral
    {
        const s=getSeriesFromRecord(record,"trunk_lateral_signed");
        if(s.length){
            const dyn=analyzeDynamicSeries(s,v=>v>=-10&&v<=10,v=>v<-10||v>10);
            const criterion=PMFCriteria.dynamic.trunkLateral({
                angle:dyn.extremeAngle,
                frequencyPerMinute:dyn.frequencyPerMinute,
                criticalTimePercent:dyn.criticalPercent
            });
            out.push(classifyMeasurement({record,section:"trunk",mode:"dynamic",measurement:"Inclinación lateral",calculated:dyn,criterionResult:criterion}));
        }
    }

    // TRONCO DINÁMICO - rotación axial
    {
        const s=getSeriesFromRecord(record,"trunk_axial_rotation_signed");
        if(s.length){
            const dyn=analyzeDynamicSeries(s,v=>v>=-10&&v<=10,v=>v<-10||v>10);
            const criterion=PMFCriteria.dynamic.trunkRotation({
                angle:dyn.extremeAngle,
                frequencyPerMinute:dyn.frequencyPerMinute,
                criticalTimePercent:dyn.criticalPercent
            });
            out.push(classifyMeasurement({record,section:"trunk",mode:"dynamic",measurement:"Rotación axial",calculated:dyn,criterionResult:criterion}));
        }
    }

    // CABEZA/CUELLO DINÁMICO
    {
        const defs=[
            ["head_flexion_signed","Flexión / extensión de cabeza",v=>v>=0&&v<=40,v=>v<0||v>40,PMFCriteria.dynamic.headFlexion],
            ["head_lateral_signed","Lateralización de cabeza",v=>v>=-10&&v<=10,v=>v<-10||v>10,PMFCriteria.dynamic.headLateral],
            ["head_axial_rotation_signed","Rotación axial de cabeza",v=>v>=-45&&v<=45,v=>v<-45||v>45,PMFCriteria.dynamic.headRotation]
        ];
        defs.forEach(([name,label,neutral,target,fn])=>{
            const s=getSeriesFromRecord(record,name);
            if(!s.length) return;
            const dyn=analyzeDynamicSeries(s,neutral,target);
            const criterion=fn({angle:dyn.extremeAngle,frequencyPerMinute:dyn.frequencyPerMinute,criticalTimePercent:dyn.criticalPercent});
            out.push(classifyMeasurement({record,section:"head_neck",mode:"dynamic",measurement:label,calculated:dyn,criterionResult:criterion}));
        });
    }

    // TRONCO ESTÁTICO: cada rango de flexión/extensión se evalúa por separado.
    {
        const s=getSeriesFromRecord(record,"trunk_flexion_signed");
        if(s.length){
            const support=trunkFlexionSupport();

            // Extensión: ≤0°. No se mezcla su duración con la flexión.
            const extension=analyzeStaticSeries(s,v=>v<=0);
            if(extension.episodes.length){
                const angle=Math.min(...extension.episodes.map(e=>Number(e.minAngle)).filter(Number.isFinite));
                const criterion=PMFCriteria.static.trunk({
                    motion:"flexion",
                    angle,
                    fullTrunkSupport:support
                });
                out.push(classifyMeasurement({
                    record,section:"trunk",mode:"static",
                    measurement:"Flexión / extensión · ≤0°",
                    calculated:extension,
                    criterionResult:criterion}));
            }

            // Flexión >20°–60°: sumar únicamente el tiempo mantenido en este rango.
            const midFlex=analyzeStaticSeries(s,v=>v>20&&v<=60);
            if(midFlex.episodes.length){
                const angle=Math.max(...midFlex.episodes.map(e=>Number(e.maxAngle)).filter(Number.isFinite));
                const durationCheck=support===false ? trunkStaticDurationCriterion(angle,midFlex.totalStaticSeconds) : null;
                const criterion=PMFCriteria.static.trunk({
                    motion:"flexion",
                    angle,
                    fullTrunkSupport:support,
                    durationCriterionResult:durationCheck?.result ?? null
                });
                if(durationCheck){
                    midFlex.maxAcceptableStaticSeconds=durationCheck.limitSeconds;
                    midFlex.durationCriterionResult=durationCheck.result;
                    midFlex.durationCriterionAngle=angle;
                }
                out.push(classifyMeasurement({
                    record,section:"trunk",mode:"static",
                    measurement:"Flexión · >20°–60°",
                    calculated:midFlex,
                    criterionResult:criterion}));
            }

            // Flexión >60°: se valora de forma independiente y es no aceptable.
            const highFlex=analyzeStaticSeries(s,v=>v>60);
            if(highFlex.episodes.length){
                const rawAngle=Math.max(...highFlex.episodes.map(e=>Number(e.maxAngle)).filter(Number.isFinite));
                const angle=rawAngle>90?90:rawAngle;
                highFlex.evaluationAngle=angle;
                if(rawAngle>90) highFlex.detectedMaxAngle=rawAngle;
                const criterion=PMFCriteria.static.trunk({
                    motion:"flexion",
                    angle,
                    fullTrunkSupport:support
                });
                out.push(classifyMeasurement({
                    record,section:"trunk",mode:"static",
                    measurement:"Flexión · >60°",
                    calculated:highFlex,
                    criterionResult:criterion
                }));
            }
        }
    }
    {
        const defs=[
            ["trunk_lateral_signed","Inclinación lateral","lateral",v=>v<-10||v>10],
            ["trunk_axial_rotation_signed","Rotación axial","rotation",v=>v<-10||v>10]
        ];
        defs.forEach(([name,label,motion,pred])=>{
            const s=getSeriesFromRecord(record,name);
            if(!s.length) return;
            const st=analyzeStaticSeries(s,pred);
            if(!st.episodes.length) return;
            const criterion=PMFCriteria.static.trunk({motion,angle:st.worstEpisode?.averageAngle});
            out.push(classifyMeasurement({record,section:"trunk",mode:"static",measurement:label,calculated:st,criterionResult:criterion}));
        });
    }

    // CABEZA/CUELLO ESTÁTICO
    {
        const headSeries=getSeriesFromRecord(record,"head_flexion_signed");
        if(headSeries.length){
            const matchedTrunkRecord=matchingTrunkRecordForHead(record);
            const trunkSeries=matchingTrunkSeriesForHead(record);
            const neckSeries=differenceSeries(headSeries,trunkSeries);
            const supports=headStaticSupportValues();
            const bands=[
                ["Extensión de cabeza",v=>v<0,"lt0"],
                ["Flexión de cabeza · 0°–25°",v=>v>=0&&v<=25,"from0to25"],
                ["Flexión de cabeza · >25°–85°",v=>v>25&&v<=85,"gt25to85"],
                ["Flexión de cabeza · >85°",v=>v>85,"gt85"]
            ];
            bands.forEach(([label,pred,band])=>{
                const st=analyzeStaticSeries(headSeries,pred);
                if(!st.episodes.length) return;
                let angle=st.worstEpisode?.averageAngle;
                if(band==="gt25to85"){
                    const ep=st.worstEpisode;

                    // Igual que en tronco: el tiempo se suma entre todos los
                    // episodios estáticos del rango y para el gráfico se usa
                    // el ángulo más desfavorable detectado en cualquiera de ellos.
                    const episodeMaxAngles=st.episodes
                        .map(e=>Number(e.maxAngle))
                        .filter(Number.isFinite);
                    angle=episodeMaxAngles.length ? Math.max(...episodeMaxAngles) : Number(ep?.maxAngle);

                    const neckInEpisode=(neckSeries||[]).filter(p=>Number(p.timestamp)>=Number(ep?.startTime)&&Number(p.timestamp)<=Number(ep?.endTime));
                    let neckAngle=null;
                    if(neckInEpisode.length){
                        const adverse=neckInEpisode.find(p=>Number(p.value)<0||Number(p.value)>25);
                        neckAngle=Number((adverse||neckInEpisode[0]).value);
                    }
                    const durationCheck=supports.fullTrunkSupport===true
                        ? headStaticDurationCriterion(angle,st.totalStaticSeconds)
                        : null;
                    const criterion=PMFCriteria.static.head({
                        motion:"head_flexion",
                        angle,
                        fullHeadSupport:supports.fullHeadSupport,
                        fullTrunkSupport:supports.fullTrunkSupport,
                        neckFlexionAngle:neckAngle,
                        durationCriterionResult:durationCheck?.result ?? null
                    });
                    if(Number.isFinite(neckAngle)){
                        st.neckFlexionAngle=neckAngle;
                        st.trunkAlphaSource="same_original_video";
                        st.trunkAlphaVideoNumber=matchedTrunkRecord?.videoNumber ?? record.videoNumber;
                        st.originalVideoFileName=record?.source?.originalVideoFileName || record?.parsedKinovea?.originalFilename || null;
                    }
                    if(durationCheck){
                        st.maxAcceptableStaticSeconds=durationCheck.limitSeconds;
                        st.durationCriterionResult=durationCheck.result;
                        st.durationCriterionAngle=angle;
                        st.durationCriterionSource="Figura 5.16 / Tabla 5.12";
                    }
                    out.push(classifyMeasurement({record,section:"head_neck",mode:"static",measurement:"Flexión / extensión de cabeza",calculated:st,criterionResult:criterion}));
                    return;
                }
                const criterion=PMFCriteria.static.head({
                    motion:"head_flexion",
                    angle,
                    fullHeadSupport:supports.fullHeadSupport,
                    fullTrunkSupport:supports.fullTrunkSupport
                });
                out.push(classifyMeasurement({record,section:"head_neck",mode:"static",measurement:"Flexión / extensión de cabeza",calculated:st,criterionResult:criterion}));
            });
        }

        // Lateralización estática: se valora cualquier postura mantenida >4 s,
        // distinguiendo el rango aceptable de las inclinaciones fuera de ±10°.
        {
            const s=getSeriesFromRecord(record,"head_lateral_signed");
            if(s.length){
                const zones=[
                    ["Lateralización de cabeza · < −10°",v=>v<-10],
                    ["Lateralización de cabeza · −10° a 10°",v=>v>=-10&&v<=10],
                    ["Lateralización de cabeza · > 10°",v=>v>10]
                ];
                zones.forEach(([label,pred])=>{
                    const st=analyzeStaticSeries(s,pred);
                    if(!st.episodes.length) return;
                    const values=st.episodes.flatMap(e=>[Number(e.minAngle),Number(e.maxAngle)]).filter(Number.isFinite);
                    const angle=values.length ? values.reduce((worst,v)=>Math.abs(v)>Math.abs(worst)?v:worst,values[0]) : Number(st.worstEpisode?.averageAngle);
                    st.evaluationAngle=angle;
                    const criterion=PMFCriteria.static.head({motion:"lateral",angle});
                    out.push(classifyMeasurement({record,section:"head_neck",mode:"static",measurement:"Lateralización de cabeza",calculated:st,criterionResult:criterion}));
                });
            }
        }

        // Rotación axial estática: cualquier postura mantenida >4 s,
        // con derecha positiva e izquierda negativa.
        {
            const s=getSeriesFromRecord(record,"head_axial_rotation_signed");
            if(s.length){
                const zones=[
                    ["Rotación axial de cabeza · < −45°",v=>v<-45],
                    ["Rotación axial de cabeza · −45° a 45°",v=>v>=-45&&v<=45],
                    ["Rotación axial de cabeza · > 45°",v=>v>45]
                ];
                zones.forEach(([label,pred])=>{
                    const st=analyzeStaticSeries(s,pred);
                    if(!st.episodes.length) return;
                    const values=st.episodes.flatMap(e=>[Number(e.minAngle),Number(e.maxAngle)]).filter(Number.isFinite);
                    const angle=values.length ? values.reduce((worst,v)=>Math.abs(v)>Math.abs(worst)?v:worst,values[0]) : Number(st.worstEpisode?.averageAngle);
                    st.evaluationAngle=angle;
                    const criterion=PMFCriteria.static.head({motion:"rotation",angle});
                    out.push(classifyMeasurement({record,section:"head_neck",mode:"static",measurement:"Rotación axial de cabeza",calculated:st,criterionResult:criterion}));
                });
            }
        }
    }


    // EXTREMIDADES INFERIORES
    ["left","right"].forEach(side=>{
        const section=side==="left"?"lower_left":"lower_right";
        const postureKey=`v${record.videoNumber}.${section}.posture`;
        const sectionStudy=ensureSectionStudy(section);
        const posture=sectionStudy?.posture==="seated" ? "seated" : "standing";

        const kneeInternal=getSeriesFromRecord(record,`knee_flexion_${side}`);
        const kneeStanding=getSeriesFromRecord(record,`knee_flexion_${side}_standing_flexion`);
        const kneeSeatedExc=getSeriesFromRecord(record,`knee_flexion_${side}_seated_excursion`);
        const ankle=getSeriesFromRecord(record,`ankle_angle_${side}_dorsi_plantar`);

        if(kneeInternal.length){
            if(!posture){
                const criterion={status:PMFCriteria.RESULT.NEEDS_CONFIRMATION,reason:"Debe seleccionarse postura sentado o de pie para valorar la rodilla.",criterionId:"LOWER_POSTURE_REQUIRED",inputs:{posture:null}};
                out.push(classifyMeasurement({record,section,mode:"dynamic",measurement:"Rodilla",calculated:{},criterionResult:criterion,manualKey:postureKey}));
            } else {
                const internalExtreme=seriesExtreme(kneeInternal);
                const dynSeries=posture==="standing"?kneeStanding:kneeSeatedExc;
                const target=posture==="standing"?(v=>v>=135):(v=>v>=40);
                const neutral=posture==="standing"?(v=>v<135):(v=>v<40);
                const dyn=analyzeDynamicSeries(dynSeries,neutral,target);
                const criterion=PMFCriteria.lowerLimb.kneeDynamic({
                    posture,
                    internalAngle:internalExtreme?.value,
                    standingFlexion:posture==="standing"?dyn.extremeAngle:null,
                    seatedExcursion:posture==="seated"?dyn.extremeAngle:null,
                    frequencyPerMinute:dyn.frequencyPerMinute
                });
                out.push(classifyMeasurement({record,section,mode:"dynamic",measurement:"Rodilla",calculated:dyn,criterionResult:criterion,manualKey:postureKey}));

                const staticPred=posture==="standing"?(v=>v>0):(v=>v<90||v>135);
                const stSource=posture==="standing"?kneeStanding:kneeInternal;
                const st=analyzeStaticSeries(stSource,staticPred);
                if(st.episodes.length){
                    const supportKey=posture==="standing"
                        ? `v${record.videoNumber}.${section}.ischialSupport`
                        : `v${record.videoNumber}.${section}.trunkPosteriorInclined`;
                    const kneeStudy=sectionStudy?.variables?.knee||{};
                    const ischialSupport=kneeStudy.ischialSupport===true?true:kneeStudy.ischialSupport===false?false:null;
                    const trunkPosteriorInclined=kneeStudy.trunkPosteriorInclined===true?true:kneeStudy.trunkPosteriorInclined===false?false:null;
                    const criterionStatic=PMFCriteria.static.knee({
                        posture,
                        internalAngle:posture==="seated"?st.worstEpisode?.averageAngle:internalExtreme?.value,
                        standingFlexion:posture==="standing"?st.worstEpisode?.averageAngle:null,
                        ischialSupport:posture==="standing"?ischialSupport:null,
                        trunkPosteriorInclined:posture==="seated"?trunkPosteriorInclined:null
                    });
                    out.push(classifyMeasurement({record,section,mode:"static",measurement:"Rodilla",calculated:st,criterionResult:criterionStatic,manualKey:null}));
                }
            }
        }

        if(ankle.length){
            const dyn=analyzeDynamicSeries(ankle,v=>v>-50&&v<20,v=>v<=-50||v>=20);
            const ankleWorst=ankleWorstPoint(ankle);
            dyn.extremeAngle=ankleWorst ? Number(ankleWorst.value) : dyn.extremeAngle;
            dyn.extremeTimestamp=ankleWorst ? Number(ankleWorst.timestamp) : dyn.extremeTimestamp;
            const criterion=PMFCriteria.lowerLimb.ankleDynamic({
                dorsiPlantarAngle:dyn.extremeAngle,
                frequencyPerMinute:dyn.frequencyPerMinute
            });
            out.push(classifyMeasurement({record,section,mode:"dynamic",measurement:"Tobillo",calculated:dyn,criterionResult:criterion}));

            const st=analyzeStaticSeries(ankle,v=>v>=20||v<=-50);
            if(st.episodes.length){
                st.worstEpisode=ankleWorstEpisode(st.episodes);
                const criterionStatic=PMFCriteria.static.ankle({dorsiPlantarAngle:st.worstEpisode?.averageAngle});
                out.push(classifyMeasurement({record,section,mode:"static",measurement:"Tobillo",calculated:st,criterionResult:criterionStatic}));
            }
        }
    });

    return out;
}

function classifyPMFSections(records) {
    const sections = {
        trunk:{label:"Tronco",status:PMFCriteria.RESULT.NOT_EVALUATED,results:[],traceability:[]},
        head_neck:{label:"Cabeza / cuello",status:PMFCriteria.RESULT.NOT_EVALUATED,results:[],traceability:[]},
        lower_right:{label:"Extremidad inferior derecha",status:PMFCriteria.RESULT.NOT_EVALUATED,results:[],traceability:[]},
        lower_left:{label:"Extremidad inferior izquierda",status:PMFCriteria.RESULT.NOT_EVALUATED,results:[],traceability:[]}
    };

    const all=[];
    records.forEach(record => all.push(...classifyRecord(record)));

    for(const result of all){
        if(!sections[result.section]) continue;
        const variableKey=movementKeyForResult(result.section,result.measurement);
        if(!variableKey || movementSource(result.section,variableKey)!=="kinovea") continue;
        sections[result.section].results.push(result);
        sections[result.section].traceability.push(result.traceability);
    }

    ["trunk","head_neck","lower_right","lower_left"].forEach(key=>{
        const manual=buildManualSection(key);
        sections[key].results.push(...manual.results);
        sections[key].traceability.push(...manual.traceability);
        const results=sections[key].results;
        const worst=PMFEngine.worstStatus(results.map(r=>({status:r.status,reason:r.reason,criterionId:r.criterionId})));
        sections[key].status=worst?.status || PMFCriteria.RESULT.NOT_EVALUATED;
    });

    return sections;
}

function buildBodySectionOverview(records) {
    const sections = {
        trunk: {label:"Tronco", status:"PENDIENTE_CLASIFICACION", measurements:[]},
        head_neck: {label:"Cabeza / cuello", status:"PENDIENTE_CLASIFICACION", measurements:[]},
        lower_right: {label:"Extremidad inferior derecha", status:"PENDIENTE_CLASIFICACION", measurements:[]},
        lower_left: {label:"Extremidad inferior izquierda", status:"PENDIENTE_CLASIFICACION", measurements:[]}
    };

    for (const record of records) {
        const vars = record?.processing?.calculatedVariables || {};
        Object.entries(vars).forEach(([name, data]) => {
            let section = null;
            if (name.startsWith("trunk_")) section = "trunk";
            else if (name.startsWith("head_")) section = "head_neck";
            else if (name.endsWith("_right")) section = "lower_right";
            else if (name.endsWith("_left")) section = "lower_left";
            if (!section) return;
            sections[section].measurements.push({
                videoNumber: record.videoNumber,
                name,
                min: data.min,
                max: data.max,
                mean: data.mean,
                samples: data.samples
            });
        });
    }
    return sections;
}


function ensureManualConfirmationStore() {
    if (!pmfProject.analysis.manualConfirmations || typeof pmfProject.analysis.manualConfirmations !== "object") {
        pmfProject.analysis.manualConfirmations = {};
    }
}

function setManualConfirmation(key, value, note = "") {
    ensureManualConfirmationStore();
    pmfProject.analysis.manualConfirmations[key] = {
        confirmed:true,
        value,
        technician:pmfProject.identification?.analyst || null,
        confirmedAt:new Date().toISOString(),
        note
    };
    touchProject(false);
}

function manualControlForResult(r) {
    if (!r?.manualKey || r.status !== PMFCriteria.RESULT.NEEDS_CONFIRMATION) return "";

    const existing = pmfProject.analysis?.manualConfirmations?.[r.manualKey]?.value ?? null;

    let options = "";
    let label = "Confirmación técnica";

    if (r.manualKey.includes(".posture")) {
        label = "Postura de referencia";
        options = `
            <option value="">-- seleccionar --</option>
            <option value="standing" ${existing==="standing"?"selected":""}>De pie</option>
            <option value="seated" ${existing==="seated"?"selected":""}>Sentado/a</option>
        `;
    } else if (r.manualKey.includes("ischialSupport")) {
        label = "Apoyo isquiotibial";
        options = `
            <option value="">-- seleccionar --</option>
            <option value="true" ${existing===true?"selected":""}>Sí</option>
            <option value="false" ${existing===false?"selected":""}>No</option>
        `;
    } else if (r.manualKey.includes("trunkPosteriorInclined")) {
        label = "Tronco posteriormente inclinado";
        options = `
            <option value="">-- seleccionar --</option>
            <option value="true" ${existing===true?"selected":""}>Sí</option>
            <option value="false" ${existing===false?"selected":""}>No</option>
        `;
    } else if (r.manualKey.includes("fullSupport")) {
        label = "Soporte completo";
        options = `
            <option value="">-- seleccionar --</option>
            <option value="true" ${existing===true?"selected":""}>Sí, existe soporte completo</option>
            <option value="false" ${existing===false?"selected":""}>No existe soporte completo</option>
        `;
    } else {
        return "";
    }

    return `
        <div class="pmf-manual-control" data-manual-key="${escapeHtml(r.manualKey)}">
            <label><strong>${label}:</strong>
                <select data-manual-select>${options}</select>
            </label>
            <button type="button" data-apply-manual>Aplicar y recalcular</button>
        </div>
    `;
}

function bindManualControls() {
    document.querySelectorAll(".pmf-manual-control").forEach(block => {
        block.querySelector("[data-apply-manual]")?.addEventListener("click", () => {
            const key = block.dataset.manualKey;
            const select = block.querySelector("[data-manual-select]");
            if (!key || !select || select.value === "") return;
            let value = select.value;
            if (value === "true") value = true;
            else if (value === "false") value = false;
            setManualConfirmation(key, value);
            const ordered = [...pmfProject.kinoveaFiles].sort((a,b)=>Number(a.videoIndex)-Number(b.videoIndex));
            pmfProject.analysis.bodySections = classifyPMFSections(ordered);
            renderAnalysisResults();
            setStatus("Confirmación técnica aplicada y clasificación recalculada.", "ok");
        });
    });
}


const PMF_SECTION_MANUAL_DEFS = {
    trunk: [
        {key:"flexion",label:"Flexión / extensión",kind:"trunkFlex"},
        {key:"lateral",label:"Inclinación lateral",kind:"trunkLateral"},
        {key:"rotation",label:"Rotación axial",kind:"trunkRotation"}
    ],
    head_neck: [
        {key:"flexion",label:"Flexión / extensión de cabeza",kind:"headFlex"},
        {key:"lateral",label:"Lateralización de cabeza",kind:"headLateral"},
        {key:"rotation",label:"Rotación axial de cabeza",kind:"headRotation"}
    ],
    lower_right: [
        {key:"knee",label:"Rodilla",kind:"knee"},
        {key:"ankle",label:"Tobillo",kind:"ankle"}
    ],
    lower_left: [
        {key:"knee",label:"Rodilla",kind:"knee"},
        {key:"ankle",label:"Tobillo",kind:"ankle"}
    ]
};

function ensureSectionStudy(key) {
    pmfProject.analysis = pmfProject.analysis || {};
    pmfProject.analysis.sectionStudy = pmfProject.analysis.sectionStudy || {};
    const lower = key === "lower_right" || key === "lower_left";
    const current = pmfProject.analysis.sectionStudy[key] || {};
    const legacySource = current.source === "manual" ? "manual" : "kinovea";
    const variables = current.variables && typeof current.variables === "object" ? current.variables : {};
    (PMF_SECTION_MANUAL_DEFS[key] || []).forEach(def => {
        const previous = variables[def.key] && typeof variables[def.key] === "object" ? variables[def.key] : {};
        variables[def.key] = {
            ...previous,
            source: previous.source === "manual" ? "manual" : (previous.source === "kinovea" ? "kinovea" : legacySource),
            frequencyBand: previous.frequencyBand === "gte2" ? "gte2" : (Number(previous.frequency) >= 2 ? "gte2" : "lt2")
        };
        delete variables[def.key].frequency;
    });
    pmfProject.analysis.sectionStudy[key] = {
        timeMode: current.timeMode === "percent" ? "percent" : "seconds",
        durationSeconds: Math.max(0.01, Number(current.durationSeconds) || 60),
        posture: lower ? (current.posture === "seated" ? "seated" : "standing") : undefined,
        taskPosture: key === "trunk"
            ? (current.taskPosture === "seated" || current.taskPosture === "combined" ? current.taskPosture : "standing")
            : undefined,
        lumbarConvex: key === "trunk"
            ? (current.lumbarConvex === true ? true : current.lumbarConvex === false ? false : null)
            : undefined,
        variables
    };
    return pmfProject.analysis.sectionStudy[key];
}

function kinoveaVariableForMovement(section, variableKey) {
    const map={
        trunk:{flexion:"trunk_flexion_signed",lateral:"trunk_lateral_signed",rotation:"trunk_axial_rotation_signed"},
        head_neck:{flexion:"head_flexion_signed",lateral:"head_lateral_signed",rotation:"head_axial_rotation_signed"},
        lower_right:{knee:"knee_flexion_right",ankle:"ankle_angle_right_dorsi_plantar"},
        lower_left:{knee:"knee_flexion_left",ankle:"ankle_angle_left_dorsi_plantar"}
    };
    return map?.[section]?.[variableKey] || null;
}

function hasKinoveaForMovement(section, variableKey) {
    const variable=kinoveaVariableForMovement(section,variableKey);
    if(!variable) return false;
    return (pmfProject.kinoveaFiles||[]).some(record=>getSeriesFromRecord(record,variable).length>0);
}

function movementSource(key, variableKey) {
    const study = ensureSectionStudy(key);
    if(!hasKinoveaForMovement(key,variableKey)) return "manual";
    return study.variables?.[variableKey]?.source === "manual" ? "manual" : "kinovea";
}

function canonicalMeasurementForResult(section, measurement) {
    const label=String(measurement||"");
    if(section==="trunk" && (/^Flexión \/ extensión/.test(label) || /^Flexión ·/.test(label))) {
        return "Flexión / extensión";
    }
    return label;
}

function movementKeyForResult(section, measurement) {
    const canonical=canonicalMeasurementForResult(section,measurement);
    const def = (PMF_SECTION_MANUAL_DEFS[section] || []).find(item => item.label === canonical);
    return def?.key || null;
}

function trunkFlexionBandAngle(band, exactAngle = null) {
    if (band === "gt20to60") {
        const a = Number(exactAngle);
        return Number.isFinite(a) && a > 20 && a <= 60 ? a : null;
    }
    return ({lt0:0,from0to20:20,gt60to90:90,gt90:90})[band] ?? null;
}

function trunkLateralBandAngle(band) {
    return ({ltNeg10:-11,fromNeg10to10:0,gt10:11})[band] ?? null;
}

function trunkRotationBandAngle(band) {
    return ({ltNeg10:-11,fromNeg10to10:0,gt10:11})[band] ?? null;
}

function trunkStaticMaxAcceptableSeconds(angle) {
    const a = Number(angle);
    if (!Number.isFinite(a) || a <= 20 || a > 60) return null;
    return Math.max(0, (5.5 - 0.075 * a) * 60);
}

function trunkStaticDurationCriterion(angle, observedSeconds) {
    const limitSeconds = trunkStaticMaxAcceptableSeconds(angle);
    const actual = Number(observedSeconds);
    if (!Number.isFinite(limitSeconds) || !Number.isFinite(actual)) return null;
    return {
        result: actual <= limitSeconds ? PMFCriteria.RESULT.ACCEPTABLE : PMFCriteria.RESULT.NOT_ACCEPTABLE,
        limitSeconds,
        actualSeconds: actual
    };
}

function headStaticBandAngle(band, exactAngle = null) {
    if (band === "gt25to85") {
        const a = Number(exactAngle);
        return Number.isFinite(a) && a > 25 && a <= 85 ? a : 26;
    }
    return ({lt0:-1,from0to25:25,gt85:86})[band] ?? null;
}

function headNeckFlexBandAngle(band) {
    return ({lt0:-1,from0to25:25,gt25:26})[band] ?? null;
}

function headLateralBandAngle(band) {
    return ({ltNeg10:-11,fromNeg10to10:0,gt10:11})[band] ?? null;
}

function headRotationBandAngle(band) {
    return ({ltNeg45:-46,fromNeg45to45:0,gt45:46})[band] ?? null;
}

function headDynamicFlexBandAngle(band) {
    return ({lt0:-1,from0to40:20,gt40:41})[band] ?? null;
}

function headStaticMaxAcceptableSeconds(angle) {
    const a=Number(angle);
    if(!Number.isFinite(a) || a<=25 || a>85) return null;

    // Figura 5.16: recta de duración máxima aceptable para la cabeza
    // entre 25° (8 min) y 85° (1 min). Se interpola linealmente,
    // igual que se hace con el gráfico de duración del tronco.
    const minAngle=25, maxAngle=85;
    const maxMinutesAtMinAngle=8, maxMinutesAtMaxAngle=1;
    const ratio=(a-minAngle)/(maxAngle-minAngle);
    const minutes=maxMinutesAtMinAngle + ratio*(maxMinutesAtMaxAngle-maxMinutesAtMinAngle);
    return Math.max(0,minutes*60);
}

function headStaticDurationCriterion(angle, observedSeconds) {
    const limitSeconds=headStaticMaxAcceptableSeconds(angle);
    const actual=Number(observedSeconds);
    if(!Number.isFinite(limitSeconds)||!Number.isFinite(actual)) return null;
    return {
        result:actual<=limitSeconds?PMFCriteria.RESULT.ACCEPTABLE:PMFCriteria.RESULT.NOT_ACCEPTABLE,
        limitSeconds,
        actualSeconds:actual
    };
}

function originalVideoKey(record) {
    const raw=record?.source?.originalVideoFileName
        || record?.parsedKinovea?.originalFilename
        || null;
    return raw ? String(raw).trim().toLowerCase() : null;
}

function matchingTrunkRecordForHead(record) {
    const sameRecordSeries=getSeriesFromRecord(record,"trunk_flexion_signed");
    if(sameRecordSeries.length) return record;

    const key=originalVideoKey(record);
    if(!key) return null;

    return (pmfProject.kinoveaFiles||[]).find(candidate =>
        candidate !== record &&
        originalVideoKey(candidate)===key &&
        getSeriesFromRecord(candidate,"trunk_flexion_signed").length
    ) || null;
}

function matchingTrunkSeriesForHead(record) {
    const match=matchingTrunkRecordForHead(record);
    return match ? getSeriesFromRecord(match,"trunk_flexion_signed") : [];
}

function headStaticSupportValues() {
    const v=ensureSectionStudy("head_neck")?.variables?.flexion || {};
    return {
        fullHeadSupport:v.fullHeadSupport===true?true:v.fullHeadSupport===false?false:null,
        fullTrunkSupport:v.fullTrunkSupport===true?true:v.fullTrunkSupport===false?false:null
    };
}

function differenceSeries(aSeries,bSeries) {
    const bMap=new Map((Array.isArray(bSeries)?bSeries:[]).map(p=>[Number(p.timestamp),Number(p.value)]));
    return (Array.isArray(aSeries)?aSeries:[]).flatMap(p=>{
        const t=Number(p.timestamp), a=Number(p.value), b=bMap.get(t);
        return Number.isFinite(a)&&Number.isFinite(b)?[{timestamp:t,value:a-b,valid:true,frame_index:p.frame_index??null}]:[];
    });
}

function manualTimeValues(study, value) {
    const duration = Math.max(0.01, Number(study.durationSeconds) || 60);
    const raw = Math.max(0, Number(value) || 0);
    const percent = study.timeMode === "percent" ? Math.min(100, raw) : Math.min(100, raw / duration * 100);
    const seconds = study.timeMode === "percent" ? duration * percent / 100 : raw;
    return {seconds, percent, duration};
}

function pmfManualResult(section, mode, measurement, calculated, criterionResult, manualKey = null) {
    return {
        section,
        videoNumber: "Manual",
        mode,
        measurement,
        calculated: calculated || {},
        status: criterionResult?.status || PMFCriteria.RESULT.NOT_EVALUATED,
        reason: criterionResult?.reason || "Sin criterio.",
        criterionId: criterionResult?.criterionId || null,
        manualKey,
        traceability: {
            source: "manual",
            section,
            mode,
            measurement,
            inputs: criterionResult?.inputs || null,
            generatedAt: new Date().toISOString()
        }
    };
}

function buildManualSection(key) {
    const study = ensureSectionStudy(key);
    const results = [];
    const vars = study.variables || {};
    const getVar = name => ({
        source: movementSource(key, name),
        angle: name === "flexion" && key === "trunk"
            ? trunkFlexionBandAngle(vars[name]?.angleBand, vars[name]?.exactAngle)
            : (name === "lateral" && key === "trunk"
                ? trunkLateralBandAngle(vars[name]?.angleBand)
                : (name === "rotation" && key === "trunk"
                    ? trunkRotationBandAngle(vars[name]?.angleBand)
                    : (name === "flexion" && key === "head_neck"
                        ? headStaticBandAngle(vars[name]?.staticAngleBand, vars[name]?.staticExactAngle)
                        : (name === "lateral" && key === "head_neck"
                            ? headLateralBandAngle(vars[name]?.angleBand)
                            : (name === "rotation" && key === "head_neck"
                                ? headRotationBandAngle(vars[name]?.angleBand)
                                : (vars[name]?.angle === null || vars[name]?.angle === undefined || vars[name]?.angle === "" ? null : Number(vars[name].angle))))))),
        time: Number(vars[name]?.time),
        frequencyBand: vars[name]?.frequencyBand === "gte2" ? "gte2" : "lt2",
        frequency: vars[name]?.frequencyBand === "gte2" ? 2 : 0
    });

    if (key === "trunk") {
        PMF_SECTION_MANUAL_DEFS.trunk.forEach(def => {
            const v=getVar(def.key);
            if(v.source!=="manual" || !Number.isFinite(v.angle)) return;
            const tv=manualTimeValues(study,v.time);
            if(def.kind==="trunkFlex"){
                const support=trunkFlexionSupport();
                const dyn=PMFCriteria.dynamic.trunkFlexion({angle:v.angle,frequencyPerMinute:Number.isFinite(v.frequency)?v.frequency:0,fullTrunkSupport:support});
                results.push(pmfManualResult(key,"dynamic",def.label,{extremeAngle:v.angle,frequencyPerMinute:Number.isFinite(v.frequency)?v.frequency:0,criticalPercent:tv.percent,criticalSeconds:tv.seconds,totalSeconds:tv.duration},dyn));
                if(tv.seconds>PMFCriteria.LIMITS.staticMinSeconds){
                    const durationCheck=support===false ? trunkStaticDurationCriterion(v.angle,tv.seconds) : null;
                    const st=PMFCriteria.static.trunk({
                        motion:"flexion",
                        angle:v.angle,
                        fullTrunkSupport:support,
                        durationCriterionResult:durationCheck?.result ?? null
                    });
                    const calculated={
                        totalStaticSeconds:tv.seconds,
                        worstEpisode:{averageAngle:v.angle,duration:tv.seconds}
                    };
                    if(durationCheck){
                        calculated.maxAcceptableStaticSeconds=durationCheck.limitSeconds;
                        calculated.durationCriterionResult=durationCheck.result;
                    }
                    results.push(pmfManualResult(key,"static",def.label,calculated,st));
                }
            } else {
                const fn=def.kind==="trunkLateral"?PMFCriteria.dynamic.trunkLateral:PMFCriteria.dynamic.trunkRotation;
                const dyn=fn({angle:v.angle,frequencyPerMinute:Number.isFinite(v.frequency)?v.frequency:0,criticalTimePercent:tv.percent});
                results.push(pmfManualResult(key,"dynamic",def.label,{extremeAngle:v.angle,frequencyPerMinute:Number.isFinite(v.frequency)?v.frequency:0,criticalPercent:tv.percent,criticalSeconds:tv.seconds,totalSeconds:tv.duration},dyn));
                if(tv.seconds>PMFCriteria.LIMITS.staticMinSeconds){
                    const st=PMFCriteria.static.trunk({motion:def.kind==="trunkLateral"?"lateral":"rotation",angle:v.angle});
                    results.push(pmfManualResult(key,"static",def.label,{totalStaticSeconds:tv.seconds,worstEpisode:{averageAngle:v.angle,duration:tv.seconds}},st));
                }
            }
        });
        if (study.taskPosture !== "standing" && study.lumbarConvex !== null) {
            const st=PMFCriteria.static.trunk({motion:"lumbar_convex",lumbarConvex:study.lumbarConvex});
            results.push(pmfManualResult(
                key,
                "static",
                "Postura convexa lumbar",
                {lumbarConvex:study.lumbarConvex,taskPosture:study.taskPosture},
                st
            ));
        }
    } else if (key === "head_neck") {
        PMF_SECTION_MANUAL_DEFS.head_neck.forEach(def => {
            const v=getVar(def.key);
            const raw=vars[def.key]||{};
            if(v.source!=="manual") return;
            const tv=manualTimeValues(study,v.time);

            if(def.kind==="headFlex"){

                // Dinámica: convención PMF = flexión hacia delante positiva.
                // 0°–40° aceptable; <0° o >40° requiere frecuencia y,
                // cuando la frecuencia es <2 mov/min, porcentaje de tiempo crítico.
                const dynamicAngle=headDynamicFlexBandAngle(raw.dynamicAngleBand);
                if(Number.isFinite(dynamicAngle)){
                    const dynamicFrequency=raw.dynamicFrequencyBand==="gte2" ? 2 : 0;
                    const dynamicCriticalPercent=raw.dynamicCriticalTimeBand==="gt60"
                        ? 60.01
                        : (raw.dynamicCriticalTimeBand==="lte60" ? 60 : null);
                    const dyn=PMFCriteria.dynamic.headFlexion({
                        angle:dynamicAngle,
                        frequencyPerMinute:dynamicFrequency,
                        criticalTimePercent:dynamicCriticalPercent
                    });
                    results.push(pmfManualResult(
                        key,
                        "dynamic",
                        def.label,
                        {
                            extremeAngle:dynamicAngle,
                            angleBand:raw.dynamicAngleBand||null,
                            frequencyBand:raw.dynamicFrequencyBand||"lt2",
                            frequencyPerMinute:dynamicFrequency,
                            criticalTimeBand:raw.dynamicCriticalTimeBand||null,
                            criticalPercent:dynamicCriticalPercent
                        },
                        dyn
                    ));
                }

                // Estática: mantiene sus datos y lógica independientes.
                if(!Number.isFinite(v.angle) || tv.seconds<=PMFCriteria.LIMITS.staticMinSeconds) return;
                const supports=headStaticSupportValues();
                const exactAngle=raw.staticAngleBand==="gt25to85" ? Number(raw.staticExactAngle) : v.angle;
                const manualTrunkAlpha=Number(raw.trunkAlpha);
                const trunkAlpha=manualTrunkAlpha;
                const neckAngle=raw.staticAngleBand==="gt25to85" && supports.fullTrunkSupport===false &&
                    Number.isFinite(exactAngle) && Number.isFinite(trunkAlpha)
                    ? exactAngle-trunkAlpha
                    : null;
                const durationCheck=raw.staticAngleBand==="gt25to85" && supports.fullTrunkSupport===true
                    ? headStaticDurationCriterion(exactAngle,tv.seconds)
                    : null;
                const st=PMFCriteria.static.head({
                    motion:"head_flexion",
                    angle:Number.isFinite(exactAngle)?exactAngle:v.angle,
                    fullHeadSupport:supports.fullHeadSupport,
                    fullTrunkSupport:supports.fullTrunkSupport,
                    neckFlexionAngle:neckAngle,
                    durationCriterionResult:durationCheck?.result ?? null
                });
                const calculated={
                    totalStaticSeconds:tv.seconds,
                    worstEpisode:{averageAngle:Number.isFinite(exactAngle)?exactAngle:v.angle,duration:tv.seconds}
                };
                if(Number.isFinite(neckAngle)){
                    calculated.neckFlexionAngle=neckAngle;
                    calculated.trunkAlpha=trunkAlpha;
                    calculated.trunkAlphaSource="manual";
                }
                if(durationCheck){
                    calculated.maxAcceptableStaticSeconds=durationCheck.limitSeconds;
                    calculated.durationCriterionResult=durationCheck.result;
                    calculated.durationCriterionAngle=Number.isFinite(exactAngle)?exactAngle:v.angle;
                    calculated.durationCriterionSource="Figura 5.16 / Tabla 5.12";
                }
                results.push(pmfManualResult(key,"static",def.label,calculated,st));
                return;
            }

            if(def.kind==="headLateral"){
                // Dinámica y estática se introducen de forma independiente.
                const dynamicAngle=headLateralBandAngle(raw.dynamicAngleBand);
                if(Number.isFinite(dynamicAngle)){
                    const dynamicFrequency=raw.dynamicFrequencyBand==="gte2" ? 2 : 0;
                    const dynamicCriticalPercent=raw.dynamicCriticalTimeBand==="gt60"
                        ? 60.01
                        : (raw.dynamicCriticalTimeBand==="lte60" ? 60 : null);
                    const dyn=PMFCriteria.dynamic.headLateral({
                        angle:dynamicAngle,
                        frequencyPerMinute:dynamicFrequency,
                        criticalTimePercent:dynamicCriticalPercent
                    });
                    results.push(pmfManualResult(
                        key,
                        "dynamic",
                        def.label,
                        {
                            extremeAngle:dynamicAngle,
                            angleBand:raw.dynamicAngleBand||null,
                            frequencyBand:raw.dynamicFrequencyBand||"lt2",
                            frequencyPerMinute:dynamicFrequency,
                            criticalTimeBand:raw.dynamicCriticalTimeBand||null,
                            criticalPercent:dynamicCriticalPercent
                        },
                        dyn
                    ));
                }

                if(Number.isFinite(v.angle) && tv.seconds>PMFCriteria.LIMITS.staticMinSeconds){
                    const st=PMFCriteria.static.head({motion:"lateral",angle:v.angle});
                    results.push(pmfManualResult(key,"static",def.label,{totalStaticSeconds:tv.seconds,worstEpisode:{averageAngle:v.angle,duration:tv.seconds}},st));
                }
                return;
            }

            if(def.kind==="headRotation"){
                // Dinámica y estática se introducen de forma independiente.
                const dynamicAngle=headRotationBandAngle(raw.dynamicAngleBand);
                if(Number.isFinite(dynamicAngle)){
                    const dynamicFrequency=raw.dynamicFrequencyBand==="gte2" ? 2 : 0;
                    const dynamicCriticalPercent=raw.dynamicCriticalTimeBand==="gt60"
                        ? 60.01
                        : (raw.dynamicCriticalTimeBand==="lte60" ? 60 : null);
                    const dyn=PMFCriteria.dynamic.headRotation({
                        angle:dynamicAngle,
                        frequencyPerMinute:dynamicFrequency,
                        criticalTimePercent:dynamicCriticalPercent
                    });
                    results.push(pmfManualResult(
                        key,
                        "dynamic",
                        def.label,
                        {
                            extremeAngle:dynamicAngle,
                            angleBand:raw.dynamicAngleBand||null,
                            frequencyBand:raw.dynamicFrequencyBand||"lt2",
                            frequencyPerMinute:dynamicFrequency,
                            criticalTimeBand:raw.dynamicCriticalTimeBand||null,
                            criticalPercent:dynamicCriticalPercent
                        },
                        dyn
                    ));
                }

                if(Number.isFinite(v.angle) && tv.seconds>PMFCriteria.LIMITS.staticMinSeconds){
                    const st=PMFCriteria.static.head({motion:"rotation",angle:v.angle});
                    results.push(pmfManualResult(key,"static",def.label,{totalStaticSeconds:tv.seconds,worstEpisode:{averageAngle:v.angle,duration:tv.seconds}},st));
                }
                return;
            }
        });
    } else {
        const posture=study.posture==="seated"?"seated":"standing";
        const knee=getVar("knee");
        if(knee.source==="manual" && Number.isFinite(knee.angle)){
            const tv=manualTimeValues(study,knee.time);
            const standingFlexion=180-knee.angle;
            const seatedExcursion=Math.abs(knee.angle-90);
            const dyn=PMFCriteria.lowerLimb.kneeDynamic({
                posture,
                internalAngle:knee.angle,
                standingFlexion,
                seatedExcursion,
                frequencyPerMinute:Number.isFinite(knee.frequency)?knee.frequency:0
            });
            results.push(pmfManualResult(key,"dynamic","Rodilla",{extremeAngle:posture==="standing"?standingFlexion:seatedExcursion,frequencyPerMinute:Number.isFinite(knee.frequency)?knee.frequency:0,criticalPercent:tv.percent,criticalSeconds:tv.seconds,totalSeconds:tv.duration},dyn));
            if(tv.seconds>PMFCriteria.LIMITS.staticMinSeconds){
                const mk=posture==="standing"?"manual."+key+".ischialSupport":"manual."+key+".trunkPosteriorInclined";
                const kneeRaw=vars.knee||{};
                const ischialSupport=kneeRaw.ischialSupport===true?true:kneeRaw.ischialSupport===false?false:null;
                const trunkPosteriorInclined=kneeRaw.trunkPosteriorInclined===true?true:kneeRaw.trunkPosteriorInclined===false?false:null;
                const st=PMFCriteria.static.knee({
                    posture,
                    internalAngle:knee.angle,
                    standingFlexion,
                    ischialSupport:posture==="standing"?ischialSupport:null,
                    trunkPosteriorInclined:posture==="seated"?trunkPosteriorInclined:null
                });
                results.push(pmfManualResult(key,"static","Rodilla",{totalStaticSeconds:tv.seconds,worstEpisode:{averageAngle:knee.angle,duration:tv.seconds}},st,null));
            }
        }
        const ankle=getVar("ankle");
        if(ankle.source==="manual" && Number.isFinite(ankle.angle)){
            const tv=manualTimeValues(study,ankle.time);
            const dyn=PMFCriteria.lowerLimb.ankleDynamic({dorsiPlantarAngle:ankle.angle,frequencyPerMinute:Number.isFinite(ankle.frequency)?ankle.frequency:0});
            results.push(pmfManualResult(key,"dynamic","Tobillo",{extremeAngle:ankle.angle,frequencyPerMinute:Number.isFinite(ankle.frequency)?ankle.frequency:0,criticalPercent:tv.percent,criticalSeconds:tv.seconds,totalSeconds:tv.duration},dyn));
            if(tv.seconds>PMFCriteria.LIMITS.staticMinSeconds){
                const st=PMFCriteria.static.ankle({dorsiPlantarAngle:ankle.angle});
                results.push(pmfManualResult(key,"static","Tobillo",{totalStaticSeconds:tv.seconds,worstEpisode:{averageAngle:ankle.angle,duration:tv.seconds}},st));
            }
        }
    }

    return {label:key,results,traceability:results.map(r=>r.traceability)};
}

function pmfSectionHelp(sectionKey) {
    const helps = {
        trunk: '<details class="help-panel"><summary>ⓘ Ayuda: ejemplos de posturas de espalda</summary><div class="help-content"><p><strong>Flexión / extensión (inclinarse hacia delante o hacia atrás):</strong> por ejemplo al recoger algo del suelo, hacer una cama, trabajar sobre una mesa baja, mirar una balda alta o alcanzar algo situado por encima y detrás.</p><p><strong>Inclinación lateral (inclinarse hacia un lado):</strong> por ejemplo al coger algo situado junto a una silla, alcanzar una pieza colocada a un lado o acercarse lateralmente a una persona o máquina.</p><p><strong>Rotación (girar el cuerpo):</strong> por ejemplo al mirar hacia atrás desde un asiento, mover objetos entre dos zonas situadas a ambos lados o girarse repetidamente hacia una cinta.</p><p><strong>Postura convexa lumbar (espalda baja redondeada al estar sentado/a):</strong> se produce cuando la zona lumbar pierde su curvatura habitual y queda redondeada hacia atrás durante la posición sentada. Por ejemplo, al sentarse encorvado/a sin apoyo lumbar o trabajar sentado/a inclinado hacia delante durante periodos prolongados. Solo se valora cuando la tarea incluye trabajo en posición sentada.</p></div></details>',
        head_neck: '<details class="help-panel"><summary>ⓘ Ayuda: medición y ejemplos de posturas de cabeza y cuello</summary><div class="help-content"><p><strong>Cómo medir manualmente el ángulo β de flexión/extensión de cabeza:</strong></p><p>1. Utilice una <strong>vista lateral</strong> en la que se vea con claridad la cabeza y el tronco.</p><p>2. Tome como referencia la <strong>postura neutra de cabeza = 0°</strong>: cabeza erguida, sin mirar hacia arriba ni hacia abajo.</p><p>3. En el vídeo, identifique el fotograma o periodo en el que se mantiene la postura de cabeza que quiere valorar. Para considerarla estática debe mantenerse durante <strong>más de 4 segundos</strong>.</p><p>4. Trace una línea entre la <strong>frente</strong> y la <strong>parte posterior de la cabeza, por encima de la nuca</strong>. Utilice siempre esas mismas zonas como referencia y compare la línea con la postura neutra.</p><p>5. Introduzca como β la <strong>desviación respecto a 0°</strong>, no el ángulo absoluto que pueda mostrar la herramienta de medición del vídeo. La inclinación hacia delante es positiva; la extensión hacia atrás es negativa.</p><div class="pmf-help-image-wrap"><img class="pmf-help-image" src="assets/angulo_beta_help.png" alt="Esquema para medir el ángulo beta de flexión y extensión de cabeza"></div><p><strong>Ejemplo:</strong> si desde la posición neutra la cabeza se inclina 35° hacia delante, β = 35°. Si se inclina 10° hacia atrás, β = −10°.</p><p><strong>Flexión / extensión de cabeza:</strong> por ejemplo al mirar el móvil, leer sobre una mesa, revisar piezas pequeñas, mirar una balda alta o inspeccionar una instalación elevada.</p><p><strong>Lateralización de cabeza:</strong> por ejemplo al sujetar un teléfono entre el hombro y la oreja o inclinar la cabeza lateralmente para observar una zona de trabajo.</p><p><strong>Rotación axial de cabeza:</strong> por ejemplo al mirar hacia atrás al aparcar, vigilar una pantalla lateral o mirar alternativamente dos zonas de trabajo.</p></div></details>',
        lower_right: '<details class="help-panel"><summary>ⓘ Ayuda: ejemplos de posturas de la extremidad inferior derecha</summary><div class="help-content"><p><strong>Rodilla de pie:</strong> por ejemplo al ponerse en cuclillas, trabajar en semisentadilla, agacharse manteniendo una rodilla flexionada, arrodillarse o trabajar cerca del suelo.</p><p><strong>Rodilla sentado/a:</strong> por ejemplo al trabajar en un asiento bajo, mantener la pierna muy recogida bajo la silla o, por el contrario, mantenerla muy extendida hacia delante.</p><p><strong>Apoyo isquiotibial:</strong> por ejemplo cuando la persona trabaja semisentada sobre un apoyo o asiento alto que soporta el peso sobre los huesos en los que nos sentamos.</p><p><strong>Tronco posteriormente inclinado:</strong> por ejemplo cuando la persona permanece sentada y recostada hacia atrás sobre el respaldo.</p><p><strong>Tobillo:</strong> por ejemplo al hacer una sentadilla profunda, trabajar agachado con el talón apoyado, ponerse de puntillas, accionar un pedal o alcanzar algo situado en altura. Para la entrada manual, la <strong>dorsiflexión se introduce con signo positivo (+)</strong> y la <strong>flexión plantar con signo negativo (−)</strong>.</p></div></details>',
        lower_left: '<details class="help-panel"><summary>ⓘ Ayuda: ejemplos de posturas de la extremidad inferior izquierda</summary><div class="help-content"><p><strong>Rodilla de pie:</strong> por ejemplo al ponerse en cuclillas, trabajar en semisentadilla, agacharse manteniendo una rodilla flexionada, arrodillarse o trabajar cerca del suelo.</p><p><strong>Rodilla sentado/a:</strong> por ejemplo al trabajar en un asiento bajo, mantener la pierna muy recogida bajo la silla o, por el contrario, mantenerla muy extendida hacia delante.</p><p><strong>Apoyo isquiotibial:</strong> por ejemplo cuando la persona trabaja semisentada sobre un apoyo o asiento alto que soporta el peso sobre los huesos en los que nos sentamos.</p><p><strong>Tronco posteriormente inclinado:</strong> por ejemplo cuando la persona permanece sentada y recostada hacia atrás sobre el respaldo.</p><p><strong>Tobillo:</strong> por ejemplo al hacer una sentadilla profunda, trabajar agachado con el talón apoyado, ponerse de puntillas, accionar un pedal o alcanzar algo situado en altura. Para la entrada manual, la <strong>dorsiflexión se introduce con signo positivo (+)</strong> y la <strong>flexión plantar con signo negativo (−)</strong>.</p></div></details>'
    };
    return helps[sectionKey] || "";
}

function sectionStudyControls(key) {
    const study=ensureSectionStudy(key);
    const defs=PMF_SECTION_MANUAL_DEFS[key] || [];
    const lower=key==="lower_right"||key==="lower_left";
    const hasManual=defs.some(def=>movementSource(key,def.key)==="manual");
    const unitLabel=study.timeMode==="percent"?"% del tiempo analizado en el que se mantiene esta postura":"segundos";

    const rows=defs.map(def=>{
        const v=study.variables?.[def.key] || {};
        const kinoveaAvailable=hasKinoveaForMovement(key,def.key);
        const source=kinoveaAvailable && v.source!=="manual" ? "kinovea" : "manual";
        const angleLabel=def.kind==="knee"?"Ángulo interno (°)":def.kind==="ankle"?"Ángulo tobillo (°; + dorsiflexión / − plantar)":"Ángulo (°)";
        const angleControl = key==="trunk" && def.key==="flexion"
          ? '<label>Intervalo angular<select data-pmf-trunk-flexion-band><option value="">-- seleccionar --</option><option value="lt0" '+(v.angleBand==="lt0"?"selected":"")+'>≤ 0°</option><option value="from0to20" '+(v.angleBand==="from0to20"?"selected":"")+'>1°–20° (20° incluido)</option><option value="gt20to60" '+(v.angleBand==="gt20to60"?"selected":"")+'>›20°–60° (60° incluido)</option><option value="gt60to90" '+(v.angleBand==="gt60to90"?"selected":"")+'>›60°–90° (90° incluido)</option><option value="gt90" '+(v.angleBand==="gt90"?"selected":"")+'>› 90° (se evalúa como 90°)</option></select></label>'+
            (v.angleBand==="gt20to60"?'<label>Ángulo observado exacto (›20° y ≤60°)<input type="number" min="20.01" max="60" step="0.1" data-pmf-trunk-flexion-exact value="'+escapeHtml(v.exactAngle ?? "")+'"></label>':'')
          : (key==="trunk" && def.key==="lateral"
              ? '<label>Intervalo angular<select data-pmf-trunk-lateral-band><option value="">-- seleccionar --</option><option value="ltNeg10" '+(v.angleBand==="ltNeg10"?"selected":"")+'>‹ -10°</option><option value="fromNeg10to10" '+(v.angleBand==="fromNeg10to10"?"selected":"")+'>-10° a 10° (incluidos)</option><option value="gt10" '+(v.angleBand==="gt10"?"selected":"")+'>› 10°</option></select></label>'
              : (key==="trunk" && def.key==="rotation"
                  ? '<label>Intervalo angular<select data-pmf-trunk-rotation-band><option value="">-- seleccionar --</option><option value="ltNeg10" '+(v.angleBand==="ltNeg10"?"selected":"")+'>‹ -10°</option><option value="fromNeg10to10" '+(v.angleBand==="fromNeg10to10"?"selected":"")+'>-10° a 10° (incluidos)</option><option value="gt10" '+(v.angleBand==="gt10"?"selected":"")+'>› 10°</option></select></label>'
                  : (key==="head_neck" && def.key==="flexion"
                      ? '<label>Estática · Inclinación de cabeza β<select data-pmf-head-static-band><option value="">-- seleccionar --</option><option value="lt0" '+(v.staticAngleBand==="lt0"?"selected":"")+'>‹ 0°</option><option value="from0to25" '+(v.staticAngleBand==="from0to25"?"selected":"")+'>0°–25° (incluidos)</option><option value="gt25to85" '+(v.staticAngleBand==="gt25to85"?"selected":"")+'>›25°–85° (85° incluido)</option><option value="gt85" '+(v.staticAngleBand==="gt85"?"selected":"")+'>› 85°</option></select></label>'+
                        (v.staticAngleBand==="gt25to85"?'<label>Ángulo exacto de cabeza β (0° = neutra)<input type="number" min="25.01" max="85" step="0.1" data-pmf-head-static-exact value="'+escapeHtml(v.staticExactAngle ?? "")+'"></label>':'')+
                        (v.staticAngleBand==="gt25to85" && v.fullTrunkSupport===false
                          ? '<label>Ángulo de tronco α (0° = neutra)<input type="number" step="0.1" data-pmf-head-trunk-alpha value="'+escapeHtml(v.trunkAlpha ?? "")+'"></label>'+
                            '<div class="notice">Para calcular β − α en entrada manual, introduzca el ángulo α correspondiente a la misma postura observada.</div>'
                          : '')+
                        '<label>Dinámica · Intervalo angular · flexión (+) / extensión (−)<select data-pmf-head-dynamic-flex-band><option value="">-- seleccionar --</option><option value="lt0" '+(v.dynamicAngleBand==="lt0"?"selected":"")+'>‹ 0° · extensión</option><option value="from0to40" '+(v.dynamicAngleBand==="from0to40"?"selected":"")+'>0°–40° (incluidos)</option><option value="gt40" '+(v.dynamicAngleBand==="gt40"?"selected":"")+'>› 40° · flexión</option></select></label>'
                      : (key==="head_neck" && def.key==="lateral"
                          ? '<label>Estática · Intervalo angular · derecha (+) / izquierda (−)<select data-pmf-head-lateral-band><option value="">-- seleccionar --</option><option value="ltNeg10" '+(v.angleBand==="ltNeg10"?"selected":"")+'>‹ −10° · izquierda</option><option value="fromNeg10to10" '+(v.angleBand==="fromNeg10to10"?"selected":"")+'>−10° a 10° (incluidos)</option><option value="gt10" '+(v.angleBand==="gt10"?"selected":"")+'>› 10° · derecha</option></select></label>'+
                            '<label>Dinámica · Intervalo angular · derecha (+) / izquierda (−)<select data-pmf-head-dynamic-lateral-band><option value="">-- seleccionar --</option><option value="ltNeg10" '+(v.dynamicAngleBand==="ltNeg10"?"selected":"")+'>‹ −10° · izquierda</option><option value="fromNeg10to10" '+(v.dynamicAngleBand==="fromNeg10to10"?"selected":"")+'>−10° a 10° (incluidos)</option><option value="gt10" '+(v.dynamicAngleBand==="gt10"?"selected":"")+'>› 10° · derecha</option></select></label>'
                          : (key==="head_neck" && def.key==="rotation"
                              ? '<label>Estática · Intervalo angular · derecha (+) / izquierda (−)<select data-pmf-head-rotation-band><option value="">-- seleccionar --</option><option value="ltNeg45" '+(v.angleBand==="ltNeg45"?"selected":"")+'>‹ −45° · izquierda</option><option value="fromNeg45to45" '+(v.angleBand==="fromNeg45to45"?"selected":"")+'>−45° a 45° (incluidos)</option><option value="gt45" '+(v.angleBand==="gt45"?"selected":"")+'>› 45° · derecha</option></select></label>'+
                                '<label>Dinámica · Intervalo angular · derecha (+) / izquierda (−)<select data-pmf-head-dynamic-rotation-band><option value="">-- seleccionar --</option><option value="ltNeg45" '+(v.dynamicAngleBand==="ltNeg45"?"selected":"")+'>‹ −45° · izquierda</option><option value="fromNeg45to45" '+(v.dynamicAngleBand==="fromNeg45to45"?"selected":"")+'>−45° a 45° (incluidos)</option><option value="gt45" '+(v.dynamicAngleBand==="gt45"?"selected":"")+'>› 45° · derecha</option></select></label>'
                              : '<label>'+angleLabel+'<input type="number" step="0.1" data-pmf-manual-angle="'+def.key+'" value="'+escapeHtml(v.angle ?? "")+'"></label>')))));
        const supportCell = key==="trunk" && def.key==="flexion"
          ? '<td><div class="pmf-cell-stack"><label>Soporte completo<select data-pmf-trunk-flexion-support><option value="">-- seleccionar --</option><option value="true" '+(v.fullSupport===true?"selected":"")+'>Con soporte</option><option value="false" '+(v.fullSupport===false?"selected":"")+'>Sin soporte</option></select></label></div></td>'
          : (key==="head_neck" && def.key==="flexion"
              ? '<td><div class="pmf-cell-stack">'+
                ((source==="kinovea"||v.staticAngleBand==="lt0")?'<label>Soporte completo de cabeza<select data-pmf-head-support><option value="">-- seleccionar --</option><option value="true" '+(v.fullHeadSupport===true?"selected":"")+'>Con soporte</option><option value="false" '+(v.fullHeadSupport===false?"selected":"")+'>Sin soporte</option></select></label>':'')+
                ((source==="kinovea"||v.staticAngleBand==="gt25to85")?'<label>Soporte completo del tronco<select data-pmf-head-trunk-support><option value="">-- seleccionar --</option><option value="true" '+(v.fullTrunkSupport===true?"selected":"")+'>Con soporte</option><option value="false" '+(v.fullTrunkSupport===false?"selected":"")+'>Sin soporte</option></select></label>':'')+
                ((source==="manual"&&v.staticAngleBand!=="lt0"&&v.staticAngleBand!=="gt25to85")?'<span class="pmf-result-empty">—</span>':'')+
                '</div></td>'
              : (lower && def.key==="knee"
                  ? '<td><div class="pmf-cell-stack">'+
                    (study.posture==="standing"
                      ? '<label>Apoyo isquiotibial<select data-pmf-knee-ischial-support><option value="">-- seleccionar --</option><option value="true" '+(v.ischialSupport===true?"selected":"")+'>Sí</option><option value="false" '+(v.ischialSupport===false?"selected":"")+'>No</option></select></label>'
                      : '<label>Tronco posteriormente inclinado<select data-pmf-knee-trunk-posterior><option value="">-- seleccionar --</option><option value="true" '+(v.trunkPosteriorInclined===true?"selected":"")+'>Sí</option><option value="false" '+(v.trunkPosteriorInclined===false?"selected":"")+'>No</option></select></label>')+
                    '</div></td>'
                  : '<td><div class="pmf-cell-stack"><span class="pmf-result-empty">—</span></div></td>'));
        const manualCells=source==="manual"
          ? '<td><div class="pmf-cell-stack">'+angleControl+'</div></td>'+
            '<td><div class="pmf-cell-stack"><label>Tiempo ('+unitLabel+')<input type="number" min="0" step="0.1" data-pmf-manual-time="'+def.key+'" value="'+escapeHtml(v.time ?? "")+'"></label></div></td>'+
            (key==="head_neck"&&def.key==="flexion"
              ? '<td><div class="pmf-cell-stack"><label>Frecuencia dinámica<select data-pmf-head-dynamic-frequency><option value="lt2" '+((v.dynamicFrequencyBand||"lt2")==="lt2"?"selected":"")+'>‹ 2 movimientos/minuto</option><option value="gte2" '+(v.dynamicFrequencyBand==="gte2"?"selected":"")+'>≥ 2 movimientos/minuto</option></select></label>'+
                ((v.dynamicAngleBand==="lt0"||v.dynamicAngleBand==="gt40") && (v.dynamicFrequencyBand||"lt2")==="lt2"
                  ? '<label>Tiempo en postura crítica<select data-pmf-head-dynamic-critical-time><option value="">-- seleccionar --</option><option value="lte60" '+(v.dynamicCriticalTimeBand==="lte60"?"selected":"")+'>≤ 60% del tiempo de la tarea</option><option value="gt60" '+(v.dynamicCriticalTimeBand==="gt60"?"selected":"")+'>› 60% del tiempo de la tarea</option></select></label>'
                  : '')+
                '</div></td>'
              : (key==="head_neck"&&def.key==="lateral"
                  ? '<td><div class="pmf-cell-stack"><label>Frecuencia dinámica<select data-pmf-head-dynamic-lateral-frequency><option value="lt2" '+((v.dynamicFrequencyBand||"lt2")==="lt2"?"selected":"")+'>‹ 2 movimientos/minuto</option><option value="gte2" '+(v.dynamicFrequencyBand==="gte2"?"selected":"")+'>≥ 2 movimientos/minuto</option></select></label>'+
                    ((v.dynamicAngleBand==="ltNeg10"||v.dynamicAngleBand==="gt10") && (v.dynamicFrequencyBand||"lt2")==="lt2"
                      ? '<label>Tiempo en postura crítica<select data-pmf-head-dynamic-lateral-critical-time><option value="">-- seleccionar --</option><option value="lte60" '+(v.dynamicCriticalTimeBand==="lte60"?"selected":"")+'>≤ 60% del tiempo de la tarea</option><option value="gt60" '+(v.dynamicCriticalTimeBand==="gt60"?"selected":"")+'>› 60% del tiempo de la tarea</option></select></label>'
                      : '')+
                    '</div></td>'
                  : (key==="head_neck"&&def.key==="rotation"
                      ? '<td><div class="pmf-cell-stack"><label>Frecuencia dinámica<select data-pmf-head-dynamic-rotation-frequency><option value="lt2" '+((v.dynamicFrequencyBand||"lt2")==="lt2"?"selected":"")+'>‹ 2 movimientos/minuto</option><option value="gte2" '+(v.dynamicFrequencyBand==="gte2"?"selected":"")+'>≥ 2 movimientos/minuto</option></select></label>'+
                        ((v.dynamicAngleBand==="ltNeg45"||v.dynamicAngleBand==="gt45") && (v.dynamicFrequencyBand||"lt2")==="lt2"
                          ? '<label>Tiempo en postura crítica<select data-pmf-head-dynamic-rotation-critical-time><option value="">-- seleccionar --</option><option value="lte60" '+(v.dynamicCriticalTimeBand==="lte60"?"selected":"")+'>≤ 60% del tiempo de la tarea</option><option value="gt60" '+(v.dynamicCriticalTimeBand==="gt60"?"selected":"")+'>› 60% del tiempo de la tarea</option></select></label>'
                          : '')+
                        '</div></td>'
                      : '<td><div class="pmf-cell-stack"><label>Frecuencia<select data-pmf-manual-frequency="'+def.key+'"><option value="lt2" '+((v.frequencyBand||"lt2")==="lt2"?"selected":"")+'>‹ 2 movimientos/minuto</option><option value="gte2" '+(v.frequencyBand==="gte2"?"selected":"")+'>≥ 2 movimientos/minuto</option></select></label></div></td>')))
          : '<td colspan="3"><div class="pmf-kinovea-note">'+
              (key==="head_neck"&&def.key==="flexion"
                ? 'Se utilizarán los datos Kinovea de cabeza. Para calcular la flexo-extensión del cuello es necesario disponer del análisis de tronco de este mismo vídeo o introducir α manualmente.'
                : 'Se utilizarán los datos Kinovea disponibles para este movimiento/postura.')+
              '</div></td>';
        return '<tr><td><strong>'+escapeHtml(def.label)+'</strong></td>'+
          '<td><div class="pmf-cell-stack"><label>Fuente<select data-pmf-movement-source="'+def.key+'">'+
            (kinoveaAvailable
              ? '<option value="kinovea" '+(source==="kinovea"?"selected":"")+'>Kinovea</option><option value="manual" '+(source==="manual"?"selected":"")+'>Manual</option>'
              : '<option value="manual" selected>Manual</option>')+
            '</select></label>'+
            ((!kinoveaAvailable && (pmfProject.kinoveaFiles||[]).length>0)?'<div class="pmf-field-hint">Esta postura debe valorarse mediante introducción manual de los datos.</div>':'')+
            '</div></td>'+
          manualCells+supportCell+'</tr>';
    }).join("");

    const convexRow = key==="trunk" && study.taskPosture!=="standing"
      ? '<tr><td><strong>Postura convexa lumbar</strong>'+(study.taskPosture==="combined"?'<div class="pmf-field-hint">Valorar únicamente durante los periodos en posición sentada.</div>':'')+'</td>'+
        '<td><div class="pmf-cell-stack pmf-cell-static-text">Manual</div></td>'+
        '<td colspan="4"><div class="pmf-cell-stack"><label>Postura convexa lumbar<select data-pmf-lumbar-convex><option value="">-- seleccionar --</option><option value="false" '+(study.lumbarConvex===false?"selected":"")+'>No existe</option><option value="true" '+(study.lumbarConvex===true?"selected":"")+'>Existe</option></select></label></div></td></tr>'
      : '';

    const trunkTaskPosture = key==="trunk"
      ? '<div class="form-grid pmf-task-posture"><label>Posición durante la tarea<select data-pmf-task-posture><option value="standing" '+(study.taskPosture==="standing"?"selected":"")+'>De pie</option><option value="seated" '+(study.taskPosture==="seated"?"selected":"")+'>Sentado/a</option><option value="combined" '+(study.taskPosture==="combined"?"selected":"")+'>Combinada: de pie y sentado/a</option></select></label></div>'
      : '';

    return '<div class="pmf-study-controls" data-pmf-study-section="'+key+'">'+
      trunkTaskPosture+
      (hasManual?'<div class="form-grid">'+
        '<label>Unidad de tiempo<select data-pmf-time-mode><option value="seconds" '+(study.timeMode==="seconds"?"selected":"")+'>Segundos</option><option value="percent" '+(study.timeMode==="percent"?"selected":"")+'>% del tiempo analizado en el que se mantiene esta postura</option></select></label>'+
        '<label>Duración analizada (s)<input type="number" min="0.01" step="0.1" data-pmf-duration value="'+escapeHtml(study.durationSeconds)+'"></label>'+
        (lower?'<label>Postura de referencia<select data-pmf-posture><option value="standing" '+(study.posture==="standing"?"selected":"")+'>De pie</option><option value="seated" '+(study.posture==="seated"?"selected":"")+'>Sentado/a</option></select></label>':'')+
      '</div>':'')+
      '<div class="result-table-wrap"><table class="compact-table"><thead><tr><th>Movimiento / postura</th><th>Fuente</th><th>Ángulo</th><th>Tiempo</th><th>Frecuencia</th><th>Soporte</th></tr></thead><tbody>'+rows+convexRow+'</tbody></table></div>'+
      pmfSectionHelp(key)+
      (hasManual?'<div class="notice">Cada movimiento/postura puede estudiarse de forma independiente. Los datos manuales se combinan con los resultados Kinovea del resto del segmento. Una postura se considera estática cuando se mantiene durante más de 4 segundos.</div>':'<div class="notice">Todos los movimientos/posturas de este segmento se obtendrán de Kinovea mientras mantengan esta fuente seleccionada.</div>')+
    '</div>';
}

function bindSectionStudyControls() {
    document.querySelectorAll("[data-pmf-study-section]").forEach(block=>{
        const key=block.dataset.pmfStudySection;
        const study=ensureSectionStudy(key);
        const rerender=()=>{
            const ordered=[...(pmfProject.kinoveaFiles||[])].sort((a,b)=>Number(a.videoIndex)-Number(b.videoIndex));
            pmfProject.analysis.bodySections=classifyPMFSections(ordered);
            touchProject(false);
            renderAnalysisResults();
        };
        block.querySelectorAll("[data-pmf-movement-source]").forEach(el=>el.addEventListener("change",()=>{
            const k=el.dataset.pmfMovementSource;
            study.variables[k]=study.variables[k]||{};
            study.variables[k].source=(el.value==="kinovea"&&hasKinoveaForMovement(key,k))?"kinovea":"manual";
            rerender();
        }));
        block.querySelector("[data-pmf-time-mode]")?.addEventListener("change",e=>{study.timeMode=e.target.value==="percent"?"percent":"seconds";rerender();});
        block.querySelector("[data-pmf-duration]")?.addEventListener("change",e=>{study.durationSeconds=Math.max(.01,Number(e.target.value)||60);rerender();});
        block.querySelector("[data-pmf-posture]")?.addEventListener("change",e=>{study.posture=e.target.value==="seated"?"seated":"standing";rerender();});
        block.querySelector("[data-pmf-knee-ischial-support]")?.addEventListener("change",e=>{study.variables.knee=study.variables.knee||{};study.variables.knee.ischialSupport=e.target.value==="true"?true:e.target.value==="false"?false:null;rerender();});
        block.querySelector("[data-pmf-knee-trunk-posterior]")?.addEventListener("change",e=>{study.variables.knee=study.variables.knee||{};study.variables.knee.trunkPosteriorInclined=e.target.value==="true"?true:e.target.value==="false"?false:null;rerender();});
        block.querySelector("[data-pmf-task-posture]")?.addEventListener("change",e=>{
            study.taskPosture=e.target.value==="seated"?"seated":e.target.value==="combined"?"combined":"standing";
            if(study.taskPosture==="standing") study.lumbarConvex=null;
            rerender();
        });
        block.querySelector("[data-pmf-lumbar-convex]")?.addEventListener("change",e=>{
            study.lumbarConvex=e.target.value==="true"?true:e.target.value==="false"?false:null;
            rerender();
        });
        block.querySelector("[data-pmf-trunk-flexion-band]")?.addEventListener("change",e=>{study.variables.flexion=study.variables.flexion||{};study.variables.flexion.angleBand=e.target.value||null;if(e.target.value!=="gt20to60")delete study.variables.flexion.exactAngle;delete study.variables.flexion.angle;rerender();});
        block.querySelector("[data-pmf-trunk-flexion-exact]")?.addEventListener("change",e=>{const a=Number(e.target.value);study.variables.flexion=study.variables.flexion||{};study.variables.flexion.exactAngle=Number.isFinite(a)&&a>20&&a<=60?a:null;rerender();});
        block.querySelector("[data-pmf-trunk-lateral-band]")?.addEventListener("change",e=>{study.variables.lateral=study.variables.lateral||{};study.variables.lateral.angleBand=e.target.value||null;delete study.variables.lateral.angle;rerender();});
        block.querySelector("[data-pmf-trunk-rotation-band]")?.addEventListener("change",e=>{study.variables.rotation=study.variables.rotation||{};study.variables.rotation.angleBand=e.target.value||null;delete study.variables.rotation.angle;rerender();});
        block.querySelector("[data-pmf-head-lateral-band]")?.addEventListener("change",e=>{study.variables.lateral=study.variables.lateral||{};study.variables.lateral.angleBand=e.target.value||null;delete study.variables.lateral.angle;rerender();});
        block.querySelector("[data-pmf-head-dynamic-lateral-band]")?.addEventListener("change",e=>{study.variables.lateral=study.variables.lateral||{};study.variables.lateral.dynamicAngleBand=e.target.value||null;if(e.target.value==="fromNeg10to10")delete study.variables.lateral.dynamicCriticalTimeBand;rerender();});
        block.querySelector("[data-pmf-head-dynamic-lateral-frequency]")?.addEventListener("change",e=>{study.variables.lateral=study.variables.lateral||{};study.variables.lateral.dynamicFrequencyBand=e.target.value==="gte2"?"gte2":"lt2";if(study.variables.lateral.dynamicFrequencyBand==="gte2")delete study.variables.lateral.dynamicCriticalTimeBand;rerender();});
        block.querySelector("[data-pmf-head-dynamic-lateral-critical-time]")?.addEventListener("change",e=>{study.variables.lateral=study.variables.lateral||{};study.variables.lateral.dynamicCriticalTimeBand=e.target.value==="gt60"?"gt60":e.target.value==="lte60"?"lte60":null;rerender();});
        block.querySelector("[data-pmf-head-rotation-band]")?.addEventListener("change",e=>{study.variables.rotation=study.variables.rotation||{};study.variables.rotation.angleBand=e.target.value||null;delete study.variables.rotation.angle;rerender();});
        block.querySelector("[data-pmf-head-dynamic-rotation-band]")?.addEventListener("change",e=>{study.variables.rotation=study.variables.rotation||{};study.variables.rotation.dynamicAngleBand=e.target.value||null;if(e.target.value==="fromNeg45to45")delete study.variables.rotation.dynamicCriticalTimeBand;rerender();});
        block.querySelector("[data-pmf-head-dynamic-rotation-frequency]")?.addEventListener("change",e=>{study.variables.rotation=study.variables.rotation||{};study.variables.rotation.dynamicFrequencyBand=e.target.value==="gte2"?"gte2":"lt2";if(study.variables.rotation.dynamicFrequencyBand==="gte2")delete study.variables.rotation.dynamicCriticalTimeBand;rerender();});
        block.querySelector("[data-pmf-head-dynamic-rotation-critical-time]")?.addEventListener("change",e=>{study.variables.rotation=study.variables.rotation||{};study.variables.rotation.dynamicCriticalTimeBand=e.target.value==="gt60"?"gt60":e.target.value==="lte60"?"lte60":null;rerender();});
        block.querySelector("[data-pmf-trunk-flexion-support]")?.addEventListener("change",e=>{study.variables.flexion=study.variables.flexion||{};study.variables.flexion.fullSupport=e.target.value==="true"?true:e.target.value==="false"?false:null;rerender();});
        block.querySelector("[data-pmf-head-static-band]")?.addEventListener("change",e=>{study.variables.flexion=study.variables.flexion||{};study.variables.flexion.staticAngleBand=e.target.value||null;if(e.target.value!=="gt25to85"){delete study.variables.flexion.staticExactAngle;delete study.variables.flexion.fullTrunkSupport;delete study.variables.flexion.trunkAlpha;}if(e.target.value!=="lt0")delete study.variables.flexion.fullHeadSupport;rerender();});
        block.querySelector("[data-pmf-head-static-exact]")?.addEventListener("change",e=>{const a=Number(e.target.value);study.variables.flexion=study.variables.flexion||{};study.variables.flexion.staticExactAngle=Number.isFinite(a)&&a>25&&a<=85?a:null;rerender();});
        block.querySelector("[data-pmf-head-dynamic-flex-band]")?.addEventListener("change",e=>{study.variables.flexion=study.variables.flexion||{};study.variables.flexion.dynamicAngleBand=e.target.value||null;if(e.target.value==="from0to40")delete study.variables.flexion.dynamicCriticalTimeBand;rerender();});
        block.querySelector("[data-pmf-head-dynamic-frequency]")?.addEventListener("change",e=>{study.variables.flexion=study.variables.flexion||{};study.variables.flexion.dynamicFrequencyBand=e.target.value==="gte2"?"gte2":"lt2";if(study.variables.flexion.dynamicFrequencyBand==="gte2")delete study.variables.flexion.dynamicCriticalTimeBand;rerender();});
        block.querySelector("[data-pmf-head-dynamic-critical-time]")?.addEventListener("change",e=>{study.variables.flexion=study.variables.flexion||{};study.variables.flexion.dynamicCriticalTimeBand=e.target.value==="gt60"?"gt60":e.target.value==="lte60"?"lte60":null;rerender();});
        block.querySelector("[data-pmf-head-trunk-alpha]")?.addEventListener("change",e=>{const a=Number(e.target.value);study.variables.flexion=study.variables.flexion||{};study.variables.flexion.trunkAlpha=Number.isFinite(a)?a:null;rerender();});
        block.querySelector("[data-pmf-head-support]")?.addEventListener("change",e=>{study.variables.flexion=study.variables.flexion||{};study.variables.flexion.fullHeadSupport=e.target.value==="true"?true:e.target.value==="false"?false:null;rerender();});
        block.querySelector("[data-pmf-head-trunk-support]")?.addEventListener("change",e=>{study.variables.flexion=study.variables.flexion||{};study.variables.flexion.fullTrunkSupport=e.target.value==="true"?true:e.target.value==="false"?false:null;if(study.variables.flexion.fullTrunkSupport===true)delete study.variables.flexion.trunkAlpha;rerender();});
        block.querySelectorAll("[data-pmf-manual-angle]").forEach(el=>el.addEventListener("change",()=>{const k=el.dataset.pmfManualAngle;study.variables[k]=study.variables[k]||{};study.variables[k].angle=el.value===""?null:Number(el.value);rerender();}));
        block.querySelectorAll("[data-pmf-manual-time]").forEach(el=>el.addEventListener("change",()=>{const k=el.dataset.pmfManualTime;study.variables[k]=study.variables[k]||{};study.variables[k].time=el.value===""?0:Number(el.value);rerender();}));
        block.querySelectorAll("[data-pmf-manual-frequency]").forEach(el=>el.addEventListener("change",()=>{const k=el.dataset.pmfManualFrequency;study.variables[k]=study.variables[k]||{};study.variables[k].frequencyBand=el.value==="gte2"?"gte2":"lt2";delete study.variables[k].frequency;rerender();}));
    });
}

function renderAnalysisResults() {
    renderVideoJsonSummary();
    const sections = pmfProject.analysis?.bodySections || {};
    const targetIds = {trunk:'results_trunk',head_neck:'results_head_neck',lower_right:'results_lower_right',lower_left:'results_lower_left'};
    const movementOrder = {
        trunk:["Flexión / extensión","Inclinación lateral","Rotación axial","Postura convexa lumbar"],
        head_neck:["Flexión / extensión de cabeza","Lateralización de cabeza","Rotación axial de cabeza"],
        lower_right:["Rodilla","Tobillo"],
        lower_left:["Rodilla","Tobillo"]
    };

    function resultMetrics(r) {
        const inputs=r?.traceability?.criterion?.inputs || r?.traceability?.inputs || {};
        const calc=r?.calculated || {};
        const firstFinite=(...values)=>{
            for(const value of values){
                if(value===null || value===undefined || value==="") continue;
                const n=Number(value);
                if(Number.isFinite(n)) return n;
            }
            return null;
        };

        const angle=firstFinite(
            inputs.angle,
            inputs.dorsiPlantarAngle,
            inputs.standingFlexion,
            inputs.seatedExcursion,
            calc.extremeAngle,
            calc.evaluationAngle,
            calc.durationCriterionAngle,
            inputs.internalAngle,
            calc.worstEpisode?.averageAngle
        );
        const f=firstFinite(inputs.frequencyPerMinute,calc.frequencyPerMinute);
        const cp=firstFinite(inputs.criticalTimePercent,calc.criticalPercent);
        const staticSec=firstFinite(calc.totalStaticSeconds,calc.worstEpisode?.duration);
        const maxSec=firstFinite(calc.maxAcceptableStaticSeconds);

        return [
            angle!==null ? 'Ángulo: ' + angle.toFixed(1) + '°' : null,
            f!==null ? 'Frecuencia: ' + f.toFixed(2) + ' mov/min' : null,
            cp!==null ? 'Tiempo crítico: ' + cp.toFixed(1) + '%' : null,
            staticSec!==null ? 'Tiempo estático: ' + staticSec.toFixed(2) + ' s' : null,
            maxSec!==null ? 'Máximo aceptable: ' + maxSec.toFixed(1) + ' s' : null
        ].filter(Boolean).join(' · ');
    }

    function resultCell(items, mode) {
        const rows=(items||[]).filter(r=>r.mode===mode);
        if(!rows.length) return '<span class="pmf-result-empty">—</span>';
        return rows.map(r=>{
            const metrics=resultMetrics(r);
            const manual=manualControlForResult(r);
            return '<div class="pmf-table-result">'+
              '<strong class="pmf-result-status">'+escapeHtml(r.status)+'</strong>'+
              (r.reason?'<div class="pmf-result-reason">'+escapeHtml(r.reason)+'</div>':'')+
              (metrics?'<div class="pmf-result-metrics">'+escapeHtml(metrics)+'</div>':'')+
              manual+
            '</div>';
        }).join('');
    }

    Object.entries(targetIds).forEach(([key,id]) => {
        const container = document.getElementById(id);
        if (!container) return;
        const controls = sectionStudyControls(key);
        const section = sections[key];
        const results = section?.results || [];
        const labels = (movementOrder[key] || [...new Set(results.map(r=>r.measurement))]).filter(label =>
            !(key==="trunk" && label==="Postura convexa lumbar" && ensureSectionStudy("trunk").taskPosture==="standing")
        );

        const tableRows = labels.map(label=>{
            const matching = results.filter(r=>{
                if(r.measurement===label) return true;
                if(key==="trunk" && label==="Flexión / extensión" && /^Flexión/.test(r.measurement||"")) return true;
                return false;
            });
            return '<tr>'+
              '<td><strong>'+escapeHtml(label)+'</strong></td>'+
              '<td>'+resultCell(matching,"static")+'</td>'+
              '<td>'+resultCell(matching,"dynamic")+'</td>'+
            '</tr>';
        }).join('');

        const table='<div class="result-table-wrap"><table class="compact-table pmf-results-matrix">'+
          '<thead><tr><th>Movimiento</th><th>Postura forzada estática</th><th>Postura forzada dinámica</th></tr></thead>'+
          '<tbody>'+tableRows+'</tbody></table></div>';

        const reason = !results.length && section?.reason ? '<div class="pmf-callout"><span>' + escapeHtml(section.reason) + '</span></div>' : '';
        container.innerHTML = controls + table + reason;
    });
    bindManualControls();
    bindSectionStudyControls();
    renderSegmentResultsSummary();
}

function summarizeResultSet(results) {
    const R=PMFCriteria.RESULT;
    if(!results.length) return {status:R.NOT_EVALUATED,text:"NO EVALUADO",reasons:[]};

    const nonAcceptable=results.filter(r=>r.status===R.NOT_ACCEPTABLE);
    if(nonAcceptable.length){
        const reasons=[...new Set(nonAcceptable.map(r=>r.reason).filter(Boolean))];
        return {status:R.NOT_ACCEPTABLE,text:"NO ACEPTABLE",reasons};
    }

    const pending=results.filter(r=>r.status===R.NEEDS_CONFIRMATION);
    if(pending.length){
        const reasons=[...new Set(pending.map(r=>r.reason).filter(Boolean))];
        return {status:R.NEEDS_CONFIRMATION,text:"REQUIERE CONFIRMACIÓN",reasons};
    }

    const acceptable=results.some(r=>r.status===R.ACCEPTABLE);
    if(acceptable) return {status:R.ACCEPTABLE,text:"ACEPTABLE",reasons:[]};

    return {status:R.NOT_EVALUATED,text:"NO EVALUADO",reasons:[]};
}

function segmentModeSummary(sectionKey, mode) {
    const results=(pmfProject.analysis?.bodySections?.[sectionKey]?.results||[]).filter(r=>r.mode===mode);
    return summarizeResultSet(results);
}

function movementModeSummary(sectionKey, label, mode) {
    const results=(pmfProject.analysis?.bodySections?.[sectionKey]?.results||[]).filter(r=>{
        if(r.mode!==mode) return false;
        if(r.measurement===label) return true;
        if(sectionKey==="trunk" && label==="Flexión / extensión" && /^Flexión/.test(r.measurement||"")) return true;
        return false;
    });
    return summarizeResultSet(results);
}

function segmentSummaryCell(summary, forWord=false) {
    const R=PMFCriteria.RESULT;
    const cls=summary.status===R.ACCEPTABLE
        ? "pmf-summary-acceptable"
        : summary.status===R.NOT_ACCEPTABLE
            ? "pmf-summary-not-acceptable"
            : summary.status===R.NEEDS_CONFIRMATION
                ? "pmf-summary-pending"
                : "pmf-summary-not-evaluated";
    const body='<strong>'+escapeHtml(summary.text)+'</strong>'+
        (summary.status===R.NOT_ACCEPTABLE && summary.reasons.length
            ? '<div class="pmf-summary-reasons">'+summary.reasons.map(escapeHtml).join('<br>')+'</div>'
            : summary.status===R.NEEDS_CONFIRMATION && summary.reasons.length
                ? '<div class="pmf-summary-reasons">'+summary.reasons.map(escapeHtml).join('<br>')+'</div>'
                : '');
    if(!forWord) return '<td class="'+cls+'">'+body+'</td>';

    let style="border:1px solid #9ca3af;padding:7px;vertical-align:top;";
    if(summary.status===R.ACCEPTABLE) style+="background:#c6efce;color:#006100;";
    else if(summary.status===R.NOT_ACCEPTABLE) style+="background:#ffc7ce;color:#9c0006;";
    else if(summary.status===R.NEEDS_CONFIRMATION) style+="background:#ffeb9c;color:#9c6500;";
    else style+="background:#f3f4f6;color:#475569;";
    return '<td style="'+style+'">'+body+'</td>';
}

function segmentSummaryRows(forWord=false) {
    const sections=[
        ["trunk","Tronco",["Flexión / extensión","Inclinación lateral","Rotación axial","Postura convexa lumbar"]],
        ["head_neck","Cabeza / cuello",["Flexión / extensión de cabeza","Lateralización de cabeza","Rotación axial de cabeza"]],
        ["lower_right","Extremidad inferior derecha",["Rodilla","Tobillo"]],
        ["lower_left","Extremidad inferior izquierda",["Rodilla","Tobillo"]]
    ];

    return sections.map(([key,label,movements])=>{
        const stat=segmentModeSummary(key,"static");
        const dyn=segmentModeSummary(key,"dynamic");
        const first=forWord
            ? '<td style="border:1px solid #9ca3af;padding:7px;font-weight:700;background:#eaf2fb;">'+escapeHtml(label)+'</td>'
            : '<td class="pmf-summary-segment"><strong>'+escapeHtml(label)+'</strong></td>';
        const segmentRow='<tr class="pmf-summary-segment-row">'+first+segmentSummaryCell(stat,forWord)+segmentSummaryCell(dyn,forWord)+'</tr>';

        const visibleMovements=movements.filter(movement =>
            !(key==="trunk" && movement==="Postura convexa lumbar" && ensureSectionStudy("trunk").taskPosture==="standing")
        );

        const detailRows=visibleMovements.map(movement=>{
            const mStat=movementModeSummary(key,movement,"static");
            const mDyn=movementModeSummary(key,movement,"dynamic");
            const movementCell=forWord
                ? '<td style="border:1px solid #9ca3af;padding:7px 7px 7px 22px;background:#fff;">↳ '+escapeHtml(movement)+'</td>'
                : '<td class="pmf-summary-movement">↳ '+escapeHtml(movement)+'</td>';
            return '<tr class="pmf-summary-movement-row">'+movementCell+segmentSummaryCell(mStat,forWord)+segmentSummaryCell(mDyn,forWord)+'</tr>';
        }).join("");

        return segmentRow+detailRows;
    }).join("");
}

function renderSegmentResultsSummary() {
    const container=document.getElementById("segmentResultsSummary");
    if(!container || !pmfProject) return;
    container.innerHTML='<div class="result-table-wrap"><table class="compact-table pmf-segment-summary-table">'+
        '<thead><tr><th>Segmento corporal / postura-movimiento</th><th>Estática</th><th>Dinámica</th></tr></thead>'+
        '<tbody>'+segmentSummaryRows(false)+'</tbody></table></div>';
}

function wordSegmentSummaryTable() {
    return '<section class="pmf-word-block"><div class="pmf-word-heading"><h3>Resumen de resultados por segmento corporal y postura/movimiento</h3>'+
        '<button type="button" class="toolbar-btn pmf-copy-word-table">Copiar tabla</button></div>'+
        '<div class="pmf-word-copy-target"><table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:10pt;">'+
        '<thead><tr>'+
        '<th style="border:1px solid #9ca3af;padding:7px;background:#dbeafe;text-align:left;">Segmento corporal / postura-movimiento</th>'+
        '<th style="border:1px solid #9ca3af;padding:7px;background:#dbeafe;text-align:left;">Estática</th>'+
        '<th style="border:1px solid #9ca3af;padding:7px;background:#dbeafe;text-align:left;">Dinámica</th>'+
        '</tr></thead><tbody>'+segmentSummaryRows(true)+'</tbody></table></div></section>';
}


function wordStatusRank(status) {
    const R=PMFCriteria.RESULT;
    return ({[R.NOT_EVALUATED]:0,[R.ACCEPTABLE]:1,[R.NEEDS_CONFIRMATION]:2,[R.NOT_ACCEPTABLE]:3})[status] ?? 0;
}

function wordWorstStatus(items) {
    const valid=(items||[]).filter(Boolean);
    if(!valid.length) return null;
    return valid.reduce((worst,r)=>!worst||wordStatusRank(r.status)>wordStatusRank(worst.status)?r:worst,null)?.status || null;
}

function wordStatusCellStyle(status) {
    if(status===PMFCriteria.RESULT.ACCEPTABLE) return "background:#c6efce;color:#006100;";
    if(status===PMFCriteria.RESULT.NOT_ACCEPTABLE) return "background:#ffc7ce;color:#9c0006;";
    if(status===PMFCriteria.RESULT.NEEDS_CONFIRMATION) return "background:#ffeb9c;color:#9c6500;";
    return "background:#f3f4f6;color:#475569;";
}

function wordResultMetrics(r) {
    const parts=[];
    const angle=Number(r?.calculated?.extremeAngle);
    const f=Number(r?.calculated?.frequencyPerMinute);
    const cp=Number(r?.calculated?.criticalPercent);
    const staticSec=Number(r?.calculated?.totalStaticSeconds);
    const maxSec=Number(r?.calculated?.maxAcceptableStaticSeconds);
    if(Number.isFinite(angle)) parts.push("Ángulo: "+angle.toFixed(1)+"°");
    if(Number.isFinite(f)) parts.push("Frecuencia: "+f.toFixed(2)+" mov/min");
    if(Number.isFinite(cp)) parts.push("Tiempo crítico: "+cp.toFixed(1)+"%");
    if(Number.isFinite(staticSec)) parts.push("Tiempo estático: "+staticSec.toFixed(2)+" s");
    if(Number.isFinite(maxSec)) parts.push("Máximo aceptable: "+maxSec.toFixed(1)+" s");
    return parts.join(" · ");
}

function wordResultCell(items, mode) {
    const rows=(items||[]).filter(r=>r.mode===mode);
    if(!rows.length) return '<td style="border:1px solid #9ca3af;padding:6px;background:#fff;">—</td>';

    const R=PMFCriteria.RESULT;
    const status=wordWorstStatus(rows);

    if(status===R.ACCEPTABLE){
        return '<td style="border:1px solid #9ca3af;padding:6px;vertical-align:top;'+wordStatusCellStyle(status)+'"><strong>ACEPTABLE</strong></td>';
    }

    if(status===R.NOT_ACCEPTABLE){
        const reasons=[...new Set(rows.filter(r=>r.status===R.NOT_ACCEPTABLE).map(r=>r.reason).filter(Boolean))];
        const content='<strong>NO ACEPTABLE</strong>'+
            (reasons.length?'<div style="margin-top:4px;">'+reasons.map(escapeHtml).join('<br>')+'</div>':'');
        return '<td style="border:1px solid #9ca3af;padding:6px;vertical-align:top;'+wordStatusCellStyle(status)+'">'+content+'</td>';
    }

    if(status===R.NEEDS_CONFIRMATION){
        const reasons=[...new Set(rows.filter(r=>r.status===R.NEEDS_CONFIRMATION).map(r=>r.reason).filter(Boolean))];
        const content='<strong>REQUIERE CONFIRMACIÓN</strong>'+
            (reasons.length?'<div style="margin-top:4px;">'+reasons.map(escapeHtml).join('<br>')+'</div>':'');
        return '<td style="border:1px solid #9ca3af;padding:6px;vertical-align:top;'+wordStatusCellStyle(status)+'">'+content+'</td>';
    }

    return '<td style="border:1px solid #9ca3af;padding:6px;vertical-align:top;'+wordStatusCellStyle(status)+'"><strong>NO EVALUADO</strong></td>';
}

function wordSectionTable(sectionKey, title) {
    const sections=pmfProject.analysis?.bodySections||{};
    const results=sections[sectionKey]?.results||[];
    const movementOrder={
        trunk:["Flexión / extensión","Inclinación lateral","Rotación axial","Postura convexa lumbar"],
        head_neck:["Flexión / extensión de cabeza","Lateralización de cabeza","Rotación axial de cabeza"],
        lower_right:["Rodilla","Tobillo"],
        lower_left:["Rodilla","Tobillo"]
    };
    const labels=(movementOrder[sectionKey]||[]).filter(label =>
        !(sectionKey==="trunk" && label==="Postura convexa lumbar" && ensureSectionStudy("trunk").taskPosture==="standing")
    );
    const rows=labels.map(label=>{
        const matching=results.filter(r=>{
            if(r.measurement===label) return true;
            if(sectionKey==="trunk" && label==="Flexión / extensión" && /^Flexión/.test(r.measurement||"")) return true;
            return false;
        });
        return '<tr><td style="border:1px solid #9ca3af;padding:6px 6px 6px 22px;background:#fff;">↳ '+escapeHtml(label)+'</td>'+
            wordResultCell(matching,"static")+wordResultCell(matching,"dynamic")+'</tr>';
    }).join('');
    return '<section class="pmf-word-block"><div class="pmf-word-heading"><h3>'+escapeHtml(title)+'</h3>'+
        '<button type="button" class="toolbar-btn pmf-copy-word-table">Copiar tabla</button></div>'+
        '<div class="pmf-word-copy-target">'+
        '<div style="font-family:Arial,sans-serif;font-size:10pt;font-weight:700;background:#eaf2fb;border:1px solid #9ca3af;border-bottom:0;padding:7px;">'+escapeHtml(title)+'</div>'+
        '<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:10pt;">'+
        '<thead><tr>'+
        '<th style="border:1px solid #9ca3af;padding:6px;background:#dbeafe;text-align:left;">Movimiento</th>'+
        '<th style="border:1px solid #9ca3af;padding:6px;background:#dbeafe;text-align:left;">Postura forzada estática</th>'+
        '<th style="border:1px solid #9ca3af;padding:6px;background:#dbeafe;text-align:left;">Postura forzada dinámica</th>'+
        '</tr></thead><tbody>'+rows+'</tbody></table></div></section>';
}

function wordSimulationStatusCell(status, reason) {
    const R=PMFCriteria.RESULT;
    const style=wordStatusCellStyle(status);
    if(status===R.ACCEPTABLE){
        return '<td style="border:1px solid #9ca3af;padding:6px;vertical-align:top;'+style+'"><strong>ACEPTABLE</strong></td>';
    }
    if(status===R.NOT_ACCEPTABLE){
        return '<td style="border:1px solid #9ca3af;padding:6px;vertical-align:top;'+style+'"><strong>NO ACEPTABLE</strong>'+
            (reason?'<div style="margin-top:4px;">'+escapeHtml(reason)+'</div>':'')+'</td>';
    }
    if(status===R.NEEDS_CONFIRMATION){
        return '<td style="border:1px solid #9ca3af;padding:6px;vertical-align:top;'+style+'"><strong>REQUIERE CONFIRMACIÓN</strong>'+
            (reason?'<div style="margin-top:4px;">'+escapeHtml(reason)+'</div>':'')+'</td>';
    }
    return '<td style="border:1px solid #9ca3af;padding:6px;vertical-align:top;'+style+'"><strong>NO EVALUADO</strong></td>';
}

function wordSimulationTable() {
    const sections=pmfProject.analysis?.bodySections||{};
    const store=ensureSimulationStore();
    const entries=Object.entries(store.results||{});
    let lastSection=null;
    const rows=entries.map(([key,item])=>{
        const sectionLabel=sections[item.section]?.label||item.section;
        const mode=item.mode==="static"?"Estática":"Dinámica";
        const showSection=sectionLabel!==lastSection;
        lastSection=sectionLabel;

        const currentReason=item.currentReason||"";

        return '<tr>'+
            '<td style="border:1px solid #9ca3af;padding:6px;'+(showSection?'font-weight:700;background:#eaf2fb;':'background:#fff;')+'">'+(showSection?escapeHtml(sectionLabel):'')+'</td>'+
            '<td style="border:1px solid #9ca3af;padding:6px 6px 6px 22px;background:#fff;">↳ '+escapeHtml(item.measurement||"")+'</td>'+
            '<td style="border:1px solid #9ca3af;padding:6px;background:#fff;">'+mode+'</td>'+
            wordSimulationStatusCell(item.currentStatus,currentReason)+
            wordSimulationStatusCell(item.simulatedStatus,item.reason||"")+
        '</tr>';
    }).join('');
    const body=rows || '<tr><td colspan="5" style="border:1px solid #9ca3af;padding:6px;background:#fff;">Todavía no hay resultados de simulación.</td></tr>';
    return '<section class="pmf-word-block"><div class="pmf-word-heading"><h3>Resultados de la simulación</h3>'+
        '<button type="button" class="toolbar-btn pmf-copy-word-table">Copiar tabla</button></div>'+
        '<div class="pmf-word-copy-target"><table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:10pt;">'+
        '<thead><tr>'+
        '<th style="border:1px solid #9ca3af;padding:6px;background:#dbeafe;text-align:left;">Segmento corporal</th>'+
        '<th style="border:1px solid #9ca3af;padding:6px;background:#dbeafe;text-align:left;">Postura / movimiento</th>'+
        '<th style="border:1px solid #9ca3af;padding:6px;background:#dbeafe;text-align:left;">Tipo</th>'+
        '<th style="border:1px solid #9ca3af;padding:6px;background:#dbeafe;text-align:left;">Resultado actual</th>'+
        '<th style="border:1px solid #9ca3af;padding:6px;background:#dbeafe;text-align:left;">Resultado simulado</th>'+
        '</tr></thead><tbody>'+body+'</tbody></table></div></section>';
}

async function copyWordTable(target) {
    if(!target) return;
    const html=target.innerHTML;
    const text=target.innerText;
    try {
        if(navigator.clipboard && window.ClipboardItem){
            const item=new ClipboardItem({
                "text/html":new Blob([html],{type:"text/html"}),
                "text/plain":new Blob([text],{type:"text/plain"})
            });
            await navigator.clipboard.write([item]);
            return;
        }
    } catch (_) {}
    const range=document.createRange();
    range.selectNodeContents(target);
    const selection=window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("copy");
    selection.removeAllRanges();
}

function renderWordTables() {
    const container=document.getElementById("wordTablesContent");
    if(!container || !pmfProject) return;
    container.innerHTML=
        wordSegmentSummaryTable()+
        wordSectionTable("trunk","Tronco")+
        wordSectionTable("head_neck","Cabeza / cuello")+
        wordSectionTable("lower_right","Extremidad inferior derecha")+
        wordSectionTable("lower_left","Extremidad inferior izquierda")+
        wordSimulationTable();

    container.querySelectorAll(".pmf-copy-word-table").forEach(button=>{
        button.addEventListener("click",async()=>{
            const target=button.closest(".pmf-word-block")?.querySelector(".pmf-word-copy-target");
            await copyWordTable(target);
            const original=button.textContent;
            button.textContent="Copiado";
            window.setTimeout(()=>button.textContent=original,1200);
        });
    });
}

function formatDeg(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(1) + "°" : "-";
}


function ensureSimulationStore() {
    pmfProject.analysis = pmfProject.analysis || {};
    const current = pmfProject.analysis.simulation && typeof pmfProject.analysis.simulation === "object"
        ? pmfProject.analysis.simulation
        : {};
    current.overrides = current.overrides && typeof current.overrides === "object" ? current.overrides : {};
    current.results = current.results && typeof current.results === "object" ? current.results : {};
    current.sourceSignatures = current.sourceSignatures && typeof current.sourceSignatures === "object" ? current.sourceSignatures : {};
    current.updatedAt = current.updatedAt || null;
    pmfProject.analysis.simulation = current;
    return current;
}

function simulationKey(section, measurement, mode) {
    return [section, measurement, mode].join("|");
}

function simulationRank(status) {
    const R=PMFCriteria.RESULT;
    return ({[R.NOT_EVALUATED]:0,[R.ACCEPTABLE]:1,[R.NEEDS_CONFIRMATION]:2,[R.NOT_ACCEPTABLE]:3})[status] ?? 0;
}

function worstSimulationSource(results) {
    return (results||[]).reduce((worst,r)=>!worst||simulationRank(r.status)>simulationRank(worst.status)?r:worst,null);
}

function simFinite(value, fallback=null) {
    if(value===null || value===undefined || value==="") return fallback;
    const n=Number(value);
    return Number.isFinite(n)?n:fallback;
}

function currentSimulationValues(section, measurement, mode, result) {
    const inputs=result?.traceability?.criterion?.inputs || result?.traceability?.inputs || {};
    const calc=result?.calculated || {};
    const study=ensureSectionStudy(section);
    const v=movementKeyForResult(section,measurement) ? (study.variables?.[movementKeyForResult(section,measurement)]||{}) : {};
    const values={};

    values.angle=simFinite(inputs.angle,simFinite(calc.extremeAngle,
        simFinite(calc.evaluationAngle,simFinite(calc.worstEpisode?.averageAngle,null))));
    values.frequencyPerMinute=simFinite(inputs.frequencyPerMinute,simFinite(calc.frequencyPerMinute,0));
    values.criticalTimePercent=simFinite(inputs.criticalTimePercent,simFinite(calc.criticalPercent,0));
    values.staticSeconds=simFinite(calc.totalStaticSeconds,simFinite(calc.worstEpisode?.duration,5));
    values.fullTrunkSupport=inputs.fullTrunkSupport ?? v.fullSupport ?? v.fullTrunkSupport ?? null;
    values.fullHeadSupport=inputs.fullHeadSupport ?? v.fullHeadSupport ?? null;
    values.neckFlexionAngle=simFinite(inputs.neckFlexionAngle,null);
    values.lumbarConvex=inputs.lumbarConvex ?? study.lumbarConvex ?? null;
    values.posture=inputs.posture || study.posture || "standing";
    values.internalAngle=simFinite(inputs.internalAngle,null);
    values.standingFlexion=simFinite(inputs.standingFlexion,null);
    values.seatedExcursion=simFinite(inputs.seatedExcursion,null);
    if(values.internalAngle===null && section.startsWith("lower_") && measurement==="Rodilla"){
        if(values.posture==="standing" && values.standingFlexion!==null) values.internalAngle=180-values.standingFlexion;
        else if(values.posture==="seated" && values.seatedExcursion!==null) values.internalAngle=90+values.seatedExcursion;
        else values.internalAngle=180;
    }
    values.ischialSupport=inputs.ischialSupport ?? v.ischialSupport ?? null;
    values.trunkPosteriorInclined=inputs.trunkPosteriorInclined ?? v.trunkPosteriorInclined ?? null;
    if(measurement==="Tobillo"){
        values.angle=simFinite(inputs.dorsiPlantarAngle,values.angle);
    }
    return values;
}

function evaluateSimulation(section, measurement, mode, values) {
    const R=PMFCriteria.RESULT;
    if(section==="trunk"){
        if(measurement==="Postura convexa lumbar"){
            return PMFCriteria.static.trunk({motion:"lumbar_convex",lumbarConvex:values.lumbarConvex});
        }
        if(measurement==="Flexión / extensión"){
            if(mode==="dynamic"){
                return PMFCriteria.dynamic.trunkFlexion({
                    angle:values.angle,
                    frequencyPerMinute:values.frequencyPerMinute,
                    fullTrunkSupport:values.fullTrunkSupport
                });
            }
            const dc=values.fullTrunkSupport===false ? trunkStaticDurationCriterion(values.angle,values.staticSeconds) : null;
            return PMFCriteria.static.trunk({
                motion:"flexion",
                angle:values.angle,
                fullTrunkSupport:values.fullTrunkSupport,
                durationCriterionResult:dc?.result ?? null
            });
        }
        const motion=measurement==="Inclinación lateral"?"lateral":"rotation";
        if(mode==="dynamic"){
            const fn=motion==="lateral"?PMFCriteria.dynamic.trunkLateral:PMFCriteria.dynamic.trunkRotation;
            return fn({angle:values.angle,frequencyPerMinute:values.frequencyPerMinute,criticalTimePercent:values.criticalTimePercent});
        }
        return PMFCriteria.static.trunk({motion,angle:values.angle});
    }

    if(section==="head_neck"){
        if(measurement==="Flexión / extensión de cabeza"){
            if(mode==="dynamic"){
                return PMFCriteria.dynamic.headFlexion({
                    angle:values.angle,
                    frequencyPerMinute:values.frequencyPerMinute,
                    criticalTimePercent:values.criticalTimePercent
                });
            }
            const dc=values.fullTrunkSupport===true ? headStaticDurationCriterion(values.angle,values.staticSeconds) : null;
            return PMFCriteria.static.head({
                motion:"head_flexion",
                angle:values.angle,
                fullHeadSupport:values.fullHeadSupport,
                fullTrunkSupport:values.fullTrunkSupport,
                neckFlexionAngle:values.neckFlexionAngle,
                durationCriterionResult:dc?.result ?? null
            });
        }
        const motion=measurement==="Lateralización de cabeza"?"lateral":"rotation";
        if(mode==="dynamic"){
            const fn=motion==="lateral"?PMFCriteria.dynamic.headLateral:PMFCriteria.dynamic.headRotation;
            return fn({angle:values.angle,frequencyPerMinute:values.frequencyPerMinute,criticalTimePercent:values.criticalTimePercent});
        }
        return PMFCriteria.static.head({motion,angle:values.angle});
    }

    if(section==="lower_right" || section==="lower_left"){
        if(measurement==="Rodilla"){
            const posture=values.posture==="seated"?"seated":"standing";
            const internal=Number(values.internalAngle);
            const standingFlexion=180-internal;
            const seatedExcursion=Math.abs(internal-90);
            if(mode==="dynamic"){
                return PMFCriteria.lowerLimb.kneeDynamic({
                    posture,
                    internalAngle:internal,
                    standingFlexion,
                    seatedExcursion,
                    frequencyPerMinute:values.frequencyPerMinute
                });
            }
            return PMFCriteria.static.knee({
                posture,
                internalAngle:internal,
                standingFlexion,
                ischialSupport:values.ischialSupport,
                trunkPosteriorInclined:values.trunkPosteriorInclined
            });
        }
        if(measurement==="Tobillo"){
            if(mode==="dynamic"){
                return PMFCriteria.lowerLimb.ankleDynamic({
                    dorsiPlantarAngle:values.angle,
                    frequencyPerMinute:values.frequencyPerMinute
                });
            }
            return PMFCriteria.static.ankle({dorsiPlantarAngle:values.angle});
        }
    }
    return {status:R.NOT_EVALUATED,reason:"No se ha definido la simulación para este criterio.",criterionId:"SIM_NOT_DEFINED",inputs:{}};
}

function simBoolSelect(label,name,value) {
    return '<label>'+escapeHtml(label)+'<select data-sim-field="'+name+'"><option value="" '+(value===null?"selected":"")+'>-- seleccionar --</option><option value="true" '+(value===true?"selected":"")+'>Sí</option><option value="false" '+(value===false?"selected":"")+'>No</option></select></label>';
}
function simNumber(label,name,value,step="0.1",min=null,max=null) {
    return '<label>'+escapeHtml(label)+'<input type="number" data-sim-field="'+name+'" step="'+step+'"'+(min!==null?' min="'+min+'"':'')+(max!==null?' max="'+max+'"':'')+' value="'+escapeHtml(value??"")+'"></label>';
}
function simFrequency(value) {
    return '<label>Frecuencia<select data-sim-field="frequencyPerMinute"><option value="0" '+(Number(value)<2?"selected":"")+'>‹ 2 movimientos/minuto</option><option value="2" '+(Number(value)>=2?"selected":"")+'>≥ 2 movimientos/minuto</option></select></label>';
}
function simCriticalTime(value) {
    return '<label>Tiempo en postura crítica<select data-sim-field="criticalTimePercent"><option value="60" '+(Number(value)<=60?"selected":"")+'>≤ 60% del tiempo de la tarea</option><option value="60.01" '+(Number(value)>60?"selected":"")+'>› 60% del tiempo de la tarea</option></select></label>';
}

function simulationControls(section,measurement,mode,v) {
    let out="";
    if(section==="trunk"){
        if(measurement==="Postura convexa lumbar") return simBoolSelect("Postura convexa lumbar","lumbarConvex",v.lumbarConvex);
        out+=simNumber("Ángulo (°)","angle",v.angle);
        if(mode==="dynamic") out+=simFrequency(v.frequencyPerMinute);
        if(mode==="dynamic" && (measurement==="Inclinación lateral"||measurement==="Rotación axial")) out+=simCriticalTime(v.criticalTimePercent);
        if(measurement==="Flexión / extensión"){
            out+=simBoolSelect("Soporte completo del tronco","fullTrunkSupport",v.fullTrunkSupport);
            if(mode==="static") out+=simNumber("Duración de la postura (s)","staticSeconds",v.staticSeconds,"0.1","0");
        }
        return out;
    }
    if(section==="head_neck"){
        out+=simNumber(measurement==="Flexión / extensión de cabeza"?"Ángulo de cabeza β (°)":"Ángulo (°)","angle",v.angle);
        if(mode==="dynamic"){out+=simFrequency(v.frequencyPerMinute);out+=simCriticalTime(v.criticalTimePercent);}
        if(mode==="static" && measurement==="Flexión / extensión de cabeza"){
            out+=simNumber("Duración de la postura (s)","staticSeconds",v.staticSeconds,"0.1","0");
            out+=simBoolSelect("Soporte completo de cabeza","fullHeadSupport",v.fullHeadSupport);
            out+=simBoolSelect("Soporte completo del tronco","fullTrunkSupport",v.fullTrunkSupport);
            out+=simNumber("Flexo-extensión de cuello β−α (°)","neckFlexionAngle",v.neckFlexionAngle);
        }
        return out;
    }
    if(section==="lower_right"||section==="lower_left"){
        if(measurement==="Rodilla"){
            out+='<label>Postura de referencia<select data-sim-field="posture"><option value="standing" '+(v.posture==="standing"?"selected":"")+'>De pie</option><option value="seated" '+(v.posture==="seated"?"selected":"")+'>Sentado/a</option></select></label>';
            out+=simNumber("Ángulo interno de rodilla (°)","internalAngle",v.internalAngle);
            if(mode==="dynamic") out+=simFrequency(v.frequencyPerMinute);
            if(mode==="static"){
                out+=simBoolSelect("Apoyo isquiotibial","ischialSupport",v.ischialSupport);
                out+=simBoolSelect("Tronco posteriormente inclinado","trunkPosteriorInclined",v.trunkPosteriorInclined);
            }
            return out;
        }
        if(measurement==="Tobillo"){
            out+=simNumber("Ángulo de tobillo (°; + dorsiflexión / − plantar)","angle",v.angle);
            if(mode==="dynamic") out+=simFrequency(v.frequencyPerMinute);
            return out;
        }
    }
    return out;
}

function simulationFieldLabel(field) {
    return ({
        angle:"Ángulo",
        frequencyPerMinute:"Frecuencia",
        criticalTimePercent:"Tiempo en postura crítica",
        staticSeconds:"Duración",
        fullTrunkSupport:"Soporte completo del tronco",
        fullHeadSupport:"Soporte completo de cabeza",
        neckFlexionAngle:"Flexo-extensión de cuello β−α",
        lumbarConvex:"Postura convexa lumbar",
        posture:"Postura de referencia",
        internalAngle:"Ángulo interno de rodilla",
        ischialSupport:"Apoyo isquiotibial",
        trunkPosteriorInclined:"Tronco posteriormente inclinado"
    })[field]||field;
}
function simulationValueText(field,value) {
    if(value===true)return "Sí";
    if(value===false)return "No";
    if(value===null||value===undefined||value==="")return "—";
    if(field==="posture")return value==="seated"?"Sentado/a":"De pie";
    if(field==="frequencyPerMinute")return Number(value)>=2?"≥ 2 movimientos/minuto":"< 2 movimientos/minuto";
    if(field==="criticalTimePercent")return Number(value)>60?"> 60% del tiempo de la tarea":"≤ 60% del tiempo de la tarea";
    if(["angle","neckFlexionAngle","internalAngle"].includes(field))return Number(value).toFixed(1)+"°";
    if(field==="staticSeconds")return Number(value).toFixed(1)+" s";
    return String(value);
}

function simulationSourceSignature(section, measurement, mode, result) {
    const inputs=result?.traceability?.criterion?.inputs || result?.traceability?.inputs || {};
    const calc=result?.calculated || {};
    return JSON.stringify({
        section,
        measurement,
        mode,
        status:result?.status||null,
        criterionId:result?.criterionId||null,
        reason:result?.reason||null,
        inputs,
        calculated:{
            extremeAngle:calc.extremeAngle??null,
            evaluationAngle:calc.evaluationAngle??null,
            frequencyPerMinute:calc.frequencyPerMinute??null,
            criticalPercent:calc.criticalPercent??null,
            totalStaticSeconds:calc.totalStaticSeconds??null,
            maxAcceptableStaticSeconds:calc.maxAcceptableStaticSeconds??null,
            durationCriterionAngle:calc.durationCriterionAngle??null,
            worstEpisode:calc.worstEpisode ? {
                averageAngle:calc.worstEpisode.averageAngle??null,
                duration:calc.worstEpisode.duration??null
            } : null
        }
    });
}

function renderSimulation() {
    const container=document.getElementById("simulationContent");
    if(!container || !pmfProject) return;
    const sections=pmfProject.analysis?.bodySections||{};
    const store=ensureSimulationStore();
    store.results = {};
    const groups=[];
    Object.entries(sections).forEach(([section,data])=>{
        const by=new Map();
        (data?.results||[]).forEach(r=>{
            if(!r?.measurement || !["static","dynamic"].includes(r.mode)) return;
            const measurement=canonicalMeasurementForResult(section,r.measurement);
            const k=simulationKey(section,measurement,r.mode);
            if(!by.has(k))by.set(k,[]);
            by.get(k).push(r);
        });
        by.forEach((results,key)=>{
            const current=worstSimulationSource(results);
            if(current && current.status===PMFCriteria.RESULT.NOT_ACCEPTABLE){
                groups.push({
                    section,
                    key,
                    measurement:canonicalMeasurementForResult(section,current.measurement),
                    current
                });
            }
        });
    });
    if(!groups.length){
        container.innerHTML='<div class="placeholder">No hay posturas o movimientos NO ACEPTABLES que requieran simulación de mejora.</div>';
        return;
    }

    const cards=groups.map(({section,key,measurement,current})=>{
        const sourceSignature=simulationSourceSignature(section,measurement,current.mode,current);
        if(store.sourceSignatures[key]!==sourceSignature){
            delete store.overrides[key];
            delete store.results[key];
            store.sourceSignatures[key]=sourceSignature;
        }

        const base=currentSimulationValues(section,measurement,current.mode,current);
        const override=store.overrides[key]||{};
        const values={...base,...override};
        const simulated=evaluateSimulation(section,measurement,current.mode,values);
        store.results[key]={
            section,measurement,mode:current.mode,
            currentStatus:current.status,currentReason:current.reason||"",
            simulatedStatus:simulated.status,
            reason:simulated.reason,values:PMFStorage.deepClone(values)
        };
        const sectionLabel=sections[section]?.label||section;
        return '<article class="pmf-sim-card" data-sim-key="'+escapeHtml(key)+'">'+
            '<div class="pmf-sim-head"><div><strong>'+escapeHtml(sectionLabel)+'</strong><h3>'+escapeHtml(measurement)+' · '+(current.mode==="static"?"Estática":"Dinámica")+'</h3></div>'+
            '<div class="pmf-sim-compare"><div><span>Actual</span><strong>'+escapeHtml(current.status)+'</strong></div><span class="pmf-sim-arrow">→</span><div><span>Simulado</span><strong>'+escapeHtml(simulated.status)+'</strong></div></div></div>'+
            '<div class="pmf-sim-reason">'+escapeHtml(simulated.reason||"")+'</div>'+
            '<div class="pmf-sim-controls">'+simulationControls(section,measurement,current.mode,values)+'</div>'+
            '<button type="button" class="nav-secondary pmf-sim-reset" data-sim-reset>Restablecer esta simulación</button>'+
        '</article>';
    }).join("");

    const changes=[];
    groups.forEach(({section,key,measurement,current})=>{
        const base=currentSimulationValues(section,measurement,current.mode,current);
        const override=store.overrides[key]||{};
        Object.keys(override).forEach(field=>{
            const before=base[field],after=override[field];
            if(String(before)!==String(after)){
                changes.push('<li><strong>'+escapeHtml((sections[section]?.label||section)+' · '+measurement+' · '+(current.mode==="static"?"Estática":"Dinámica"))+'</strong>: '+escapeHtml(simulationFieldLabel(field))+' · '+escapeHtml(simulationValueText(field,before))+' → <strong>'+escapeHtml(simulationValueText(field,after))+'</strong></li>');
            }
        });
    });
    const summary='<section class="pmf-sim-summary"><h3>Resumen de cambios simulados</h3>'+(changes.length?'<ul>'+changes.join("")+'</ul>':'<p class="pmf-note">Todavía no se han realizado cambios sobre las condiciones actuales.</p>')+'</section>';

    container.innerHTML='<div class="notice"><strong>El estudio original no se modifica.</strong> Cambie únicamente las condiciones que quiera mejorar; el programa recalcula el resultado de cada postura.</div>'+cards+summary;
    store.updatedAt=new Date().toISOString();

    container.querySelectorAll(".pmf-sim-card").forEach(card=>{
        const key=card.dataset.simKey;
        card.querySelectorAll("[data-sim-field]").forEach(control=>{
            control.addEventListener("change",()=>{
                const field=control.dataset.simField;
                let value=control.value;
                if(["fullTrunkSupport","fullHeadSupport","lumbarConvex","ischialSupport","trunkPosteriorInclined"].includes(field)){
                    value=value==="true"?true:value==="false"?false:null;
                }else if(field!=="posture"){
                    value=value===""?null:Number(value);
                }
                store.overrides[key]=store.overrides[key]||{};
                store.overrides[key][field]=value;
                touchProject(false);
                renderSimulation();
            });
        });
        card.querySelector("[data-sim-reset]")?.addEventListener("click",()=>{
            delete store.overrides[key];
            delete store.results[key];
            touchProject(false);
            renderSimulation();
        });
    });
}
