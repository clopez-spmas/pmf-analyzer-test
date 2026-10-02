"use strict";

let pmfProject = null;

document.addEventListener("DOMContentLoaded", () => {
    pmfProject = PMFStorage.createEmptyProject();
    buildVideoCountSelector();
    bindIdentification();
    bindProjectActions();
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

    document.getElementById("loadProjectInput")?.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const json = await PMFStorage.readJsonFile(file);
            pmfProject = PMFStorage.normalizeProject(json);
            renderProject();
            setStatus(`Proyecto abierto: ${file.name}. Los datos Kinovea guardados están disponibles sin volver a cargarlos.`, "ok");
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
    renderAnalysisSummary();
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

        const persistedText = record
            ? `<div class="pmf-persisted"><strong>Guardado en el proyecto:</strong> ${escapeHtml(record.source?.fileName || "Kinovea sin nombre")} · ${formatFrames(record)} · SHA-256: ${escapeHtml(shortHash(record.source?.sha256))}</div>`
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
        setStatus(`Vídeo ${videoIndex + 1}: Kinovea incorporado al proyecto. No será necesario volver a cargarlo al reabrir este JSON.`, "ok");
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
    setStatus(`Se han eliminado del proyecto los datos Kinovea del vídeo ${videoIndex + 1}.`);
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
        container.innerHTML = '<div class="pmf-summary"><p>No hay archivos Kinovea cargados.</p></div>';
        return;
    }
    const rows = records.map(record => {
        const mapping = record?.processing?.markerMapping || {};
        const assigned = Object.values(mapping).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
        const frames = Array.isArray(record?.extracted?.frames) ? record.extracted.frames.length : 0;
        const variables = record?.processing?.calculatedVariables ? Object.keys(record.processing.calculatedVariables).length : 0;
        const vn = Number(record.videoNumber || Number(record.videoIndex) + 1);
        return '<tr><td><strong>Vídeo ' + vn + '</strong></td><td>' + escapeHtml(record.source?.fileName || 'Sin nombre') + '</td><td>' + escapeHtml(formatBytes(record.source?.size)) + '</td><td>' + frames + '</td><td>' + assigned + '</td><td>' + variables + '</td><td><code>' + escapeHtml(shortHash(record.source?.sha256)) + '</code></td></tr>';
    }).join('');
    container.innerHTML = '<div class="pmf-summary-cards"><div><span>Vídeos configurados</span><strong>' + (Number(pmfProject.configuration.videoCount)||1) + '</strong></div><div><span>JSON cargados</span><strong>' + records.length + '</strong></div><div><span>Resultado global</span><strong>No aplica</strong></div></div>' +
      '<div class="table-wrapper"><table><thead><tr><th>Vídeo</th><th>JSON Kinovea</th><th>Tamaño</th><th>Frames</th><th>Marcadores asignados</th><th>Variables calculadas</th><th>SHA-256</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="pmf-note">Cada vídeo puede aportar información de uno o varios segmentos corporales. Los resultados se revisan en su pantalla específica.</p>';
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

function saveProject() {
    syncIdentificationFromUI();
    touchProject(false);

    const task = (pmfProject.identification.task || "Tarea")
        .trim()
        .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, "_")
        .replace(/^_+|_+$/g, "");

    PMFStorage.downloadProject(pmfProject, `PMF_${task || "Proyecto"}.json`);
    setStatus("Proyecto guardado con los Kinovea y los datos procesados disponibles hasta este punto.", "ok");
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
    if (updateStatus) setStatus("Proyecto modificado. Guarda el JSON para conservar los cambios.");
}

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

            const anatomicalFrames = adaptKinoveaFrames(record.extracted.frames, mapping);
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
        setStatus("Análisis PMF completado: variables, frecuencia, tiempo crítico, estáticas y clasificación por sección guardadas en el proyecto.", "ok");
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
            const dyn=analyzeDynamicSeries(s, v=>v>=0&&v<=20, v=>v<0||v>20);
            const key=`v${record.videoNumber}.dynamic.trunk.fullSupport`;
            const criterion=PMFCriteria.dynamic.trunkFlexion({
                angle:dyn.extremeAngle,
                frequencyPerMinute:dyn.frequencyPerMinute,
                fullTrunkSupport:manualValue(key)
            });
            out.push(classifyMeasurement({record,section:"trunk",mode:"dynamic",measurement:"Flexión / extensión",calculated:dyn,criterionResult:criterion,manualKey:key}));
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
            ["head_flexion_signed","Flexión / extensión de cabeza",v=>v>=-40&&v<=0,v=>v>0||v<-40,PMFCriteria.dynamic.headFlexion],
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

    // TRONCO ESTÁTICO: se evalúan episodios >4 s.
    {
        const s=getSeriesFromRecord(record,"trunk_flexion_signed");
        if(s.length){
            const staticData=analyzeStaticSeries(s,v=>v<0||v>20);
            if(staticData.episodes.length){
                const angle=staticData.worstEpisode?.averageAngle ?? null;
                const key=`v${record.videoNumber}.static.trunk.fullSupport`;
                const criterion=PMFCriteria.static.trunk({
                    motion:"flexion",
                    angle,
                    fullTrunkSupport:manualValue(key),
                    durationCriterionResult:pmfProject.analysis?.manualConfirmations?.[`v${record.videoNumber}.static.trunk.durationCriterion`]?.value ?? null
                });
                out.push(classifyMeasurement({record,section:"trunk",mode:"static",measurement:"Flexión / extensión",calculated:staticData,criterionResult:criterion,manualKey:key}));
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
        const defs=[
            ["head_lateral_signed","Lateralización de cabeza","lateral",v=>v<-10||v>10],
            ["head_axial_rotation_signed","Rotación axial de cabeza","rotation",v=>v<-45||v>45]
        ];
        defs.forEach(([name,label,motion,pred])=>{
            const s=getSeriesFromRecord(record,name);
            if(!s.length) return;
            const st=analyzeStaticSeries(s,pred);
            if(!st.episodes.length) return;
            const criterion=PMFCriteria.static.head({motion,angle:st.worstEpisode?.averageAngle});
            out.push(classifyMeasurement({record,section:"head_neck",mode:"static",measurement:label,calculated:st,criterionResult:criterion}));
        });
    }


    // EXTREMIDADES INFERIORES
    ["left","right"].forEach(side=>{
        const section=side==="left"?"lower_left":"lower_right";
        const postureKey=`v${record.videoNumber}.${section}.posture`;
        const posture=pmfProject.analysis?.manualConfirmations?.[postureKey]?.value ?? null;

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

                const staticPred=posture==="standing"?(v=>v>=135):(v=>v<90||v>135);
                const stSource=posture==="standing"?kneeStanding:kneeInternal;
                const st=analyzeStaticSeries(stSource,staticPred);
                if(st.episodes.length){
                    const supportKey=posture==="standing"
                        ? `v${record.videoNumber}.${section}.ischialSupport`
                        : `v${record.videoNumber}.${section}.trunkPosteriorInclined`;
                    const criterionStatic=PMFCriteria.static.knee({
                        posture,
                        internalAngle:posture==="seated"?st.worstEpisode?.averageAngle:internalExtreme?.value,
                        standingFlexion:posture==="standing"?st.worstEpisode?.averageAngle:null,
                        ischialSupport:posture==="standing"?(pmfProject.analysis?.manualConfirmations?.[supportKey]?.value ?? null):null,
                        trunkPosteriorInclined:posture==="seated"?(pmfProject.analysis?.manualConfirmations?.[supportKey]?.value ?? null):null
                    });
                    out.push(classifyMeasurement({record,section,mode:"static",measurement:"Rodilla",calculated:st,criterionResult:criterionStatic,manualKey:supportKey}));
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
        sections[result.section].results.push(result);
        sections[result.section].traceability.push(result.traceability);
    }

    ["trunk","head_neck","lower_right","lower_left"].forEach(key=>{
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

function renderAnalysisResults() {
    renderVideoJsonSummary();
    const sections = pmfProject.analysis?.bodySections || {};
    const targetIds = {trunk:'results_trunk',head_neck:'results_head_neck',lower_right:'results_lower_right',lower_left:'results_lower_left'};
    Object.entries(targetIds).forEach(([key,id]) => {
        const container = document.getElementById(id);
        if (!container) return;
        const section = sections[key];
        if (!section) {
            container.innerHTML = '<div class="pmf-summary"><p>Sin datos suficientes para evaluar este segmento corporal.</p></div>';
            return;
        }
        const details = (section.results || []).map(r => {
            const f = Number(r.calculated?.frequencyPerMinute);
            const cp = Number(r.calculated?.criticalPercent);
            const staticSec = Number(r.calculated?.totalStaticSeconds);
            const angle = Number(r.calculated?.extremeAngle);
            const metrics = [
                Number.isFinite(angle) ? 'ángulo desfavorable ' + angle.toFixed(1) + '°' : null,
                Number.isFinite(f) ? 'frecuencia ' + f.toFixed(2) + ' mov/min' : null,
                Number.isFinite(cp) ? 'tiempo crítico ' + cp.toFixed(1) + '%' : null,
                Number.isFinite(staticSec) ? 'estática acumulada ' + staticSec.toFixed(2) + ' s' : null
            ].filter(Boolean).join(' · ');
            const manual = manualControlForResult(r);
            return '<div class="pmf-result-card"><div class="pmf-result-card-head"><span>Vídeo ' + r.videoNumber + ' · ' + escapeHtml(r.mode) + '</span><strong>' + escapeHtml(r.status) + '</strong></div><h3>' + escapeHtml(r.measurement) + '</h3><p>' + escapeHtml(r.reason) + '</p>' + (metrics ? '<div class="pmf-result-metrics">' + escapeHtml(metrics) + '</div>' : '') + manual + '</div>';
        }).join('');
        const reason = section.reason ? '<div class="pmf-callout"><span>' + escapeHtml(section.reason) + '</span></div>' : '';
        container.innerHTML = '<div class="pmf-section-status"><span>Resultado del segmento</span><strong>' + escapeHtml(section.status || 'NO_EVALUADO') + '</strong></div>' + (details || reason || '<div class="pmf-summary"><p>No hay mediciones válidas para este segmento.</p></div>') + '<p class="pmf-note">El resultado corresponde a la situación más desfavorable entre los vídeos que aportan datos válidos para este segmento. No se calcula un resultado global de la tarea.</p>';
    });
    bindManualControls();
}

function formatDeg(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(1) + "°" : "-";
}
