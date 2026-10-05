"use strict";

const PMF_PROJECT_SCHEMA = "pmf-project";
const PMF_PROJECT_VERSION = 1;

function pmfDeepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function pmfCreateEmptyProject() {
    return {
        schema: PMF_PROJECT_SCHEMA,
        version: PMF_PROJECT_VERSION,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        identification: {
            company: "",
            workstation: "",
            task: "",
            analyst: "",
            notes: ""
        },
        configuration: {
            videoCount: 1,
            resultMode: "body-section-only",
            overallResultEnabled: false,
            sustainedPostureSeconds: 4
        },
        kinoveaFiles: [],
        analysis: {
            bodySections: {},
            manualConfirmations: {},
            sectionStudy: {
                trunk: { source: "kinovea", timeMode: "seconds", durationSeconds: 60, variables: {} },
                head_neck: { source: "kinovea", timeMode: "seconds", durationSeconds: 60, variables: {} },
                lower_right: { source: "kinovea", timeMode: "seconds", durationSeconds: 60, posture: "standing", variables: {} },
                lower_left: { source: "kinovea", timeMode: "seconds", durationSeconds: 60, posture: "standing", variables: {} }
            },
            traceability: {}
        }
    };
}

function pmfNormalizeProject(candidate) {
    if (!candidate || typeof candidate !== "object") {
        throw new Error("El archivo no contiene un estudio válido.");
    }
    if (candidate.schema !== PMF_PROJECT_SCHEMA) {
        throw new Error("El archivo no corresponde a un estudio de Posturas y Movimientos Forzados.");
    }

    const base = pmfCreateEmptyProject();
    const project = Object.assign(base, pmfDeepClone(candidate));
    project.identification = Object.assign(base.identification, candidate.identification || {});
    project.configuration = Object.assign(base.configuration, candidate.configuration || {});
    project.analysis = Object.assign(base.analysis, candidate.analysis || {});
    project.analysis.sectionStudy = Object.assign(base.analysis.sectionStudy, candidate.analysis?.sectionStudy || {});
    Object.keys(base.analysis.sectionStudy).forEach(key => {
        project.analysis.sectionStudy[key] = Object.assign(base.analysis.sectionStudy[key], candidate.analysis?.sectionStudy?.[key] || {});
        project.analysis.sectionStudy[key].variables = Object.assign({}, candidate.analysis?.sectionStudy?.[key]?.variables || {});
    });
    project.kinoveaFiles = Array.isArray(candidate.kinoveaFiles) ? candidate.kinoveaFiles : [];

    project.configuration.overallResultEnabled = false;
    project.configuration.resultMode = "body-section-only";

    return project;
}

async function pmfSha256(text) {
    if (!window.crypto || !window.crypto.subtle) return null;
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function pmfBuildKinoveaRecord(file, rawJson, parsedData, videoIndex) {
    const rawText = JSON.stringify(rawJson);
    return {
        videoIndex,
        videoNumber: videoIndex + 1,
        source: {
            fileName: file?.name || null,
            fileSize: Number.isFinite(Number(file?.size)) ? Number(file.size) : null,
            fileLastModified: Number.isFinite(Number(file?.lastModified)) ? Number(file.lastModified) : null,
            mimeType: file?.type || "application/json",
            sha256: await pmfSha256(rawText)
        },
        importedAt: new Date().toISOString(),
        rawJson: pmfDeepClone(rawJson),
        parsedKinovea: pmfDeepClone(parsedData),
        extracted: {
            markers: Array.isArray(parsedData?.markers) ? pmfDeepClone(parsedData.markers) : [],
            frames: Array.isArray(parsedData?.frames) ? pmfDeepClone(parsedData.frames) : []
        },
        processing: {
            kinoveaConfig: {
                task: "",
                range: {
                    mode: "all",
                    start: 0,
                    end: Array.isArray(parsedData?.frames) && parsedData.frames.length
                        ? Math.max(...parsedData.frames.map(frame => Number(frame?.time) || 0))
                        : 0,
                    cycles: 1
                }
            },
            markerMapping: null,
            anatomicalFrames: null,
            biomechanicalFrames: null,
            calculatedVariables: null,
            manualCorrections: null,
            resultByBodySection: null,
            traceability: null
        }
    };
}

function pmfDownloadProject(project, filename) {
    const clean = pmfDeepClone(project);
    clean.updatedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || "PMF_Project.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function pmfReadJsonFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => {
            try {
                resolve(JSON.parse(event.target.result));
            } catch (_) {
                reject(new Error(`El archivo "${file.name}" no contiene un JSON válido.`));
            }
        };
        reader.onerror = () => reject(new Error(`No se pudo leer "${file.name}".`));
        reader.readAsText(file);
    });
}

window.PMFStorage = {
    PROJECT_SCHEMA: PMF_PROJECT_SCHEMA,
    PROJECT_VERSION: PMF_PROJECT_VERSION,
    createEmptyProject: pmfCreateEmptyProject,
    normalizeProject: pmfNormalizeProject,
    buildKinoveaRecord: pmfBuildKinoveaRecord,
    downloadProject: pmfDownloadProject,
    readJsonFile: pmfReadJsonFile,
    deepClone: pmfDeepClone
};